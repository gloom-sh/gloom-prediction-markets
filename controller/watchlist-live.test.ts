import { afterEach, expect, test } from "bun:test";
import { act, createElement, useState } from "react";
import { testRender } from "gloomberb/test-support";
import type { PredictionMarketSummary } from "../types";
import type { LiveQuotePatch } from "./watchlist-quotes";
import {
  retainSubscribedQuotePatches,
  useWatchlistLiveOverlay,
} from "./watchlist-live";

function market(key: string, token: string): PredictionMarketSummary {
  return {
    key,
    venue: "polymarket",
    marketId: key,
    title: key,
    marketLabel: "Yes",
    eventLabel: key,
    status: "open",
    url: "https://example.test",
    description: "",
    endsAt: null,
    updatedAt: null,
    yesPrice: 0.48,
    noPrice: 0.52,
    yesBid: 0.47,
    yesAsk: 0.49,
    noBid: null,
    noAsk: null,
    spread: 0.02,
    lastTradePrice: 0.48,
    volume24h: 10,
    volume24hUnit: "usd",
    totalVolume: null,
    totalVolumeUnit: "usd",
    openInterest: null,
    openInterestUnit: "usd",
    liquidity: null,
    liquidityUnit: "usd",
    yesTokenId: token,
    noTokenId: `${token}-no`,
  };
}

test("a resubscribe keeps patches for asset ids that are still subscribed", () => {
  const pending = new Map<string, LiveQuotePatch>([
    ["a", { yesPrice: 0.62 }],
    ["b", { yesPrice: 0.2 }],
  ]);
  const markets = new Map([
    ["a", market("a", "token-a")],
    ["b", market("b", "token-b")],
  ]);
  const keep = retainSubscribedQuotePatches(pending, markets, new Set(["token-a", "token-a-no"]));
  expect(keep.get("a")?.yesPrice).toBe(0.62);
  expect(keep.has("b")).toBe(false);
});

const originalWebSocket = globalThis.WebSocket;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  listeners: Record<string, Array<(event?: { data?: string }) => void>> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: { data?: string }) => void) {
    (this.listeners[type] ??= []).push(listener);
  }

  send() {}

  close() {
    for (const listener of this.listeners.close ?? []) listener({});
  }

  emit(data: string) {
    for (const listener of this.listeners.message ?? []) listener({ data });
  }
}

let latestQuotes: ReadonlyMap<string, LiveQuotePatch> = new Map();
let setMarkets: ((markets: PredictionMarketSummary[]) => void) | null = null;
const postponed: Array<ReturnType<typeof setTimeout>> = [];

function Probe() {
  const [markets, setCurrent] = useState([market("a", "token-a"), market("b", "token-b")]);
  setMarkets = setCurrent;
  latestQuotes = useWatchlistLiveOverlay({ enabled: true, markets }).quotes;
  return null;
}

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  for (const id of postponed) originalClearTimeout(id);
  postponed.length = 0;
  MockWebSocket.instances = [];
  setMarkets = null;
});

test("resubscribe flushes a still-subscribed patch without waiting for the coalesce timer", async () => {
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (timeout === 50) {
      const id = originalSetTimeout(handler as () => void, 60_000, ...(args as []));
      postponed.push(id);
      return id;
    }
    return originalSetTimeout(handler as () => void, timeout, ...(args as []));
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    const index = postponed.indexOf(id);
    if (index >= 0) postponed.splice(index, 1);
    return originalClearTimeout(id);
  }) as typeof clearTimeout;

  const testSetup = await testRender(createElement(Probe), { width: 20, height: 4 });
  await act(async () => {
    await testSetup.renderOnce();
  });
  const socket = MockWebSocket.instances.at(-1);
  await act(async () => {
    socket?.emit(JSON.stringify({
      event_type: "last_trade_price",
      asset_id: "token-a",
      price: "0.62",
      size: "1",
      side: "BUY",
      timestamp: "1",
    }));
    socket?.emit(JSON.stringify({
      event_type: "book",
      asset_id: "token-b",
      bids: [{ price: "0.10", size: "1" }, { price: "0.30", size: "1" }],
      asks: [{ price: "0.70", size: "1" }, { price: "0.40", size: "1" }],
    }));
    await testSetup.renderOnce();
  });
  expect(latestQuotes.get("a")?.yesPrice).toBeUndefined();
  expect(latestQuotes.get("b")?.yesPrice).toBeUndefined();

  await act(async () => {
    setMarkets?.([market("a", "token-a")]);
    await testSetup.renderOnce();
  });
  expect(latestQuotes.get("a")?.yesPrice).toBeCloseTo(0.62);
  expect(latestQuotes.has("b")).toBe(false);
  expect(postponed).toHaveLength(0);

  await act(async () => {
    testSetup.renderer.destroy();
  });
});

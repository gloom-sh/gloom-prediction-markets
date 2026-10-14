import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, createElement, useState } from "react";
import { testRender } from "gloomberb/test-support";
import { resetPredictionMarketsPersistence } from "../services/fetch";
import type { PredictionMarketDetail, PredictionMarketSummary } from "../types";
import {
  BROWSE_SOCKET_REST_MS,
  mergePredictionDetailLoad,
  seedPredictionDetailCache,
  shouldSubscribePredictionDetailSocket,
  usePredictionDetailData,
} from "./detail";

function summary(patch: Partial<PredictionMarketSummary> = {}): PredictionMarketSummary {
  return {
    key: "polymarket:1",
    venue: "polymarket",
    marketId: "1",
    title: "Sample",
    marketLabel: "Yes",
    eventLabel: "Sample",
    status: "open",
    url: "https://example.test",
    description: "From the venue.",
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
    yesTokenId: "yes-token",
    noTokenId: "no-token",
    ...patch,
  };
}

function loadedDetail(yesPrice: number): PredictionMarketDetail {
  const next = summary({ yesPrice, description: "From the venue." });
  return {
    summary: next,
    siblings: [],
    rules: ["From the venue."],
    history: [],
    book: {
      yesBids: [{ price: 0.1, size: 4 }],
      yesAsks: [{ price: 0.2, size: 5 }],
      noBids: [],
      noAsks: [],
      lastTradePrice: 0.11,
    },
    trades: [],
  };
}

test("a snapshot does not clobber a yes price or book the socket already wrote", () => {
  const current = loadedDetail(0.62);
  current.book.yesBids = [{ price: 0.61, size: 2 }];
  current.trades = [{
    id: "t",
    timestamp: 1,
    side: "buy",
    outcome: "yes",
    price: 0.62,
    size: 1,
  }];
  const loaded = loadedDetail(0.48);
  loaded.rules = ["From the venue.", "Resolution text"];
  const merged = mergePredictionDetailLoad(current, loaded, {
    yesPrice: true,
    bids: true,
    book: true,
    trades: true,
  });
  expect(merged.summary.yesPrice).toBe(0.62);
  expect(merged.summary.yesBid).toBe(current.summary.yesBid);
  expect(merged.book.yesBids).toEqual([{ price: 0.61, size: 2 }]);
  expect(merged.trades).toEqual(current.trades);
  expect(merged.rules).toEqual(["From the venue.", "Resolution text"]);
  expect(mergePredictionDetailLoad(current, loaded, {
    yesPrice: false,
    bids: false,
    book: false,
    trades: false,
  }).summary.yesPrice).toBe(0.48);
});

test("the detail cache is seeded before a socket print has a snapshot to land on", () => {
  const sample = summary();
  const seeded = seedPredictionDetailCache({}, "polymarket:1|1M", sample, null);
  expect(seeded["polymarket:1|1M"]?.summary.yesPrice).toBe(0.48);
  expect(seeded["polymarket:1|1M"]?.book.yesBids).toEqual([]);
  const persisted: PredictionMarketDetail = {
    ...seeded["polymarket:1|1M"]!,
    rules: ["saved"],
  };
  expect(seedPredictionDetailCache({}, "polymarket:1|1M", sample, persisted)["polymarket:1|1M"]?.rules).toEqual(["saved"]);
  const wrongKey: PredictionMarketDetail = {
    ...persisted,
    summary: { ...persisted.summary, key: "other" },
  };
  expect(seedPredictionDetailCache({}, "polymarket:1|1M", sample, wrongKey)["polymarket:1|1M"]?.rules).toEqual(["From the venue."]);
  const existing = seedPredictionDetailCache(seeded, "polymarket:1|1M", summary({ yesPrice: 0.1 }), null);
  expect(existing).toBe(seeded);
});

test("the detail socket stays up while detail is closed unless the list socket already has the market", () => {
  const sample = summary();
  expect(shouldSubscribePredictionDetailSocket({
    focused: true,
    summary: sample,
    detailOpen: false,
    listCoversMarket: false,
  })).toBe(true);
  expect(shouldSubscribePredictionDetailSocket({
    focused: true,
    summary: sample,
    detailOpen: false,
    listCoversMarket: true,
  })).toBe(false);
  expect(shouldSubscribePredictionDetailSocket({
    focused: true,
    summary: sample,
    detailOpen: true,
    listCoversMarket: true,
  })).toBe(true);
  expect(shouldSubscribePredictionDetailSocket({
    focused: false,
    summary: sample,
    detailOpen: false,
    listCoversMarket: false,
  })).toBe(false);
  expect(shouldSubscribePredictionDetailSocket({
    focused: true,
    summary: summary({ venue: "kalshi", yesTokenId: undefined, noTokenId: undefined }),
    detailOpen: false,
    listCoversMarket: false,
  })).toBe(false);
});

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  resetPredictionMarketsPersistence();
});

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

interface PendingFetch {
  url: string;
  resolve: (value: Response) => void;
}

let pendingFetches: PendingFetch[] = [];
let catalogWrites = 0;
let latest: ReturnType<typeof usePredictionDetailData> | null = null;
let setSummary: ((summary: PredictionMarketSummary | null) => void) | null = null;

function writeCatalog() {
  catalogWrites += 1;
}

function releaseFetches() {
  const batch = pendingFetches.splice(0);
  for (const item of batch) {
    if (item.url.includes("prices-history")) {
      item.resolve(new Response(JSON.stringify({ history: [] }), { status: 200 }));
    } else if (item.url.includes("/book?")) {
      item.resolve(new Response(JSON.stringify({
        bids: [{ price: "0.10", size: "4" }],
        asks: [{ price: "0.20", size: "5" }],
        last_trade_price: "0.11",
      }), { status: 200 }));
    } else {
      item.resolve(new Response("no", { status: 404 }));
    }
  }
}

function Probe() {
  const [current, setCurrent] = useState<PredictionMarketSummary | null>(summary());
  setSummary = setCurrent;
  latest = usePredictionDetailData({
    focused: true,
    detailOpen: current != null,
    historyRange: "1M",
    selectedSummary: current,
    browseSummary: null,
    setCatalogCache: writeCatalog,
  });
  return null;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
  pendingFetches = [];
  catalogWrites = 0;
  latest = null;
  setSummary = null;
  MockWebSocket.instances = [];
});

test("a print before the snapshot is kept when the snapshot arrives", async () => {
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  globalThis.fetch = (async (input: Request | string | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    return await new Promise<Response>((resolve) => {
      pendingFetches.push({ url, resolve });
    });
  }) as typeof fetch;

  const testSetup = await testRender(createElement(Probe), { width: 20, height: 4 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await testSetup.renderOnce();
  });
  expect(pendingFetches.length).toBeGreaterThan(0);
  const socket = MockWebSocket.instances.at(-1);
  expect(socket).toBeDefined();
  await act(async () => {
    socket?.emit(JSON.stringify({
      event_type: "last_trade_price",
      asset_id: "yes-token",
      price: "0.62",
      size: "3",
      side: "BUY",
      timestamp: "1710000000000",
    }));
    await testSetup.renderOnce();
  });
  expect(latest?.detail?.summary.yesPrice).toBeCloseTo(0.62);

  await act(async () => {
    releaseFetches();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await testSetup.renderOnce();
  });
  expect(latest?.detail?.summary.yesPrice).toBeCloseTo(0.62);
  expect(latest?.detail?.rules).toContain("From the venue.");
  expect(latest?.detail?.book.yesBids[0]?.price).toBeCloseTo(0.1);
  expect(catalogWrites).toBe(1);

  await act(async () => {
    testSetup.renderer.destroy();
  });
});

test("an aborted detail load does not write the snapshot", async () => {
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  globalThis.fetch = (async (input: Request | string | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    return await new Promise<Response>((resolve) => {
      pendingFetches.push({ url, resolve });
    });
  }) as typeof fetch;

  const testSetup = await testRender(createElement(Probe), { width: 20, height: 4 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await testSetup.renderOnce();
  });
  expect(pendingFetches.length).toBeGreaterThan(0);

  await act(async () => {
    setSummary?.(null);
    await testSetup.renderOnce();
  });
  await act(async () => {
    releaseFetches();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await testSetup.renderOnce();
  });
  expect(catalogWrites).toBe(0);

  await act(async () => {
    setSummary?.(summary());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await testSetup.renderOnce();
  });
  expect(latest?.detail?.book.yesBids.length ?? 0).toBe(0);
  expect(catalogWrites).toBe(0);

  await act(async () => {
    testSetup.renderer.destroy();
  });
});

let setBrowsed: ((summary: PredictionMarketSummary | null) => void) | null = null;

function BrowseProbe() {
  const [browsed, setCurrent] = useState<PredictionMarketSummary | null>(summary());
  setBrowsed = setCurrent;
  usePredictionDetailData({
    focused: true,
    detailOpen: false,
    historyRange: "1M",
    selectedSummary: null,
    browseSummary: browsed,
    setCatalogCache: writeCatalog,
  });
  return null;
}

test("the browse socket waits for the cursor to rest instead of one socket per row", async () => {
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  const testSetup = await testRender(createElement(BrowseProbe), { width: 20, height: 4 });
  for (const id of ["2", "3", "4"]) {
    await act(async () => {
      setBrowsed?.(summary({ key: `polymarket:${id}`, marketId: id, yesTokenId: `yes-${id}`, noTokenId: `no-${id}` }));
      await testSetup.renderOnce();
    });
  }
  expect(MockWebSocket.instances).toHaveLength(0);

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, BROWSE_SOCKET_REST_MS + 50));
    await testSetup.renderOnce();
  });
  expect(MockWebSocket.instances).toHaveLength(1);

  await act(async () => {
    testSetup.renderer.destroy();
  });
  setBrowsed = null;
});

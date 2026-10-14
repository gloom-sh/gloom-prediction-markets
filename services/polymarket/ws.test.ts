import { afterEach, expect, test } from "bun:test";
import {
  dispatchPolymarketMarketFrame,
  subscribePolymarketMarket,
} from "./ws";

const originalWebSocket = globalThis.WebSocket;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  listeners: Record<string, Array<(event?: { data?: string } | undefined) => void>> = {
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

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  MockWebSocket.instances = [];
});

test("a JSON array of events is dispatched and a tradeless price is dropped", () => {
  const trades: Array<{ price: number; size: number }> = [];
  const quotes: Array<[string, number | null, number | null]> = [];
  const levels: Array<{ price: number; size: number; side: string }> = [];
  dispatchPolymarketMarketFrame(JSON.stringify([
    null,
    "skip",
    {
      event_type: "last_trade_price",
      asset_id: "yes-token",
      size: "2",
      side: "BUY",
      timestamp: "10",
    },
    {
      event_type: "last_trade_price",
      asset_id: "yes-token",
      price: "nope",
      size: "2",
      side: "BUY",
      timestamp: "11",
    },
    {
      event_type: "last_trade_price",
      asset_id: "yes-token",
      price: "0.62",
      side: "BUY",
      timestamp: "12",
    },
    {
      event_type: "price_change",
      price_changes: [
        {
          asset_id: "yes-token",
          price: "0.4",
          size: "5",
          side: "BUY",
          best_bid: "0.4",
          best_ask: "0.6",
        },
        null,
        {
          asset_id: "yes-token",
          price: "0.7",
          size: "0",
          side: "SELL",
          best_bid: "0.41",
          best_ask: "0.59",
        },
      ],
    },
    {
      event_type: "book",
      asset_id: "yes-token",
      bids: [{ price: "0.2", size: "1" }],
      asks: [{ price: "0.8", size: "1" }],
    },
  ]), {
    onTrade: (_assetId, trade) => trades.push({ price: trade.price, size: trade.size }),
    onBestBidAsk: (assetId, bestBid, bestAsk) => quotes.push([assetId, bestBid, bestAsk]),
    onBookLevel: (_assetId, side, price, size) => levels.push({ side, price, size }),
    onBook: () => levels.push({ side: "book", price: 0, size: 0 }),
  });

  expect(trades).toEqual([{ price: 0.62, size: 0 }]);
  expect(quotes).toEqual([
    ["yes-token", 0.4, 0.6],
    ["yes-token", 0.41, 0.59],
  ]);
  expect(levels).toEqual([
    { side: "bid", price: 0.4, size: 5 },
    { side: "ask", price: 0.7, size: 0 },
    { side: "book", price: 0, size: 0 },
  ]);
  expect(() => dispatchPolymarketMarketFrame("PONG", {})).not.toThrow();
});

test("the market socket runs the same dispatcher for an array frame", () => {
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  const trades: number[] = [];
  const unsubscribe = subscribePolymarketMarket(["yes-token"], {
    onTrade: (_assetId, trade) => trades.push(trade.price),
  });
  MockWebSocket.instances.at(-1)?.emit(JSON.stringify([
    { event_type: "last_trade_price", asset_id: "yes-token", price: "0.25", size: "1", side: "BUY", timestamp: "1" },
    { event_type: "last_trade_price", asset_id: "yes-token", size: "1", side: "BUY", timestamp: "2" },
  ]));
  expect(trades).toEqual([0.25]);
  unsubscribe();
});

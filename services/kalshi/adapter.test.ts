import { afterEach, describe, expect, test } from "bun:test";
import type { PredictionMarketSummary } from "../../types";
import {
  loadKalshiCatalogPage,
  loadKalshiDetail,
  loadMoreKalshiCatalog,
} from "./adapter";

const originalFetch = globalThis.fetch;
const CATEGORY_CURSOR_PREFIX = "kalshi-cat-cursors:v1:";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function decodeCategoryCursors(cursor: string | null): Record<string, string> {
  expect(cursor?.startsWith(CATEGORY_CURSOR_PREFIX)).toBe(true);
  const encoded = cursor!.slice(CATEGORY_CURSOR_PREFIX.length);
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, string>;
}

function kalshiEvent(ticker: string, category: string) {
  return {
    title: ticker,
    category,
    event_ticker: ticker,
    markets: [
      {
        ticker,
        title: ticker,
        event_ticker: ticker,
        status: "active",
        market_type: "binary",
        last_price_dollars: "0.40",
        volume_24h_fp: "10",
      },
    ],
  };
}

function requestParts(url: string): { category: string | null; cursor: string | null } {
  const params = new URL(url).searchParams;
  return {
    category: params.get("category"),
    cursor: params.get("cursor"),
  };
}

describe("kalshi catalog cursors", () => {
  test("encodes kalshi-cat-cursors:v1 base64url JSON with one cursor per Kalshi category", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = String(input);
      calls.push(url);
      const { category, cursor } = requestParts(url);
      if (category === "Politics" && cursor == null) {
        return json({ events: [kalshiEvent("POL-1", "Politics")], cursor: "pol-2" });
      }
      if (category === "Elections" && cursor == null) {
        return json({ events: [kalshiEvent("EL-1", "Elections")], cursor: "el-2" });
      }
      if (category === "Politics" && cursor === "pol-2") {
        return json({ events: [kalshiEvent("POL-2", "Politics")], cursor: "pol-3" });
      }
      if (category === "Elections" && cursor === "el-2") {
        return json({ events: [], cursor: "" });
      }
      if (category === "Politics" && cursor === "pol-3") {
        return json({ events: [kalshiEvent("POL-3", "Politics")], cursor: "" });
      }
      return json({ events: [kalshiEvent("WRONG", category ?? "none")], cursor: "wrong" });
    }) as typeof fetch;

    const first = await loadKalshiCatalogPage("politics", null);
    expect(first.markets.map((market) => market.marketId).sort()).toEqual(["EL-1", "POL-1"]);
    expect(decodeCategoryCursors(first.nextCursor)).toEqual({
      Politics: "pol-2",
      Elections: "el-2",
    });

    const second = await loadMoreKalshiCatalog("", "politics", first.nextCursor ?? "");
    expect(calls.slice(2).map((url) => requestParts(url))).toEqual([
      { category: "Politics", cursor: "pol-2" },
      { category: "Elections", cursor: "el-2" },
    ]);
    expect(second.markets.map((market) => market.marketId)).toEqual(["POL-2"]);
    expect(decodeCategoryCursors(second.nextCursor)).toEqual({ Politics: "pol-3" });
    expect(second.hasMore).toBe(true);

    const third = await loadMoreKalshiCatalog("", "politics", second.nextCursor ?? "");
    expect(calls.slice(4).map((url) => requestParts(url))).toEqual([
      { category: "Politics", cursor: "pol-3" },
    ]);
    expect(third.nextCursor).toBeNull();
    expect(third.hasMore).toBe(false);
  });

  test("world keeps separate cursors for World and Politics", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const { category, cursor } = requestParts(String(input));
      if (cursor == null && category === "World") {
        return json({ events: [kalshiEvent("WORLD-1", "World")], cursor: "w-2" });
      }
      if (cursor == null && category === "Politics") {
        return json({ events: [kalshiEvent("POL-1", "Politics")], cursor: "p-2" });
      }
      return json({ events: [], cursor: "" });
    }) as typeof fetch;

    const first = await loadKalshiCatalogPage("world", null);
    expect(decodeCategoryCursors(first.nextCursor)).toEqual({
      World: "w-2",
      Politics: "p-2",
    });

    const calls: string[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      calls.push(String(input));
      return json({ events: [], cursor: "" });
    }) as typeof fetch;
    await loadMoreKalshiCatalog("", "world", first.nextCursor ?? "");
    expect(calls.map((url) => requestParts(url))).toEqual([
      { category: "World", cursor: "w-2" },
      { category: "Politics", cursor: "p-2" },
    ]);
  });

  test("a single-category tab keeps the raw API cursor", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = String(input);
      calls.push(url);
      const { category, cursor } = requestParts(url);
      expect(category).toBe("Economics");
      if (cursor == null) return json({ events: [kalshiEvent("ECON-1", "Economics")], cursor: "econ-2" });
      expect(cursor).toBe("econ-2");
      return json({ events: [kalshiEvent("ECON-2", "Economics")], cursor: "" });
    }) as typeof fetch;

    const first = await loadKalshiCatalogPage("macro", null);
    expect(first.nextCursor).toBe("econ-2");
    expect(first.nextCursor?.startsWith(CATEGORY_CURSOR_PREFIX)).toBe(false);
    const second = await loadMoreKalshiCatalog("", "macro", first.nextCursor ?? "");
    expect(second.nextCursor).toBeNull();
    expect(calls).toHaveLength(2);
  });

  test("does not send one raw cursor to every category on a two-category tab", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      calls.push(String(input));
      return json({ events: [], cursor: "next" });
    }) as typeof fetch;

    const page = await loadKalshiCatalogPage("politics", "shared-cursor");
    expect(calls).toEqual([]);
    expect(page.markets).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

function tradeSummary(): PredictionMarketSummary {
  return {
    key: "kalshi:TEST-MKT",
    venue: "kalshi",
    marketId: "TEST-MKT",
    title: "Test market",
    marketLabel: "Yes",
    eventLabel: "Test event",
    eventTicker: "TEST-EVT",
    seriesTicker: "TEST",
    status: "open",
    url: "https://kalshi.com/markets/TEST-MKT",
    description: "",
    endsAt: null,
    updatedAt: null,
    yesPrice: 0.4,
    noPrice: 0.6,
    yesBid: null,
    yesAsk: null,
    noBid: null,
    noAsk: null,
    spread: null,
    lastTradePrice: 0.4,
    volume24h: 10,
    volume24hUnit: "contracts",
    totalVolume: null,
    totalVolumeUnit: "contracts",
    openInterest: null,
    openInterestUnit: "contracts",
    liquidity: null,
    liquidityUnit: "usd",
  };
}

describe("kalshi trades", () => {
  test("maps taker_side onto the outcome and does not treat no as a sell", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = String(input);
      if (url.includes("/markets/trades")) {
        return json({
          trades: [
            {
              trade_id: "t-yes",
              ticker: "TEST-MKT",
              taker_side: "yes",
              yes_price_dollars: "0.42",
              no_price_dollars: "0.58",
              count_fp: "3",
              created_time: "2026-04-01T00:00:00Z",
            },
            {
              trade_id: "t-no",
              ticker: "TEST-MKT",
              taker_side: "no",
              yes_price_dollars: "0.42",
              no_price_dollars: "0.58",
              count_fp: "4",
              created_time: "2026-04-01T00:01:00Z",
            },
            {
              trade_id: "t-sell",
              ticker: "TEST-MKT",
              taker_side: "no",
              side: "sell",
              yes_price_dollars: "0.42",
              no_price_dollars: "0.58",
              count_fp: "5",
              created_time: "2026-04-01T00:02:00Z",
            },
            {
              trade_id: "t-side-yes",
              ticker: "TEST-MKT",
              taker_side: "no",
              side: "yes",
              yes_price_dollars: "0.42",
              no_price_dollars: "0.58",
              count_fp: "6",
              created_time: "2026-04-01T00:03:00Z",
            },
          ],
        });
      }
      if (url.includes("/orderbook")) return json({ orderbook_fp: { yes_dollars: [], no_dollars: [] } });
      if (url.includes("/candlesticks")) return json({ candlesticks: [] });
      if (url.includes("/series/")) return json({ series: {} });
      if (url.includes("/events/")) {
        return json({
          event: { title: "Test event", event_ticker: "TEST-EVT", series_ticker: "TEST" },
          markets: [],
        });
      }
      return json({});
    }) as typeof fetch;

    const detail = await loadKalshiDetail(tradeSummary(), "1D");
    expect(detail.trades.map((trade) => ({ id: trade.id, side: trade.side, outcome: trade.outcome }))).toEqual([
      { id: "t-yes", side: "buy", outcome: "yes" },
      { id: "t-no", side: "buy", outcome: "no" },
      { id: "t-sell", side: "sell", outcome: "no" },
      { id: "t-side-yes", side: "buy", outcome: "no" },
    ]);
  });

  test("uses the selected event contract instead of the contract the row was opened on", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = String(input);
      if (url.includes("/markets/trades")) return json({ trades: [] });
      if (url.includes("/orderbook")) return json({ orderbook_fp: { yes_dollars: [], no_dollars: [] } });
      if (url.includes("/candlesticks")) return json({ candlesticks: [] });
      if (url.includes("/series/")) return json({ series: {} });
      if (url.includes("/events/")) {
        return json({
          event: {
            title: "Fed",
            event_ticker: "FED-EVT",
            series_ticker: "FED",
            category: "Economics",
          },
          markets: [
            {
              ticker: "FED-EVT-OPEN",
              title: "Opened",
              event_ticker: "FED-EVT",
              status: "active",
              market_type: "binary",
              last_price_dollars: "0.20",
              yes_bid_dollars: "0.10",
              open_interest_fp: "50",
            },
            {
              ticker: "FED-EVT-NEXT",
              title: "Next",
              event_ticker: "FED-EVT",
              status: "active",
              market_type: "binary",
              last_price_dollars: "0.70",
              yes_bid_dollars: "0.66",
              open_interest_fp: "9",
            },
          ],
        });
      }
      return json({});
    }) as typeof fetch;

    const detail = await loadKalshiDetail({
      ...tradeSummary(),
      key: "kalshi:FED-EVT-NEXT",
      marketId: "FED-EVT-NEXT",
      title: "Opened",
      marketLabel: "Opened",
      eventTicker: "FED-EVT",
      seriesTicker: "FED",
      url: "",
      yesPrice: 0.2,
      yesBid: 0.1,
      openInterest: 50,
    }, "1D");

    expect(detail.summary.marketId).toBe("FED-EVT-NEXT");
    expect(detail.summary.url).toBe("https://kalshi.com/markets/FED-EVT-NEXT");
    expect(detail.summary.yesPrice).toBeCloseTo(0.7);
    expect(detail.summary.yesBid).toBeCloseTo(0.66);
    expect(detail.summary.openInterest).toBe(9);
    expect(detail.siblings.find((sibling) => sibling.marketId === "FED-EVT-NEXT")?.url)
      .toBe("https://kalshi.com/markets/FED-EVT-NEXT");
  });
});

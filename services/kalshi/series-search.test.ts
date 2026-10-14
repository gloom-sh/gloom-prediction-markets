import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MemoryPluginPersistence } from "gloomberb/test-support";
import { attachPredictionMarketsPersistence } from "../fetch";
import { kalshiEventTickerFromQuery, rankKalshiSeries, streamKalshiSeriesSearch } from "./series-search";

describe("rankKalshiSeries", () => {
  test("ranks ticker matches by volume and keeps the Fed series for a one-word query", () => {
    const ranked = rankKalshiSeries([
      { ticker: "KXCBDECISIONMEXICO", title: "Bank of Mexico interest rate decision", volume_fp: "400000" },
      { ticker: "KXFEDDECISION", title: "Fed meeting", volume_fp: "8000000", tags: ["Fed"] },
      { ticker: "KXHIGHNY", title: "NYC high temperature", volume_fp: "9000000" },
    ], "decision");
    expect(ranked.map((series) => series.ticker)).toEqual(["KXFEDDECISION", "KXCBDECISIONMEXICO"]);
  });
});

const originalFetch = globalThis.fetch;

beforeEach(() => {
  attachPredictionMarketsPersistence(new MemoryPluginPersistence());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function kalshiMarket(ticker: string, title: string) {
  return {
    ticker,
    title,
    event_ticker: "KXFEDDECISION-26OCT",
    status: "active",
    market_type: "binary",
    last_price_dollars: "0.48",
    yes_bid_dollars: "0.47",
    yes_ask_dollars: "0.49",
  };
}

describe("streamKalshiSeriesSearch", () => {
  test("loads the event ticker from a pasted Kalshi URL", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.includes("/events/KXFEDDECISION-26OCT")) {
        return jsonResponse({
          event: {
            title: "Fed decision in Oct 2026?",
            category: "Economics",
            event_ticker: "KXFEDDECISION-26OCT",
            series_ticker: "KXFEDDECISION",
          },
          markets: [kalshiMarket("KXFEDDECISION-26OCT-H0", "Fed maintains rate")],
        });
      }
      return jsonResponse({ series: [], events: [] });
    }) as typeof fetch;

    const batches: string[][] = [];
    await streamKalshiSeriesSearch(
      "https://kalshi.com/markets/kxfeddecision/kxfeddecision-26oct",
      "sports",
      new AbortController().signal,
      (markets) => {
        batches.push(markets.map((market) => market.marketId));
      },
    );

    expect(kalshiEventTickerFromQuery("https://kalshi.com/markets/kxfeddecision/kxfeddecision-26oct"))
      .toBe("KXFEDDECISION-26OCT");
    expect(urls.some((url) => url.includes("/trade-api/v2/events/KXFEDDECISION-26OCT"))).toBe(true);
    expect(batches.flat()).toEqual(["KXFEDDECISION-26OCT-H0"]);
    expect(urls.filter((url) => url.includes("/series")).every((url) => !url.includes("category="))).toBe(true);
  });

  test("pages series events until the cursor is empty and ignores the selected category", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.includes("/series")) {
        return jsonResponse({
          series: [{ ticker: "KXFEDDECISION", title: "Fed meeting", volume_fp: "8000000", tags: ["Fed"] }],
        });
      }
      const parsed = new URL(url);
      if (parsed.searchParams.get("cursor") === "page-2") {
        return jsonResponse({
          events: [{
            title: "Fed decision in Dec 2026?",
            category: "Economics",
            event_ticker: "KXFEDDECISION-26DEC",
            series_ticker: "KXFEDDECISION",
            markets: [kalshiMarket("KXFEDDECISION-26DEC-H0", "Fed maintains rate in December")],
          }],
          cursor: "",
        });
      }
      return jsonResponse({
        events: [{
          title: "Fed decision in Oct 2026?",
          category: "Economics",
          event_ticker: "KXFEDDECISION-26OCT",
          series_ticker: "KXFEDDECISION",
          markets: [kalshiMarket("KXFEDDECISION-26OCT-H0", "Fed maintains rate")],
        }],
        cursor: "page-2",
      });
    }) as typeof fetch;

    const ids: string[] = [];
    await streamKalshiSeriesSearch(
      "decision",
      "sports",
      new AbortController().signal,
      (markets) => {
        ids.push(...markets.map((market) => market.marketId));
      },
    );

    const eventPages = urls.filter((url) => url.includes("/events?") && url.includes("series_ticker=KXFEDDECISION"));
    expect(eventPages).toHaveLength(2);
    expect(eventPages[1]).toContain("cursor=page-2");
    expect(urls.filter((url) => url.includes("/series")).every((url) => !url.includes("category="))).toBe(true);
    expect(ids).toEqual(["KXFEDDECISION-26OCT-H0", "KXFEDDECISION-26DEC-H0"]);
  });

  test("a market ticker and a pane link retry the event after the contract lookup misses", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.includes("/events/KXFEDDECISION-26OCT-H0")) {
        return new Response("missing", { status: 404 });
      }
      if (url.includes("/events/KXFEDDECISION-26OCT")) {
        return jsonResponse({
          event: {
            title: "Fed decision in Oct 2026?",
            category: "Economics",
            event_ticker: "KXFEDDECISION-26OCT",
            series_ticker: "KXFEDDECISION",
          },
          markets: [kalshiMarket("KXFEDDECISION-26OCT-H0", "Fed maintains rate")],
        });
      }
      return jsonResponse({ series: [], events: [] });
    }) as typeof fetch;

    const fromTicker: string[] = [];
    await streamKalshiSeriesSearch(
      "KXFEDDECISION-26OCT-H0",
      "sports",
      new AbortController().signal,
      (markets) => {
        fromTicker.push(...markets.map((market) => market.marketId));
      },
    );
    const fromUrl: string[] = [];
    await streamKalshiSeriesSearch(
      "https://kalshi.com/markets/KXFEDDECISION-26OCT-H0",
      "sports",
      new AbortController().signal,
      (markets) => {
        fromUrl.push(...markets.map((market) => market.marketId));
      },
    );

    expect(fromTicker).toEqual(["KXFEDDECISION-26OCT-H0"]);
    expect(fromUrl).toEqual(["KXFEDDECISION-26OCT-H0"]);
    expect(urls.filter((url) => url.includes("/events/KXFEDDECISION-26OCT-H0"))).toHaveLength(2);
    expect(urls.filter((url) => url.includes("/events/KXFEDDECISION-26OCT?"))).toHaveLength(2);
  });

  test("a series page loads that series and skips the event route", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.includes("/series")) {
        return jsonResponse({
          series: [{ ticker: "KXFEDDECISION", title: "Fed meeting", volume_fp: "8000000" }],
        });
      }
      if (url.includes("series_ticker=KXFEDDECISION")) {
        return jsonResponse({
          events: [{
            title: "Fed decision in Oct 2026?",
            category: "Economics",
            event_ticker: "KXFEDDECISION-26OCT",
            series_ticker: "KXFEDDECISION",
            markets: [kalshiMarket("KXFEDDECISION-26OCT-H0", "Fed maintains rate")],
          }],
          cursor: "",
        });
      }
      return new Response("missing", { status: 404 });
    }) as typeof fetch;

    const ids: string[] = [];
    await streamKalshiSeriesSearch(
      "https://kalshi.com/markets/kxfeddecision",
      "sports",
      new AbortController().signal,
      (markets) => {
        ids.push(...markets.map((market) => market.marketId));
      },
    );

    expect(ids).toEqual(["KXFEDDECISION-26OCT-H0"]);
    expect(urls.some((url) => url.includes("/events/KXFEDDECISION"))).toBe(false);
    expect(urls.filter((url) => url.includes("series_ticker=KXFEDDECISION"))).toHaveLength(1);
  });
});

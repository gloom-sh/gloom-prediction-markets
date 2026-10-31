import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MemoryPluginPersistence } from "gloomberb/test-support";
import { attachPredictionMarketsPersistence } from "../fetch";
import { KALSHI_SERIES_SEARCH_PAGE_SIZE, kalshiEventTickerFromQuery, loadKalshiPagedSeriesSearch, rankKalshiSeries, streamKalshiSeriesSearch } from "./series-search";

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

describe("loadKalshiPagedSeriesSearch", () => {
  test("pages all categories, deduplicates series, and ranks matches from later pages", async () => {
    const searches: URL[] = [];
    const item = (ticker: string, volume: number, category = "Sports") => ({
      series_ticker: ticker,
      series_title: "Championship winner",
      total_series_volume: volume,
      category,
      tags: null,
    });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(requestUrl(input));
      if (url.pathname === "/v1/search/series") {
        searches.push(url);
        const cursor = url.searchParams.get("cursor");
        if (cursor === "second/+==") {
          // Even an empty page can carry a continuation token.
          return jsonResponse({ current_page: [], next_cursor: "third" });
        }
        if (cursor === "third") {
          return jsonResponse({
            current_page: [item("SPORT0", 1), item("NEW", 100, "New category")],
          });
        }
        return jsonResponse({
          current_page: Array.from({ length: 8 }, (_, i) => item(`SPORT${i}`, i + 1)),
          next_cursor: "second/+==",
        });
      }
      return jsonResponse({ events: [] });
    }) as typeof fetch;

    const series = await loadKalshiPagedSeriesSearch("championship", new AbortController().signal);
    expect(series).toHaveLength(9);
    expect(searches).toHaveLength(3);
    expect(searches.map((url) => url.searchParams.get("cursor"))).toEqual([null, "second/+==", "third"]);
    for (const url of searches) {
      expect(url.searchParams.get("page_size")).toBe(String(KALSHI_SERIES_SEARCH_PAGE_SIZE));
      expect(url.searchParams.get("query")).toBe("championship");
      expect(url.searchParams.has("category")).toBe(false);
    }
    expect(rankKalshiSeries(series, "championship").map((match) => match.ticker)).toEqual(["NEW", "SPORT7", "SPORT6", "SPORT5", "SPORT4", "SPORT3", "SPORT2", "SPORT1"]);

    // Only a complete traversal is cached, and it is specific to the query.
    await loadKalshiPagedSeriesSearch("championship", new AbortController().signal);
    expect(searches).toHaveLength(3);
    await loadKalshiPagedSeriesSearch("winner", new AbortController().signal);
    expect(searches).toHaveLength(6);
  });

  test.each(["failure", "cycle", "invalid"])("does not cache a partial index after a paging %s", async (failure) => {
    const searches: Array<string | null> = [];
    let fail = true;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(requestUrl(input));
      if (url.pathname !== "/v1/search/series") return jsonResponse({ events: [] });
      const cursor = url.searchParams.get("cursor");
      searches.push(cursor);
      if (fail && cursor) {
        if (failure === "failure") return new Response("missing", { status: 404 });
        if (failure === "invalid") return jsonResponse({});
        return jsonResponse({ current_page: [], next_cursor: "next" });
      }
      return jsonResponse({ current_page: [], next_cursor: fail ? "next" : "" });
    }) as typeof fetch;
    await expect(loadKalshiPagedSeriesSearch("decision", new AbortController().signal)).rejects.toThrow();
    expect(searches).toEqual([null, "next"]);
    fail = false;
    await loadKalshiPagedSeriesSearch("decision", new AbortController().signal);
    expect(searches).toEqual([null, "next", null]);
  });

  test("cancellation between pages stops the traversal without caching a partial index", async () => {
    const controller = new AbortController();
    let calls = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL) => {
      calls += 1;
      if (calls === 1) controller.abort();
      return jsonResponse({ current_page: [], next_cursor: calls === 1 ? "next" : "" });
    }) as typeof fetch;
    await expect(loadKalshiPagedSeriesSearch("decision", controller.signal)).rejects.toThrow();
    expect(calls).toBe(1);
    await loadKalshiPagedSeriesSearch("decision", new AbortController().signal);
    expect(calls).toBe(2);
  });
});

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

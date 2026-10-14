import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MemoryPluginPersistence } from "gloomberb/test-support";
import { attachPredictionMarketsPersistence } from "../fetch";
import { loadGeminiCatalog } from "./adapter";
import type { GeminiEventRecord, GeminiEventsResponse } from "./types";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  attachPredictionMarketsPersistence(new MemoryPluginPersistence());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function geminiEvent(ticker: string, title = ticker): GeminiEventRecord {
  return {
    id: ticker,
    ticker,
    title,
    slug: ticker.toLowerCase(),
    status: "active",
    category: "Politics",
    contracts: [
      {
        instrumentSymbol: ticker,
        label: "Yes",
        prices: { lastTradePrice: "0.5" },
      },
    ],
  };
}

function page(events: GeminiEventRecord[], offset: number, total: number, limit = 1): GeminiEventsResponse {
  return {
    data: events,
    pagination: { limit, offset, total },
  };
}

describe("gemini catalog paging", () => {
  test("follows pagination offset and total instead of stopping at 100", async () => {
    const offsets: string[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = new URL(String(input));
      const offset = url.searchParams.get("offset") ?? "";
      offsets.push(offset);
      expect(url.searchParams.get("status")).toBe("active");
      expect(url.searchParams.get("limit")).toBe("100");
      expect(url.searchParams.get("search")).toBeNull();
      const index = Number(offset);
      if (index >= 3) return json(page([], index, 3));
      return json(page([geminiEvent(`G-${index}`)], index, 3));
    }) as typeof fetch;

    const markets = await loadGeminiCatalog("", "all");

    expect(offsets).toEqual(["0", "1", "2"]);
    expect(markets.map((market) => market.marketId)).toEqual(["G-0", "G-1", "G-2"]);
  });

  test("keeps the search param while paging", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = String(input);
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      if (offset === 0) return json(page([geminiEvent("FED-1", "Fed Decision one")], 0, 2));
      return json(page([geminiEvent("FED-2", "Fed Decision two")], 1, 2));
    }) as typeof fetch;

    const markets = await loadGeminiCatalog("Fed Decision", "all");

    expect(urls).toHaveLength(2);
    expect(new URL(urls[0] ?? "").searchParams.get("search")).toBe("Fed Decision");
    expect(new URL(urls[1] ?? "").searchParams.get("search")).toBe("Fed Decision");
    expect(markets.map((market) => market.marketId)).toEqual(["FED-1", "FED-2"]);
  });

  test("stops on a repeated event page and caps the walk at 10 pages", async () => {
    let repeatedCalls = 0;
    globalThis.fetch = (async (_input: Request | string | URL) => {
      repeatedCalls += 1;
      return json(page([geminiEvent("SAME")], 0, 50));
    }) as typeof fetch;

    const repeated = await loadGeminiCatalog("", "all");
    expect(repeatedCalls).toBe(2);
    expect(repeated.map((market) => market.marketId)).toEqual(["SAME"]);

    let cappedCalls = 0;
    globalThis.fetch = (async (input: Request | string | URL) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset") ?? "0");
      cappedCalls += 1;
      return json(page([geminiEvent(`CAP-${offset}`)], offset, 1_000));
    }) as typeof fetch;

    const capped = await loadGeminiCatalog("cap", "all");
    expect(cappedCalls).toBe(10);
    expect(capped).toHaveLength(10);
    expect(capped[0]?.marketId).toBe("CAP-0");
    expect(capped[9]?.marketId).toBe("CAP-9");
  });
});

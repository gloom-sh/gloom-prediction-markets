import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MemoryPluginPersistence } from "gloomberb/test-support";
import { attachPredictionMarketsPersistence } from "../fetch";
import {
  loadPolymarketCatalog,
  loadPolymarketSearchHits,
  nextPolymarketCatalogOffset,
} from "./adapter";

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

function polymarketEvent(
  id: string,
  markets: Array<{ id: string; volume: number }>,
) {
  return {
    id,
    title: id,
    tags: [{ label: "Politics", slug: "politics" }],
    markets: markets.map((market) => ({
      id: market.id,
      question: market.id,
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.4", "0.6"],
      volume24hr: market.volume,
      active: true,
      closed: false,
    })),
  };
}

function manyMarkets(prefix: string, count: number, volume: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    volume,
  }));
}

describe("polymarket catalog paging", () => {
  test("keeps every contract from the event pages it already fetched", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset") ?? "0");
      if (offset === 0) return json([polymarketEvent("page-0", manyMarkets("early", 200, 1_000))]);
      if (offset === 200) return json([polymarketEvent("page-200", [{ id: "late-200", volume: 1 }])]);
      if (offset === 400) return json([polymarketEvent("page-400", [{ id: "late-400", volume: 1 }])]);
      return json([]);
    }) as typeof fetch;

    const markets = await loadPolymarketCatalog("", "all");
    const ids = markets.map((market) => market.marketId);

    expect(ids).toHaveLength(202);
    expect(ids).toContain("late-200");
    expect(ids).toContain("late-400");
    expect(nextPolymarketCatalogOffset("all", "")).toBe(600);
  });

  test("resumes at the first event page that was not retained", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset") ?? "0");
      if (offset === 200) throw new Error("catalog page failed");
      if (offset === 0) return json([polymarketEvent("page-0", [{ id: "kept-early", volume: 5 }])]);
      if (offset === 400) return json([polymarketEvent("page-400", [{ id: "kept-late", volume: 1 }])]);
      return json([]);
    }) as typeof fetch;

    const markets = await loadPolymarketCatalog("", "all");
    const ids = markets.map((market) => market.marketId);

    expect(ids).toContain("kept-early");
    expect(ids).toContain("kept-late");
    expect(nextPolymarketCatalogOffset("all", "")).toBe(200);
  });

  test("category tabs keep contracts outside the old 200 cap", async () => {
    const offsets: number[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("tag_slug")).toBe("politics");
      const offset = Number(url.searchParams.get("offset") ?? "0");
      offsets.push(offset);
      if (offset === 0) return json([polymarketEvent("politics-0", manyMarkets("pol", 200, 50))]);
      if (offset === 200) return json([polymarketEvent("politics-200", [{ id: "pol-late", volume: 1 }])]);
      return json([]);
    }) as typeof fetch;

    const markets = await loadPolymarketCatalog("", "politics");

    expect(offsets.sort((left, right) => left - right)).toEqual([0, 200]);
    expect(markets).toHaveLength(201);
    expect(markets.map((market) => market.marketId)).toContain("pol-late");
    expect(nextPolymarketCatalogOffset("politics", "")).toBe(400);
  });

  test("search hits stay capped at the search page size", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      urls.push(String(input));
      return json({
        events: Array.from({ length: 45 }, (_, index) =>
          polymarketEvent(`inflation-${index}`, [{ id: `inflation-market-${index}`, volume: 10 }]),
        ),
      });
    }) as typeof fetch;

    const markets = await loadPolymarketCatalog("inflation", "all");
    const direct = await loadPolymarketSearchHits("inflation", "all", 2);

    expect(new URL(urls[0] ?? "").searchParams.get("limit_per_type")).toBe("40");
    expect(new URL(urls[0] ?? "").pathname).toBe("/public-search");
    expect(new URL(urls[1] ?? "").searchParams.get("limit_per_type")).toBe("2");
    expect(markets).toHaveLength(40);
    expect(direct).toHaveLength(2);
    expect(nextPolymarketCatalogOffset("all", "inflation")).toBeNull();
  });
});

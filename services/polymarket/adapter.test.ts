import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MemoryPluginPersistence } from "gloomberb/test-support";
import { attachPredictionMarketsPersistence } from "../fetch";
import {
  loadMorePolymarketCatalog,
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

function offsetOf(input: Request | string | URL): number {
  return Number(new URL(String(input)).searchParams.get("offset") ?? "0");
}

describe("polymarket catalog paging", () => {
  test("keeps every contract from the event pages it already fetched", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const offset = offsetOf(input);
      if (offset === 0) return json([polymarketEvent("page-0", manyMarkets("early", 200, 1_000))]);
      if (offset === 10) return json([polymarketEvent("page-10", [{ id: "late-10", volume: 1 }])]);
      if (offset === 20) return json([polymarketEvent("page-20", [{ id: "late-20", volume: 1 }])]);
      return json([]);
    }) as typeof fetch;

    const markets = await loadPolymarketCatalog("", "all");
    const ids = markets.map((market) => market.marketId);

    expect(ids).toHaveLength(202);
    expect(ids).toContain("late-10");
    expect(ids).toContain("late-20");
    expect(nextPolymarketCatalogOffset("all", "")).toBe(120);
  });

  test("resumes at the first event page that was not retained", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const offset = offsetOf(input);
      if (offset === 10) throw new Error("catalog page failed");
      if (offset === 0) return json([polymarketEvent("page-0", [{ id: "kept-early", volume: 5 }])]);
      if (offset === 20) return json([polymarketEvent("page-20", [{ id: "kept-late", volume: 1 }])]);
      return json([]);
    }) as typeof fetch;

    const markets = await loadPolymarketCatalog("", "all");
    const ids = markets.map((market) => market.marketId);

    expect(ids).toContain("kept-early");
    expect(ids).toContain("kept-late");
    expect(nextPolymarketCatalogOffset("all", "")).toBe(10);
  });

  test("category tabs read four pages of ten events from the top of the volume order", async () => {
    const offsets: number[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("tag_slug")).toBe("politics");
      const offset = Number(url.searchParams.get("offset") ?? "0");
      offsets.push(offset);
      if (offset === 0) return json([polymarketEvent("politics-0", manyMarkets("pol", 200, 50))]);
      if (offset === 30) return json([polymarketEvent("politics-30", [{ id: "pol-late", volume: 1 }])]);
      return json([]);
    }) as typeof fetch;

    const markets = await loadPolymarketCatalog("", "politics");

    expect(offsets.sort((left, right) => left - right)).toEqual([0, 10, 20, 30]);
    expect(markets).toHaveLength(201);
    expect(markets.map((market) => market.marketId)).toContain("pol-late");
    expect(nextPolymarketCatalogOffset("politics", "")).toBe(40);
  });

  test("every catalog page asks for ten events, which keeps a page under the web proxy's 5 MB", async () => {
    const urls: URL[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      urls.push(new URL(String(input)));
      return json([]);
    }) as typeof fetch;

    await loadPolymarketCatalog("", "all");
    await loadMorePolymarketCatalog("", "all", 120);

    expect(urls).toHaveLength(12 + 4);
    expect(urls.every((url) => url.searchParams.get("limit") === "10")).toBe(true);
    expect(urls.every((url) => url.toString().length < 1_900)).toBe(true);
  });

  test("an explicit limit reads that many events in pages of ten and leaves the browse resume offset alone", async () => {
    const offsets: number[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      offsets.push(offsetOf(input));
      return json([]);
    }) as typeof fetch;
    const resumeBefore = nextPolymarketCatalogOffset("all", "");

    await loadPolymarketCatalog("", "all", { limit: 200 });
    expect(offsets.sort((left, right) => left - right)).toEqual(Array.from({ length: 10 }, (_, index) => index * 10));

    offsets.length = 0;
    globalThis.fetch = (async (input: Request | string | URL) => {
      offsets.push(offsetOf(input));
      return json([polymarketEvent("politics-event", [{ id: "politics-market", volume: 1 }])]);
    }) as typeof fetch;
    await loadPolymarketCatalog("", "politics", { limit: 8 });
    expect(offsets).toEqual([0]);
    expect(nextPolymarketCatalogOffset("all", "")).toBe(resumeBefore);
  });

  test("load more reads a batch of four pages and resumes at one that failed", async () => {
    const offsets: number[] = [];
    globalThis.fetch = (async (input: Request | string | URL) => {
      const offset = offsetOf(input);
      offsets.push(offset);
      if (offset === 150) throw new Error("page failed");
      return json(Array.from({ length: 10 }, (_, index) => polymarketEvent(`event-${offset}-${index}`, [{ id: `m-${offset}-${index}`, volume: 1 }])));
    }) as typeof fetch;

    const more = await loadMorePolymarketCatalog("", "all", 120);

    expect(offsets.sort((left, right) => left - right)).toEqual([120, 130, 140, 150]);
    expect(more.markets).toHaveLength(30);
    expect(more.nextOffset).toBe(150);
    expect(more.hasMore).toBe(true);

    globalThis.fetch = (async (input: Request | string | URL) => {
      const offset = offsetOf(input);
      return json(offset < 160 ? Array.from({ length: 10 }, (_, index) => polymarketEvent(`e-${offset}-${index}`, [{ id: `x-${offset}-${index}`, volume: 1 }])) : []);
    }) as typeof fetch;
    const rest = await loadMorePolymarketCatalog("", "all", 160);
    expect(rest.markets).toHaveLength(0);
    expect(rest.hasMore).toBe(false);
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

describe("polymarket refresh times", () => {
  test("a search hit with no update time is dated by none, not by the day its event started", async () => {
    globalThis.fetch = (async () => json({
      events: [{
        id: "mortgage", title: "Mortgage delinquency rate exceeds 3% by end of Q4 2027?", startDate: "2026-09-28T17:55:56Z",
        markets: [{ id: "m-1", question: "Mortgage delinquency rate exceeds 3%?", createdAt: "2026-09-28T17:50:00Z",
          outcomes: ["Yes", "No"], outcomePrices: ["0.455", "0.545"], active: true, closed: false }],
      }],
    })) as unknown as typeof fetch;
    const [hit] = await loadPolymarketSearchHits("mortgage", "all");
    expect(hit).toMatchObject({ status: "open", updatedAt: null, refreshedAt: null });

    globalThis.fetch = (async () => json([{ ...polymarketEvent("browse", [{ id: "m-2", volume: 10 }]), updatedAt: "2026-10-23T21:50:53Z" }])) as unknown as typeof fetch;
    const [browsed] = await loadPolymarketCatalog("", "all", { limit: 10 });
    expect(browsed).toMatchObject({ updatedAt: "2026-10-23T21:50:53Z", refreshedAt: "2026-10-23T21:50:53Z" });
  });
});

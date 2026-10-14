import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, createElement } from "react";
import * as gloomberbReact from "gloomberb/react";
import { testRender } from "gloomberb/test-support";
import type { PredictionMarketSummary } from "../types";

let latestRefresh: (() => void) | null = null;

mock.module("gloomberb/react", () => ({
  ...gloomberbReact,
  useAutoRefresh(_lastUpdated: number | null, refresh: () => void) {
    latestRefresh = refresh;
  },
}));

const {
  catalogPendingContribution,
  scanSearchCatalogs,
  seedCatalogPending,
  usePredictionCatalogData,
} = await import("./catalog");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  latestRefresh = null;
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

function polymarketEvent(id: string, question: string) {
  return {
    id: "9001",
    title: question,
    markets: [{
      id,
      question,
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.5", "0.5"],
      active: true,
      closed: false,
    }],
  };
}

describe("catalog pending", () => {
  test("seeds only the uncached venues in scope", () => {
    const kalshiOnly = seedCatalogPending({
      categoryId: "macro",
      includeKalshi: true,
      includePolymarket: false,
      venueScope: "kalshi",
    });
    expect(kalshiOnly).toEqual({ "kalshi|macro|": 1 });

    const all = seedCatalogPending({
      categoryId: "macro",
      includeKalshi: false,
      includePolymarket: true,
      venueScope: "all",
    });
    expect(all).toEqual({ "polymarket|macro|": 1 });

    for (const venue of ["gemini", "limitless", "crypto-com", "polymarket-us", "pascal"] as const) {
      expect(seedCatalogPending({
        categoryId: "macro",
        includeKalshi: false,
        includePolymarket: false,
        venueScope: venue,
      })).toEqual({ [`${venue}|macro|`]: 1 });
    }
  });

  test("counts an uncached unsettled key as loading", () => {
    const cacheKey = "gemini|macro|";
    const resourceKey = "gemini:macro:all";
    expect(catalogPendingContribution(cacheKey, resourceKey, {}, { [cacheKey]: 1 }, {})).toBe(1);
    expect(catalogPendingContribution(cacheKey, resourceKey, {}, {}, { [cacheKey]: true })).toBe(0);
    expect(catalogPendingContribution(cacheKey, resourceKey, { [cacheKey]: [] }, {}, {})).toBe(0);
    expect(catalogPendingContribution(cacheKey, resourceKey, {}, {}, {})).toBe(1);
  });
});

const POLYMARKET_HOST = "gamma-api.polymarket.com";
const KALSHI_HOST = "api.elections.kalshi.com";
const VENUE_HOSTS = {
  gemini: "api.gemini.com",
  limitless: "api.limitless.exchange",
  "crypto-com": "api.crypto.com",
  "polymarket-us": "gateway.polymarket.us",
  pascal: "data.pascal.trade",
} as const;

function installFetch(searchEvents: unknown[] = []) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    urls.push(url);
    if (url.includes(`${POLYMARKET_HOST}/public-search`)) return jsonResponse({ events: searchEvents });
    if (url.includes(`${POLYMARKET_HOST}/events`)) {
      return jsonResponse([polymarketEvent("111", "Will the home side win?")]);
    }
    if (url.includes("gateway.polymarket.us")) return jsonResponse({ markets: [] });
    if (url.includes("api.gemini.com")) return jsonResponse({ data: [] });
    if (url.includes(KALSHI_HOST)) return jsonResponse({ series: [], events: [] });
    return jsonResponse({ data: [], events: [], markets: [], series: [] });
  }) as typeof fetch;
  return urls;
}

function hostsOf(urls: string[]): string[] {
  return [...new Set(urls.map((url) => new URL(url).host))].sort();
}

describe("scanSearchCatalogs", () => {
  test("a search under All contacts only Polymarket and Kalshi, and ignores the browse category", async () => {
    const urls = installFetch();
    await scanSearchCatalogs({
      query: "qxunique",
      categoryId: "sports",
      venueScope: "all",
      signal: new AbortController().signal,
      addHits() {},
    });

    expect(hostsOf(urls)).toEqual([KALSHI_HOST, POLYMARKET_HOST]);
    expect(urls.filter((url) => url.includes(`${POLYMARKET_HOST}/events`)).every((url) => !url.includes("tag_slug"))).toBe(true);
    expect(urls.filter((url) => url.includes("/trade-api/v2/series")).every((url) => !url.includes("category="))).toBe(true);
  });

  test("a venue picked in the menu is searched on its own", async () => {
    for (const [venue, host] of Object.entries(VENUE_HOSTS)) {
      const urls = installFetch();
      await scanSearchCatalogs({
        query: "qxunique",
        categoryId: "sports",
        venueScope: venue as keyof typeof VENUE_HOSTS,
        signal: new AbortController().signal,
        addHits() {},
      });
      expect(hostsOf(urls)).toEqual([host]);
    }
  });

  test("Crypto.com and the first Limitless page are scanned without the browse category", async () => {
    const urls = installFetch();
    for (const venueScope of ["crypto-com", "limitless"] as const) {
      await scanSearchCatalogs({
        query: "qxunique",
        categoryId: "sports",
        venueScope,
        signal: new AbortController().signal,
        addHits() {},
      });
    }

    expect(urls.some((url) => url.includes("api.crypto.com/dcm/v1/public/get-events"))).toBe(true);
    expect(urls.some((url) => url.includes("api.limitless.exchange/markets/active") && url.includes("page=1"))).toBe(true);
  });
});

describe("catalog browse", () => {
  async function browseHosts(venueScope: "all" | "gemini"): Promise<string[]> {
    const urls = installFetch();
    function Harness() {
      usePredictionCatalogData({
        categoryId: "all",
        includeKalshi: venueScope === "all",
        includePolymarket: venueScope === "all",
        searchQuery: "",
        venueScope,
      });
      return null;
    }
    const rendered = await testRender(createElement(Harness), { width: 20, height: 4 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    rendered.renderer.destroy();
    return hostsOf(urls);
  }

  test("All loads Polymarket and Kalshi, and a picked venue loads only itself", async () => {
    expect(await browseHosts("all")).toEqual([KALSHI_HOST, POLYMARKET_HOST]);
    expect(await browseHosts("gemini")).toEqual([VENUE_HOSTS.gemini]);
  });
});

describe("aborted extra catalog loads", () => {
  test("decrement the pending count and the first paint stays loading", async () => {
    let started = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async () => {
      started += 1;
      await gate;
      return jsonResponse({ data: [] });
    }) as unknown as typeof fetch;

    const latest: { catalogLoadCount: number; allMarkets: PredictionMarketSummary[] } = {
      catalogLoadCount: 0,
      allMarkets: [],
    };
    function Harness() {
      const data = usePredictionCatalogData({
        categoryId: "macro",
        includeKalshi: false,
        includePolymarket: false,
        searchQuery: "",
        venueScope: "gemini",
      });
      latest.catalogLoadCount = data.catalogLoadCount;
      latest.allMarkets = data.allMarkets;
      return null;
    }

    const rendered = await testRender(createElement(Harness), { width: 20, height: 4 });
    expect(started).toBeGreaterThan(0);
    expect(latest.catalogLoadCount).toBeGreaterThan(0);
    expect(latest.allMarkets).toEqual([]);

    await act(async () => {
      latestRefresh?.();
    });
    // The refresh joins the venue download already in flight.
    expect(started).toBe(1);

    await act(async () => {
      release();
      await gate;
    });
    expect(latest.catalogLoadCount).toBe(0);
    rendered.renderer.destroy();
  });
});

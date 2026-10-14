import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MemoryPluginPersistence } from "gloomberb/test-support";
import { attachPredictionMarketsPersistence } from "../fetch";
import { loadCryptoComCatalog } from "./adapter";

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

function eventPage(symbols: string[], nextCursor: string | null) {
  return {
    code: 0,
    result: {
      data: symbols.map((symbol) => ({
        symbol,
        name: symbol,
        description: symbol,
      })),
      next_cursor: nextCursor,
    },
  };
}

function installFetch(eventsFor: (url: URL) => unknown): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: Request | string | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/get-events")) return json(eventsFor(new URL(url)));
    return json({ code: 0, result: { data: [] } });
  }) as typeof fetch;
  return calls;
}

describe("crypto.com event paging", () => {
  test("follows next_cursor and does not send a search param", async () => {
    const calls = installFetch((url) => {
      const cursor = url.searchParams.get("cursor");
      if (cursor == null) return eventPage(["Weather"], "c2");
      expect(cursor).toBe("c2");
      return eventPage(["Bitcoin above 200k"], null);
    });

    const markets = await loadCryptoComCatalog("bitcoin", "all");
    const eventCalls = calls.filter((url) => url.includes("/get-events"));

    expect(markets.map((market) => market.marketId)).toEqual(["Bitcoin above 200k"]);
    expect(eventCalls).toHaveLength(2);
    expect(new URL(eventCalls[0] ?? "").searchParams.get("cursor")).toBeNull();
    expect(new URL(eventCalls[1] ?? "").searchParams.get("cursor")).toBe("c2");
    expect(new URL(eventCalls[0] ?? "").searchParams.get("limit")).toBe("100");
    for (const url of eventCalls) {
      const params = new URL(url).searchParams;
      expect(params.get("search")).toBeNull();
      expect(params.get("q")).toBeNull();
      expect(params.get("query")).toBeNull();
    }
  });

  test("one download serves every category tab and search", async () => {
    const calls = installFetch(() => eventPage(["Bitcoin above 200k", "Weather"], null));

    await loadCryptoComCatalog("", "all");
    const searched = await loadCryptoComCatalog("bitcoin", "all");
    const crypto = await loadCryptoComCatalog("", "crypto");

    expect(searched.map((market) => market.marketId)).toEqual(["Bitcoin above 200k"]);
    expect(crypto.map((market) => market.marketId)).toEqual(["Bitcoin above 200k"]);
    expect(calls.filter((url) => url.includes("/get-events"))).toHaveLength(1);
  });

  test("a search that is aborted stops waiting but the list still gets the one download", async () => {
    const calls = installFetch(() => eventPage(["Bitcoin above 200k"], null));
    const controller = new AbortController();

    const searched = loadCryptoComCatalog("bitcoin", "all", { signal: controller.signal });
    const listed = loadCryptoComCatalog("", "all");
    controller.abort();

    await expect(searched).rejects.toMatchObject({ name: "AbortError" });
    expect((await listed).map((market) => market.marketId)).toEqual(["Bitcoin above 200k"]);
    expect(calls.filter((url) => url.includes("/get-events"))).toHaveLength(1);
  });

  test("stops when the next cursor repeats", async () => {
    const calls = installFetch((url) => {
      const cursor = url.searchParams.get("cursor");
      if (cursor == null) return eventPage(["A"], "loop");
      return eventPage(["B"], "loop");
    });

    const markets = await loadCryptoComCatalog("", "all");
    const eventCalls = calls.filter((url) => url.includes("/get-events"));

    expect(eventCalls).toHaveLength(2);
    expect(markets.map((market) => market.marketId)).toEqual(["A", "B"]);
  });

  test("stops after 10 event pages", async () => {
    const calls = installFetch((url) => {
      const cursor = url.searchParams.get("cursor");
      const page = cursor == null ? 0 : Number(cursor.slice(1));
      return eventPage([`E-${page}`], `c${page + 1}`);
    });

    const markets = await loadCryptoComCatalog("", "all");
    const eventCalls = calls.filter((url) => url.includes("/get-events"));

    expect(eventCalls).toHaveLength(10);
    expect(markets).toHaveLength(10);
    expect(markets[0]?.marketId).toBe("E-0");
    expect(markets[9]?.marketId).toBe("E-9");
  });
});

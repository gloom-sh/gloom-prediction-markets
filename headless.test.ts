import { describe, expect, test } from "bun:test";
import type { HeadlessPaneContext, HeadlessPaneLoadArgs } from "gloomberb/types/plugin";
import {
  createPredictionMarketsHeadless,
  type PredictionMarketsHeadlessDependencies,
} from "./headless";
import type { PredictionMarketSummary, PredictionVenue } from "./types";

function market(
  key: string,
  venue: PredictionVenue,
  title: string,
  volume24h: number,
  endsAt: string,
): PredictionMarketSummary {
  return {
    key,
    venue,
    marketId: `${key}-id`,
    title,
    marketLabel: "Yes",
    eventLabel: title,
    category: title.includes("Fed") ? "Economics" : "Politics",
    tags: [],
    status: "open",
    url: `https://example.com/${key}`,
    description: `${title} market`,
    endsAt,
    updatedAt: "2026-09-04T20:00:00.000Z",
    yesPrice: 0.62,
    noPrice: 0.38,
    yesBid: 0.61,
    yesAsk: 0.63,
    noBid: 0.37,
    noAsk: 0.39,
    spread: 0.02,
    lastTradePrice: 0.62,
    volume24h,
    volume24hUnit: "usd",
    totalVolume: volume24h * 10,
    totalVolumeUnit: "usd",
    openInterest: volume24h / 2,
    openInterestUnit: venue === "kalshi" ? "contracts" : "usd",
    liquidity: volume24h / 4,
    liquidityUnit: "usd",
  };
}

const markets = [
  market("poly-fed", "polymarket", "Will the Fed cut rates?", 2_000_000, "2026-10-01T00:00:00.000Z"),
  market("kalshi-election", "kalshi", "Will the incumbent win?", 500_000, "2026-11-01T00:00:00.000Z"),
];

function args(
  argument: string | null,
  options: Record<string, string | number | boolean>,
): HeadlessPaneLoadArgs {
  return {
    rawArgument: argument ?? "",
    argument,
    symbols: [],
    options,
  };
}

const context = {} as HeadlessPaneContext;

function dependencies(seen: string[]): PredictionMarketsHeadlessDependencies {
  return {
    loadPolymarket: async (query) => {
      seen.push(`polymarket:${query}`);
      return markets.filter((entry) => entry.venue === "polymarket");
    },
    loadKalshi: async (query) => {
      seen.push(`kalshi:${query}`);
      return markets.filter((entry) => entry.venue === "kalshi");
    },
    now: () => new Date("2026-09-04T21:00:00.000Z"),
  };
}

describe("prediction markets headless", () => {
  test("projects venue data through the pane's shared row ordering", async () => {
    const definition = createPredictionMarketsHeadless(dependencies([]));

    const result = await definition.load(args(null, {
      venue: "all",
      category: "all",
      tab: "top",
      limit: 1,
    }), context);

    expect(result.rows).toEqual([
      expect.objectContaining({
        key: "poly-fed",
        venue: "polymarket",
        yesProbability: 0.62,
        volume24h: 2_000_000,
      }),
    ]);
    expect(result.metadata).toMatchObject({ total: 2, returned: 1, truncated: true });
  });

  test("a venue the report does not cover reaches neither Polymarket nor Kalshi", async () => {
    const seen: string[] = [];
    const definition = createPredictionMarketsHeadless(dependencies(seen));

    const result = await definition.load(args(null, { venue: "gemini" }), context);

    expect(seen).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  test("uses the shortcut venue prefix without querying the other venue", async () => {
    const seen: string[] = [];
    const definition = createPredictionMarketsHeadless(dependencies(seen));

    const result = await definition.load(args("polymarket:fed", {
      venue: "all",
      category: "macro",
      tab: "ending",
      limit: 20,
    }), context);

    expect(seen).toEqual(["polymarket:fed"]);
    expect(result.rows.map((row) => row.key)).toEqual(["poly-fed"]);
    expect(result.metadata).toMatchObject({ venue: "polymarket", query: "fed" });
  });

  test("a market the venue stopped refreshing a day ago is left out of the open markets, and marked when asked for", async () => {
    const now = new Date("2026-10-23T21:00:00.000Z");
    const refreshed = (key: string, title: string, refreshedAt: string | undefined) => ({
      ...market(key, "polymarket", title, 1_000, "2027-01-15T00:00:00.000Z"),
      updatedAt: refreshedAt ?? null,
      ...(refreshedAt ? { refreshedAt } : {}),
    });
    const venues = [
      refreshed("poly-stale", "Mortgage delinquency above 3%?", "2026-09-28T17:55:56.000Z"),
      refreshed("poly-fresh", "Mortgage rate above 7.5%?", "2026-10-23T20:48:38.000Z"),
      // A search hit carries no refresh time: its prices are as of the request.
      refreshed("poly-hit", "Mortgage rate below 6%?", undefined),
    ];
    const definition = createPredictionMarketsHeadless({
      loadPolymarket: async () => venues,
      loadKalshi: async () => [{ ...market("kalshi-mortgage", "kalshi", "Mortgage rate above 7%?", 500, "2027-01-01T00:00:00.000Z"), updatedAt: "2026-04-09T09:18:53.000Z" }],
      now: () => now,
    });

    const open = await definition.load(args("mortgage", {}), context);
    expect(open.rows.map((row) => [row.key, row.status, row.updatedAt])).toEqual([
      ["poly-fresh", "open", "2026-10-23T20:48:38.000Z"],
      ["poly-hit", "open", null],
      // Kalshi's update time is the market's own record, not its prices, which are read live.
      ["kalshi-mortgage", "open", null],
    ]);
    expect(open.notes).toEqual(["1 market not refreshed in a day is left out; --stale lists it."]);
    expect(open.metadata).toMatchObject({ staleLeftOut: 1 });
    expect(open.freshness).toEqual({ source: "Polymarket and Kalshi" });

    const all = await definition.load(args("mortgage", { stale: true }), context);
    expect(all.rows.find((row) => row.key === "poly-stale")).toMatchObject({
      status: "not refreshed since 28 Sep 2026", updatedAt: "2026-09-28T17:55:56.000Z",
    });
    expect(all.notes).toBeUndefined();
  });
});

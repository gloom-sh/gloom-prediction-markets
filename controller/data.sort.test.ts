import { expect, test } from "bun:test";
import { sortPredictionOutcomeMarkets } from "../outcome-order";
import { buildPredictionListRows, flattenPredictionListRows } from "../rows";
import { PREDICTION_COLUMN_DEFS } from "../columns";
import { getDefaultPredictionSort, getPredictionColumnValue, sortPredictionMarkets } from "../metrics";
import type { PredictionListRow, PredictionMarketSummary, PredictionSortPreference } from "../types";
import {
  resolvePredictionEventMarkets,
  resolvePredictionVisibleSort,
  resolveSortedOutcomeMarkets,
  withPredictionDetailSibling,
} from "./data";

function market(
  key: string,
  overrides: Partial<PredictionMarketSummary> = {},
): PredictionMarketSummary {
  return {
    key,
    venue: "kalshi",
    marketId: key,
    title: key,
    marketLabel: key,
    eventLabel: key,
    status: "open",
    url: "https://example.test",
    description: "",
    endsAt: null,
    updatedAt: null,
    yesPrice: null,
    noPrice: null,
    yesBid: null,
    yesAsk: null,
    noBid: null,
    noAsk: null,
    spread: null,
    lastTradePrice: null,
    volume24h: null,
    volume24hUnit: "contracts",
    totalVolume: null,
    totalVolumeUnit: "contracts",
    openInterest: null,
    openInterestUnit: "contracts",
    liquidity: null,
    liquidityUnit: "usd",
    ...overrides,
  };
}

function rows(): PredictionListRow[] {
  return buildPredictionListRows([
    market("soon", {
      title: "Soon",
      endsAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      volume24h: 50,
      yesPrice: 0.1,
    }),
    market("later", {
      title: "Later",
      endsAt: "2026-12-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      volume24h: 5,
      yesPrice: 0.9,
    }),
    market("mid", {
      title: "Mid",
      endsAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      volume24h: 20,
      yesPrice: 0.5,
    }),
  ]);
}

const volumeSort: PredictionSortPreference = { columnId: "vol_24h", direction: "desc" };

function ordered(tab: "top" | "ending" | "new", sort: PredictionSortPreference): string[] {
  return sortPredictionMarkets(rows(), resolvePredictionVisibleSort(tab, sort)).map((row) => row.key);
}

test("ending orders by soonest end and new orders by newest updated", () => {
  expect(ordered("ending", volumeSort)).toEqual(["soon", "mid", "later"]);
  expect(ordered("new", volumeSort)).toEqual(["mid", "later", "soon"]);
  expect(ordered("ending", { columnId: "vol_24h", direction: "asc" })).toEqual(["soon", "mid", "later"]);
  expect(ordered("new", { columnId: null, direction: "desc" })).toEqual(["mid", "later", "soon"]);
  expect(ordered("top", volumeSort)).toEqual(["soon", "mid", "later"]);
});

test("new lists the newest markets first, by when they were listed, and a market with none by its last update", () => {
  // Polymarket search hits: listed on these days, with no refresh time.
  const hits = buildPredictionListRows([
    market("listed-feb", { venue: "polymarket", createdAt: "2026-02-03T10:00:00.000Z" }),
    market("listed-oct", { venue: "polymarket", createdAt: "2026-10-20T10:00:00.000Z" }),
    market("no-listing", { updatedAt: "2026-09-01T00:00:00.000Z" }),
    // An event is as new as its newest market.
    market("event-old", { venue: "polymarket", eventId: "ev", eventLabel: "Event", createdAt: "2026-01-05T00:00:00.000Z" }),
    market("event-new", { venue: "polymarket", eventId: "ev", eventLabel: "Event", createdAt: "2026-10-01T00:00:00.000Z" }),
  ]);
  const order = sortPredictionMarkets(hits, getDefaultPredictionSort("new"));
  expect(order.map((row) => row.kind === "group" ? row.title : row.key)).toEqual(["listed-oct", "Event", "no-listing", "listed-feb"]);
  // The listing time is no update: UPDATED stays empty without a refresh time.
  const updated = PREDICTION_COLUMN_DEFS.find((column) => column.id === "updated")!;
  expect(getPredictionColumnValue(updated, order[0]!, false).text).toBe("—");
});

test("an explicit non-default column sort still wins on ending and new", () => {
  const byYes: PredictionSortPreference = { columnId: "yes", direction: "desc" };
  expect(ordered("ending", byYes)).toEqual(["later", "mid", "soon"]);
  expect(ordered("new", byYes)).toEqual(["later", "mid", "soon"]);
  expect(ordered("ending", { columnId: "ends", direction: "desc" })).toEqual(["later", "mid", "soon"]);
});

test("outcome keys follow the outcomes table for a child row while detail is open", () => {
  const contracts = [
    market("low", {
      marketLabel: "Low",
      eventLabel: "Event",
      eventTicker: "EVT",
      yesPrice: 0.2,
      volume24h: 5,
    }),
    market("high", {
      marketLabel: "High",
      eventLabel: "Event",
      eventTicker: "EVT",
      yesPrice: 0.8,
      volume24h: 1,
    }),
  ];
  const grouped = buildPredictionListRows(contracts);
  const group = grouped[0]!;
  const child = flattenPredictionListRows(grouped, new Set([group.key])).find((row) => row.parentKey)!;
  const eventMarkets = resolvePredictionEventMarkets(child, grouped);

  expect(eventMarkets.map((item) => item.key)).toEqual(group.markets.map((item) => item.key));
  expect(resolveSortedOutcomeMarkets(true, eventMarkets).map((item) => item.key)).toEqual(
    sortPredictionOutcomeMarkets(eventMarkets).map((item) => item.key),
  );
  expect(resolveSortedOutcomeMarkets(true, eventMarkets).map((item) => item.key)).toEqual(["high", "low"]);
  expect(resolveSortedOutcomeMarkets(false, eventMarkets)).toEqual([]);
  expect(resolveSortedOutcomeMarkets(true, resolvePredictionEventMarkets(child, []))).toEqual([]);
  expect(
    resolveSortedOutcomeMarkets(true, resolvePredictionEventMarkets(group, grouped)).map((item) => item.key),
  ).toEqual(["high", "low"]);
});

test("a detail sibling that is not on the list row replaces the open summary", () => {
  const open = market("polymarket:pm-1", {
    marketId: "pm-1",
    eventId: "event-1",
    yesTokenId: "yes-1",
    conditionId: "cond-1",
    openInterest: 99,
    yesBid: 0.2,
    url: "https://polymarket.com/event/old",
  });
  const sibling = withPredictionDetailSibling(open, "polymarket:pm-2", [{
    key: "polymarket:pm-2",
    marketId: "pm-2",
    label: "Core CPI",
    yesPrice: 0.41,
    volume24h: 10,
  }]);
  expect(sibling?.key).toBe("polymarket:pm-2");
  expect(sibling?.marketId).toBe("pm-2");
  expect(sibling?.eventId).toBe("event-1");
  expect(sibling?.yesTokenId).toBeUndefined();
  expect(sibling?.openInterest).toBeNull();
  expect(sibling?.yesBid).toBeNull();
  expect(sibling?.url).toBe("");
  const rich = withPredictionDetailSibling(open, "polymarket:pm-2", [{
    key: "polymarket:pm-2",
    marketId: "pm-2",
    label: "Core CPI",
    yesPrice: 0.41,
    volume24h: 10,
    yesTokenId: "yes-2",
    noTokenId: "no-2",
    conditionId: "cond-2",
    url: "https://polymarket.com/event/core",
    openInterest: 12,
    yesBid: 0.4,
    yesAsk: 0.42,
  }]);
  expect(rich?.yesTokenId).toBe("yes-2");
  expect(rich?.noTokenId).toBe("no-2");
  expect(rich?.conditionId).toBe("cond-2");
  expect(rich?.openInterest).toBe(12);
  expect(rich?.yesBid).toBe(0.4);
  expect(rich?.url).toBe("https://polymarket.com/event/core");
  expect(withPredictionDetailSibling(open, open.key, [])).toBe(open);
});

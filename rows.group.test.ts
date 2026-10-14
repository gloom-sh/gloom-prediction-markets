import { expect, test } from "bun:test";
import { PREDICTION_COLUMN_DEFS } from "./columns";
import { getPredictionColumnValue } from "./metrics";
import { buildPredictionListRows, flattenPredictionListRows } from "./rows";
import type { PredictionMarketSummary } from "./types";

function market(
  overrides: Partial<PredictionMarketSummary> & Pick<PredictionMarketSummary, "key" | "marketLabel">,
): PredictionMarketSummary {
  return {
    venue: "polymarket",
    marketId: overrides.key,
    title: overrides.marketLabel,
    eventLabel: "Fed decision",
    eventId: "fed",
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
    volume24hUnit: "usd",
    totalVolume: null,
    totalVolumeUnit: "usd",
    openInterest: null,
    openInterestUnit: "usd",
    liquidity: null,
    liquidityUnit: "usd",
    ...overrides,
  };
}

test("an event row sums lifetime volume and liquidity and takes the focus contract spread", () => {
  const busy = market({
    key: "busy",
    marketLabel: "Busy",
    volume24h: 100,
    yesPrice: 0.2,
    spread: 0.09,
    totalVolume: null,
    liquidity: null,
    openInterest: 4,
  });
  const focus = market({
    key: "focus",
    marketLabel: "Focus",
    volume24h: 10,
    yesPrice: 0.8,
    spread: 0.02,
    totalVolume: 30,
    liquidity: 8,
    openInterest: 1,
  });
  const other = market({
    key: "other",
    marketLabel: "Other",
    volume24h: 40,
    yesPrice: 0.4,
    spread: 0.05,
    totalVolume: 12,
    liquidity: null,
    openInterest: null,
  });
  const [row] = buildPredictionListRows([busy, focus, other]);

  expect(row?.kind).toBe("group");
  expect(row?.representative.key).toBe("busy");
  expect(row?.focusMarketKey).toBe("focus");
  expect(row?.focusYesPrice).toBe(0.8);
  expect(row?.spread).toBe(0.02);
  const spreadColumn = PREDICTION_COLUMN_DEFS.find((column) => column.id === "spread");
  expect(getPredictionColumnValue(spreadColumn!, row!, false).text).toBe("2.0c");
  expect(row?.totalVolume).toBe(42);
  expect(row?.liquidity).toBe(8);
  expect(row?.volume24h).toBe(150);
  expect(row?.openInterest).toBe(5);
});

test("an event row does not copy shared event volume or open interest onto contracts", () => {
  const left = market({
    key: "left",
    marketLabel: "Left",
    volume24h: null,
    eventVolume24h: 900,
    openInterest: null,
    eventOpenInterest: 50,
    totalVolume: 1,
    liquidity: 3,
  });
  const right = market({
    key: "right",
    marketLabel: "Right",
    volume24h: null,
    eventVolume24h: 900,
    openInterest: null,
    eventOpenInterest: 50,
    totalVolume: 2,
    liquidity: 4,
    yesPrice: 0.7,
  });
  const [group] = buildPredictionListRows([left, right]);
  expect(group?.volume24h).toBe(900);
  expect(group?.openInterest).toBe(50);
  expect(group?.totalVolume).toBe(3);
  expect(group?.liquidity).toBe(7);

  const flat = flattenPredictionListRows([group!], new Set([group!.key]));
  const children = flat.filter((row) => row.parentKey);
  expect(children.map((row) => row.volume24h)).toEqual([null, null]);
  expect(children.map((row) => row.openInterest)).toEqual([null, null]);
  expect(children.map((row) => row.totalVolume).sort()).toEqual([1, 2]);
  expect(children.map((row) => row.liquidity).sort()).toEqual([3, 4]);
});

test("lifetime volume and liquidity stay empty when no contract reports them", () => {
  const [row] = buildPredictionListRows([
    market({ key: "a", marketLabel: "A", volume24h: 5, yesPrice: 0.6 }),
    market({ key: "b", marketLabel: "B", volume24h: 1, yesPrice: 0.1, totalVolume: null, liquidity: null }),
  ]);
  expect(row?.totalVolume).toBeNull();
  expect(row?.liquidity).toBeNull();
});

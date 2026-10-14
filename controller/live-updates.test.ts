import { expect, test } from "bun:test";
import type { PredictionMarketDetail, PredictionMarketSummary } from "../types";
import {
  applyPredictionBestBidAskUpdate,
  applyPredictionBookLevelUpdate,
  applyPredictionBookUpdate,
  applyPredictionTradeUpdate,
  displayedOutcomeYesPrice,
  predictionBookErrorText,
  visiblePredictionBookLevels,
} from "./live-updates";

function summary(patch: Partial<PredictionMarketSummary> = {}): PredictionMarketSummary {
  return {
    key: "polymarket:1",
    venue: "polymarket",
    marketId: "1",
    title: "Sample",
    marketLabel: "Yes",
    eventLabel: "Sample",
    status: "open",
    url: "https://example.test",
    description: "Rules stay put.",
    endsAt: null,
    updatedAt: null,
    yesPrice: 0.48,
    noPrice: 0.52,
    yesBid: 0.47,
    yesAsk: 0.49,
    noBid: null,
    noAsk: null,
    spread: 0.02,
    lastTradePrice: 0.48,
    volume24h: 10,
    volume24hUnit: "usd",
    totalVolume: null,
    totalVolumeUnit: "usd",
    openInterest: null,
    openInterestUnit: "usd",
    liquidity: null,
    liquidityUnit: "usd",
    yesTokenId: "yes-token",
    noTokenId: "no-token",
    ...patch,
  };
}

function detail(): PredictionMarketDetail {
  return {
    summary: summary(),
    siblings: [],
    rules: ["Rules stay put."],
    history: [],
    book: {
      yesBids: [{ price: 0.47, size: 1 }],
      yesAsks: [{ price: 0.49, size: 1 }],
      noBids: [],
      noAsks: [],
      lastTradePrice: 0.48,
    },
    trades: [],
  };
}

test("a two-sided quote moves detail yes to the midpoint and a one-sided quote does not", () => {
  const entry = detail();
  const twoSided = applyPredictionBestBidAskUpdate(entry, "yes-token", 0.4, 0.6, 0.2);
  expect(twoSided.summary.yesPrice).toBe(0.5);
  expect(twoSided.summary.noPrice).toBe(0.5);
  expect(twoSided.summary.yesBid).toBe(0.4);
  expect(twoSided.summary.spread).toBe(0.2);
  const oneSided = applyPredictionBestBidAskUpdate(entry, "yes-token", 0.41, null, null);
  expect(oneSided.summary.yesPrice).toBe(0.48);
  expect(oneSided.summary.yesBid).toBe(0.41);
  expect(oneSided.summary.yesAsk).toBe(0.49);
  const noToken = applyPredictionBestBidAskUpdate(entry, "no-token", 0.4, 0.6, null);
  expect(noToken.summary.yesPrice).toBe(0.5);
});

test("a full book and a level delta keep the inside of the ladder", () => {
  const entry = detail();
  const bids = Array.from({ length: 11 }, (_, index) => ({ price: (index + 1) / 100, size: index + 1 }));
  const asks = Array.from({ length: 11 }, (_, index) => ({ price: 0.9 - index / 100, size: index + 1 }));
  const next = applyPredictionBookUpdate(entry, "yes-token", bids, asks, null);
  expect(next.summary.yesPrice).toBeCloseTo((0.11 + 0.8) / 2);
  expect(next.book.yesBids[0]?.price).toBeCloseTo(0.11);
  expect(next.book.yesAsks[0]?.price).toBeCloseTo(0.8);
  expect(visiblePredictionBookLevels(bids, "bid").map((level) => level.price)).toEqual(
    [0.11, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02],
  );
  expect(visiblePredictionBookLevels(asks, "ask")[0]?.price).toBeCloseTo(0.8);
  const oneSided = applyPredictionBookUpdate(entry, "yes-token", bids, [], null);
  expect(oneSided.summary.yesPrice).toBe(0.48);
  const leveled = applyPredictionBookLevelUpdate(next, "yes-token", "bid", 0.11, 0, undefined);
  const added = applyPredictionBookLevelUpdate(leveled, "yes-token", "bid", 0.2, 4, undefined);
  expect(added.book.yesBids.some((level) => level.price === 0.11)).toBe(false);
  expect(added.book.yesBids[0]).toEqual({ price: 0.2, size: 4 });
});

test("a no-token print uses the shared yes price", () => {
  const next = applyPredictionTradeUpdate(detail(), "no-token", {
    id: "t1",
    timestamp: 1,
    side: "buy",
    outcome: "yes",
    price: 0.3,
    size: 2,
  });
  expect(next.summary.yesPrice).toBeCloseTo(0.7);
  expect(next.summary.lastTradePrice).toBeCloseTo(0.7);
  expect(next.trades[0]?.outcome).toBe("no");
  expect(next.rules).toEqual(["Rules stay put."]);
});

test("the outcomes row for the open market uses that summary yes price", () => {
  const live = { key: "polymarket:1", yesPrice: 0.66 };
  expect(displayedOutcomeYesPrice("polymarket:1", 0.48, live)).toBe(0.66);
  expect(displayedOutcomeYesPrice("polymarket:2", 0.48, live)).toBe(0.48);
  expect(displayedOutcomeYesPrice("polymarket:1", 0.48, { key: "polymarket:1", yesPrice: null })).toBeNull();
  expect(displayedOutcomeYesPrice("polymarket:1", 0.48, null)).toBe(0.48);
});

test("book error text shown to the user has no request URL", () => {
  expect(predictionBookErrorText(
    "Request failed (404) for https://clob.polymarket.com/book?token_id=yes-1",
  )).toBe("Request failed (404)");
  expect(predictionBookErrorText("https://clob.polymarket.com/book?token_id=yes-1")).toBe(
    "Order book unavailable.",
  );
});

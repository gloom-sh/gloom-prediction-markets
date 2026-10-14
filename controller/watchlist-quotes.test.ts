import { expect, test } from "bun:test";
import { readKalshiMarketQuote } from "../services/kalshi/normalize";
import type { PredictionMarketSummary } from "../types";
import {
  OddsFlashBook,
  applyLiveQuotes,
  polymarketBookPatch,
  polymarketInsideBookPatch,
  polymarketTradePatch,
} from "./watchlist-quotes";

function market(patch: Partial<PredictionMarketSummary> = {}): PredictionMarketSummary {
  return {
    key: "polymarket:1",
    venue: "polymarket",
    marketId: "1",
    title: "Sample",
    marketLabel: "Yes",
    eventLabel: "Sample",
    status: "open",
    url: "https://example.test",
    description: "",
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

test("a yes print and a no print both move the yes price", () => {
  const sample = market();
  expect(polymarketTradePatch(sample, "yes-token", 0.62)?.yesPrice).toBe(0.62);
  const noPrint = polymarketTradePatch(sample, "no-token", 0.3);
  expect(noPrint?.yesPrice).toBeCloseTo(0.7);
  expect(noPrint?.noPrice).toBeCloseTo(0.3);
  expect(noPrint?.lastTradePrice).toBeCloseTo(0.7);
  expect(polymarketTradePatch(sample, "other", 0.2)).toBeNull();
});

test("a two-sided book sets the midpoint and a one-sided book does not", () => {
  const sample = market();
  expect(polymarketBookPatch(sample, "yes-token", 0.4, 0.6, 0.2)?.yesPrice).toBe(0.5);
  const oneSided = polymarketBookPatch(sample, "yes-token", 0.4, null, null);
  expect(oneSided?.yesPrice).toBeUndefined();
  expect(oneSided?.yesBid).toBe(0.4);
  expect(polymarketBookPatch(sample, "no-token", 0.4, 0.6, null)?.yesPrice).toBe(0.5);
});

test("a full book uses the inside bid and ask, not wire order", () => {
  const sample = market();
  const twoSided = polymarketInsideBookPatch(
    sample,
    "yes-token",
    [{ price: 0.2 }, { price: 0.4 }, { price: 0.3 }],
    [{ price: 0.8 }, { price: 0.6 }, { price: 0.7 }],
  );
  expect(twoSided?.yesPrice).toBe(0.5);
  expect(twoSided?.yesBid).toBe(0.4);
  expect(twoSided?.yesAsk).toBe(0.6);
  const oneSided = polymarketInsideBookPatch(
    sample,
    "yes-token",
    [{ price: 0.2 }, { price: 0.44 }],
    [],
  );
  expect(oneSided?.yesPrice).toBeUndefined();
  expect(oneSided?.yesBid).toBe(0.44);
  const crossed = polymarketInsideBookPatch(
    sample,
    "yes-token",
    [{ price: 0.7 }],
    [{ price: 0.4 }],
  );
  expect(crossed?.yesPrice).toBeUndefined();
});

test("applyLiveQuotes keeps the array when nothing changed", () => {
  const rows = [market()];
  expect(applyLiveQuotes(rows, new Map())).toBe(rows);
  expect(applyLiveQuotes(rows, new Map([[rows[0]!.key, { yesPrice: 0.48 }]]))).toBe(rows);
  const next = applyLiveQuotes(rows, new Map([[rows[0]!.key, { yesPrice: 0.7, volume24h: 12 }]]));
  expect(next).not.toBe(rows);
  expect(next[0]).not.toBe(rows[0]);
  expect(next[0]?.yesPrice).toBe(0.7);
  expect(next[0]?.volume24h).toBe(12);
  expect(next[0]?.title).toBe("Sample");
});

test("the odds cell flashes only when the printed percent changes, then waits out the gap", () => {
  const book = new OddsFlashBook();
  book.seed("a", 0.48);
  expect(book.note("a", 0.484, 0)).toBe(false);
  expect(book.note("a", 0.486, 0)).toBe(true);
  expect(book.note("a", 0.62, 100)).toBe(false);
  expect(book.note("a", 0.7, 600)).toBe(true);
  expect(book.active(600).has("a")).toBe(true);
  expect(book.active(900).has("a")).toBe(false);
});

test("a Kalshi quote prefers the last trade and otherwise the bid-ask midpoint", () => {
  const traded = readKalshiMarketQuote({
    ticker: "ABC",
    title: "ABC",
    last_price_dollars: "0.4200",
    yes_bid_dollars: "0.4000",
    yes_ask_dollars: "0.4400",
    volume_24h_fp: "10",
    open_interest_fp: "3",
  });
  expect(traded?.key).toBe("kalshi:ABC");
  expect(traded?.yesPrice).toBe(0.42);
  expect(traded?.spread).toBeCloseTo(0.04);
  expect(traded?.volume24h).toBe(10);
  const mid = readKalshiMarketQuote({
    ticker: "ABC",
    title: "ABC",
    last_price_dollars: "0",
    yes_bid_dollars: "0.4000",
    yes_ask_dollars: "0.6000",
  });
  expect(mid?.yesPrice).toBe(0.5);
});

import { expect, test } from "bun:test";
import { filterPredictionMarkets } from "./metrics";
import { withSavedWatchlistMarkets } from "./rows";
import type {
  PredictionListRow,
  PredictionMarketSummary,
} from "./types";

function summary(
  key: string,
  title: string,
  category: string,
): PredictionMarketSummary {
  return {
    key,
    venue: "polymarket",
    marketId: key,
    title,
    marketLabel: title,
    eventLabel: title,
    category,
    tags: [],
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
  };
}

function row(
  key: string,
  title: string,
  category: string,
  searchText: string,
): PredictionListRow {
  const market = summary(key, title, category);
  return {
    key,
    kind: "market",
    venue: market.venue,
    representative: market,
    focusMarketKey: key,
    focusMarketLabel: title,
    focusYesPrice: null,
    markets: [market],
    title,
    marketId: key,
    marketLabel: title,
    eventLabel: title,
    category,
    tags: [],
    status: "open",
    url: market.url,
    description: "",
    endsAt: null,
    updatedAt: null,
    yesPrice: null,
    noPrice: null,
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
    searchText,
    watchMarketKeys: [key],
  };
}

const politics = row("politics", "Senate race", "Politics", "senate race anthropic");
const crypto = row("crypto", "Token launch", "Crypto", "token launch anthropic");

test("a search matches every category and an empty query keeps the category filter", () => {
  const markets = [politics, crypto];

  expect(
    filterPredictionMarkets(markets, "top", "all", "politics", "anthropic", new Set())
      .map((market) => market.key),
  ).toEqual(["politics", "crypto"]);

  expect(
    filterPredictionMarkets(markets, "top", "all", "politics", "", new Set())
      .map((market) => market.key),
  ).toEqual(["politics"]);
});

test("a starred search result stays in the list after the search results are gone", () => {
  const saved = summary("kalshi:KXFEDDECISION-26OCT-H0", "Fed decision in Oct 2026?", "Economics");
  const listed = withSavedWatchlistMarkets([], { [saved.key]: saved });
  expect(listed.map((market) => market.key)).toEqual([saved.key]);
});

test("All lists Polymarket and Kalshi, a picked venue lists its own, and the watchlist keeps every venue", () => {
  const gemini: PredictionListRow = { ...row("gemini:fed", "Fed hold", "Economics", "fed hold"), venue: "gemini" };
  const markets = [politics, gemini];
  const starred = new Set(["gemini:fed"]);
  const keys = (rows: PredictionListRow[]) => rows.map((market) => market.key);

  expect(keys(filterPredictionMarkets(markets, "top", "all", "all", "", starred))).toEqual(["politics"]);
  expect(keys(filterPredictionMarkets(markets, "top", "all", "all", "fed", starred))).toEqual([]);
  expect(keys(filterPredictionMarkets(markets, "watchlist", "all", "all", "", starred))).toEqual(["gemini:fed"]);
  expect(keys(filterPredictionMarkets(markets, "top", "gemini", "all", "", starred))).toEqual(["gemini:fed"]);
  expect(keys(filterPredictionMarkets(markets, "top", "polymarket", "all", "", starred))).toEqual(["politics"]);
});

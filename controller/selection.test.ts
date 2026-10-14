import { expect, test } from "bun:test";
import type { PredictionListRow, PredictionMarketSummary } from "../types";
import {
  resolvePredictionBrowseSocketSummary,
  resolvePredictionSelectedSummary,
} from "./selection";

function summary(key: string): PredictionMarketSummary {
  return {
    key,
    venue: "polymarket",
    marketId: key,
    title: key,
    marketLabel: "Yes",
    eventLabel: key,
    status: "open",
    url: "https://example.test",
    description: "",
    endsAt: null,
    updatedAt: null,
    yesPrice: 0.4,
    noPrice: 0.6,
    yesBid: null,
    yesAsk: null,
    noBid: null,
    noAsk: null,
    spread: null,
    lastTradePrice: 0.4,
    volume24h: null,
    volume24hUnit: "usd",
    totalVolume: null,
    totalVolumeUnit: "usd",
    openInterest: null,
    openInterestUnit: "usd",
    liquidity: null,
    liquidityUnit: "usd",
    yesTokenId: `${key}-yes`,
    noTokenId: `${key}-no`,
  };
}

function row(): PredictionListRow {
  const focus = summary("polymarket:focus");
  const other = summary("polymarket:other");
  return {
    kind: "group",
    key: "group",
    focusMarketKey: focus.key,
    representative: focus,
    markets: [other, focus],
  } as PredictionListRow;
}

test("detail closed keeps the REST summary null and publishes the highlighted market", () => {
  const selected = row();
  expect(resolvePredictionSelectedSummary({
    detailOpen: false,
    selectedDetailMarketKey: "polymarket:other",
    selectedRow: selected,
  })).toBeNull();
  expect(resolvePredictionBrowseSocketSummary(false, selected)?.key).toBe("polymarket:focus");
});

test("detail open returns the selected contract and does not keep a browse socket", () => {
  const selected = row();
  const open = resolvePredictionSelectedSummary({
    detailOpen: true,
    selectedDetailMarketKey: "polymarket:other",
    selectedRow: selected,
  });
  expect(open?.key).toBe("polymarket:other");
  expect(resolvePredictionBrowseSocketSummary(true, selected)).toBeNull();
});

test("a missing row has no browse socket", () => {
  expect(resolvePredictionSelectedSummary({
    detailOpen: false,
    selectedDetailMarketKey: null,
    selectedRow: null,
  })).toBeNull();
  expect(resolvePredictionBrowseSocketSummary(false, null)).toBeNull();
});

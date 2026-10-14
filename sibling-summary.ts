import type { PredictionMarketSummary, PredictionSiblingMarket } from "./types";

export function predictionSiblingFromSummary(market: PredictionMarketSummary): PredictionSiblingMarket {
  return {
    key: market.key,
    marketId: market.marketId,
    label: market.marketLabel,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    volume24h: market.volume24h,
    yesBid: market.yesBid,
    yesAsk: market.yesAsk,
    noBid: market.noBid,
    noAsk: market.noAsk,
    spread: market.spread,
    lastTradePrice: market.lastTradePrice,
    openInterest: market.openInterest,
    url: market.url,
    yesTokenId: market.yesTokenId,
    noTokenId: market.noTokenId,
    conditionId: market.conditionId,
    eventTicker: market.eventTicker,
    seriesTicker: market.seriesTicker,
  };
}

function supplied<T>(value: T | undefined, empty: T): T {
  return value === undefined ? empty : value;
}

/**
 * A one-contract list row does not carry the other contracts. The sibling
 * record is the contract; quote fields the record omits stay empty instead of
 * keeping the contract the row was opened on.
 */
export function predictionSiblingSummary(
  base: PredictionMarketSummary,
  sibling: PredictionSiblingMarket,
): PredictionMarketSummary {
  const yesPrice = sibling.yesPrice;
  return {
    ...base,
    key: sibling.key,
    marketId: sibling.marketId,
    title: sibling.label,
    marketLabel: sibling.label,
    yesPrice,
    noPrice: supplied(sibling.noPrice, yesPrice == null ? null : Math.max(0, 1 - yesPrice)),
    volume24h: sibling.volume24h,
    yesBid: supplied(sibling.yesBid, null),
    yesAsk: supplied(sibling.yesAsk, null),
    noBid: supplied(sibling.noBid, null),
    noAsk: supplied(sibling.noAsk, null),
    spread: supplied(sibling.spread, null),
    lastTradePrice: supplied(sibling.lastTradePrice, null),
    openInterest: supplied(sibling.openInterest, null),
    url: supplied(sibling.url, ""),
    yesTokenId: sibling.yesTokenId,
    noTokenId: sibling.noTokenId,
    conditionId: sibling.conditionId,
    eventTicker: sibling.eventTicker ?? base.eventTicker,
    seriesTicker: sibling.seriesTicker ?? base.seriesTicker,
  };
}

import type {
  PredictionBookLevel,
  PredictionMarketDetail,
  PredictionTrade,
} from "../types";
import {
  polymarketBookPatch,
  polymarketTradePatch,
} from "./watchlist-quotes";

export interface DetailSocketTouch {
  yesPrice: boolean;
  bids: boolean;
  book: boolean;
  trades: boolean;
}

export function orderPredictionBookLevels(
  levels: readonly PredictionBookLevel[],
  side: "bid" | "ask",
): PredictionBookLevel[] {
  return [...levels].sort((left, right) =>
    side === "bid" ? right.price - left.price : left.price - right.price,
  );
}

export function visiblePredictionBookLevels(
  levels: readonly PredictionBookLevel[],
  side: "bid" | "ask",
): PredictionBookLevel[] {
  return orderPredictionBookLevels(levels, side).slice(0, 10);
}

export function predictionBookErrorText(error: string): string {
  const stripped = error
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+for\s*$/i, "")
    .trim();
  return stripped || "Order book unavailable.";
}

function noteQuoteTouch(
  touch: DetailSocketTouch | undefined,
  patch: {
    yesPrice?: number | null;
    yesBid?: number | null;
    yesAsk?: number | null;
    noBid?: number | null;
    noAsk?: number | null;
    spread?: number | null;
  } | null,
): void {
  if (!touch || !patch) return;
  if (patch.yesPrice !== undefined) touch.yesPrice = true;
  if (
    patch.yesBid !== undefined ||
    patch.yesAsk !== undefined ||
    patch.noBid !== undefined ||
    patch.noAsk !== undefined ||
    patch.spread !== undefined
  ) {
    touch.bids = true;
  }
}

function extremePrice(
  levels: readonly PredictionBookLevel[],
  side: "bid" | "ask",
): number | null {
  let best: number | null = null;
  for (const level of levels) {
    if (best == null || (side === "bid" ? level.price > best : level.price < best)) {
      best = level.price;
    }
  }
  return best;
}

function upsertBookLevel(
  levels: readonly PredictionBookLevel[],
  price: number,
  size: number,
): PredictionBookLevel[] {
  if (size <= 0) return levels.filter((level) => level.price !== price);
  let found = false;
  const next: PredictionBookLevel[] = [];
  for (const level of levels) {
    if (level.price === price) {
      if (!found) next.push({ price, size });
      found = true;
      continue;
    }
    next.push(level);
  }
  if (!found) next.push({ price, size });
  return next;
}

export function applyPredictionBestBidAskUpdate(
  detailEntry: PredictionMarketDetail,
  assetId: string,
  bestBid: number | null,
  bestAsk: number | null,
  spread: number | null,
  touch?: DetailSocketTouch,
): PredictionMarketDetail {
  const patch = polymarketBookPatch(detailEntry.summary, assetId, bestBid, bestAsk, spread);
  if (!patch) return detailEntry;
  noteQuoteTouch(touch, patch);
  return {
    ...detailEntry,
    summary: {
      ...detailEntry.summary,
      ...patch,
    },
  };
}

export function applyPredictionBookUpdate(
  detailEntry: PredictionMarketDetail,
  assetId: string,
  bids: PredictionBookLevel[],
  asks: PredictionBookLevel[],
  lastTradePrice: number | null,
  touch?: DetailSocketTouch,
): PredictionMarketDetail {
  const isYes = assetId === detailEntry.summary.yesTokenId;
  const isNo = assetId === detailEntry.summary.noTokenId;
  if (!isYes && !isNo) return detailEntry;
  if (touch) touch.book = true;
  const bestBid = extremePrice(bids, "bid");
  const bestAsk = extremePrice(asks, "ask");
  const spread = bestBid != null && bestAsk != null && bestAsk >= bestBid
    ? bestAsk - bestBid
    : null;
  const patch = polymarketBookPatch(detailEntry.summary, assetId, bestBid, bestAsk, spread);
  noteQuoteTouch(touch, patch);
  return {
    ...detailEntry,
    summary: patch
      ? { ...detailEntry.summary, ...patch }
      : detailEntry.summary,
    book: {
      ...detailEntry.book,
      ...(isYes
        ? {
            yesBids: orderPredictionBookLevels(bids, "bid"),
            yesAsks: orderPredictionBookLevels(asks, "ask"),
          }
        : {
            noBids: orderPredictionBookLevels(bids, "bid"),
            noAsks: orderPredictionBookLevels(asks, "ask"),
          }),
      lastTradePrice: lastTradePrice ?? detailEntry.book.lastTradePrice,
    },
  };
}

export function applyPredictionBookLevelUpdate(
  detailEntry: PredictionMarketDetail,
  assetId: string,
  side: "bid" | "ask",
  price: number,
  size: number,
  touch?: DetailSocketTouch,
): PredictionMarketDetail {
  const isYes = assetId === detailEntry.summary.yesTokenId;
  const isNo = assetId === detailEntry.summary.noTokenId;
  if (!isYes && !isNo) return detailEntry;
  if (touch) touch.book = true;
  const key = isYes
    ? side === "bid" ? "yesBids" : "yesAsks"
    : side === "bid" ? "noBids" : "noAsks";
  return {
    ...detailEntry,
    book: {
      ...detailEntry.book,
      [key]: orderPredictionBookLevels(
        upsertBookLevel(detailEntry.book[key], price, size),
        side,
      ),
    },
  };
}

export function applyPredictionTradeUpdate(
  detailEntry: PredictionMarketDetail,
  assetId: string,
  trade: PredictionTrade,
  touch?: DetailSocketTouch,
): PredictionMarketDetail {
  const patch = polymarketTradePatch(detailEntry.summary, assetId, trade.price);
  if (!patch) return detailEntry;
  if (touch) {
    touch.trades = true;
    touch.yesPrice = true;
  }
  const normalizedTrade: PredictionTrade = {
    ...trade,
    outcome: assetId === detailEntry.summary.yesTokenId ? "yes" : "no",
    price: trade.price,
  };
  return {
    ...detailEntry,
    summary: {
      ...detailEntry.summary,
      ...patch,
    },
    trades: [normalizedTrade, ...detailEntry.trades].slice(0, 40),
  };
}

export function displayedOutcomeYesPrice(
  marketKey: string,
  catalogYes: number | null,
  live: { key: string; yesPrice: number | null } | null,
): number | null {
  if (live?.key === marketKey) return live.yesPrice;
  return catalogYes;
}

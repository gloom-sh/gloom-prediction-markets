import { displayedPredictionPercent } from "../metrics";
import type { PredictionMarketSummary } from "../types";

const FLASH_MS = 300;
const FLASH_GAP_MS = 300;

export const LIVE_QUOTE_FIELDS = [
  "yesPrice",
  "noPrice",
  "lastTradePrice",
  "yesBid",
  "yesAsk",
  "noBid",
  "noAsk",
  "spread",
  "volume24h",
  "openInterest",
] as const;

export type LiveQuoteField = (typeof LIVE_QUOTE_FIELDS)[number];
export type LiveQuotePatch = Partial<Pick<PredictionMarketSummary, LiveQuoteField>>;

export function displayedOddsBucket(price: number | null | undefined): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  return Math.round(displayedPredictionPercent(price) * 10);
}

export function mergeLiveQuote(
  current: LiveQuotePatch | undefined,
  patch: LiveQuotePatch,
): LiveQuotePatch {
  if (!current) return patch;
  const next: LiveQuotePatch = { ...current };
  for (const field of LIVE_QUOTE_FIELDS) {
    if (patch[field] !== undefined) next[field] = patch[field];
  }
  return next;
}

export function quotesEqual(
  left: LiveQuotePatch | undefined,
  right: LiveQuotePatch,
): boolean {
  if (!left) return false;
  for (const field of LIVE_QUOTE_FIELDS) {
    if (left[field] !== right[field]) return false;
  }
  return true;
}

export function applyLiveQuotes(
  markets: readonly PredictionMarketSummary[],
  quotes: ReadonlyMap<string, LiveQuotePatch>,
): PredictionMarketSummary[] {
  if (quotes.size === 0) return markets as PredictionMarketSummary[];
  let changed = false;
  const next = markets.map((market) => {
    const patch = quotes.get(market.key);
    if (!patch) return market;
    const updated = applyPatch(market, patch);
    if (updated !== market) changed = true;
    return updated;
  });
  return changed ? next : (markets as PredictionMarketSummary[]);
}

function applyPatch(
  market: PredictionMarketSummary,
  patch: LiveQuotePatch,
): PredictionMarketSummary {
  let updated: PredictionMarketSummary | null = null;
  for (const field of LIVE_QUOTE_FIELDS) {
    const value = patch[field];
    if (value === undefined || value === market[field]) continue;
    updated ??= { ...market };
    updated[field] = value;
  }
  return updated ?? market;
}

export function polymarketTradePatch(
  market: Pick<PredictionMarketSummary, "yesTokenId" | "noTokenId">,
  assetId: string,
  price: number,
): LiveQuotePatch | null {
  if (!Number.isFinite(price)) return null;
  const yes = assetId === market.yesTokenId;
  const no = assetId === market.noTokenId;
  if (!yes && !no) return null;
  const yesPrice = yes ? price : Math.max(0, 1 - price);
  return {
    yesPrice,
    noPrice: Math.max(0, 1 - yesPrice),
    lastTradePrice: yesPrice,
  };
}

export function polymarketInsideBookPatch(
  market: Pick<PredictionMarketSummary, "yesTokenId" | "noTokenId">,
  assetId: string,
  bids: readonly { price: number }[],
  asks: readonly { price: number }[],
): LiveQuotePatch | null {
  let bestBid: number | null = null;
  for (const level of bids) {
    if (bestBid == null || level.price > bestBid) bestBid = level.price;
  }
  let bestAsk: number | null = null;
  for (const level of asks) {
    if (bestAsk == null || level.price < bestAsk) bestAsk = level.price;
  }
  const spread = bestBid != null && bestAsk != null && bestAsk >= bestBid
    ? bestAsk - bestBid
    : null;
  return polymarketBookPatch(market, assetId, bestBid, bestAsk, spread);
}

export function polymarketBookPatch(
  market: Pick<PredictionMarketSummary, "yesTokenId" | "noTokenId">,
  assetId: string,
  bestBid: number | null,
  bestAsk: number | null,
  spread: number | null,
): LiveQuotePatch | null {
  const yes = assetId === market.yesTokenId;
  const no = assetId === market.noTokenId;
  if (!yes && !no) return null;
  const patch: LiveQuotePatch = {};
  if (yes) {
    if (bestBid != null) patch.yesBid = bestBid;
    if (bestAsk != null) patch.yesAsk = bestAsk;
  } else {
    if (bestBid != null) patch.noBid = bestBid;
    if (bestAsk != null) patch.noAsk = bestAsk;
  }
  if (bestBid != null && bestAsk != null && bestAsk >= bestBid) {
    const mid = (bestBid + bestAsk) / 2;
    const yesPrice = yes ? mid : Math.max(0, 1 - mid);
    patch.yesPrice = yesPrice;
    patch.noPrice = Math.max(0, 1 - yesPrice);
    patch.spread = spread ?? bestAsk - bestBid;
  } else if (spread != null) {
    patch.spread = spread;
  }
  return patch.yesPrice !== undefined || patch.yesBid !== undefined || patch.yesAsk !== undefined
    || patch.noBid !== undefined || patch.noAsk !== undefined || patch.spread !== undefined
    ? patch
    : null;
}

/** Per-market flash clock. A tick that does not change the printed percent does not flash. */
export class OddsFlashBook {
  private readonly previous = new Map<string, number | null>();
  private readonly until = new Map<string, number>();
  private readonly nextAllowed = new Map<string, number>();

  seed(key: string, price: number | null | undefined): void {
    if (this.previous.has(key)) return;
    this.previous.set(key, displayedOddsBucket(price));
  }

  note(key: string, price: number | null | undefined, now: number): boolean {
    const bucket = displayedOddsBucket(price);
    const prev = this.previous.get(key);
    this.previous.set(key, bucket);
    if (prev === undefined || prev === bucket || bucket == null) return false;
    if (now < (this.nextAllowed.get(key) ?? 0)) return false;
    this.until.set(key, now + FLASH_MS);
    this.nextAllowed.set(key, now + FLASH_MS + FLASH_GAP_MS);
    return true;
  }

  active(now: number): Set<string> {
    const keys = new Set<string>();
    for (const [key, until] of this.until) {
      if (until > now) keys.add(key);
    }
    return keys;
  }

  nextChangeAt(now: number): number | null {
    let next: number | null = null;
    for (const until of this.until.values()) {
      if (until > now && (next == null || until < next)) next = until;
    }
    return next;
  }

  clear(): void {
    this.previous.clear();
    this.until.clear();
    this.nextAllowed.clear();
  }
}

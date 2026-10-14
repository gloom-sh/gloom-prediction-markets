import { measurePerf } from "gloomberb/utils";
import {
  matchesPredictionCategory,
  resolvePredictionDisplayCategory,
} from "../../categories";
import type { PredictionCategoryId, PredictionMarketSummary } from "../../types";
import { parseFloatSafe } from "../fetch";
import type { PascalMarket, PascalWindowStats } from "./types";

const PASCAL_APP = "https://app.pascal.trade";

/** The list route returns every unresolved market, a few thousand rows. */
export const PASCAL_BROWSE_MARKET_LIMIT = 400;

function eventCode(symbol: string): string {
  const dot = symbol.lastIndexOf(".");
  return dot > 0 ? symbol.slice(0, dot) : symbol;
}

function unitPrice(value: unknown): number | null {
  const parsed = parseFloatSafe(value);
  if (parsed == null || parsed < 0 || parsed > 1) return null;
  return parsed;
}

function notional(window: PascalWindowStats | undefined): number | null {
  if (!window) return null;
  const buy = parseFloatSafe(window.taker_buy_volume_notional);
  const sell = parseFloatSafe(window.taker_sell_volume_notional);
  if (buy == null && sell == null) return null;
  return (buy ?? 0) + (sell ?? 0);
}

function timestampIso(value: string | undefined): string | null {
  if (!value) return null;
  const ms = Number(value);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function matchesQuery(summary: PredictionMarketSummary, query: string): boolean {
  return [
    summary.title,
    summary.marketLabel,
    summary.eventLabel,
    summary.marketId,
    ...(summary.tags ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function normalizePascalMarket(market: PascalMarket): PredictionMarketSummary | null {
  if (market.resolution) return null;
  const symbol = market.symbol?.trim();
  if (!symbol) return null;
  const display = market.display_attributes;
  const eventLabel = display?.event_description?.trim() || symbol;
  const marketLabel = display?.market_description?.trim() || symbol;
  const tags = [
    ...(Array.isArray(display?.tags) ? display.tags : []),
    display?.topic?.description,
  ].flatMap((tag) => {
    const trimmed = tag?.trim();
    return trimmed ? [trimmed] : [];
  });
  const yesPrice = unitPrice(market.mark_price);
  const yesBid = unitPrice(market.best_bid);
  const yesAsk = unitPrice(market.best_ask);
  const eventId = eventCode(symbol);
  return {
    key: `pascal:${symbol}`,
    venue: "pascal",
    marketId: symbol,
    title: eventLabel,
    marketLabel,
    eventLabel,
    eventId,
    category: resolvePredictionDisplayCategory(tags),
    tags,
    status: "open",
    url: `${PASCAL_APP}/trade/${encodeURIComponent(eventId)}?marketSymbol=${encodeURIComponent(symbol)}`,
    description: eventLabel === marketLabel ? eventLabel : `${eventLabel}. ${marketLabel}`,
    endsAt: timestampIso(display?.expected_resolution_time_ms),
    updatedAt: timestampIso(market.listing_ts_ms),
    yesPrice,
    noPrice: yesPrice == null ? null : Math.max(0, 1 - yesPrice),
    yesBid,
    yesAsk,
    noBid: yesAsk == null ? null : Math.max(0, 1 - yesAsk),
    noAsk: yesBid == null ? null : Math.max(0, 1 - yesBid),
    spread: yesBid != null && yesAsk != null ? yesAsk - yesBid : null,
    lastTradePrice: null,
    // 24h and lifetime figures are taker buy plus sell notionals, in USD.
    volume24h: notional(market.stats?.last_24h),
    volume24hUnit: "usd",
    totalVolume: notional(market.stats?.all_time),
    totalVolumeUnit: "usd",
    openInterest: parseFloatSafe(market.long_interest) ?? parseFloatSafe(market.open_interest),
    openInterestUnit: "contracts",
    liquidity: null,
    liquidityUnit: "usd",
  };
}

function eventActivity(markets: PredictionMarketSummary[]): { volume: number; interest: number } {
  let volume = 0;
  let interest = 0;
  for (const market of markets) {
    volume += market.volume24h ?? 0;
    interest += market.openInterest ?? 0;
  }
  return { volume, interest };
}

export function selectPascalBrowse(
  markets: readonly PredictionMarketSummary[],
  categoryId: PredictionCategoryId,
  searchQuery = "",
  limit = PASCAL_BROWSE_MARKET_LIMIT,
): PredictionMarketSummary[] {
  const query = searchQuery.trim().toLowerCase();
  const matching = markets.filter((market) =>
    query ? matchesQuery(market, query) : matchesPredictionCategory(market, categoryId));
  const groups = new Map<string, PredictionMarketSummary[]>();
  for (const market of matching) {
    const id = market.eventId ?? market.marketId;
    const group = groups.get(id);
    if (group) group.push(market);
    else groups.set(id, [market]);
  }
  const ranked = [...groups.values()].sort((left, right) => {
    const a = eventActivity(left);
    const b = eventActivity(right);
    if (b.volume !== a.volume) return b.volume - a.volume;
    if (b.interest !== a.interest) return b.interest - a.interest;
    return (left[0]?.eventLabel ?? "").localeCompare(right[0]?.eventLabel ?? "");
  });
  const kept: PredictionMarketSummary[] = [];
  for (const group of ranked) {
    if (kept.length > 0 && kept.length + group.length > limit) break;
    kept.push(...group);
  }
  return kept;
}

export function normalizePascalMarkets(markets: PascalMarket[]): PredictionMarketSummary[] {
  const deduped = new Map<string, PredictionMarketSummary>();
  for (const market of markets) {
    const summary = normalizePascalMarket(market);
    if (!summary || deduped.has(summary.key)) continue;
    deduped.set(summary.key, summary);
  }
  return [...deduped.values()];
}

export function normalizePascalCatalog(
  markets: PascalMarket[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  return measurePerf(
    "prediction.catalog.pascal.normalize",
    () => selectPascalBrowse(normalizePascalMarkets(markets), categoryId, searchQuery),
    {
      categoryId,
      marketCount: markets.length,
      search: searchQuery.trim().length > 0,
    },
  );
}

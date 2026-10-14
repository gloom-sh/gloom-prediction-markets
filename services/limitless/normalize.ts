import { measurePerf } from "gloomberb/utils";
import { matchesPredictionCategory } from "../../categories";
import type { PredictionCategoryId, PredictionMarketSummary } from "../../types";
import { parseFloatSafe } from "../fetch";
import type { LimitlessActiveMarket, LimitlessProperty } from "./types";

const DURATION_CATEGORIES = new Set([
  "minutely",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "5 min",
  "15 min",
  "5-min",
  "15-min",
]);

const CLOSED_STATUSES = new Set([
  "resolved",
  "closed",
  "cancelled",
  "canceled",
]);

/** Extra words the shared category list does not already cover for this venue. */
const EXTRA_CATEGORY_KEYWORDS: Record<
  Exclude<PredictionCategoryId, "all">,
  string[]
> = {
  politics: ["election", "trump", "congress", "senate", "president"],
  world: ["geopolitics", "war", "military", "ukraine", "ceasefire"],
  macro: ["economy", "finance", "financial", "earnings", "inflation", "commodit", "rates", "stock"],
  crypto: ["btc", "eth", "doge", "xrp", "bnb", "sol"],
  science: ["space"],
  sports: ["sport", "football", "soccer", "nba", "nfl", "mlb", "nhl", "tennis", "ufc", "cricket", "baseball", "hockey", "f1"],
  entertainment: ["movie", "celebrity"],
  climate: ["hurricane", "temperature"],
  social: [],
};

function lowerUnique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function stringList(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function propertyValues(
  record: LimitlessActiveMarket | undefined,
  slug: string,
): string[] {
  const properties: LimitlessProperty[] = record?.properties ?? [];
  const values: string[] = [];
  for (const property of properties) {
    if (property.propertyKeySlug !== slug) continue;
    values.push(...stringList(property.value));
  }
  return values;
}

function containsKeyword(haystack: string, keyword: string): boolean {
  if (keyword.length >= 6) return haystack.includes(keyword);
  return new RegExp(`(?:^|[^a-z0-9])${keyword}(?:[^a-z0-9]|$)`).test(haystack);
}

function matchesLimitlessCategory(
  summary: PredictionMarketSummary,
  categoryId: PredictionCategoryId,
): boolean {
  if (categoryId === "all") return true;
  if (matchesPredictionCategory(summary, categoryId)) return true;
  const haystack = [
    summary.category ?? "",
    ...(summary.tags ?? []),
    summary.eventLabel,
    summary.title,
    summary.marketLabel,
  ]
    .join(" ")
    .toLowerCase();
  if (containsKeyword(haystack, categoryId)) return true;
  return EXTRA_CATEGORY_KEYWORDS[categoryId].some((keyword) =>
    containsKeyword(haystack, keyword),
  );
}

function matchesSearch(summary: PredictionMarketSummary, query: string): boolean {
  if (!query) return true;
  const haystack = [summary.title, summary.marketLabel, summary.eventLabel]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function plainText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Live prices are 0..1. The documented example uses 0..100 (42.8 / 57.2). */
function toUnitProbability(value: unknown): number | null {
  const parsed = parseFloatSafe(value);
  if (parsed == null) return null;
  const scaled = parsed > 1 ? parsed / 100 : parsed;
  if (scaled < 0 || scaled > 1) return null;
  return scaled;
}

function priceAt(
  prices: LimitlessActiveMarket["prices"],
  index: number,
): number | null {
  if (!prices || index >= prices.length) return null;
  return toUnitProbability(prices[index]);
}

function quote(
  record: LimitlessActiveMarket,
  side: "buy" | "sell",
  index: number,
): number | null {
  const levels = record.tradePrices?.[side]?.market;
  if (!levels || index >= levels.length) return null;
  return toUnitProbability(levels[index]);
}

function collateralDecimals(
  record: LimitlessActiveMarket,
  parent?: LimitlessActiveMarket,
): number {
  const decimals = record.collateralToken?.decimals ?? parent?.collateralToken?.decimals;
  return typeof decimals === "number" && Number.isFinite(decimals) && decimals >= 0
    ? decimals
    : 6;
}

function readUsd(
  record: LimitlessActiveMarket,
  formattedKey: keyof LimitlessActiveMarket,
  rawKey: keyof LimitlessActiveMarket,
  decimals: number,
): number | null {
  const formatted = record[formattedKey];
  if (formatted != null && formatted !== "") {
    const parsed = parseFloatSafe(formatted);
    if (parsed != null) return parsed;
  }
  const raw = record[rawKey];
  if (raw == null || raw === "") return null;
  const parsed = parseFloatSafe(raw);
  if (parsed == null) return null;
  if (typeof raw === "string" && decimals > 0) return parsed / 10 ** decimals;
  return parsed;
}

function readFirstUsd(
  record: LimitlessActiveMarket,
  pairs: Array<[keyof LimitlessActiveMarket, keyof LimitlessActiveMarket]>,
  decimals: number,
): number | null {
  for (const [formattedKey, rawKey] of pairs) {
    if (record[formattedKey] == null && record[rawKey] == null) continue;
    return readUsd(record, formattedKey, rawKey, decimals);
  }
  return null;
}

function isClosedStatus(status: string | undefined): boolean {
  return CLOSED_STATUSES.has(status?.trim().toLowerCase() ?? "");
}

function isTradeable(record: LimitlessActiveMarket): boolean {
  if (record.expired === true || record.hidden === true) return false;
  if (record.winningOutcomeIndex != null) return false;
  if (isClosedStatus(record.status)) return false;
  return true;
}

function readEndsAt(
  record: LimitlessActiveMarket,
  parent?: LimitlessActiveMarket,
): string | null {
  const timestamp = record.expirationTimestamp ?? parent?.expirationTimestamp;
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const raw = record.expirationDate ?? parent?.expirationDate;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    return raw.trim();
  }
  return null;
}

function chooseCategory(categories: string[], domains: string[]): string | undefined {
  const topical = categories.find((category) => !DURATION_CATEGORIES.has(category));
  return topical ?? domains[0] ?? categories[0];
}

function collectCategory(
  record: LimitlessActiveMarket,
  parent?: LimitlessActiveMarket,
): { category?: string; tags: string[] } {
  const categories = lowerUnique([
    ...stringList(record.categories),
    ...stringList(parent?.categories),
  ]);
  const domains = lowerUnique([
    ...propertyValues(record, "domain"),
    ...propertyValues(parent, "domain"),
  ]);
  const tags = lowerUnique([
    ...categories,
    ...stringList(record.tags),
    ...stringList(parent?.tags),
    ...domains,
    ...propertyValues(record, "sport-type"),
    ...propertyValues(parent, "sport-type"),
    ...propertyValues(record, "ticker"),
    ...propertyValues(parent, "ticker"),
  ]);
  return {
    category: chooseCategory(categories, domains),
    tags,
  };
}

function toSummary(
  record: LimitlessActiveMarket,
  parent: LimitlessActiveMarket | undefined,
  eventId: string | undefined,
): PredictionMarketSummary | null {
  const eventTitle = (parent?.title ?? record.title ?? "").trim();
  const outcomeLabel = parent
    ? (record.proxyTitle?.trim() || record.title?.trim() || "")
    : eventTitle;
  const identity = record.slug?.trim() || (record.id != null ? String(record.id) : "");
  if (!eventTitle || !outcomeLabel || !identity) return null;

  const yesBid = quote(record, "sell", 0);
  const yesAsk = quote(record, "buy", 0);
  const noBid = quote(record, "sell", 1);
  const noAsk = quote(record, "buy", 1);
  const yesPrice = priceAt(record.prices, 0)
    ?? (yesBid != null && yesAsk != null ? (yesBid + yesAsk) / 2 : (yesAsk ?? yesBid));
  const noPrice = priceAt(record.prices, 1)
    ?? (noBid != null && noAsk != null ? (noBid + noAsk) / 2 : (noAsk ?? noBid))
    ?? (yesPrice != null ? Math.max(0, 1 - yesPrice) : null);
  const decimals = collateralDecimals(record, parent);
  const slug = record.slug?.trim() || parent?.slug?.trim() || "";
  const { category, tags } = collectCategory(record, parent);
  const updatedAt = record.updatedAt ?? parent?.updatedAt ?? null;

  return {
    key: `limitless:${identity}`,
    venue: "limitless",
    marketId: record.id != null ? String(record.id) : identity,
    title: eventTitle,
    marketLabel: outcomeLabel,
    eventLabel: eventTitle,
    ...(eventId ? { eventId } : {}),
    category,
    tags,
    status: "open",
    url: slug
      ? `https://limitless.exchange/markets/${slug}`
      : "https://limitless.exchange",
    description: plainText(record.description) || plainText(parent?.description),
    endsAt: readEndsAt(record, parent),
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
    yesPrice,
    noPrice,
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    spread: yesBid != null && yesAsk != null ? yesAsk - yesBid : null,
    lastTradePrice: null,
    // `volume` is lifetime USDC volume. There is no 24h field on this payload.
    volume24h: readFirstUsd(
      record,
      [
        ["volume24hFormatted", "volume24h"],
        ["volume24hrFormatted", "volume24hr"],
      ],
      decimals,
    ),
    volume24hUnit: "usd",
    totalVolume: readFirstUsd(record, [["volumeFormatted", "volume"]], decimals),
    totalVolumeUnit: "usd",
    openInterest: readFirstUsd(
      record,
      [["openInterestFormatted", "openInterest"]],
      decimals,
    ),
    openInterestUnit: "usd",
    liquidity: readFirstUsd(record, [["liquidityFormatted", "liquidity"]], decimals),
    liquidityUnit: "usd",
    yesTokenId: typeof record.tokens?.yes === "string" ? record.tokens.yes : undefined,
    noTokenId: typeof record.tokens?.no === "string" ? record.tokens.no : undefined,
    conditionId: record.conditionId ?? undefined,
  };
}

function eventIdentity(record: LimitlessActiveMarket | undefined): string | undefined {
  if (!record) return undefined;
  if (record.id != null && String(record.id).trim()) return String(record.id);
  const slug = record.slug?.trim();
  return slug || undefined;
}

function appendMarket(
  record: LimitlessActiveMarket,
  into: PredictionMarketSummary[],
): void {
  const nested = record.markets;
  if (Array.isArray(nested) && nested.length > 0) {
    if (record.expired === true || record.hidden === true || isClosedStatus(record.status)) {
      return;
    }
    const tradeable = nested.filter(isTradeable);
    const eventId = tradeable.length > 1 ? eventIdentity(record) : undefined;
    for (const child of tradeable) {
      const summary = toSummary(child, record, eventId);
      if (summary) into.push(summary);
    }
    return;
  }

  if (!isTradeable(record)) return;
  const groupId = record.groupId == null ? undefined : String(record.groupId).trim() || undefined;
  const summary = toSummary(record, undefined, groupId);
  if (summary) into.push(summary);
}

function normalizeLimitlessMarkets(
  markets: LimitlessActiveMarket[],
  searchQuery: string,
  categoryId: PredictionCategoryId,
): PredictionMarketSummary[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const deduped = new Map<string, PredictionMarketSummary>();
  const collected: PredictionMarketSummary[] = [];
  for (const market of markets) appendMarket(market, collected);

  for (const summary of collected) {
    if (!matchesLimitlessCategory(summary, categoryId)) continue;
    if (!matchesSearch(summary, normalizedQuery)) continue;
    if (!deduped.has(summary.key)) deduped.set(summary.key, summary);
  }
  return [...deduped.values()];
}

export function normalizeLimitlessCatalog(
  markets: LimitlessActiveMarket[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  return measurePerf(
    "prediction.catalog.limitless.normalize",
    () => normalizeLimitlessMarkets(markets, searchQuery, categoryId),
    {
      categoryId,
      marketCount: markets.length,
      search: searchQuery.trim().length > 0,
    },
  );
}

/** Narrows a catalog normalized with no query or category, so one download
 * serves every category tab and search. */
export function filterLimitlessCatalog(
  markets: readonly PredictionMarketSummary[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery && categoryId === "all") return [...markets];
  return markets.filter((summary) =>
    matchesLimitlessCategory(summary, categoryId) && matchesSearch(summary, normalizedQuery));
}

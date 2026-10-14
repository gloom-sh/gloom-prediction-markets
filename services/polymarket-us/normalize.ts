import type {
  PredictionCategoryId,
  PredictionMarketSummary,
} from "../../types";
import { parseFloatSafe } from "../fetch";
import type {
  PolymarketUsAmount,
  PolymarketUsMarketRecord,
  PolymarketUsMarketSide,
} from "./types";

const POLYMARKET_US_HOME = "https://polymarket.us";

function toProbability(value: unknown): number | null {
  const parsed = parseFloatSafe(value);
  if (parsed == null) return null;
  if (parsed >= 0 && parsed <= 1) return parsed;
  if (parsed > 1 && parsed <= 100) return parsed / 100;
  return null;
}

function amountProbability(amount: PolymarketUsAmount | null | undefined): number | null {
  if (!amount) return null;
  return toProbability(amount.value);
}

function readDecimal(value: unknown): number | null {
  return parseFloatSafe(value);
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findYesSide(
  sides: PolymarketUsMarketSide[],
): PolymarketUsMarketSide | undefined {
  return (
    sides.find((side) => side.long === true) ??
    sides.find((side) => side.description?.trim().toLowerCase() === "yes")
  );
}

function findNoSide(
  sides: PolymarketUsMarketSide[],
): PolymarketUsMarketSide | undefined {
  return (
    sides.find((side) => side.long === false) ??
    sides.find((side) => side.description?.trim().toLowerCase() === "no")
  );
}

function sideProbability(side: PolymarketUsMarketSide | undefined): number | null {
  if (!side) return null;
  return toProbability(side.price) ?? amountProbability(side.quote);
}

/**
 * On gateway.polymarket.us, outcomePrices[0] is the long/Yes dollar price.
 * It is not zipped to `outcomes` (that array is often ["No","Yes"]).
 */
function outcomePricesYes(record: PolymarketUsMarketRecord): number | null {
  const prices = parseJsonArray(record.outcomePrices);
  return toProbability(prices[0]);
}

function outcomeName(
  record: PolymarketUsMarketRecord,
  yesSide: PolymarketUsMarketSide | undefined,
): string {
  const titled =
    readText(record.title) ?? readText(record.titleShort) ?? readText(record.subtitle);
  if (titled) return titled;
  const sideName = readText(yesSide?.description);
  if (sideName && sideName.toLowerCase() !== "yes" && sideName.toLowerCase() !== "no") {
    return sideName;
  }
  return readText(record.question) ?? "Unknown market";
}

function collectTags(record: PolymarketUsMarketRecord, category: string | undefined): string[] {
  const tags: string[] = [];
  if (category) tags.push(category);
  for (const tag of record.tags ?? []) {
    if (typeof tag === "string") {
      const label = tag.trim().toLowerCase();
      if (label) tags.push(label);
      continue;
    }
    const label = (tag.label ?? tag.slug ?? "").trim().toLowerCase();
    if (label) tags.push(label);
  }
  return [...new Set(tags)];
}

function catalogHaystack(summary: PredictionMarketSummary): string {
  return [
    summary.title,
    summary.eventLabel,
    summary.marketLabel,
    summary.category ?? "",
    ...(summary.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function withSharedEventIds(
  summaries: PredictionMarketSummary[],
): PredictionMarketSummary[] {
  const counts = new Map<string, number>();
  const canonical = new Map<string, string>();
  for (const summary of summaries) {
    if (summary.eventId) continue;
    const label = summary.eventLabel.trim();
    const key = label.toLowerCase();
    if (!key) continue;
    if (!canonical.has(key)) canonical.set(key, label);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return summaries.map((summary) => {
    if (summary.eventId) return summary;
    const key = summary.eventLabel.trim().toLowerCase();
    if ((counts.get(key) ?? 0) < 2) return summary;
    const eventId = canonical.get(key);
    return eventId ? { ...summary, eventId } : summary;
  });
}

export function normalizePolymarketUsMarket(
  record: PolymarketUsMarketRecord,
): PredictionMarketSummary | null {
  const marketId = record.id == null ? "" : String(record.id).trim();
  if (!marketId) return null;

  const sides = record.marketSides ?? [];
  const yesSide = findYesSide(sides);
  const noSide = findNoSide(sides);
  const yesBid = amountProbability(record.bestBidQuote);
  const yesAsk = amountProbability(record.bestAskQuote);
  const yesPrice =
    sideProbability(yesSide) ?? yesAsk ?? outcomePricesYes(record) ?? yesBid;
  const noPrice = sideProbability(noSide);
  const eventLabel = readText(record.question) ?? outcomeName(record, yesSide);
  const category = readText(record.category)?.toLowerCase();
  const eventOpenInterest = readDecimal(record.event?.openInterest);
  const eventVolume24h = readDecimal(record.event?.volume24hr);
  const eventId = record.event?.id == null ? undefined : String(record.event.id).trim() || undefined;

  return {
    key: `polymarket-us:${marketId}`,
    venue: "polymarket-us",
    marketId,
    title: eventLabel,
    marketLabel: outcomeName(record, yesSide),
    eventLabel,
    ...(eventId ? { eventId } : {}),
    category,
    tags: collectTags(record, category),
    status: record.closed === true ? "closed" : "open",
    url: POLYMARKET_US_HOME,
    description: readText(record.description) ?? "",
    endsAt: readText(record.endDate),
    updatedAt: readText(record.updatedAt) ?? readText(record.createdAt),
    yesPrice,
    noPrice,
    yesBid,
    yesAsk,
    noBid: null,
    noAsk: null,
    spread: yesBid != null && yesAsk != null ? yesAsk - yesBid : null,
    lastTradePrice: null,
    volume24h: readDecimal(record.volume24hr) ?? readDecimal(record.volume24h),
    volume24hUnit: "usd",
    totalVolume: readDecimal(record.volume) ?? readDecimal(record.volumeNum),
    totalVolumeUnit: "usd",
    openInterest: readDecimal(record.openInterest),
    openInterestUnit: "usd",
    liquidity: readDecimal(record.liquidity) ?? readDecimal(record.liquidityNum),
    liquidityUnit: "usd",
    eventOpenInterest,
    eventVolume24h,
  };
}

export function normalizePolymarketUsCatalog(
  markets: PolymarketUsMarketRecord[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  const summaries = withSharedEventIds(
    markets.flatMap((market) => {
      const normalized = normalizePolymarketUsMarket(market);
      return normalized ? [normalized] : [];
    }),
  );
  return filterPolymarketUsCatalog(summaries, searchQuery, categoryId);
}

/** Narrows a catalog normalized with no query or category, so one download
 * serves every category tab and search. */
export function filterPolymarketUsCatalog(
  summaries: readonly PredictionMarketSummary[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return summaries.filter((summary) => {
    const haystack = catalogHaystack(summary);
    if (categoryId !== "all" && !haystack.includes(categoryId)) return false;
    if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
    return true;
  });
}

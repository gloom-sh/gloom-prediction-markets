import { measurePerf } from "gloomberb/utils";
import { matchesPredictionCategory } from "../../categories";
import type {
  PredictionCategoryId,
  PredictionMarketSummary,
} from "../../types";
import { parseFloatSafe } from "../fetch";
import type { GeminiContractRecord, GeminiEventRecord } from "./types";

const GEMINI_EXCHANGE_URL = "https://exchange.gemini.com";

function readText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readTimestamp(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = readText(value);
    if (trimmed) return trimmed;
  }
  return null;
}

function geminiEventId(event: GeminiEventRecord): string {
  return (
    readText(event.ticker) ??
    readText(event.slug) ??
    readText(event.title) ??
    readText(event.id) ??
    "event"
  );
}

function geminiEventUrl(event: GeminiEventRecord): string {
  const ticker = readText(event.ticker);
  const slug = readText(event.slug);
  if (!ticker || !slug) return GEMINI_EXCHANGE_URL;
  return `${GEMINI_EXCHANGE_URL}/predictions/${encodeURIComponent(ticker)}/${encodeURIComponent(slug)}`;
}

function geminiCategory(event: GeminiEventRecord): string | undefined {
  return readText(event.category)?.toLowerCase() || undefined;
}

function geminiStatus(event: GeminiEventRecord): string {
  const status = readText(event.status);
  if (status?.toLowerCase() === "active") return "open";
  return status ?? "unknown";
}

function contractPrices(contract: GeminiContractRecord): {
  yesPrice: number | null;
  noPrice: number | null;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  spread: number | null;
  lastTradePrice: number | null;
} {
  const yesBid = parseFloatSafe(contract.prices?.bestBid);
  const yesAsk = parseFloatSafe(contract.prices?.bestAsk);
  const lastTradePrice = parseFloatSafe(contract.prices?.lastTradePrice);
  const midpoint =
    yesBid != null && yesAsk != null ? (yesBid + yesAsk) / 2 : null;
  const yesPrice = lastTradePrice ?? midpoint ?? yesBid;
  return {
    yesPrice,
    noPrice: yesPrice == null ? null : 1 - yesPrice,
    yesBid,
    yesAsk,
    noBid: yesAsk == null ? null : 1 - yesAsk,
    noAsk: yesBid == null ? null : 1 - yesBid,
    spread: yesBid != null && yesAsk != null ? yesAsk - yesBid : null,
    lastTradePrice,
  };
}

function normalizeGeminiContract(
  event: GeminiEventRecord,
  contract: GeminiContractRecord,
): PredictionMarketSummary | null {
  const instrumentSymbol = readText(contract.instrumentSymbol);
  if (!instrumentSymbol) return null;

  const eventTitle =
    readText(event.title) ?? readText(event.slug) ?? readText(event.ticker) ?? instrumentSymbol;
  const category = geminiCategory(event);
  const prices = contractPrices(contract);
  // Volume and open interest are published once for the event. Leaving them
  // off the per-contract fields keeps grouped rows from summing the same number.
  const contractVolume24h = parseFloatSafe(contract.volume24h);
  const eventVolume24h = parseFloatSafe(event.volume24h);
  const contractOpenInterest = parseFloatSafe(contract.openInterest);
  const eventOpenInterest = parseFloatSafe(event.openInterest);

  return {
    key: `gemini:${instrumentSymbol}`,
    venue: "gemini",
    marketId: instrumentSymbol,
    title: eventTitle,
    marketLabel: readText(contract.label) ?? instrumentSymbol,
    eventLabel: eventTitle,
    eventId: geminiEventId(event),
    category,
    tags: category ? [category] : [],
    status: geminiStatus(event),
    url: geminiEventUrl(event),
    description: "",
    endsAt: readTimestamp(
      contract.expiryDate,
      contract.endDate,
      event.expiryDate,
      event.endDate,
    ),
    updatedAt: null,
    yesPrice: prices.yesPrice,
    noPrice: prices.noPrice,
    yesBid: prices.yesBid,
    yesAsk: prices.yesAsk,
    noBid: prices.noBid,
    noAsk: prices.noAsk,
    spread: prices.spread,
    lastTradePrice: prices.lastTradePrice,
    volume24h: contractVolume24h,
    volume24hUnit: "usd",
    totalVolume: parseFloatSafe(contract.volume) ?? parseFloatSafe(event.volume),
    totalVolumeUnit: "usd",
    openInterest: contractOpenInterest,
    openInterestUnit: "usd",
    eventOpenInterest,
    eventVolume24h,
    liquidity: parseFloatSafe(contract.liquidity) ?? parseFloatSafe(event.liquidity),
    liquidityUnit: "usd",
  };
}

function matchesGeminiSearch(
  summary: PredictionMarketSummary,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  return [summary.title, summary.eventLabel, summary.marketLabel]
    .join("\n")
    .toLowerCase()
    .includes(normalizedQuery);
}

function flattenGeminiEvents(
  events: GeminiEventRecord[],
  searchQuery: string,
  categoryId: PredictionCategoryId,
): PredictionMarketSummary[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const deduped = new Map<string, PredictionMarketSummary>();

  for (const event of events) {
    for (const contract of event.contracts ?? []) {
      const summary = normalizeGeminiContract(event, contract);
      if (!summary) continue;
      if (
        categoryId !== "all" &&
        !matchesPredictionCategory(summary, categoryId)
      ) {
        continue;
      }
      if (!matchesGeminiSearch(summary, normalizedQuery)) continue;
      deduped.set(summary.key, summary);
    }
  }

  return [...deduped.values()];
}

export function normalizeGeminiCatalog(
  events: GeminiEventRecord[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  return measurePerf(
    "prediction.catalog.gemini.normalize",
    () => flattenGeminiEvents(events, searchQuery, categoryId),
    {
      categoryId,
      eventCount: events.length,
      search: searchQuery.trim().length > 0,
    },
  );
}

/** Narrows a catalog normalized with no category, so one download per search
 * serves every category tab. */
export function filterGeminiCatalog(
  markets: readonly PredictionMarketSummary[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return markets.filter((summary) =>
    (categoryId === "all" || matchesPredictionCategory(summary, categoryId)) &&
    matchesGeminiSearch(summary, normalizedQuery));
}

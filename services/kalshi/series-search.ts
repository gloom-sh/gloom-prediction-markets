import { categoryForPredictionQuery, getKalshiCategoryNames } from "../../categories";
import type { PredictionCategoryId, PredictionMarketSummary } from "../../types";
import { fetchJson, loadCachedPredictionResource, parseFloatSafe, PREDICTION_CACHE_POLICIES } from "../fetch";
import { normalizeKalshiCatalog } from "./normalize";
import type { KalshiEventResponse, KalshiEventsResponse } from "./types";

const SERIES_MATCH_LIMIT = 8;

interface KalshiSeriesListItem {
  ticker?: string;
  title?: string;
  category?: string;
  tags?: string[] | null;
  volume_fp?: string;
}

interface KalshiSeriesListResponse {
  series?: KalshiSeriesListItem[];
}

export interface RankedKalshiSeries {
  ticker: string;
  title: string;
  volume: number;
}

export function rankKalshiSeries(
  series: readonly KalshiSeriesListItem[],
  query: string,
  limit = SERIES_MATCH_LIMIT,
): RankedKalshiSeries[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [];
  const ranked: RankedKalshiSeries[] = [];
  for (const item of series) {
    const ticker = item.ticker?.trim();
    if (!ticker) continue;
    const haystack = [ticker, item.title ?? "", ...(item.tags ?? [])].join(" ").toLowerCase();
    if (!words.every((word) => haystack.includes(word))) continue;
    ranked.push({
      ticker,
      title: item.title?.trim() || ticker,
      volume: parseFloatSafe(item.volume_fp) ?? 0,
    });
  }
  ranked.sort((left, right) => right.volume - left.volume || left.ticker.localeCompare(right.ticker));
  return ranked.slice(0, limit);
}

function looksLikeKalshiTicker(query: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(query.trim());
}

function kalshiMarketsPath(query: string): string[] | null {
  if (!/^https?:\/\//i.test(query) && !/kalshi\.com\//i.test(query)) return null;
  try {
    const url = new URL(query.includes("://") ? query : `https://${query}`);
    const host = url.hostname.toLowerCase();
    if (host !== "kalshi.com" && !host.endsWith(".kalshi.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    const marketsIndex = parts.findIndex((part) => part.toLowerCase() === "markets");
    if (marketsIndex < 0) return null;
    return parts.slice(marketsIndex + 1);
  } catch {
    return null;
  }
}

export function kalshiEventTickerFromQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const path = kalshiMarketsPath(trimmed);
  if (path) {
    const ticker = [...path].reverse().find((part) => looksLikeKalshiTicker(part));
    return ticker ? ticker.toUpperCase() : null;
  }
  if (looksLikeKalshiTicker(trimmed)) return trimmed.toUpperCase();
  return null;
}

export function kalshiSeriesTickerFromQuery(query: string): string | null {
  const path = kalshiMarketsPath(query.trim());
  const first = path?.[0]?.trim();
  if (!first || looksLikeKalshiTicker(first)) return null;
  return first.toUpperCase();
}

function eventTickerCandidates(ticker: string): string[] {
  const parts = ticker.split("-").filter(Boolean);
  if (parts.length < 3) return [ticker];
  return [ticker, parts.slice(0, -1).join("-")];
}

async function loadKalshiSeriesList(
  categoryId: PredictionCategoryId,
  signal?: AbortSignal,
): Promise<KalshiSeriesListItem[]> {
  const categories = getKalshiCategoryNames(categoryId);
  const names = categories.length > 0 ? categories : [""];
  const lists = await Promise.all(names.map(async (category) => {
    const url = new URL("https://api.elections.kalshi.com/trade-api/v2/series");
    url.searchParams.set("include_volume", "true");
    if (category) url.searchParams.set("category", category);
    return await loadCachedPredictionResource(
      "catalog",
      `kalshi:series:${category || "all"}`,
      () => fetchJson<KalshiSeriesListResponse>(url.toString(), signal),
      PREDICTION_CACHE_POLICIES.catalog,
    );
  }));
  const seen = new Set<string>();
  const series: KalshiSeriesListItem[] = [];
  for (const list of lists) {
    for (const item of list.series ?? []) {
      const ticker = item.ticker?.trim();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      series.push(item);
    }
  }
  return series;
}

async function loadSeriesEvents(
  seriesTicker: string,
  categoryId: PredictionCategoryId,
  signal?: AbortSignal,
): Promise<PredictionMarketSummary[]> {
  const markets: PredictionMarketSummary[] = [];
  const seenCursors = new Set<string>();
  let cursor = "";
  for (;;) {
    if (signal?.aborted) return markets;
    const url = new URL("https://api.elections.kalshi.com/trade-api/v2/events");
    url.searchParams.set("series_ticker", seriesTicker);
    url.searchParams.set("status", "open");
    url.searchParams.set("with_nested_markets", "true");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchJson<KalshiEventsResponse>(url.toString(), signal);
    markets.push(...normalizeKalshiCatalog(response.events ?? [], "", categoryId));
    const next = response.cursor?.trim() ?? "";
    if (!next || seenCursors.has(next)) return markets;
    seenCursors.add(next);
    cursor = next;
  }
}

async function loadEventByTicker(
  eventTicker: string,
  categoryId: PredictionCategoryId,
  signal?: AbortSignal,
): Promise<PredictionMarketSummary[]> {
  const response = await fetchJson<KalshiEventResponse>(
    `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(eventTicker)}?with_nested_markets=true`,
    signal,
  );
  if (!response.event) return [];
  return normalizeKalshiCatalog([{
    ...response.event,
    markets: response.markets,
  }], "", categoryId);
}

export async function streamKalshiSeriesSearch(
  query: string,
  categoryId: PredictionCategoryId,
  signal: AbortSignal,
  onMarkets: (markets: PredictionMarketSummary[]) => void,
): Promise<number> {
  let emitted = 0;
  const searchCategory = categoryForPredictionQuery(query, categoryId);
  const publish = (markets: PredictionMarketSummary[]) => {
    if (signal.aborted || markets.length === 0) return;
    emitted += markets.length;
    onMarkets(markets);
  };
  const eventTicker = kalshiEventTickerFromQuery(query);
  const seriesTicker = kalshiSeriesTickerFromQuery(query);
  const loadedSeries = new Set<string>();
  if (eventTicker) {
    for (const candidate of eventTickerCandidates(eventTicker)) {
      if (signal.aborted) return emitted;
      try {
        const markets = await loadEventByTicker(candidate, searchCategory, signal);
        if (markets.length === 0) continue;
        publish(markets);
        break;
      } catch {
        if (signal.aborted) return emitted;
      }
    }
  } else if (seriesTicker) {
    try {
      publish(await loadSeriesEvents(seriesTicker, searchCategory, signal));
      loadedSeries.add(seriesTicker);
    } catch {
      if (signal.aborted) return emitted;
    }
  }
  const rankQuery = eventTicker?.split("-")[0] ?? seriesTicker ?? query;
  const series = rankKalshiSeries(await loadKalshiSeriesList(searchCategory, signal), rankQuery);
  for (const match of series) {
    if (signal.aborted) return emitted;
    if (loadedSeries.has(match.ticker)) continue;
    try {
      publish(await loadSeriesEvents(match.ticker, searchCategory, signal));
    } catch {
      if (signal.aborted) return emitted;
    }
  }
  return emitted;
}

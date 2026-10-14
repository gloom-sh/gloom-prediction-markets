import {
  buildPredictionCatalogResourceKey,
  buildPredictionDetailResourceKey,
} from "../../cache";
import { getKalshiCategoryNames } from "../../categories";
import type {
  PredictionBookLevel,
  PredictionBookSnapshot,
  PredictionCategoryId,
  PredictionHistoryPoint,
  PredictionMarketDetail,
  PredictionMarketSummary,
  PredictionTrade,
} from "../../types";
import { predictionSiblingFromSummary } from "../../sibling-summary";
import {
  fetchJson,
  loadCachedPredictionResource,
  parseFloatSafe,
  PREDICTION_CACHE_POLICIES,
} from "../fetch";
import {
  normalizeKalshiBookLevel,
  normalizeKalshiCatalog,
  normalizeKalshiMarket,
} from "./normalize";
import type {
  KalshiCandlestickResponse,
  KalshiEventRecord,
  KalshiEventResponse,
  KalshiEventsResponse,
  KalshiOrderbookResponse,
  KalshiSeriesResponse,
  KalshiTradesResponse,
} from "./types";

export { normalizeKalshiMarket } from "./normalize";

const KALSHI_EVENT_PAGE_LIMIT = 200;
const DEFAULT_KALSHI_EVENT_MAX_PAGES = 3;
const SEARCH_KALSHI_EVENT_MAX_PAGES = 3;
const KALSHI_CATEGORY_CURSOR_PREFIX = "kalshi-cat-cursors:v1:";
const kalshiCursors = new Map<string, string | null>();

function kalshiCursorKey(searchQuery: string, categoryId: PredictionCategoryId): string {
  return `${categoryId}:${searchQuery.trim().toLowerCase()}`;
}

function rememberKalshiCursor(
  searchQuery: string,
  categoryId: PredictionCategoryId,
  cursor: string | null,
): void {
  kalshiCursors.set(kalshiCursorKey(searchQuery, categoryId), cursor);
}

export function kalshiCatalogCursor(searchQuery: string, categoryId: PredictionCategoryId): string | null {
  return kalshiCursors.get(kalshiCursorKey(searchQuery, categoryId)) ?? null;
}

function kalshiSeriesTickerFromEvent(eventTicker: string | undefined): string | undefined {
  const trimmed = eventTicker?.trim().toUpperCase();
  if (!trimmed) return undefined;
  const withoutDateSuffix = trimmed.replace(/-[0-9].*$/, "");
  return withoutDateSuffix || trimmed;
}

function decodeKalshiCategoryCursors(cursor: string): Record<string, string> | null {
  if (!cursor.startsWith(KALSHI_CATEGORY_CURSOR_PREFIX)) return null;
  try {
    const json = Buffer.from(cursor.slice(KALSHI_CATEGORY_CURSOR_PREFIX.length), "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed) payload[key] = trimmed;
    }
    return payload;
  } catch {
    return null;
  }
}

function kalshiCategoryStarts(
  categories: readonly string[],
  startCursor?: string,
): Map<string, string | undefined> {
  const starts = new Map<string, string | undefined>();
  if (!startCursor) {
    for (const category of categories) starts.set(category, undefined);
    return starts;
  }
  const decoded = decodeKalshiCategoryCursors(startCursor);
  if (decoded) {
    for (const category of categories) {
      const cursor = decoded[category];
      if (cursor) starts.set(category, cursor);
    }
    return starts;
  }
  const only = categories.length === 1 ? categories[0] : undefined;
  if (only) starts.set(only, startCursor);
  return starts;
}

function encodeKalshiCategoryCursor(
  categories: readonly string[],
  next: ReadonlyMap<string, string>,
): string | null {
  const only = categories.length === 1 ? categories[0] : undefined;
  if (only) return next.get(only) ?? null;
  const payload: Record<string, string> = {};
  for (const category of categories) {
    const cursor = next.get(category);
    if (cursor) payload[category] = cursor;
  }
  if (Object.keys(payload).length === 0) return null;
  return KALSHI_CATEGORY_CURSOR_PREFIX + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function buildKalshiCatalogUrl(cursor?: string, category?: string, limit = KALSHI_EVENT_PAGE_LIMIT): string {
  const url = new URL("https://api.elections.kalshi.com/trade-api/v2/events");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("status", "open");
  url.searchParams.set("with_nested_markets", "true");
  if (category) url.searchParams.set("category", category);
  if (cursor) url.searchParams.set("cursor", cursor);
  return url.toString();
}

async function fetchKalshiCatalogEvents(
  maxPages = DEFAULT_KALSHI_EVENT_MAX_PAGES,
  limit = KALSHI_EVENT_PAGE_LIMIT,
  signal?: AbortSignal,
  startCursor?: string,
): Promise<{ events: KalshiEventRecord[]; nextCursor: string | null }> {
  const events: KalshiEventRecord[] = [];
  let cursor: string | undefined = startCursor;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchJson<KalshiEventsResponse>(
      buildKalshiCatalogUrl(cursor, undefined, limit),
      signal,
    );
    events.push(...(response.events ?? []));
    cursor = response.cursor?.trim() || undefined;
    if (!cursor) break;
  }

  return { events, nextCursor: cursor ?? null };
}

async function fetchKalshiCatalogEventsForCategory(
  categoryId: PredictionCategoryId,
  maxPages = DEFAULT_KALSHI_EVENT_MAX_PAGES,
  limit = KALSHI_EVENT_PAGE_LIMIT,
  signal?: AbortSignal,
  startCursor?: string,
): Promise<{ events: KalshiEventRecord[]; nextCursor: string | null }> {
  const categories = getKalshiCategoryNames(categoryId);
  if (categories.length === 0) return await fetchKalshiCatalogEvents(maxPages, limit, signal, startCursor);

  const deduped = new Map<string, KalshiEventRecord>();
  const starts = kalshiCategoryStarts(categories, startCursor);
  const nextByCategory = new Map<string, string>();
  for (const category of categories) {
    if (!starts.has(category)) continue;
    let cursor = starts.get(category);
    for (let page = 0; page < maxPages; page += 1) {
      const response = await fetchJson<KalshiEventsResponse>(
        buildKalshiCatalogUrl(cursor, category, limit),
        signal,
      );
      for (const event of response.events ?? []) {
        const key = event.event_ticker ?? event.title;
        deduped.set(key, event);
      }
      cursor = response.cursor?.trim() || undefined;
      if (!cursor) break;
    }
    if (cursor) nextByCategory.set(category, cursor);
  }

  return { events: [...deduped.values()], nextCursor: encodeKalshiCategoryCursor(categories, nextByCategory) };
}

export async function loadKalshiCatalog(
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<PredictionMarketSummary[]> {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const requestedLimit = Math.max(1, Math.min(KALSHI_EVENT_PAGE_LIMIT, options.limit ?? KALSHI_EVENT_PAGE_LIMIT));
  const pageLimit = Math.max(20, requestedLimit);
  const maxPages = options.limit ? 1 : normalizedQuery ? SEARCH_KALSHI_EVENT_MAX_PAGES : DEFAULT_KALSHI_EVENT_MAX_PAGES;
  return await loadCachedPredictionResource(
    "catalog",
    `${buildPredictionCatalogResourceKey("kalshi", categoryId, normalizedQuery)}:${requestedLimit}`,
    async () => {
      const page = categoryId === "all"
        ? await fetchKalshiCatalogEvents(maxPages, pageLimit, options.signal)
        : await fetchKalshiCatalogEventsForCategory(categoryId, maxPages, pageLimit, options.signal);
      rememberKalshiCursor(normalizedQuery, categoryId, page.nextCursor);
      return normalizeKalshiCatalog(page.events, normalizedQuery, categoryId).slice(0, requestedLimit);
    },
    PREDICTION_CACHE_POLICIES.catalog,
  );
}

export async function loadKalshiCatalogPage(
  categoryId: PredictionCategoryId,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<{ markets: PredictionMarketSummary[]; nextCursor: string | null }> {
  const page = categoryId === "all"
    ? await fetchKalshiCatalogEvents(1, KALSHI_EVENT_PAGE_LIMIT, signal, cursor ?? undefined)
    : await fetchKalshiCatalogEventsForCategory(categoryId, 1, KALSHI_EVENT_PAGE_LIMIT, signal, cursor ?? undefined);
  return {
    markets: normalizeKalshiCatalog(page.events, "", categoryId),
    nextCursor: page.nextCursor,
  };
}

export async function loadMoreKalshiCatalog(
  searchQuery: string,
  categoryId: PredictionCategoryId,
  cursor: string,
  signal?: AbortSignal,
): Promise<{ markets: PredictionMarketSummary[]; nextCursor: string | null; hasMore: boolean }> {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const page = categoryId === "all"
    ? await fetchKalshiCatalogEvents(1, KALSHI_EVENT_PAGE_LIMIT, signal, cursor)
    : await fetchKalshiCatalogEventsForCategory(categoryId, 1, KALSHI_EVENT_PAGE_LIMIT, signal, cursor);
  rememberKalshiCursor(normalizedQuery, categoryId, page.nextCursor);
  return {
    markets: normalizeKalshiCatalog(page.events, normalizedQuery, categoryId),
    nextCursor: page.nextCursor,
    hasMore: !!page.nextCursor,
  };
}

async function loadKalshiEvent(
  eventTicker: string | undefined,
): Promise<KalshiEventResponse | null> {
  if (!eventTicker) return null;
  try {
    return await loadCachedPredictionResource(
      "rules",
      `kalshi:event:${eventTicker}`,
      async () =>
        await fetchJson<KalshiEventResponse>(
          `https://api.elections.kalshi.com/trade-api/v2/events/${eventTicker}`,
        ),
      PREDICTION_CACHE_POLICIES.rules,
    );
  } catch {
    return null;
  }
}

export async function resolveKalshiChartSummary(
  eventTicker: string,
  marketTicker: string,
  signal?: AbortSignal,
): Promise<PredictionMarketSummary> {
  const response = await fetchJson<KalshiEventResponse>(
    `https://api.elections.kalshi.com/trade-api/v2/events/${eventTicker}`,
    signal,
  );
  const market = response.markets?.find((candidate) => candidate.ticker === marketTicker);
  const summary = market ? normalizeKalshiMarket(market, response.event) : null;
  if (!summary) {
    throw new Error(`Kalshi market ${marketTicker} in event ${eventTicker} is no longer resolvable. Remove or replace this chart series.`);
  }
  return summary;
}

function kalshiTradeSide(trade: { taker_side: "yes" | "no" }): "buy" | "sell" {
  const record = trade as { taker_side: "yes" | "no" } & Record<string, unknown>;
  for (const field of ["side", "action", "taker_action"]) {
    const value = record[field];
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (normalized === "buy" || normalized === "sell") return normalized;
  }
  return "buy";
}

async function loadKalshiTrades(
  summary: PredictionMarketSummary,
): Promise<PredictionTrade[]> {
  return await loadCachedPredictionResource(
    "trades",
    summary.key,
    async () => {
      const response = await fetchJson<KalshiTradesResponse>(
        `https://api.elections.kalshi.com/trade-api/v2/markets/trades?ticker=${summary.marketId}&limit=30`,
      );
      return (response.trades ?? []).map((trade) => ({
        id: trade.trade_id,
        timestamp: new Date(trade.created_time).getTime(),
        side: kalshiTradeSide(trade),
        outcome: trade.taker_side === "no" ? "no" : "yes",
        price: parseFloatSafe(trade.yes_price_dollars) ?? 0,
        size: parseFloatSafe(trade.count_fp) ?? 0,
      }));
    },
    PREDICTION_CACHE_POLICIES.trades,
  );
}

async function loadKalshiBook(
  summary: PredictionMarketSummary,
): Promise<PredictionBookSnapshot> {
  return await loadCachedPredictionResource(
    "book",
    summary.key,
    async () => {
      const response = await fetchJson<KalshiOrderbookResponse>(
        `https://api.elections.kalshi.com/trade-api/v2/markets/${summary.marketId}/orderbook`,
      );
      const yesBids = (response.orderbook_fp?.yes_dollars ?? [])
        .map(normalizeKalshiBookLevel)
        .filter((level): level is PredictionBookLevel => level != null);
      const noBids = (response.orderbook_fp?.no_dollars ?? [])
        .map(normalizeKalshiBookLevel)
        .filter((level): level is PredictionBookLevel => level != null);
      return {
        yesBids,
        yesAsks: noBids.map((level) => ({
          price: Math.max(0, 1 - level.price),
          size: level.size,
        })),
        noBids,
        noAsks: yesBids.map((level) => ({
          price: Math.max(0, 1 - level.price),
          size: level.size,
        })),
        lastTradePrice: summary.lastTradePrice,
      };
    },
    PREDICTION_CACHE_POLICIES.book,
  );
}

export async function loadKalshiHistory(
  summary: PredictionMarketSummary,
  range: "1D" | "1W" | "1M" | "ALL",
  options: { start?: Date; end?: Date; signal?: AbortSignal; strict?: boolean } = {},
): Promise<PredictionHistoryPoint[]> {
  const seriesTicker = summary.seriesTicker ?? (await loadKalshiEvent(summary.eventTicker))?.event?.series_ticker;
  if (!seriesTicker) {
    if (options.strict) throw new Error(`Kalshi event ${summary.eventTicker ?? "unknown"} no longer exposes chart history.`);
    return [];
  }

  const now = Math.floor((options.end?.getTime() ?? Date.now()) / 1000);
  const rangeSeconds =
    range === "1D"
      ? 24 * 60 * 60
      : range === "1W"
        ? 7 * 24 * 60 * 60
        : range === "1M"
          ? 30 * 24 * 60 * 60
          : 365 * 24 * 60 * 60;
  const periodInterval = range === "1D" ? 60 : range === "1W" ? 60 : 1440;
  const start = Math.floor((options.start?.getTime() ?? (now * 1000 - rangeSeconds * 1000)) / 1000);

  try {
    return await loadCachedPredictionResource(
      "history",
      `${summary.key}:${range}:${start}:${now}`,
      async () => {
        const response = await fetchJson<KalshiCandlestickResponse>(
          `https://api.elections.kalshi.com/trade-api/v2/series/${seriesTicker}/markets/${summary.marketId}/candlesticks?start_ts=${start}&end_ts=${now}&period_interval=${periodInterval}`,
          options.signal,
        );
        return (response.candlesticks ?? [])
          .map((candle) => ({
            date: new Date(candle.end_period_ts * 1000),
            close:
              parseFloatSafe(candle.price?.close_dollars) ??
              parseFloatSafe(candle.price?.previous_dollars) ??
              0,
            open: parseFloatSafe(candle.price?.open_dollars) ?? undefined,
            high: parseFloatSafe(candle.price?.high_dollars) ?? undefined,
            low: parseFloatSafe(candle.price?.low_dollars) ?? undefined,
            volume: parseFloatSafe(candle.volume_fp) ?? undefined,
          }))
          .filter((point) => Number.isFinite(point.date.getTime()));
      },
      PREDICTION_CACHE_POLICIES.history,
    );
  } catch (error) {
    if (options.strict) throw error;
    return [];
  }
}

async function loadKalshiSeriesSettlement(
  seriesTicker: string | undefined,
): Promise<string | undefined> {
  const ticker = seriesTicker?.trim();
  if (!ticker) return undefined;
  try {
    const response = await fetchJson<KalshiSeriesResponse>(
      `https://api.elections.kalshi.com/trade-api/v2/series/${encodeURIComponent(ticker)}`,
    );
    const names = (response.series?.settlement_sources ?? [])
      .map((source) => source.name?.trim())
      .filter((name): name is string => !!name);
    return names.length > 0 ? names.join(", ") : undefined;
  } catch {
    return undefined;
  }
}

export async function loadKalshiDetail(
  summary: PredictionMarketSummary,
  range: "1D" | "1W" | "1M" | "ALL",
): Promise<PredictionMarketDetail> {
  return await loadCachedPredictionResource(
    "detail",
    buildPredictionDetailResourceKey(summary.key, range),
    async () => {
      const seriesTicker = summary.seriesTicker
        || kalshiSeriesTickerFromEvent(summary.eventTicker);
      const [event, history, book, trades, resolutionSource] = await Promise.all([
        loadKalshiEvent(summary.eventTicker),
        loadKalshiHistory(summary, range),
        loadKalshiBook(summary),
        loadKalshiTrades(summary),
        loadKalshiSeriesSettlement(seriesTicker),
      ]);
      const eventMeta = event?.event;
      const normalized = (event?.markets ?? [])
        .map((market) =>
          normalizeKalshiMarket(market, {
            title: eventMeta?.title,
            category: eventMeta?.category,
            series_ticker: eventMeta?.series_ticker,
            sub_title: eventMeta?.sub_title,
          }),
        )
        .filter((market): market is PredictionMarketSummary => market != null);
      const matched = normalized.find((market) => market.key === summary.key)
        ?? normalized.find((market) => market.marketId === summary.marketId);
      const base = matched ?? summary;

      return {
        summary: {
          ...base,
          eventLabel: event?.event?.title ?? base.eventLabel,
          category: event?.event?.category ?? base.category,
          seriesTicker: event?.event?.series_ticker ?? base.seriesTicker ?? seriesTicker,
          resolutionSource: resolutionSource ?? base.resolutionSource,
          tags: base.tags?.length
            ? base.tags
            : event?.event?.category
              ? [event.event.category]
              : [],
        },
        siblings: normalized.map(predictionSiblingFromSummary),
        rules: [
          base.rulesPrimary ?? "",
          base.rulesSecondary ?? "",
        ].filter((value) => value.trim().length > 0),
        history,
        book,
        trades,
      };
    },
    PREDICTION_CACHE_POLICIES.detail,
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  buildPredictionCatalogCacheKey,
  buildPredictionCatalogResourceKey,
  samePredictionCatalogSummaries,
  updatePredictionErrorState,
  updatePredictionPendingCounts,
} from "../cache";
import { categoryForPredictionQuery } from "../categories";
import {
  formatPredictionLoadError,
  getPredictionCatalogStatus,
  isRetryablePredictionLoadError,
} from "./status";
import { useAutoRefresh } from "gloomberb/react";
import { getCachedPredictionResource } from "../services/fetch";
import { loadCryptoComCatalog } from "../services/crypto-com/adapter";
import { loadGeminiCatalog } from "../services/gemini/adapter";
import { loadKalshiCatalogPage, loadMoreKalshiCatalog } from "../services/kalshi/adapter";
import { streamKalshiSeriesSearch } from "../services/kalshi/series-search";
import { loadLimitlessCatalog, loadLimitlessCatalogPage } from "../services/limitless/adapter";
import { loadMorePolymarketCatalog, loadPolymarketCatalog, loadPolymarketSearchHits, nextPolymarketCatalogOffset } from "../services/polymarket/adapter";
import { loadPascalCatalog, PASCAL_TEXT_SEARCH_LIMIT } from "../services/pascal/adapter";
import { loadPolymarketUsCatalog } from "../services/polymarket-us/adapter";
import type {
  PredictionCategoryId,
  PredictionMarketSummary,
  PredictionVenue,
  PredictionVenueScope,
} from "../types";
import { PREDICTION_VENUE_LABELS, venueInScope } from "../venues";

const EXTRA_VENUE_CATALOGS: ReadonlyArray<{
  venue: PredictionVenue;
  load: (
    searchQuery: string,
    categoryId: PredictionCategoryId,
    options?: { signal?: AbortSignal },
  ) => Promise<PredictionMarketSummary[]>;
}> = [
  { venue: "gemini", load: loadGeminiCatalog },
  { venue: "limitless", load: loadLimitlessCatalog },
  { venue: "crypto-com", load: loadCryptoComCatalog },
  { venue: "polymarket-us", load: loadPolymarketUsCatalog },
  { venue: "pascal", load: loadPascalCatalog },
];

type PredictionCatalogCache = Record<string, PredictionMarketSummary[]>;
export type PredictionCatalogCacheSetter = Dispatch<SetStateAction<PredictionCatalogCache>>;

// Four more tries after the first miss. Stops early once a try succeeds.
const CATALOG_LOAD_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 8_000] as const;

function openCatalogLoad(abortRef: { current: AbortController | null }): AbortSignal {
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;
  return controller.signal;
}

function catalogLoadAborted(): Error {
  const error = new Error("The catalog load was aborted.");
  error.name = "AbortError";
  return error;
}

function waitForCatalogRetry(delayMs: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeoutId);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function loadCatalogWithRetry<T>(
  load: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    if (signal.aborted) throw catalogLoadAborted();
    try {
      const value = await load();
      if (signal.aborted) throw catalogLoadAborted();
      return value;
    } catch (error) {
      if (signal.aborted) throw catalogLoadAborted();
      const delayMs = CATALOG_LOAD_RETRY_DELAYS_MS[attempt];
      if (delayMs == null || !isRetryablePredictionLoadError(error)) throw error;
      attempt += 1;
      const stillCurrent = await waitForCatalogRetry(delayMs, signal);
      if (!stillCurrent || signal.aborted) throw catalogLoadAborted();
    }
  }
}

export function seedCatalogPending(options: {
  categoryId: PredictionCategoryId;
  includeKalshi: boolean;
  includePolymarket: boolean;
  venueScope: PredictionVenueScope;
}): Record<string, number> {
  const pending: Record<string, number> = {};
  const consider = (venue: PredictionVenue) => {
    const cacheKey = buildPredictionCatalogCacheKey(venue, options.categoryId, "");
    const resourceKey = buildPredictionCatalogResourceKey(venue, options.categoryId, "");
    if (getCachedPredictionResource<PredictionMarketSummary[]>("catalog", resourceKey) != null) return;
    pending[cacheKey] = 1;
  };
  if (options.includePolymarket) consider("polymarket");
  if (options.includeKalshi) consider("kalshi");
  for (const entry of EXTRA_VENUE_CATALOGS) {
    if (!venueInScope(entry.venue, options.venueScope)) continue;
    consider(entry.venue);
  }
  return pending;
}

export function catalogPendingContribution(
  cacheKey: string,
  resourceKey: string,
  cache: PredictionCatalogCache,
  pending: Record<string, number>,
  settled: Record<string, true>,
): number {
  const inFlight = pending[cacheKey] ?? 0;
  if (inFlight > 0) return inFlight;
  if (settled[cacheKey]) return 0;
  if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) return 0;
  if (getCachedPredictionResource<PredictionMarketSummary[]>("catalog", resourceKey) != null) return 0;
  return 1;
}

interface UsePredictionCatalogDataOptions {
  categoryId: PredictionCategoryId;
  includeKalshi: boolean;
  includePolymarket: boolean;
  searchQuery: string;
  venueScope: PredictionVenueScope;
}

export function usePredictionCatalogData({
  categoryId,
  includeKalshi,
  includePolymarket,
  searchQuery,
  venueScope,
}: UsePredictionCatalogDataOptions) {
  const [catalogCache, setCatalogCache] = useState<PredictionCatalogCache>({});
  const seededPendingRef = useRef<Set<string> | null>(null);
  const [catalogPending, setCatalogPending] = useState<Record<string, number>>(() => {
    const seeded = seedCatalogPending({
      categoryId,
      includeKalshi,
      includePolymarket,
      venueScope,
    });
    seededPendingRef.current = new Set(Object.keys(seeded));
    return seeded;
  });
  const [catalogSettled, setCatalogSettled] = useState<Record<string, true>>({});
  const [catalogErrors, setCatalogErrors] = useState<
    Record<string, string | null>
  >({});
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [polymarketLoadedAt, setPolymarketLoadedAt] = useState<number | null>(null);
  const [kalshiLoadedAt, setKalshiLoadedAt] = useState<number | null>(null);
  const [polymarketNextOffset, setPolymarketNextOffset] = useState<number | null>(null);
  const [kalshiNextCursor, setKalshiNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const activeCatalogRef = useRef<PredictionCatalogCache>({});
  const polymarketAbortRef = useRef<AbortController | null>(null);
  const kalshiAbortRef = useRef<AbortController | null>(null);
  const extraAbortRef = useRef<AbortController | null>(null);
  const searchHitsQueryRef = useRef("");
  const [extraLoadedAt, setExtraLoadedAt] = useState<number | null>(null);
  const [polymarketSearchHits, setPolymarketSearchHits] = useState<PredictionMarketSummary[]>([]);
  const [searchInFlight, setSearchInFlight] = useState(false);
  const [searchScanNote, setSearchScanNote] = useState<string | null>(null);

  const normalizedCatalogQuery = "";
  const polymarketCatalogKey = useMemo(
    () => buildPredictionCatalogCacheKey("polymarket", categoryId, ""),
    [categoryId],
  );
  const kalshiCatalogKey = useMemo(
    () => buildPredictionCatalogCacheKey("kalshi", categoryId, ""),
    [categoryId],
  );
  const polymarketCatalogResourceKey = useMemo(
    () =>
      buildPredictionCatalogResourceKey(
        "polymarket",
        categoryId,
        normalizedCatalogQuery,
      ),
    [categoryId, normalizedCatalogQuery],
  );
  const kalshiCatalogResourceKey = useMemo(
    () =>
      buildPredictionCatalogResourceKey(
        "kalshi",
        categoryId,
        normalizedCatalogQuery,
      ),
    [categoryId, normalizedCatalogQuery],
  );
  const persistedPolymarketCatalog = useMemo(
    () =>
      getCachedPredictionResource<PredictionMarketSummary[]>(
        "catalog",
        polymarketCatalogResourceKey,
      ) ?? [],
    [polymarketCatalogResourceKey],
  );
  const persistedKalshiCatalog = useMemo(
    () =>
      getCachedPredictionResource<PredictionMarketSummary[]>(
        "catalog",
        kalshiCatalogResourceKey,
      ) ?? [],
    [kalshiCatalogResourceKey],
  );
  const polymarketCatalog =
    catalogCache[polymarketCatalogKey] ?? persistedPolymarketCatalog;
  const kalshiCatalog = catalogCache[kalshiCatalogKey] ?? persistedKalshiCatalog;
  activeCatalogRef.current = {
    [polymarketCatalogKey]: polymarketCatalog,
    [kalshiCatalogKey]: kalshiCatalog,
  };
  const activeCatalogKeys = useMemo(
    () =>
      [
        includePolymarket ? polymarketCatalogKey : null,
        includeKalshi ? kalshiCatalogKey : null,
      ].filter((value): value is string => value != null),
    [includeKalshi, includePolymarket, kalshiCatalogKey, polymarketCatalogKey],
  );
  const activeCatalogSources = useMemo(
    () =>
      [
        includePolymarket
          ? {
              venue: "polymarket" as const,
              cacheKey: polymarketCatalogKey,
              error: catalogErrors[polymarketCatalogKey] ?? null,
              markets: polymarketCatalog,
            }
          : null,
        includeKalshi
          ? {
              venue: "kalshi" as const,
              cacheKey: kalshiCatalogKey,
              error: catalogErrors[kalshiCatalogKey] ?? null,
              markets: kalshiCatalog,
            }
          : null,
      ].filter((value) => value != null),
    [
      catalogErrors,
      includeKalshi,
      includePolymarket,
      kalshiCatalog,
      kalshiCatalogKey,
      polymarketCatalog,
      polymarketCatalogKey,
    ],
  );
  const beginCatalogPending = (cacheKey: string) => {
    if (seededPendingRef.current?.delete(cacheKey)) return;
    setCatalogPending((current) => updatePredictionPendingCounts(current, cacheKey, 1));
  };
  const finishCatalogPending = (cacheKey: string, signal: AbortSignal) => {
    if (!signal.aborted) {
      setCatalogSettled((current) => current[cacheKey] ? current : { ...current, [cacheKey]: true });
    }
    setCatalogPending((current) => updatePredictionPendingCounts(current, cacheKey, -1));
  };
  const catalogLoadCount = activeCatalogKeys.reduce((count, cacheKey) => {
    const resourceKey = cacheKey === polymarketCatalogKey
      ? polymarketCatalogResourceKey
      : kalshiCatalogResourceKey;
    return count + catalogPendingContribution(
      cacheKey,
      resourceKey,
      catalogCache,
      catalogPending,
      catalogSettled,
    );
  }, 0);
  const extraCatalogs = useMemo(() => EXTRA_VENUE_CATALOGS.flatMap(({ venue }) => {
    if (!venueInScope(venue, venueScope)) return [];
    const cacheKey = buildPredictionCatalogCacheKey(venue, categoryId, "");
    const resourceKey = buildPredictionCatalogResourceKey(venue, categoryId, normalizedCatalogQuery);
    const persisted = getCachedPredictionResource<PredictionMarketSummary[]>("catalog", resourceKey) ?? [];
    return [{
      venue,
      cacheKey,
      error: catalogErrors[cacheKey] ?? null,
      markets: catalogCache[cacheKey] ?? persisted,
    }];
  }), [catalogCache, catalogErrors, categoryId, normalizedCatalogQuery, venueScope]);
  const allMarkets = useMemo(() => {
    const merged: PredictionMarketSummary[] = [];
    if (includePolymarket) merged.push(...polymarketCatalog);
    if (includeKalshi) merged.push(...kalshiCatalog);
    for (const catalog of extraCatalogs) merged.push(...catalog.markets);
    return mergeSearchHitsIntoCatalog(merged, polymarketSearchHits);
  }, [
    extraCatalogs,
    includeKalshi,
    includePolymarket,
    kalshiCatalog,
    polymarketCatalog,
    polymarketSearchHits,
  ]);
  const catalogStatus = useMemo(
    () => getPredictionCatalogStatus([...activeCatalogSources, ...extraCatalogs]),
    [activeCatalogSources, extraCatalogs],
  );
  const extraLoadCount = extraCatalogs.reduce((count, catalog) => {
    const resourceKey = buildPredictionCatalogResourceKey(catalog.venue, categoryId, normalizedCatalogQuery);
    return count + catalogPendingContribution(
      catalog.cacheKey,
      resourceKey,
      catalogCache,
      catalogPending,
      catalogSettled,
    );
  }, 0);
  const loadExtraCatalogs = useCallback(async () => {
    const venues = EXTRA_VENUE_CATALOGS.filter((entry) => venueInScope(entry.venue, venueScope));
    if (venues.length === 0) return;
    const signal = openCatalogLoad(extraAbortRef);
    await Promise.all(venues.map(async ({ venue, load }) => {
      const cacheKey = buildPredictionCatalogCacheKey(venue, categoryId, "");
      beginCatalogPending(cacheKey);
      try {
        const next = await loadCatalogWithRetry(
          () => load("", categoryId, { signal }),
          signal,
        );
        if (signal.aborted) return;
        setCatalogCache((current) => {
          const previous = current[cacheKey] ?? activeCatalogRef.current[cacheKey];
          if (samePredictionCatalogSummaries(previous, next)) return current;
          return { ...current, [cacheKey]: next };
        });
        setCatalogErrors((current) => updatePredictionErrorState(current, cacheKey, null));
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        setCatalogErrors((current) => updatePredictionErrorState(
          current,
          cacheKey,
          formatPredictionLoadError(venue, "markets", error),
        ));
      } finally {
        finishCatalogPending(cacheKey, signal);
      }
    }));
    if (!signal.aborted) setExtraLoadedAt(Date.now());
  }, [categoryId, venueScope]);

  const loadPolymarket = useCallback(
    async (
      cacheKey: string,
      search: string,
      category: PredictionCategoryId,
      options?: { showPending?: boolean },
    ) => {
      const signal = openCatalogLoad(polymarketAbortRef);
      const showPending =
        options?.showPending ??
        (search.trim().length > 0 ||
          (activeCatalogRef.current[cacheKey]?.length ?? 0) === 0);
      if (showPending) beginCatalogPending(cacheKey);
      try {
        const next = await loadCatalogWithRetry(
          () => loadPolymarketCatalog(search, category),
          signal,
        );
        if (signal.aborted) return;
        setCatalogCache((current) => {
          const previous = current[cacheKey] ?? activeCatalogRef.current[cacheKey];
          if (samePredictionCatalogSummaries(previous, next)) {
            return current;
          }
          return {
            ...current,
            [cacheKey]: next,
          };
        });
        setCatalogErrors((current) =>
          updatePredictionErrorState(current, cacheKey, null),
        );
        setPolymarketNextOffset(nextPolymarketCatalogOffset(category, search));
      } catch (error) {
        if (signal.aborted) return;
        setCatalogErrors((current) =>
          updatePredictionErrorState(
            current,
            cacheKey,
            formatPredictionLoadError("polymarket", "markets", error),
          ),
        );
      } finally {
        if (!signal.aborted) {
          setPolymarketLoadedAt(Date.now());
        }
        if (showPending) finishCatalogPending(cacheKey, signal);
      }
    },
    [],
  );

  const loadKalshi = useCallback(
    async (
      cacheKey: string,
      search: string,
      category: PredictionCategoryId,
      options?: { showPending?: boolean },
    ) => {
      const signal = openCatalogLoad(kalshiAbortRef);
      void search;
      const showPending =
        options?.showPending ??
        (search.trim().length > 0 ||
          (activeCatalogRef.current[cacheKey]?.length ?? 0) === 0);
      if (showPending) beginCatalogPending(cacheKey);
      try {
        let combined: PredictionMarketSummary[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < 3; page += 1) {
          const next = await loadCatalogWithRetry(
            () => loadKalshiCatalogPage(category, cursor, signal),
            signal,
          );
          if (signal.aborted) return;
          combined = mergeCatalogMarkets(combined, next.markets);
          const painted = combined;
          setCatalogCache((current) => {
            const previous = current[cacheKey] ?? activeCatalogRef.current[cacheKey];
            if (samePredictionCatalogSummaries(previous, painted)) return current;
            return { ...current, [cacheKey]: painted };
          });
          cursor = next.nextCursor;
          if (!cursor) break;
        }
        setCatalogErrors((current) =>
          updatePredictionErrorState(current, cacheKey, null),
        );
        setKalshiNextCursor(cursor);
      } catch (error) {
        if (signal.aborted) return;
        setCatalogErrors((current) =>
          updatePredictionErrorState(
            current,
            cacheKey,
            formatPredictionLoadError("kalshi", "markets", error),
          ),
        );
      } finally {
        if (!signal.aborted) {
          setKalshiLoadedAt(Date.now());
        }
        if (showPending) finishCatalogPending(cacheKey, signal);
      }
    },
    [],
  );

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery("");
      return;
    }
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Reloads follow the one refresh cadence the user configured, instead of two
  // hardcoded intervals nobody can change.
  useEffect(() => {
    if (!includePolymarket) return;
    void loadPolymarket(polymarketCatalogKey, "", categoryId);
    return () => {
      polymarketAbortRef.current?.abort();
    };
  }, [
    categoryId,
    includePolymarket,
    loadPolymarket,
    polymarketCatalogKey,
  ]);

  useAutoRefresh(includePolymarket ? polymarketLoadedAt : null, useCallback(() => {
    void loadPolymarket(polymarketCatalogKey, "", categoryId);
  }, [categoryId, loadPolymarket, polymarketCatalogKey]));

  useEffect(() => {
    if (!includeKalshi) return;
    void loadKalshi(kalshiCatalogKey, "", categoryId);
    return () => {
      kalshiAbortRef.current?.abort();
    };
  }, [
    categoryId,
    includeKalshi,
    kalshiCatalogKey,
    loadKalshi,
  ]);

  useAutoRefresh(includeKalshi ? kalshiLoadedAt : null, useCallback(() => {
    void loadKalshi(kalshiCatalogKey, "", categoryId);
  }, [categoryId, kalshiCatalogKey, loadKalshi]));

  useEffect(() => {
    void loadExtraCatalogs();
    return () => {
      extraAbortRef.current?.abort();
    };
  }, [loadExtraCatalogs]);

  useEffect(() => {
    const query = debouncedSearchQuery.trim().toLowerCase();
    if (query.length === 0) {
      setPolymarketSearchHits([]);
      setSearchInFlight(false);
      setSearchScanNote(null);
      return;
    }
    const controller = new AbortController();
    const queryChanged = searchHitsQueryRef.current !== query;
    searchHitsQueryRef.current = query;
    setSearchInFlight(true);
    setSearchScanNote(null);
    let replaced = false;
    const addHits = (markets: PredictionMarketSummary[]) => {
      if (controller.signal.aborted || markets.length === 0) return;
      const replace = queryChanged && !replaced;
      if (queryChanged) replaced = true;
      setPolymarketSearchHits((current) => appendSearchHits(replace ? [] : current, markets, query));
    };
    void scanSearchCatalogs({
      query,
      categoryId,
      signal: controller.signal,
      venueScope,
      addHits,
    }).then((result) => {
      if (controller.signal.aborted) return;
      setSearchScanNote(formatSearchScanNote(result.capped));
      setSearchInFlight(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setSearchInFlight(false);
    });
    return () => controller.abort();
  }, [categoryId, debouncedSearchQuery, includeKalshi, includePolymarket, kalshiLoadedAt, venueScope]);

  useAutoRefresh(extraLoadedAt, loadExtraCatalogs);

  const loadMoreCatalog = useCallback(async () => {
    if (loadingMore) return;
    const canLoadPolymarket = includePolymarket && polymarketNextOffset != null;
    const canLoadKalshi = includeKalshi && !!kalshiNextCursor;
    if (!canLoadPolymarket && !canLoadKalshi) return;
    setLoadingMore(true);
    try {
      if (canLoadPolymarket && polymarketNextOffset != null) {
        const page = await loadMorePolymarketCatalog(
          "",
          categoryId,
          polymarketNextOffset,
        );
        setCatalogCache((current) => ({
          ...current,
          [polymarketCatalogKey]: mergeCatalogMarkets(
            current[polymarketCatalogKey] ?? activeCatalogRef.current[polymarketCatalogKey] ?? [],
            page.markets,
          ),
        }));
        setPolymarketNextOffset(page.hasMore ? page.nextOffset : null);
      }
      if (canLoadKalshi && kalshiNextCursor) {
        const page = await loadMoreKalshiCatalog(
          "",
          categoryId,
          kalshiNextCursor,
        );
        setCatalogCache((current) => ({
          ...current,
          [kalshiCatalogKey]: mergeCatalogMarkets(
            current[kalshiCatalogKey] ?? activeCatalogRef.current[kalshiCatalogKey] ?? [],
            page.markets,
          ),
        }));
        setKalshiNextCursor(page.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [
    categoryId,
    includeKalshi,
    includePolymarket,
    kalshiCatalogKey,
    kalshiNextCursor,
    loadingMore,
    polymarketCatalogKey,
    polymarketNextOffset,
  ]);

  return {
    allMarkets,
    catalogHasMore: (includePolymarket && polymarketNextOffset != null) || (includeKalshi && !!kalshiNextCursor),
    catalogLoadCount: catalogLoadCount + extraLoadCount,
    catalogLoadingMore: loadingMore,
    catalogStatus,
    debouncedSearchQuery,
    loadMoreCatalog,
    searchInFlight,
    searchScanNote,
    setCatalogCache,
  };
}

const SEARCH_POLYMARKET_EXTRA_PAGES = 4;
const SEARCH_LIMITLESS_FIRST_PAGE = 1;
const SEARCH_LIMITLESS_LAST_PAGE = 12;

function marketMatchesQuery(market: PredictionMarketSummary, query: string): boolean {
  return [
    market.title,
    market.marketLabel,
    market.eventLabel,
    market.marketId,
    ...(market.tags ?? []),
  ].join(" ").toLowerCase().includes(query);
}

function appendSearchHits(
  current: PredictionMarketSummary[],
  markets: PredictionMarketSummary[],
  query: string,
): PredictionMarketSummary[] {
  const seen = new Set(current.map((market) => market.key));
  const next = current.slice();
  for (const market of markets) {
    if (seen.has(market.key) || !marketMatchesQuery(market, query)) continue;
    seen.add(market.key);
    next.push(market);
  }
  return next.length === current.length ? current : next;
}

export function mergeSearchHitsIntoCatalog(
  catalog: readonly PredictionMarketSummary[],
  hits: readonly PredictionMarketSummary[],
): PredictionMarketSummary[] {
  if (hits.length === 0) return [...catalog];
  const merged = [...catalog];
  const seen = new Set(merged.map((market) => market.key));
  for (const market of hits) {
    if (seen.has(market.key)) continue;
    seen.add(market.key);
    merged.push(market);
  }
  return merged;
}

function formatSearchScanNote(capped: readonly string[]): string | null {
  if (capped.length === 0) return null;
  const labels = capped.length === 1
    ? capped.join("")
    : capped.length === 2
      ? capped.join(" and ")
      : `${capped.slice(0, -1).join(", ")}, and ${capped.at(-1) ?? ""}`;
  return `Stopped after more ${labels} pages.`;
}

/** Searches the venues in `venueScope`: Polymarket and Kalshi under All, one venue when it is picked. */
export async function scanSearchCatalogs(options: {
  query: string;
  categoryId: PredictionCategoryId;
  signal: AbortSignal;
  venueScope: PredictionVenueScope;
  addHits: (markets: PredictionMarketSummary[]) => void;
}): Promise<{ capped: string[] }> {
  const { query, signal, addHits, venueScope } = options;
  const searchCategory = categoryForPredictionQuery(query, options.categoryId);
  const tasks: Array<Promise<string | null>> = [];
  if (venueInScope("polymarket", venueScope)) {
    tasks.push((async () => {
      try {
        addHits(await loadPolymarketSearchHits(query, searchCategory, 40, signal));
      } catch {
        if (signal.aborted) return null;
      }
      let offset = nextPolymarketCatalogOffset(searchCategory, "");
      for (let page = 0; page < SEARCH_POLYMARKET_EXTRA_PAGES && offset != null && !signal.aborted; page += 1) {
        try {
          const next = await loadMorePolymarketCatalog("", searchCategory, offset, signal);
          addHits(next.markets);
          if (!next.hasMore) break;
          offset = next.nextOffset;
        } catch {
          break;
        }
      }
      return null;
    })());
  }
  if (venueInScope("kalshi", venueScope)) {
    tasks.push((async () => {
      await streamKalshiSeriesSearch(query, searchCategory, signal, addHits);
      return null;
    })());
  }
  if (venueInScope("gemini", venueScope)) {
    tasks.push((async () => {
      try {
        addHits(await loadGeminiCatalog(query, searchCategory, { signal }));
      } catch {
        if (signal.aborted) return null;
      }
      return null;
    })());
  }
  if (venueInScope("polymarket-us", venueScope)) {
    tasks.push((async () => {
      try {
        addHits(await loadPolymarketUsCatalog(query, searchCategory, { signal }));
      } catch {
        if (signal.aborted) return null;
      }
      return null;
    })());
  }
  if (venueInScope("pascal", venueScope)) {
    tasks.push((async () => {
      if (query.length < 3) return null;
      let hitLimit = false;
      try {
        const markets = await loadPascalCatalog(query, searchCategory, { signal });
        hitLimit = markets.length >= PASCAL_TEXT_SEARCH_LIMIT;
        addHits(markets);
      } catch {
        if (signal.aborted) return null;
      }
      return hitLimit ? PREDICTION_VENUE_LABELS.pascal : null;
    })());
  }
  if (venueInScope("crypto-com", venueScope)) {
    tasks.push((async () => {
      try {
        addHits(await loadCryptoComCatalog(query, searchCategory, { signal }));
      } catch {
        if (signal.aborted) return null;
      }
      return null;
    })());
  }
  if (venueInScope("limitless", venueScope)) {
    tasks.push((async () => {
      let reachedLastPage = false;
      let lastHasMore = false;
      for (let page = SEARCH_LIMITLESS_FIRST_PAGE; page <= SEARCH_LIMITLESS_LAST_PAGE && !signal.aborted; page += 1) {
        try {
          const next = await loadLimitlessCatalogPage(page, query, searchCategory, signal);
          addHits(next.markets);
          reachedLastPage = page === SEARCH_LIMITLESS_LAST_PAGE;
          lastHasMore = next.hasMore;
          if (!next.hasMore) break;
        } catch {
          break;
        }
      }
      if (signal.aborted || !reachedLastPage || !lastHasMore) return null;
      return PREDICTION_VENUE_LABELS.limitless;
    })());
  }
  const capped = (await Promise.all(tasks)).filter((label): label is string => label != null);
  return { capped };
}

function mergeCatalogMarkets(
  current: PredictionMarketSummary[],
  extra: PredictionMarketSummary[],
): PredictionMarketSummary[] {
  if (extra.length === 0) return current;
  const seen = new Set(current.map((market) => market.key));
  const merged = [...current];
  for (const market of extra) {
    if (seen.has(market.key)) continue;
    seen.add(market.key);
    merged.push(market);
  }
  return merged;
}

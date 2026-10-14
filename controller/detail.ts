import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPredictionDetailCacheKey,
  buildPredictionDetailResourceKey,
  updatePredictionCatalogCacheEntries,
  updatePredictionDetailCacheEntries,
  updatePredictionErrorState,
  updatePredictionPendingCounts,
} from "../cache";
import type { PredictionCatalogCacheSetter } from "./catalog";
import {
  applyPredictionBestBidAskUpdate,
  applyPredictionBookLevelUpdate,
  applyPredictionBookUpdate,
  applyPredictionTradeUpdate,
  type DetailSocketTouch,
} from "./live-updates";
import { formatPredictionLoadError } from "./status";
import { loadKalshiDetail } from "../services/kalshi/adapter";
import { getCachedPredictionResource } from "../services/fetch";
import { loadPolymarketDetail } from "../services/polymarket/adapter";
import { subscribePolymarketMarket } from "../services/polymarket/ws";
import type {
  PredictionHistoryRange,
  PredictionMarketDetail,
  PredictionMarketSummary,
  PredictionTransportState,
} from "../types";

function summaryOnlyDetail(summary: PredictionMarketSummary): PredictionMarketDetail {
  return {
    summary,
    siblings: [],
    rules: summary.description ? [summary.description] : [],
    history: [],
    book: {
      yesBids: [],
      yesAsks: [],
      noBids: [],
      noAsks: [],
      lastTradePrice: summary.lastTradePrice,
    },
    trades: [],
  };
}

function bookHasLevels(book: PredictionMarketDetail["book"]): boolean {
  return book.yesBids.length > 0
    || book.yesAsks.length > 0
    || book.noBids.length > 0
    || book.noAsks.length > 0;
}

export function seedPredictionDetailCache(
  current: Record<string, PredictionMarketDetail>,
  cacheKey: string,
  summary: PredictionMarketSummary,
  persisted: PredictionMarketDetail | null,
): Record<string, PredictionMarketDetail> {
  if (current[cacheKey]) return current;
  const seeded = persisted && persisted.summary.key === summary.key
    ? persisted
    : summaryOnlyDetail({ ...summary });
  return { ...current, [cacheKey]: seeded };
}

export function mergePredictionDetailLoad(
  current: PredictionMarketDetail | undefined,
  loaded: PredictionMarketDetail,
  touch: DetailSocketTouch | undefined,
): PredictionMarketDetail {
  if (!current || !touch || (!touch.yesPrice && !touch.bids && !touch.book && !touch.trades)) {
    return loaded;
  }
  const summary = { ...loaded.summary };
  if (touch.yesPrice || touch.trades) {
    summary.yesPrice = current.summary.yesPrice;
    summary.noPrice = current.summary.noPrice;
  }
  if (touch.trades) summary.lastTradePrice = current.summary.lastTradePrice;
  if (touch.bids) {
    summary.yesBid = current.summary.yesBid;
    summary.yesAsk = current.summary.yesAsk;
    summary.noBid = current.summary.noBid;
    summary.noAsk = current.summary.noAsk;
    summary.spread = current.summary.spread;
  }
  const book = touch.book
    ? {
        ...loaded.book,
        yesBids: current.book.yesBids,
        yesAsks: current.book.yesAsks,
        noBids: current.book.noBids,
        noAsks: current.book.noAsks,
        lastTradePrice: current.book.lastTradePrice ?? loaded.book.lastTradePrice,
        error: bookHasLevels(current.book) ? null : loaded.book.error ?? current.book.error ?? null,
      }
    : loaded.book;
  return {
    ...loaded,
    summary,
    book,
    trades: touch.trades ? current.trades : loaded.trades,
  };
}

export function shouldSubscribePredictionDetailSocket({
  focused,
  summary,
  detailOpen,
  listCoversMarket,
}: {
  focused: boolean;
  summary: PredictionMarketSummary | null;
  detailOpen: boolean;
  listCoversMarket: boolean;
}): boolean {
  if (!focused || !summary) return false;
  if (summary.venue !== "polymarket") return false;
  if (!summary.yesTokenId && !summary.noTokenId) return false;
  if (!detailOpen && listCoversMarket) return false;
  return true;
}

const NO_WATCHLIST_COVERAGE: ReadonlySet<string> = new Set();

// With detail closed the socket follows the highlighted row. Holding j or k
// would open and close one socket per row, so it connects once the cursor rests.
export const BROWSE_SOCKET_REST_MS = 400;

interface UsePredictionDetailDataOptions {
  focused: boolean;
  detailOpen: boolean;
  historyRange: PredictionHistoryRange;
  selectedSummary: PredictionMarketSummary | null;
  browseSummary: PredictionMarketSummary | null;
  setCatalogCache: PredictionCatalogCacheSetter;
  watchlistCoveredKeys?: ReadonlySet<string>;
}

export function usePredictionDetailData({
  focused,
  detailOpen,
  historyRange,
  selectedSummary,
  browseSummary,
  setCatalogCache,
  watchlistCoveredKeys = NO_WATCHLIST_COVERAGE,
}: UsePredictionDetailDataOptions) {
  const [detailCache, setDetailCache] = useState<
    Record<string, PredictionMarketDetail>
  >({});
  const [detailPending, setDetailPending] = useState<Record<string, number>>(
    {},
  );
  const [detailErrors, setDetailErrors] = useState<
    Record<string, string | null>
  >({});
  const [transportState, setTransportState] =
    useState<PredictionTransportState>("idle");
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);

  const selectedSummaryRef = useRef<PredictionMarketSummary | null>(null);
  const detailLoadDelayRef = useRef(0);
  const currentDetailCacheKeyRef = useRef<string | null>(null);
  const historyRangeRef = useRef(historyRange);
  const socketTouchRef = useRef(new Map<string, DetailSocketTouch>());
  historyRangeRef.current = historyRange;
  const selectedSummaryKey = selectedSummary?.key ?? null;
  const selectedSummaryVenue = selectedSummary?.venue ?? null;
  const socketSummaryRef = useRef<PredictionMarketSummary | null>(null);
  const detailCacheKey = selectedSummaryKey
    ? buildPredictionDetailCacheKey(selectedSummaryKey, historyRange)
    : null;
  const detailResourceKey = selectedSummaryKey
    ? buildPredictionDetailResourceKey(selectedSummaryKey, historyRange)
    : null;
  const persistedDetail = useMemo(
    () =>
      detailResourceKey
        ? getCachedPredictionResource<PredictionMarketDetail>(
            "detail",
            detailResourceKey,
          )
        : null,
    [detailResourceKey],
  );
  const detail = detailCacheKey
    ? detailCache[detailCacheKey] ?? persistedDetail ?? null
    : null;
  const loadedSummary = detail?.summary?.key === selectedSummaryKey ? detail.summary : null;
  const socketSummary = loadedSummary ?? selectedSummary ?? browseSummary;
  socketSummaryRef.current = socketSummary;
  const browseSocketRef = useRef(false);
  browseSocketRef.current = selectedSummary == null;
  const socketKey = socketSummary?.key ?? null;
  const socketYesTokenId = socketSummary?.yesTokenId ?? null;
  const socketNoTokenId = socketSummary?.noTokenId ?? null;
  const detailSocketEnabled = shouldSubscribePredictionDetailSocket({
    focused,
    summary: socketSummary,
    detailOpen: selectedSummary != null,
    listCoversMarket: Boolean(socketKey && watchlistCoveredKeys.has(socketKey)),
  });
  const detailLoadCount = detailCacheKey ? detailPending[detailCacheKey] ?? 0 : 0;
  const detailError = detailCacheKey ? detailErrors[detailCacheKey] ?? null : null;

  const loadSelectedDetail = useCallback(
    async (summary: PredictionMarketSummary, signal: AbortSignal) => {
      if (signal.aborted) return;
      const cacheKey = buildPredictionDetailCacheKey(summary.key, historyRange);
      const isCurrentSelection = currentDetailCacheKeyRef.current === cacheKey;
      setDetailPending((current) =>
        updatePredictionPendingCounts(current, cacheKey, 1),
      );
      if (isCurrentSelection) {
        setTransportState(summary.venue === "polymarket" ? "loading" : "polling");
      }
      try {
        const next =
          summary.venue === "polymarket"
            ? await loadPolymarketDetail(summary, historyRange)
            : summary.venue === "kalshi"
              ? await loadKalshiDetail(summary, historyRange)
              : summaryOnlyDetail(summary);
        if (signal.aborted) return;
        let merged = next;
        setDetailCache((current) => {
          merged = mergePredictionDetailLoad(
            current[cacheKey],
            next,
            socketTouchRef.current.get(summary.key),
          );
          if (merged === current[cacheKey]) return current;
          return {
            ...current,
            [cacheKey]: merged,
          };
        });
        setCatalogCache((current) =>
          updatePredictionCatalogCacheEntries(current, summary.key, () => merged.summary),
        );
        setDetailErrors((current) =>
          updatePredictionErrorState(current, cacheKey, null),
        );
        setLastRefreshAt(Date.now());
        if (currentDetailCacheKeyRef.current === cacheKey) {
          setTransportState(
            summary.venue === "polymarket" ? "stale" : "polling",
          );
        }
      } catch (error) {
        if (signal.aborted) return;
        setDetailErrors((current) =>
          updatePredictionErrorState(
            current,
            cacheKey,
            formatPredictionLoadError(summary.venue, "market detail", error),
          ),
        );
        if (currentDetailCacheKeyRef.current === cacheKey) {
          setTransportState("error");
        }
      } finally {
        setDetailPending((current) =>
          updatePredictionPendingCounts(current, cacheKey, -1),
        );
      }
    },
    [historyRange, setCatalogCache],
  );

  useEffect(() => {
    selectedSummaryRef.current = selectedSummary;
  }, [selectedSummary]);

  useEffect(() => {
    currentDetailCacheKeyRef.current = detailCacheKey;
  }, [detailCacheKey]);

  useEffect(() => {
    const detailSummary = selectedSummaryRef.current;
    if (!detailOpen || !detailSummary) {
      setTransportState("idle");
      return;
    }
    const controller = new AbortController();
    const delayMs = detailLoadDelayRef.current;
    detailLoadDelayRef.current = 0;
    const timeoutId = setTimeout(() => {
      void loadSelectedDetail(detailSummary, controller.signal);
    }, delayMs);
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [detailOpen, loadSelectedDetail, selectedSummaryKey]);

  useEffect(() => {
    if (!focused || selectedSummaryVenue !== "kalshi" || !selectedSummaryKey) {
      return;
    }
    const controller = new AbortController();
    const intervalId = setInterval(() => {
      const summary = selectedSummaryRef.current;
      if (summary && !controller.signal.aborted) {
        void loadSelectedDetail(summary, controller.signal);
      }
    }, 5_000);
    return () => {
      controller.abort();
      clearInterval(intervalId);
    };
  }, [focused, loadSelectedDetail, selectedSummaryKey, selectedSummaryVenue]);

  const applyLiveDetail = useCallback((
    marketKey: string,
    update: (entry: PredictionMarketDetail, touch: DetailSocketTouch) => PredictionMarketDetail,
  ) => {
    setDetailCache((current) => {
      const summary = socketSummaryRef.current;
      if (!summary || summary.key !== marketKey) return current;
      const range = historyRangeRef.current;
      const cacheKey = buildPredictionDetailCacheKey(marketKey, range);
      const persisted = current[cacheKey]
        ? null
        : getCachedPredictionResource<PredictionMarketDetail>(
            "detail",
            buildPredictionDetailResourceKey(marketKey, range),
          );
      const seeded = seedPredictionDetailCache(current, cacheKey, summary, persisted);
      const touch = socketTouchRef.current.get(marketKey) ?? {
        yesPrice: false,
        bids: false,
        book: false,
        trades: false,
      };
      socketTouchRef.current.set(marketKey, touch);
      return updatePredictionDetailCacheEntries(seeded, marketKey, (entry) => update(entry, touch));
    });
  }, []);

  useEffect(() => {
    // Same focus gate as the Kalshi polling above: an unfocused pane must not keep
    // a live socket open. The watchlist socket already covers its own rows.
    if (!detailSocketEnabled || !socketKey) return;

    const marketKey = socketKey;
    let unsubscribe: (() => void) | null = null;
    const connect = () => {
      unsubscribe = subscribePolymarketMarket(
        [socketYesTokenId, socketNoTokenId].filter(
          (value): value is string => !!value,
        ),
        {
          onBestBidAsk: (assetId, bestBid, bestAsk, spread) => {
            setTransportState("live");
            applyLiveDetail(marketKey, (entry, touch) =>
              applyPredictionBestBidAskUpdate(entry, assetId, bestBid, bestAsk, spread, touch),
            );
          },
          onBook: (assetId, bids, asks, lastTradePrice) => {
            setTransportState("live");
            applyLiveDetail(marketKey, (entry, touch) =>
              applyPredictionBookUpdate(entry, assetId, bids, asks, lastTradePrice, touch),
            );
          },
          onBookLevel: (assetId, side, price, size) => {
            setTransportState("live");
            applyLiveDetail(marketKey, (entry, touch) =>
              applyPredictionBookLevelUpdate(entry, assetId, side, price, size, touch),
            );
          },
          onTrade: (assetId, trade) => {
            setTransportState("live");
            applyLiveDetail(marketKey, (entry, touch) =>
              applyPredictionTradeUpdate(entry, assetId, trade, touch),
            );
          },
        },
      );
    };
    // Read when the market changes, not as a dependency: opening detail on the
    // row the cursor rests on keeps its socket.
    const timer = browseSocketRef.current ? setTimeout(connect, BROWSE_SOCKET_REST_MS) : null;
    if (!timer) connect();
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [
    applyLiveDetail,
    detailSocketEnabled,
    socketKey,
    socketNoTokenId,
    socketYesTokenId,
  ]);

  const setNextDetailLoadDelay = useCallback((delayMs: number) => {
    detailLoadDelayRef.current = Math.max(0, delayMs);
  }, []);

  return {
    detail,
    detailError,
    detailLoadCount,
    lastRefreshAt,
    transportState,
    actions: {
      setNextDetailLoadDelay,
    },
  };
}

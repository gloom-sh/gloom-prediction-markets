import { useEffect, useMemo, useRef, useState } from "react";
import { fetchKalshiMarketQuotes } from "../services/kalshi/quotes";
import { subscribePolymarketMarket } from "../services/polymarket/ws";
import type { PredictionMarketSummary } from "../types";
import {
  OddsFlashBook,
  mergeLiveQuote,
  polymarketBookPatch,
  polymarketInsideBookPatch,
  polymarketTradePatch,
  quotesEqual,
  type LiveQuotePatch,
} from "./watchlist-quotes";

const KALSHI_POLL_MS = 2_000;
const EMPTY_QUOTES: ReadonlyMap<string, LiveQuotePatch> = new Map();
const EMPTY_FLASHING: ReadonlySet<string> = new Set();
export function retainSubscribedQuotePatches(
  pending: ReadonlyMap<string, LiveQuotePatch>,
  marketsByKey: ReadonlyMap<string, Pick<PredictionMarketSummary, "yesTokenId" | "noTokenId">>,
  assetIds: ReadonlySet<string>,
): Map<string, LiveQuotePatch> {
  const keep = new Map<string, LiveQuotePatch>();
  for (const [key, patch] of pending) {
    const market = marketsByKey.get(key);
    if (!market) continue;
    const stillSubscribed = (market.yesTokenId != null && assetIds.has(market.yesTokenId))
      || (market.noTokenId != null && assetIds.has(market.noTokenId));
    if (stillSubscribed) keep.set(key, patch);
  }
  return keep;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
}

export function useWatchlistLiveOverlay({
  enabled,
  markets,
}: {
  enabled: boolean;
  markets: readonly PredictionMarketSummary[];
}): {
  quotes: ReadonlyMap<string, LiveQuotePatch>;
  flashingMarketKeys: ReadonlySet<string>;
  coveredMarketKeys: ReadonlySet<string>;
} {
  const [quotes, setQuotes] = useState<ReadonlyMap<string, LiveQuotePatch>>(EMPTY_QUOTES);
  const [flashingMarketKeys, setFlashingMarketKeys] = useState<ReadonlySet<string>>(EMPTY_FLASHING);
  const bookRef = useRef<OddsFlashBook | null>(null);
  bookRef.current ??= new OddsFlashBook();
  const marketsByKeyRef = useRef(new Map<string, PredictionMarketSummary>());
  const quotesRef = useRef(quotes);
  const enabledRef = useRef(enabled);
  const pendingRef = useRef(new Map<string, LiveQuotePatch>());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polymarketAssetsRef = useRef("");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuePatchRef = useRef<(key: string, patch: LiveQuotePatch) => void>(() => {});
  const acceptPatchesRef = useRef<(batch: ReadonlyMap<string, LiveQuotePatch>) => void>(() => {});

  quotesRef.current = quotes;
  enabledRef.current = enabled;

  const marketsByKey = useMemo(() => {
    const byKey = new Map<string, PredictionMarketSummary>();
    for (const market of markets) byKey.set(market.key, market);
    return byKey;
  }, [markets]);
  marketsByKeyRef.current = marketsByKey;

  const polymarketAssets = useMemo(() => {
    if (!enabled) return "";
    const ids: string[] = [];
    for (const market of markets) {
      if (market.venue !== "polymarket") continue;
      if (market.yesTokenId) ids.push(market.yesTokenId);
      if (market.noTokenId) ids.push(market.noTokenId);
    }
    ids.sort();
    return ids.join("\n");
  }, [enabled, markets]);
  polymarketAssetsRef.current = polymarketAssets;

  const kalshiTickers = useMemo(() => {
    if (!enabled) return "";
    const tickers: string[] = [];
    for (const market of markets) {
      if (market.venue === "kalshi" && market.marketId) tickers.push(market.marketId);
    }
    tickers.sort();
    return tickers.join(",");
  }, [enabled, markets]);

  const tokenIndexRef = useRef(new Map<string, string>());
  const tokenIndex = useMemo(() => {
    const index = new Map<string, string>();
    if (!enabled) return index;
    for (const market of markets) {
      if (market.venue !== "polymarket") continue;
      if (market.yesTokenId) index.set(market.yesTokenId, market.key);
      if (market.noTokenId) index.set(market.noTokenId, market.key);
    }
    return index;
  }, [enabled, markets]);
  tokenIndexRef.current = tokenIndex;
  const coveredMarketKeys = useMemo(() => new Set(tokenIndex.values()), [tokenIndex]);

  const publishFlashRef = useRef<() => void>(() => {});
  publishFlashRef.current = () => {
    const book = bookRef.current!;
    const now = Date.now();
    const active = book.active(now);
    setFlashingMarketKeys((current) => {
      if (sameSet(current, active)) return current;
      return active.size === 0 ? EMPTY_FLASHING : active;
    });
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = null;
    const nextAt = book.nextChangeAt(now);
    if (nextAt == null) return;
    flashTimerRef.current = setTimeout(
      () => publishFlashRef.current(),
      Math.max(0, nextAt - Date.now()),
    );
  };

  acceptPatchesRef.current = (batch) => {
    if (!enabledRef.current || batch.size === 0) return;
    const book = bookRef.current!;
    const now = Date.now();
    let flashed = false;
    for (const [key, patch] of batch) {
      if (patch.yesPrice === undefined) continue;
      const currentPrice = quotesRef.current.get(key)?.yesPrice
        ?? marketsByKeyRef.current.get(key)?.yesPrice
        ?? null;
      book.seed(key, currentPrice);
      if (book.note(key, patch.yesPrice, now)) flashed = true;
    }
    setQuotes((current) => {
      let changed = false;
      const next = new Map(current);
      for (const [key, patch] of batch) {
        const merged = mergeLiveQuote(next.get(key), patch);
        if (!quotesEqual(next.get(key), merged)) {
          next.set(key, merged);
          changed = true;
        }
      }
      return changed ? next : current;
    });
    if (flashed) publishFlashRef.current();
  };

  queuePatchRef.current = (key, patch) => {
    if (!enabledRef.current) return;
    const existing = pendingRef.current.get(key);
    pendingRef.current.set(key, existing ? mergeLiveQuote(existing, patch) : patch);
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const batch = pendingRef.current;
      pendingRef.current = new Map();
      acceptPatchesRef.current(batch);
    }, 50);
  };

  useEffect(() => {
    if (enabled) return;
    bookRef.current?.clear();
    pendingRef.current = new Map();
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    setQuotes((current) => (current.size === 0 ? current : EMPTY_QUOTES));
    setFlashingMarketKeys((current) => (current.size === 0 ? current : EMPTY_FLASHING));
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = null;
  }, [enabled]);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
  }, []);

  useEffect(() => {
    if (!polymarketAssets) return;
    const assetIds = polymarketAssets.split("\n");
    const unsubscribe = subscribePolymarketMarket(assetIds, {
      onBestBidAsk: (assetId, bestBid, bestAsk, spread) => {
        const marketKey = tokenIndexRef.current.get(assetId);
        const market = marketKey ? marketsByKeyRef.current.get(marketKey) : undefined;
        if (!market) return;
        const patch = polymarketBookPatch(market, assetId, bestBid, bestAsk, spread);
        if (patch) queuePatchRef.current(market.key, patch);
      },
      onBook: (assetId, bids, asks) => {
        const marketKey = tokenIndexRef.current.get(assetId);
        const market = marketKey ? marketsByKeyRef.current.get(marketKey) : undefined;
        if (!market) return;
        const patch = polymarketInsideBookPatch(market, assetId, bids, asks);
        if (patch) queuePatchRef.current(market.key, patch);
      },
      onTrade: (assetId, trade) => {
        const marketKey = tokenIndexRef.current.get(assetId);
        const market = marketKey ? marketsByKeyRef.current.get(marketKey) : undefined;
        if (!market) return;
        const patch = polymarketTradePatch(market, assetId, trade.price);
        if (patch) queuePatchRef.current(market.key, patch);
      },
    });
    return () => {
      const nextAssets = polymarketAssetsRef.current;
      const pending = pendingRef.current;
      pendingRef.current = new Map();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (nextAssets && nextAssets !== polymarketAssets) {
        const keep = retainSubscribedQuotePatches(
          pending,
          marketsByKeyRef.current,
          new Set(nextAssets.split("\n")),
        );
        if (keep.size > 0) acceptPatchesRef.current(keep);
      }
      unsubscribe();
    };
  }, [polymarketAssets]);

  useEffect(() => {
    // The Kalshi market socket requires an API key, so these rows poll the public markets route.
    if (!kalshiTickers) return;
    const tickers = kalshiTickers.split(",");
    const controller = new AbortController();
    let stopped = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        const next = await fetchKalshiMarketQuotes(tickers, controller.signal);
        if (stopped) return;
        const patches = new Map<string, LiveQuotePatch>();
        for (const quote of next.values()) {
          const patch: LiveQuotePatch = {};
          for (const field of ["yesPrice", "noPrice", "lastTradePrice", "yesBid", "yesAsk", "noBid", "noAsk", "spread", "volume24h", "openInterest"] as const) {
            const value = quote[field];
            if (value != null) patch[field] = value;
          }
          if (patch.yesPrice !== undefined || patch.spread !== undefined || patch.volume24h !== undefined || patch.openInterest !== undefined) {
            patches.set(quote.key, patch);
          }
        }
        acceptPatchesRef.current(patches);
      } catch {
        // The next poll retries. Cleanup aborts the request in flight.
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const intervalId = setInterval(() => {
      void poll();
    }, KALSHI_POLL_MS);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(intervalId);
    };
  }, [kalshiTickers]);

  return { quotes, flashingMarketKeys, coveredMarketKeys };
}

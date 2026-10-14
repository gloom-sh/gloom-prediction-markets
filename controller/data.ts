import { useEffect, useMemo, useState } from "react";
import { measurePerf } from "gloomberb/utils";
import { usePredictionCatalogData } from "./catalog";
import { usePredictionDetailData } from "./detail";
import { useWatchlistLiveOverlay } from "./watchlist-live";
import { applyLiveQuotes } from "./watchlist-quotes";
import {
  buildPredictionVisibleRowLookup,
  resolvePredictionSelectedRowState,
  resolvePredictionBrowseSocketSummary,
  resolvePredictionSelectedSummary,
} from "./selection";
import {
  filterPredictionMarkets,
  getDefaultPredictionSort,
  sortPredictionMarkets,
} from "../metrics";
import { sortPredictionOutcomeMarkets } from "../outcome-order";
import { buildPredictionListRows, flattenPredictionListRows, withSavedWatchlistMarkets } from "../rows";
import { predictionSiblingSummary } from "../sibling-summary";
import type {
  PredictionBrowseTab,
  PredictionCategoryId,
  PredictionHistoryRange,
  PredictionListRow,
  PredictionMarketSummary,
  PredictionSiblingMarket,
  PredictionSortPreference,
  PredictionVenueScope,
} from "../types";

const NO_LIVE_MARKETS: PredictionMarketSummary[] = [];

export function resolvePredictionVisibleSort(
  browseTab: PredictionBrowseTab,
  sortPreference: PredictionSortPreference,
): PredictionSortPreference {
  if (!sortPreference.columnId) return getDefaultPredictionSort(browseTab);
  if (
    (browseTab === "ending" || browseTab === "new") &&
    sortPreference.columnId === getDefaultPredictionSort("top").columnId
  ) {
    return getDefaultPredictionSort(browseTab);
  }
  return sortPreference;
}

export function resolvePredictionEventMarkets(
  selectedRow: PredictionListRow | null,
  allRows: readonly PredictionListRow[],
): PredictionMarketSummary[] {
  if (!selectedRow) return [];
  if (selectedRow.kind === "group") return selectedRow.markets;
  const parent = selectedRow.parentKey
    ? allRows.find((row) => row.key === selectedRow.parentKey)
    : null;
  const markets = parent?.markets ?? selectedRow.markets;
  return markets.length > 1 ? markets : [];
}

export { predictionSiblingFromSummary, predictionSiblingSummary } from "../sibling-summary";

function sameDetailSiblingList(
  current: readonly PredictionSiblingMarket[],
  next: readonly PredictionSiblingMarket[],
): boolean {
  return current.length === next.length && current.every((item, index) => {
    const other = next[index];
    return item.key === other?.key
      && item.yesPrice === other?.yesPrice
      && item.yesTokenId === other?.yesTokenId
      && item.openInterest === other?.openInterest
      && item.url === other?.url;
  });
}

/** A one-contract list row still has the rest of the event on the detail payload. */
export function mergePredictionDetailSiblings(
  eventMarkets: readonly PredictionMarketSummary[],
  selectedSummary: PredictionMarketSummary | null,
  siblings: readonly PredictionSiblingMarket[] | undefined,
): PredictionMarketSummary[] {
  if (eventMarkets.length > 1 || !selectedSummary || !siblings || siblings.length < 2) {
    return [...eventMarkets];
  }
  const byKey = new Map<string, PredictionMarketSummary>();
  byKey.set(selectedSummary.key, selectedSummary);
  for (const sibling of siblings) {
    if (byKey.has(sibling.key)) continue;
    byKey.set(sibling.key, predictionSiblingSummary(selectedSummary, sibling));
  }
  return byKey.size > 1 ? [...byKey.values()] : [...eventMarkets];
}

export function withPredictionDetailSibling(
  rowSummary: PredictionMarketSummary | null,
  selectedDetailMarketKey: string | null,
  siblings: readonly PredictionSiblingMarket[] | undefined,
): PredictionMarketSummary | null {
  if (!rowSummary || !selectedDetailMarketKey || rowSummary.key === selectedDetailMarketKey) {
    return rowSummary;
  }
  const sibling = siblings?.find((candidate) => candidate.key === selectedDetailMarketKey);
  return sibling ? predictionSiblingSummary(rowSummary, sibling) : rowSummary;
}

export function resolveSortedOutcomeMarkets(
  detailOpen: boolean,
  eventMarkets: readonly PredictionMarketSummary[],
): PredictionMarketSummary[] {
  if (!detailOpen || eventMarkets.length < 2) return [];
  return sortPredictionOutcomeMarkets(eventMarkets);
}

export function usePredictionMarketsDataState({
  browseTab,
  categoryId,
  detailOpen,
  effectiveVenueScope,
  focused,
  historyRange,
  includeKalshi,
  includePolymarket,
  expandedGroupKeys,
  searchQuery,
  selectedDetailMarketKey,
  selectedRowKey,
  sortPreference,
  watchlistMarkets,
  watchlistSet,
}: {
  browseTab: PredictionBrowseTab;
  categoryId: PredictionCategoryId;
  detailOpen: boolean;
  effectiveVenueScope: PredictionVenueScope;
  focused: boolean;
  historyRange: PredictionHistoryRange;
  includeKalshi: boolean;
  includePolymarket: boolean;
  expandedGroupKeys: ReadonlySet<string>;
  searchQuery: string;
  selectedDetailMarketKey: string | null;
  selectedRowKey: string | null;
  sortPreference: PredictionSortPreference;
  watchlistMarkets: Readonly<Record<string, PredictionMarketSummary>>;
  watchlistSet: Set<string>;
}) {
  const {
    allMarkets,
    catalogHasMore,
    catalogLoadCount,
    catalogLoadingMore,
    catalogStatus,
    debouncedSearchQuery,
    loadMoreCatalog,
    searchInFlight,
    searchScanNote,
    setCatalogCache,
  } = usePredictionCatalogData({
    categoryId,
    includeKalshi,
    includePolymarket,
    searchQuery,
    venueScope: effectiveVenueScope,
  });

  const listedMarkets = useMemo(
    () => withSavedWatchlistMarkets(allMarkets, watchlistMarkets),
    [allMarkets, watchlistMarkets],
  );
  const liveEnabled = focused && browseTab === "watchlist" && !detailOpen;
  const liveMarkets = useMemo(() => {
    if (!liveEnabled) return NO_LIVE_MARKETS;
    return listedMarkets.filter((market) =>
      watchlistSet.has(market.key) &&
      (effectiveVenueScope === "all" || market.venue === effectiveVenueScope),
    );
  }, [effectiveVenueScope, listedMarkets, liveEnabled, watchlistSet]);
  const { quotes: liveQuotes, flashingMarketKeys, coveredMarketKeys } = useWatchlistLiveOverlay({
    enabled: liveEnabled,
    markets: liveMarkets,
  });
  const pricedMarkets = useMemo(
    () => (liveEnabled ? applyLiveQuotes(listedMarkets, liveQuotes) : listedMarkets),
    [listedMarkets, liveEnabled, liveQuotes],
  );
  const allRows = useMemo(
    () =>
      measurePerf("prediction.rows.build", () => buildPredictionListRows(pricedMarkets), {
        marketCount: pricedMarkets.length,
      }),
    [pricedMarkets],
  );

  const visibleRows = useMemo(() => {
    return measurePerf("prediction.rows.filter-sort", () => {
      const filtered = filterPredictionMarkets(
        allRows,
        browseTab,
        effectiveVenueScope,
        categoryId,
        searchQuery,
        watchlistSet,
      );
      const sorted = sortPredictionMarkets(
        filtered,
        resolvePredictionVisibleSort(browseTab, sortPreference),
      );
      return flattenPredictionListRows(sorted, expandedGroupKeys);
    }, {
      browseTab,
      categoryId,
      rowCount: allRows.length,
      search: searchQuery.trim(),
      sortColumnId: sortPreference.columnId,
      sortDirection: sortPreference.direction,
      venueScope: effectiveVenueScope,
    });
  }, [
    allRows,
    browseTab,
    categoryId,
    effectiveVenueScope,
    searchQuery,
    expandedGroupKeys,
    sortPreference,
    watchlistSet,
  ]);

  const visibleRowLookup = useMemo(
    () => buildPredictionVisibleRowLookup(visibleRows),
    [visibleRows],
  );

  const selectedRowState = useMemo(
    () => resolvePredictionSelectedRowState(selectedRowKey, visibleRowLookup),
    [selectedRowKey, visibleRowLookup],
  );
  const selectedRow = selectedRowState.row;
  const [detailSiblings, setDetailSiblings] = useState<readonly PredictionSiblingMarket[]>([]);
  const rowSummary = useMemo(
    () =>
      resolvePredictionSelectedSummary({
        detailOpen,
        selectedDetailMarketKey,
        selectedRow,
      }),
    [detailOpen, selectedDetailMarketKey, selectedRow],
  );
  const siblingEventToken = rowSummary?.eventId ?? rowSummary?.key ?? null;
  const [siblingEventTokenSeen, setSiblingEventTokenSeen] = useState<string | null>(null);
  // A new event must not keep the previous event's sibling contracts.
  if (siblingEventToken !== siblingEventTokenSeen) {
    setSiblingEventTokenSeen(siblingEventToken);
    setDetailSiblings([]);
  }
  const selectedSummary = useMemo(
    () => withPredictionDetailSibling(rowSummary, selectedDetailMarketKey, detailSiblings),
    [detailSiblings, rowSummary, selectedDetailMarketKey],
  );
  const selectedSummaryKey = selectedSummary?.key ?? null;
  const selectedIndex = selectedRowState.index;
  const catalogEventMarkets = useMemo(
    () => resolvePredictionEventMarkets(selectedRow, allRows),
    [allRows, selectedRow],
  );
  const {
    detail,
    detailError,
    detailLoadCount,
    lastRefreshAt,
    transportState,
    actions: detailActions,
  } = usePredictionDetailData({
    focused,
    detailOpen,
    historyRange,
    selectedSummary,
    browseSummary: resolvePredictionBrowseSocketSummary(detailOpen, selectedRow),
    setCatalogCache,
    watchlistCoveredKeys: coveredMarketKeys,
  });
  useEffect(() => {
    const next = detail?.siblings;
    if (!next || next.length < 2) return;
    setDetailSiblings((current) => (sameDetailSiblingList(current, next) ? current : next));
  }, [detail?.siblings]);
  const selectedEventMarkets = useMemo(
    () => mergePredictionDetailSiblings(catalogEventMarkets, selectedSummary, detail?.siblings),
    [catalogEventMarkets, detail?.siblings, selectedSummary],
  );
  const sortedOutcomeMarkets = useMemo(
    () => resolveSortedOutcomeMarkets(detailOpen, selectedEventMarkets),
    [detailOpen, selectedEventMarkets],
  );

  return {
    catalogHasMore,
    catalogLoadCount,
    catalogLoadingMore,
    catalogStatus,
    debouncedSearchQuery,
    detail,
    detailError,
    detailLoadCount,
    lastRefreshAt,
    loadMoreCatalog,
    selectedIndex,
    selectedRow,
    selectedEventMarkets,
    selectedSummary,
    knownDetailSiblings: detailSiblings,
    searchInFlight,
    searchScanNote,
    selectedSummaryKey,
    sortedOutcomeMarkets,
    flashingMarketKeys,
    transportState,
    visibleRows,
    actions: {
      setNextDetailLoadDelay: detailActions.setNextDetailLoadDelay,
    },
  };
}

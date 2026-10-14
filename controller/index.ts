import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SelectControl } from "gloomberb/components";
import { type InputRenderable, type ScrollBoxRenderable } from "gloomberb/ui";
import {
  useDebouncedPluginPaneState,
  useInputCapture,
  usePaneInstance,
  usePluginPaneState,
  usePluginState,
  useViewport,
} from "gloomberb/react";
import { usePredictionMarketsDataState } from "./data";
import { usePredictionControllerEffects } from "./effects";
import { usePredictionControllerKeyboard } from "./keyboard";
import type { PredictionQueryTarget } from "../keyboard";
import { getDefaultPredictionSort, getNextPredictionSort } from "../metrics";
import {
  resolvePredictionListActivation,
  togglePredictionGroupExpanded,
} from "../rows";
import {
  getPredictionMarketsPaneSettings,
  resolvePredictionColumns,
} from "../settings";
import type {
  PredictionBrowseTab,
  PredictionCategoryId,
  PredictionDetailTab,
  PredictionHistoryRange,
  PredictionListRow,
  PredictionMarketSummary,
  PredictionSortPreference,
  PredictionVenueScope,
} from "../types";
import { venueInScope } from "../venues";

const KEYBOARD_DETAIL_LOAD_DELAY_MS = 140;
const SELECTION_PERSIST_DEBOUNCE_MS = 300;

export function usePredictionMarketsController({
  focused,
}: {
  focused: boolean;
}) {
  const paneInstance = usePaneInstance();
  const paneSettings = useMemo(
    () => getPredictionMarketsPaneSettings(paneInstance?.settings),
    [paneInstance?.settings],
  );
  const initialParams = paneInstance?.params;

  const [watchlist, setWatchlist] = usePluginState<string[]>(
    "watchlist:v1",
    [],
  );
  const [watchlistMarkets, setWatchlistMarkets] = usePluginState<Record<string, PredictionMarketSummary>>(
    "watchlistMarkets:v1",
    {},
  );
  const [lastVenueScope, setLastVenueScope] =
    usePluginState<PredictionVenueScope>("lastVenueScope:v1", "all");

  const [venueScope, setVenueScope] = usePluginPaneState<PredictionVenueScope>(
    "venueScope",
    paneSettings.hideTabs ? paneSettings.lockedVenueScope : lastVenueScope,
  );
  const [browseTab, setBrowseTab] = usePluginPaneState<PredictionBrowseTab>(
    "browseTab",
    paneSettings.defaultBrowseTab,
  );
  const [storedDetailTab, setDetailTab] = usePluginPaneState<PredictionDetailTab>(
    "detailTab",
    "overview",
  );
  const detailTab = storedDetailTab === "chart" ? "overview" : storedDetailTab;
  useEffect(() => {
    if (storedDetailTab === "chart") setDetailTab("overview");
  }, [setDetailTab, storedDetailTab]);
  const [searchQuery, setSearchQuery] = usePluginPaneState<string>(
    "searchQuery",
    "",
  );
  const [categoryId, setCategoryId] = usePluginPaneState<PredictionCategoryId>(
    "categoryId",
    "all",
  );
  const [historyRange, setHistoryRange] =
    usePluginPaneState<PredictionHistoryRange>("historyRange", "1M");
  const [selectedRowKey, setSelectedRowKey] =
    useDebouncedPluginPaneState<string | null>(
      "selectedRowKey",
      null,
      SELECTION_PERSIST_DEBOUNCE_MS,
    );
  const [selectedDetailMarketKey, setSelectedDetailMarketKey] =
    useDebouncedPluginPaneState<string | null>(
      "selectedDetailMarketKey",
      null,
      SELECTION_PERSIST_DEBOUNCE_MS,
    );
  const defaultSortPreference = useMemo(
    () => getDefaultPredictionSort(paneSettings.defaultBrowseTab),
    [paneSettings.defaultBrowseTab],
  );
  const [sortPreference, setSortPreference] =
    usePluginPaneState<PredictionSortPreference>(
      "sortPreference",
      defaultSortPreference,
    );
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedGroupList, setExpandedGroupList] = usePluginPaneState<string[]>(
    "expandedGroupKeys",
    [],
  );
  const expandedGroupKeys = useMemo(
    () => new Set(expandedGroupList),
    [expandedGroupList],
  );
  const setExpandedGroupKeys = useCallback((
    updater: Set<string> | ((current: Set<string>) => Set<string>),
  ) => {
    setExpandedGroupList((current) => {
      const next = typeof updater === "function" ? updater(new Set(current)) : updater;
      const keys = [...next];
      if (keys.length === current.length && keys.every((key, index) => key === current[index])) {
        return current;
      }
      return keys;
    });
  }, [setExpandedGroupList]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [queryTarget, setQueryTarget] = useState<PredictionQueryTarget | null>(null);
  const queryTargetRef = useRef<PredictionQueryTarget | null>(null);
  const venueControlRef = useRef<SelectControl | null>(null);
  const focusQueryTarget = useCallback((target: PredictionQueryTarget | null) => {
    queryTargetRef.current = target;
    setQueryTarget(target);
    setSearchFocused(target === "search");
  }, []);
  const clearQueryTarget = useCallback(() => {
    focusQueryTarget(null);
  }, [focusQueryTarget]);
  // Changing venue, category, or view while the field is focused leaves the
  // field. Landing on Venue or the view keeps that control's keys.
  const leaveSearchField = useCallback(() => {
    setSearchFocused(false);
    if (queryTargetRef.current === "search") focusQueryTarget(null);
  }, [focusQueryTarget]);
  const [initialParamsApplied, setInitialParamsApplied] = useState(false);
  const appViewport = useViewport();
  useInputCapture(focused && searchFocused);

  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const headerScrollRef = useRef<ScrollBoxRenderable>(null);
  const detailScrollRef = useRef<ScrollBoxRenderable>(null);
  const searchInputRef = useRef<InputRenderable>(null);
  const previousFilterResetKeyRef = useRef<string | null>(null);

  const effectiveVenueScope = paneSettings.hideTabs
    ? paneSettings.lockedVenueScope
    : venueScope;
  const includePolymarket = venueInScope("polymarket", effectiveVenueScope);
  const includeKalshi = venueInScope("kalshi", effectiveVenueScope);
  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);
  const visibleColumns = useMemo(
    () => resolvePredictionColumns(paneSettings.columnIds),
    [paneSettings.columnIds],
  );

  const data = usePredictionMarketsDataState({
    browseTab,
    categoryId,
    detailOpen,
    effectiveVenueScope,
    focused,
    expandedGroupKeys,
    historyRange,
    includeKalshi,
    includePolymarket,
    searchQuery,
    selectedDetailMarketKey,
    selectedRowKey,
    sortPreference,
    watchlistMarkets,
    watchlistSet,
  });

  usePredictionControllerEffects({
    appViewportHeight: appViewport.height,
    browseTab,
    categoryId,
    debouncedSearchQuery: searchQuery,
    detailOpen,
    effectiveVenueScope,
    headerScrollRef,
    hideTabs: paneSettings.hideTabs,
    initialParams,
    initialParamsApplied,
    lastVenueScope,
    lockedVenueScope: paneSettings.lockedVenueScope,
    previousFilterResetKeyRef,
    scrollRef,
    searchFocused,
    searchInputRef,
    selectedDetailMarketKey,
    selectedIndex: data.selectedIndex,
    selectedRow: data.selectedRow,
    selectedRowKey,
    setDetailOpen,
    setInitialParamsApplied,
    setLastVenueScope,
    setSearchQuery,
    setSelectedDetailMarketKey,
    setSelectedRowKey,
    setVenueScope,
    visibleRows: data.visibleRows,
    catalogLoadCount: data.catalogLoadCount,
    detailSiblings: data.detail?.siblings?.length
      ? data.detail.siblings
      : data.knownDetailSiblings,
    searchPending: data.searchInFlight || searchQuery.trim() !== data.debouncedSearchQuery.trim(),
  });

  useEffect(() => {
    setSortPreference((current) =>
      current.columnId === defaultSortPreference.columnId &&
      current.direction === defaultSortPreference.direction
        ? current
        : defaultSortPreference,
    );
  }, [defaultSortPreference, setSortPreference]);

  const focusSearch = useCallback(() => {
    focusQueryTarget("search");
  }, [focusQueryTarget]);

  const blurSearch = useCallback(() => {
    clearQueryTarget();
  }, [clearQueryTarget]);

  useEffect(() => {
    if (!focused) clearQueryTarget();
  }, [clearQueryTarget, focused]);

  const toggleWatchlist = useCallback(
    (row: PredictionListRow) => {
      const rowMarketKeys = [...new Set(row.watchMarketKeys)];
      const watched = watchlistSet;
      const allWatched = rowMarketKeys.every((marketKey) => watched.has(marketKey));
      setWatchlist((current) => {
        if (allWatched) return current.filter((entry) => !rowMarketKeys.includes(entry));
        return [...new Set([...current, ...rowMarketKeys])];
      });
      setWatchlistMarkets((current) => {
        const next = { ...current };
        if (allWatched) {
          for (const marketKey of rowMarketKeys) delete next[marketKey];
          return next;
        }
        for (const market of row.markets) next[market.key] = market;
        return next;
      });
    },
    [setWatchlist, setWatchlistMarkets, watchlistSet],
  );

  const setBrowseSelection = useCallback(
    (rowKey: string, options?: { debounceDetail?: boolean; pointer?: boolean }) => {
      if (options?.pointer) clearQueryTarget();
      data.actions.setNextDetailLoadDelay(
        options?.debounceDetail ? KEYBOARD_DETAIL_LOAD_DELAY_MS : 0,
      );
      setSelectedRowKey(rowKey, {
        immediate: !options?.debounceDetail || selectedRowKey == null,
      });
    },
    [clearQueryTarget, data.actions, selectedRowKey, setSelectedRowKey],
  );

  const openSelectedRow = useCallback(
    (rowKey: string) => {
      const row = data.visibleRows.find((candidate) => candidate.key === rowKey);
      if (!row) return;
      clearQueryTarget();
      if (resolvePredictionListActivation(row) === "toggle-group") {
        setExpandedGroupKeys((current) => togglePredictionGroupExpanded(current, row.key));
        setSelectedRowKey(row.key, { immediate: true });
        return;
      }
      data.actions.setNextDetailLoadDelay(0);
      setSelectedRowKey(row.key, { immediate: true });
      setSelectedDetailMarketKey(row.focusMarketKey, { immediate: true });
      setDetailOpen(true);
    },
    [clearQueryTarget, data.actions, data.visibleRows, setSelectedDetailMarketKey, setSelectedRowKey],
  );

  const selectMarket = useCallback(
    (marketKey: string) => {
      clearQueryTarget();
      data.actions.setNextDetailLoadDelay(0);
      const childRow = data.visibleRows.find(
        (candidate) => candidate.kind === "market" && candidate.key === marketKey,
      );
      const row = childRow ?? data.visibleRows.find((candidate) =>
        candidate.markets.some((market) => market.key === marketKey),
      );
      if (row) {
        setSelectedRowKey(row.key, { immediate: true });
        setSelectedDetailMarketKey(marketKey, { immediate: true });
        setDetailOpen(true);
        return;
      }
      const sibling = detailOpen
        ? data.detail?.siblings.find((candidate) => candidate.key === marketKey)
        : undefined;
      if (detailOpen && sibling) {
        setSelectedDetailMarketKey(marketKey, { immediate: true });
        setDetailOpen(true);
        return;
      }
      setDetailOpen(false);
      setSelectedRowKey(null);
      setSelectedDetailMarketKey(null);
    },
    [
      data.actions,
      clearQueryTarget,
      data.detail,
      data.visibleRows,
      detailOpen,
      setDetailOpen,
      setSelectedDetailMarketKey,
      setSelectedRowKey,
    ],
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    clearQueryTarget();
  }, [clearQueryTarget]);

  const setVenue = useCallback(
    (nextVenueScope: string) => {
      const typed = nextVenueScope as PredictionVenueScope;
      leaveSearchField();
      setVenueScope(typed);
      setLastVenueScope(typed);
    },
    [leaveSearchField, setLastVenueScope, setVenueScope],
  );

  const selectBrowseTab = useCallback(
    (nextBrowseTab: PredictionBrowseTab) => {
      leaveSearchField();
      setBrowseTab(nextBrowseTab);
      setSortPreference(getDefaultPredictionSort(nextBrowseTab));
    },
    [leaveSearchField, setBrowseTab, setSortPreference],
  );

  const selectCategory = useCallback(
    (nextCategoryId: PredictionCategoryId) => {
      leaveSearchField();
      setCategoryId(nextCategoryId);
    },
    [leaveSearchField, setCategoryId],
  );

  const handleSortHeaderClick = useCallback(
    (columnId: string) => {
      clearQueryTarget();
      setSortPreference((current) => getNextPredictionSort(current, columnId));
    },
    [clearQueryTarget, setSortPreference],
  );

  const openVenueMenu = useCallback(() => {
    venueControlRef.current?.open();
  }, []);

  usePredictionControllerKeyboard({
    categoryId,
    detailOpen,
    detailScrollRef,
    detailTab,
    effectiveVenueScope,
    focused,
    hideTabs: paneSettings.hideTabs,
    searchFocused,
    selectedRow: data.selectedRow,
    selectedSummaryKey: data.selectedSummaryKey,
    sortedOutcomeMarkets: data.sortedOutcomeMarkets,
    browseTab,
    queryTargetRef,
    blurSearch,
    focusQueryTarget,
    focusSearch,
    openVenueMenu,
    selectBrowseTab,
    selectCategory,
    selectMarket,
    setVenue,
    toggleWatchlist,
  });

  const searchLoading = searchQuery.trim().length > 0 && data.searchInFlight;
  const searchScanNote = searchQuery.trim().length > 0 ? data.searchScanNote : null;

  return {
    paneSettings,
    browseTab,
    categoryId,
    catalogHasMore: data.catalogHasMore,
    catalogLoadCount: data.catalogLoadCount,
    catalogLoadingMore: data.catalogLoadingMore,
    catalogStatus: data.catalogStatus,
    detail: data.detail,
    detailError: data.detailError,
    detailLoadCount: data.detailLoadCount,
    detailOpen,
    detailScrollRef,
    detailTab,
    effectiveVenueScope,
    headerScrollRef,
    historyRange,
    lastRefreshAt: data.lastRefreshAt,
    scrollRef,
    searchFocused,
    queryTarget,
    venueControlRef,
    searchInputRef,
    searchLoading,
    searchQuery,
    searchScanNote,
    selectedRow: data.selectedRow,
    selectedEventMarkets: data.selectedEventMarkets,
    selectedIndex: data.selectedIndex,
    selectedSummary: data.selectedSummary,
    sortPreference,
    transportState: data.transportState,
    visibleColumns,
    flashingMarketKeys: data.flashingMarketKeys,
    visibleRows: data.visibleRows,
    watchlistSet,
    actions: {
      blurSearch,
      closeDetail,
      loadMoreCatalog: data.loadMoreCatalog,
      focusSearch,
      handleSortHeaderClick,
      openSelectedRow,
      selectBrowseTab,
      selectCategory,
      selectMarket,
      setDetailTab,
      setBrowseSelection,
      setHistoryRange,
      setSearchQuery,
      setVenue,
      toggleWatchlist,
    },
  };
}

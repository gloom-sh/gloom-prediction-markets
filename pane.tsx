import { Box, useUiCapabilities } from "gloomberb/ui";
import { useCallback, useMemo, useRef } from "react";
import {
  DataTableStackView,
  QueryBar,
  Spinner,
  Tabs,
  usePaneFooter,
  usePaneHeaderTabs,
  usePaneNoticeFooter,
  usePaneStatusLinkFooter,
  useTableLoadMore,
  type DataTableKeyEvent,
  type DataTableRootKeyContext,
} from "gloomberb/components";
import { createRowValueCache } from "gloomberb/components";
import type { PaneProps } from "gloomberb/types/plugin";
import { colors } from "gloomberb/theme";
import { PREDICTION_CATEGORY_OPTIONS } from "./categories";
import { usePredictionMarketsController } from "./controller";
import { PredictionMarketDetailPane } from "./detail/pane";
import { resolvePredictionDetailTitle } from "./detail/shared";
import { getPredictionColumnValue } from "./metrics";
import { BROWSE_TABS, VENUE_TABS } from "./navigation";
import { isPlainArrowUp, stopSearchFocusNavigation } from "gloomberb/utils";
import type {
  PredictionBrowseTab,
  PredictionCategoryId,
  PredictionColumnDef,
  PredictionListRow,
  PredictionVenueScope,
} from "./types";

const PREDICTION_CELL_CACHE_SIZE = 12_000;
const CATEGORY_TABS = PREDICTION_CATEGORY_OPTIONS.map((category) => ({
  label: category.label,
  value: category.id,
}));
// 1-4 pick the view from the keyboard; the hint says so beside each label.
const BROWSE_VIEW_OPTIONS = BROWSE_TABS.map((tab, index) => ({
  label: tab.label,
  value: tab.value,
  hint: String(index + 1),
}));
const VENUE_OPTIONS = VENUE_TABS.map((tab) => ({
  label: tab.label,
  value: tab.value,
}));
const RELATIVE_TIME_CELL_BUCKET_MS = 60_000;

const predictionRowVersions = new WeakMap<object, number>();
let nextPredictionRowVersion = 1;

function predictionRowVersion(row: PredictionListRow): number {
  const existing = predictionRowVersions.get(row);
  if (existing != null) return existing;
  const next = nextPredictionRowVersion;
  nextPredictionRowVersion += 1;
  predictionRowVersions.set(row, next);
  return next;
}

function predictionCellVersion(
  row: PredictionListRow,
  column: PredictionColumnDef,
  watchlisted: boolean,
  relativeTimeBucket: number,
): string {
  return [
    predictionRowVersion(row),
    column.id,
    watchlisted ? 1 : 0,
    column.id === "ends" || column.id === "updated" ? relativeTimeBucket : 0,
  ].join("|");
}

export function PredictionMarketsPane({ focused, width, height }: PaneProps) {
  const controller = usePredictionMarketsController({ focused });
  const { nativePaneChrome } = useUiCapabilities();
  const cellCacheRef = useRef(
    createRowValueCache<string, ReturnType<typeof getPredictionColumnValue>>(
      PREDICTION_CELL_CACHE_SIZE,
    ),
  );
  const relativeTimeBucket = Math.floor(Date.now() / RELATIVE_TIME_CELL_BUCKET_MS);
  const watchlistedRowKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of controller.visibleRows) {
      if (row.watchMarketKeys.some((marketKey) => controller.watchlistSet.has(marketKey))) {
        keys.add(row.key);
      }
    }
    return keys;
  }, [controller.visibleRows, controller.watchlistSet]);
  // Every venue failing is the list's error; one venue failing while the other
  // still fills the table is a data limitation behind the footer warning.
  const catalogError =
    controller.catalogStatus?.tone === "danger"
      ? controller.catalogStatus.message
      : null;
  const catalogNotice =
    controller.catalogStatus?.tone === "warning"
      ? controller.catalogStatus.message
      : null;
  const rowsLoading =
    controller.visibleRows.length === 0 &&
    (controller.catalogLoadCount > 0 || controller.searchLoading);
  const detailTitle = resolvePredictionDetailTitle({
    detail: controller.detail,
    selectedRow: controller.selectedRow,
    selectedSummary: controller.selectedSummary,
  });
  usePaneFooter("prediction-markets", () => {
    if (controller.detailOpen) return null;
    return {
      info: [
        ...(controller.searchLoading ? [{ id: "search-loading", parts: [{ text: "searching", tone: "muted" as const }] }] : []),
        ...(controller.catalogLoadingMore ? [{ id: "loading-more", parts: [{ text: "loading more", tone: "muted" as const }] }] : []),
        ...(catalogError ? [{ id: "catalog", parts: [{ text: catalogError, tone: "warning" as const }] }] : []),
      ],
      hints: [
        { id: "search", key: "/", label: "search", onPress: controller.actions.focusSearch },
        { id: "watch", key: "w", label: "atch", onPress: controller.selectedRow ? () => controller.actions.toggleWatchlist(controller.selectedRow!) : undefined, disabled: !controller.selectedRow },
      ],
    };
  }, [
    catalogError,
    controller.catalogLoadingMore,
    controller.detailOpen,
    controller.searchLoading,
    controller.selectedRow,
  ]);
  usePaneNoticeFooter({
    registrationId: "prediction-markets-notices",
    notices: catalogNotice ? [catalogNotice] : [],
    focused,
    enabled: !controller.detailOpen,
  });

  // The open market's venue page is [o]pen; a failed detail refresh keeps the
  // cached detail on screen and says so here rather than as current data.
  const detailVisible = controller.detailOpen && !!controller.selectedSummary;
  const detailSummary = controller.detail?.summary ?? controller.selectedSummary;
  usePaneStatusLinkFooter({
    registrationId: "prediction-markets-detail",
    focused: focused && detailVisible,
    url: detailVisible ? detailSummary?.url : null,
    loading: detailVisible && controller.detailLoadCount > 0 && !controller.detail,
    error: detailVisible && controller.detailError
      ? controller.detail
        ? `Showing cached data: ${controller.detailError}`
        : controller.detailError
      : null,
    showOpenHint: true,
  });

  // The category strip only belongs to the browse list; the detail view has its own tabs.
  const showCategoryTabs = CATEGORY_TABS.length > 1 && !controller.detailOpen;
  const selectCategory = (value: string) =>
    controller.actions.selectCategory(value as PredictionCategoryId);
  const tabsInHeader = usePaneHeaderTabs(
    showCategoryTabs
      ? {
          tabs: CATEGORY_TABS,
          activeValue: controller.categoryId,
          onSelect: selectCategory,
          keyboardNavigation: false,
        }
      : null,
  );

  const browseControls = (
    <>
      {showCategoryTabs && !tabsInHeader ? (
        <Box height={1} paddingX={1}>
          <Tabs
            tabs={CATEGORY_TABS}
            activeValue={controller.categoryId}
            onSelect={selectCategory}
            compact
            variant="bare"
          />
        </Box>
      ) : null}

      <QueryBar
        width={width}
        search={{
          value: controller.searchQuery,
          onChange: controller.actions.setSearchQuery,
          placeholder: "search markets",
          focused,
          active: controller.searchFocused,
          onActiveChange: (active) =>
            active ? controller.actions.focusSearch() : controller.actions.blurSearch(),
          inputRef: controller.searchInputRef,
          debounceMs: 0,
        }}
        filters={
          // A pane locked to one venue in its settings has no venue choice.
          controller.paneSettings.hideTabs
            ? []
            : [{
                id: "venue",
                label: "Venue",
                value: controller.effectiveVenueScope,
                defaultValue: "all",
                options: VENUE_OPTIONS,
                onChange: (value: PredictionVenueScope) => controller.actions.setVenue(value),
              }]
        }
        view={{
          value: controller.browseTab,
          options: BROWSE_VIEW_OPTIONS,
          onChange: (value: PredictionBrowseTab) => controller.actions.selectBrowseTab(value),
        }}
      />
    </>
  );

  const renderCell = useCallback((
    row: PredictionListRow,
    column: PredictionColumnDef,
  ) => {
    const watchlisted = watchlistedRowKeys.has(row.key);
    const value = cellCacheRef.current.get(
      `${row.key}:${column.id}`,
      predictionCellVersion(row, column, watchlisted, relativeTimeBucket),
      () => getPredictionColumnValue(column, row, watchlisted),
    );
    if (column.id === "watch") {
      return {
        text: value.text,
        color: value.color,
        onMouseDown: (event: any) => {
          event.preventDefault();
          event.stopPropagation?.();
          controller.actions.toggleWatchlist(row);
        },
      };
    }
    return {
      text: value.text,
      color: value.color,
    };
  }, [
    controller.actions.toggleWatchlist,
    relativeTimeBucket,
    watchlistedRowKeys,
  ]);

  const onCatalogScroll = useTableLoadMore(
    controller.scrollRef,
    controller.catalogHasMore && !controller.catalogLoadingMore && !controller.detailOpen,
    () => { void controller.actions.loadMoreCatalog(); },
  );

  const handleRootKeyDown = useCallback((
    event: DataTableKeyEvent,
    context: DataTableRootKeyContext,
  ) => {
    if (context.selectedIndex <= 0 && isPlainArrowUp(event)) {
      stopSearchFocusNavigation(event);
      controller.actions.focusSearch();
      return true;
    }
    return false;
  }, [controller.actions.focusSearch]);

  const detailContent =
    controller.selectedSummary && controller.selectedRow ? (
      // No inset here: the desktop query bar and stat band run edge to edge and
      // the detail pads its own body. Only the terminal counts the Back row.
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        flexBasis={0}
        minHeight={0}
        width={width}
        height={nativePaneChrome ? undefined : Math.max(height - 1, 1)}
        overflow="hidden"
        backgroundColor={colors.panel}
      >
        <PredictionMarketDetailPane
          detail={controller.detail}
          detailLoadCount={controller.detailLoadCount}
          detailTab={controller.detailTab}
          focused={focused && controller.detailOpen}
          height={Math.max(height - 1, 1)}
          historyRange={controller.historyRange}
          onDetailTabChange={controller.actions.setDetailTab}
          onHistoryRangeChange={controller.actions.setHistoryRange}
          onSelectMarket={controller.actions.selectMarket}
          scrollRef={controller.detailScrollRef}
          selectedRow={controller.selectedRow}
          selectedSummary={controller.selectedSummary}
          width={width}
        />
      </Box>
    ) : (
      <Box flexGrow={1} backgroundColor={colors.panel} />
    );

  return (
    <DataTableStackView<PredictionListRow, PredictionColumnDef>
      focused={focused}
      keyboardNavigation={!controller.searchFocused}
      detailOpen={controller.detailOpen && !!controller.selectedSummary}
      onBack={controller.actions.closeDetail}
      detailContent={detailContent}
      detailTitle={detailTitle}
      rootBefore={browseControls}
      rootWidth={width}
      rootHeight={height}
      rootBackgroundColor={colors.panel}
      selection={{
        kind: "id",
        selectedId: controller.selectedRow?.key ?? null,
        getId: (row) => row.key,
        onChange: (key, _row, _index, reason) =>
          controller.actions.setBrowseSelection(key, {
            debounceDetail: reason === "keyboard",
          }),
      }}
      onActivate={(row) =>
        controller.actions.openSelectedRow(row.key)}
      onRootKeyDown={handleRootKeyDown}
      columns={controller.visibleColumns}
      items={controller.visibleRows}
      sortColumnId={controller.sortPreference.columnId}
      sortDirection={controller.sortPreference.direction}
      onHeaderClick={controller.actions.handleSortHeaderClick}
      headerScrollRef={controller.headerScrollRef}
      scrollRef={controller.scrollRef}
      getItemKey={(row) => row.key}
      virtualize
      onBodyScrollActivity={onCatalogScroll}
      renderCell={renderCell}
      emptyContent={
        rowsLoading ? (
          <Box width="100%" paddingX={1} paddingY={1}>
            <Spinner
              label={
                controller.searchQuery.trim().length > 0
                  ? "Searching markets..."
                  : "Loading markets..."
              }
            />
          </Box>
        ) : undefined
      }
      emptyStateTitle={catalogError ? "Markets unavailable." : "No markets matched."}
      emptyStateHint={catalogError ? undefined : "Change the venue, category, view, or search."}
    />
  );
}

import {
  Button,
  EmptyState,
  QueryBar,
  StatGrid,
  Tabs,
  type QueryBarFilter,
  type StatItem,
} from "gloomberb/components";
import { useShortcut } from "gloomberb/react";
import { Box, ScrollBox, Text, useUiCapabilities } from "gloomberb/ui";
import { type ScrollBoxRenderable } from "gloomberb/ui";
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { colors } from "gloomberb/theme";
import { isPlainKey } from "gloomberb/utils";
import { PREDICTION_HISTORY_RANGE_OPTIONS, PredictionChartChromeContext } from "../chart";
import { DETAIL_TABS } from "../navigation";
import {
  formatPredictionEndsAt,
  formatPredictionMetric,
  formatPredictionProbability,
  formatPredictionSpread,
  getPredictionProbabilityColor,
} from "../metrics";
import type {
  PredictionDetailTab,
  PredictionHistoryRange,
  PredictionListRow,
  PredictionMarketDetail,
  PredictionMarketSummary,
} from "../types";
import { matchSettlement } from "../settlement";
import { PredictionMarketBookView } from "./book";
import { PredictionMarketOverviewView } from "./overview";
import { PredictionMarketRulesView } from "./rules";
import { truncatePredictionText } from "./shared";
import { PredictionMarketTradesView } from "./trades";

function detailHasBookLevels(detail: PredictionMarketDetail | null): boolean {
  if (!detail) return false;
  const { yesBids, yesAsks, noBids, noAsks } = detail.book;
  return (
    yesBids.length > 0 ||
    yesAsks.length > 0 ||
    noBids.length > 0 ||
    noAsks.length > 0
  );
}

/**
 * The detail's switches on the desktop, where the stack's Back and title join
 * the query bar. h/l and the arrows still move between the detail tabs, as the
 * terminal's tab row does.
 */
function PredictionDetailQueryBar({
  detailTab,
  filters,
  focused,
  meta,
  onDetailTabChange,
  tabs,
  width,
}: {
  detailTab: PredictionDetailTab;
  filters: QueryBarFilter[];
  focused: boolean;
  meta?: string;
  onDetailTabChange: (tab: PredictionDetailTab) => void;
  tabs: ReadonlyArray<{ label: string; value: PredictionDetailTab }>;
  width: number;
}) {
  useShortcut((event) => {
    if (event.targetEditable) return;
    const direction = isPlainKey(event, "h", "left")
      ? -1
      : isPlainKey(event, "l", "right")
        ? 1
        : 0;
    if (direction === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const index = tabs.findIndex((tab) => tab.value === detailTab);
    const next = tabs[
      Math.max(0, Math.min(index + direction, tabs.length - 1))
    ];
    if (next && next.value !== detailTab) onDetailTabChange(next.value);
  }, { enabled: focused });

  // The stack only joins a bar it finds inside its detail frame, and that frame
  // mounts in the same commit as this bar. Mounting one layout pass later, still
  // before paint, lets the bar find it instead of adding a second header row.
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <QueryBar
      width={width}
      filters={filters}
      view={{
        value: detailTab,
        options: tabs.map((tab) => ({ label: tab.label, value: tab.value })),
        onChange: (value: PredictionDetailTab) => onDetailTabChange(value),
      }}
      meta={meta}
    />
  );
}

export function PredictionMarketDetailPane({
  detail,
  detailLoadCount,
  detailTab,
  eventMarkets,
  focused,
  height,
  historyRange,
  onDetailTabChange,
  onHistoryRangeChange,
  onSelectMarket,
  selectedRow,
  selectedSummary,
  scrollRef,
  width,
  detailError = null,
}: {
  detail: PredictionMarketDetail | null;
  detailLoadCount: number;
  detailTab: PredictionDetailTab;
  eventMarkets?: PredictionMarketSummary[];
  focused: boolean;
  height: number;
  historyRange: PredictionHistoryRange;
  onDetailTabChange: (tab: PredictionDetailTab) => void;
  onHistoryRangeChange: (range: PredictionHistoryRange) => void;
  onSelectMarket: (marketKey: string) => void;
  selectedRow: PredictionListRow | null;
  selectedSummary: PredictionMarketSummary | null;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  /** The whole detail width; the body insets one cell each side. */
  width: number;
  detailError?: string | null;
}) {
  const { nativePaneChrome } = useUiCapabilities();
  const [rangeActive, setRangeActive] = useState(false);
  const detailFailed = !detail && (detailError?.trim().length ?? 0) > 0;
  const detailPending = !detail && !detailFailed;
  const hasBookForTabs = selectedSummary?.venue === "polymarket" || selectedSummary?.venue === "kalshi";
  const detailTabsForChrome = DETAIL_TABS.filter((tab) =>
    hasBookForTabs || (tab.value !== "book" && tab.value !== "trades"));
  const activeTabForChrome = selectedSummary && detailTabsForChrome.some((tab) => tab.value === detailTab)
    ? detailTab
    : "overview";
  const rangeKeys = rangeActive && activeTabForChrome === "overview" && !nativePaneChrome;
  useEffect(() => {
    if (!rangeKeys && rangeActive) setRangeActive(false);
  }, [rangeActive, rangeKeys]);
  const chartChrome = useMemo(() => ({
    rangeActive: rangeKeys,
    setRangeActive,
    loading: detailPending,
    failed: detailFailed,
  }), [detailFailed, detailPending, rangeKeys]);

  if (!selectedSummary) {
    return (
      <Box flexGrow={1} justifyContent="center">
        <EmptyState
          title="Select a market."
          hint="Use the table on the left to inspect live prediction market detail."
        />
      </Box>
    );
  }

  const detailWidth = Math.max(width - 2, 24);
  const summaryMetrics = detail?.summary ?? selectedSummary;
  const settlement = matchSettlement({
    seriesTicker: summaryMetrics.seriesTicker,
    eventTicker: summaryMetrics.eventTicker,
    title: summaryMetrics.title,
    resolutionSource: summaryMetrics.resolutionSource,
    category: summaryMetrics.category,
  });
  let detailSubtitle = "";
  if (selectedRow?.kind === "group") {
    detailSubtitle = summaryMetrics.category ?? "";
  } else if (
    summaryMetrics.eventLabel &&
    summaryMetrics.eventLabel !== summaryMetrics.title
  ) {
    detailSubtitle = summaryMetrics.eventLabel;
  } else {
    detailSubtitle = summaryMetrics.category ?? "";
  }
  const stats: StatItem[] = [
    {
      id: "yes",
      label: "Yes",
      value: formatPredictionProbability(summaryMetrics.yesPrice),
      color: getPredictionProbabilityColor(summaryMetrics.yesPrice),
    },
    {
      id: "no",
      label: "No",
      value: formatPredictionProbability(summaryMetrics.noPrice),
      color: getPredictionProbabilityColor(summaryMetrics.noPrice),
    },
    {
      id: "volume-24h",
      label: "24h vol",
      value: formatPredictionMetric(
        summaryMetrics.volume24h,
        summaryMetrics.volume24hUnit ?? "usd",
      ),
    },
    {
      id: "volume-total",
      label: "Volume",
      value: formatPredictionMetric(
        summaryMetrics.totalVolume,
        summaryMetrics.totalVolumeUnit ?? "usd",
      ),
    },
    {
      id: "open-interest",
      label: "OI",
      value: formatPredictionMetric(
        summaryMetrics.openInterest,
        summaryMetrics.openInterestUnit ?? "usd",
      ),
    },
    {
      id: "spread",
      label: "Spread",
      value: formatPredictionSpread(summaryMetrics.spread),
    },
    {
      id: "last",
      label: "Last",
      value: formatPredictionProbability(summaryMetrics.lastTradePrice),
    },
    {
      id: "ends",
      label: "Ends",
      value: formatPredictionEndsAt(
        selectedRow?.kind === "group" ? selectedRow.endsAt : summaryMetrics.endsAt,
      ),
    },
  ];
  const hasBook = selectedSummary.venue === "polymarket" || selectedSummary.venue === "kalshi";
  const detailTabs = DETAIL_TABS.filter((tab) =>
    hasBook || (tab.value !== "book" && tab.value !== "trades"));
  const activeTab = detailTabs.some((tab) => tab.value === detailTab) ? detailTab : "overview";
  // One contract still uses detail.siblings. Several are already on the event.
  const catalogOutcomes = eventMarkets && eventMarkets.length > 1 ? eventMarkets : null;
  const networkSiblings = selectedRow?.kind === "group"
    ? []
    : (detail?.siblings?.filter((sibling) => sibling.key !== selectedSummary.key) ?? []);
  const siblings = catalogOutcomes
    ? catalogOutcomes
        .filter((market) => market.key !== selectedSummary.key)
        .map((market) => ({
          key: market.key,
          label: market.marketLabel,
          yesPrice: market.yesPrice,
        }))
    : networkSiblings;
  // The terminal row only has room for a few; the desktop menu lists them all.
  const relatedSiblings = siblings.slice(
    0,
    Math.max(Math.min(Math.floor((detailWidth - 10) / 18), 3), 0),
  );
  const barFilters: QueryBarFilter[] = [];
  if (siblings.length > 0) {
    barFilters.push({
      id: "market",
      label: "Market",
      value: selectedSummary.key,
      options: [
        {
          value: selectedSummary.key,
          label: `${summaryMetrics.marketLabel} ${formatPredictionProbability(summaryMetrics.yesPrice)}`,
        },
        ...siblings.map((sibling) => ({
          value: sibling.key,
          label: `${sibling.label} ${formatPredictionProbability(sibling.yesPrice)}`,
        })),
      ],
      onChange: (marketKey: string) => onSelectMarket(marketKey),
    });
  }
  // On the desktop the chart range sits in the bar, beside the tab it changes.
  if (activeTab === "overview" && hasBook) {
    barFilters.push({
      id: "range",
      label: "Range",
      inline: true,
      value: historyRange,
      options: PREDICTION_HISTORY_RANGE_OPTIONS,
      onChange: (range: PredictionHistoryRange) => onHistoryRangeChange(range),
    });
  }
  const detailLoading = detailLoadCount > 0 && !detail;
  const bookLoading = detailLoadCount > 0 && !detailHasBookLevels(detail);
  const detailTextWidth = Math.max(detailWidth, 12);

  return (
    <PredictionChartChromeContext.Provider value={chartChrome}>
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      flexBasis={0}
      minHeight={0}
      overflow="hidden"
    >
      {nativePaneChrome ? (
        <PredictionDetailQueryBar
          detailTab={activeTab}
          filters={barFilters}
          focused={focused}
          meta={detailSubtitle || undefined}
          onDetailTabChange={onDetailTabChange}
          tabs={detailTabs}
          width={width}
        />
      ) : detailSubtitle ? (
        <Box flexDirection="column" height={2} paddingX={1} paddingBottom={1}>
          <Box flexDirection="row" height={1}>
            <Text fg={colors.textDim}>
              {truncatePredictionText(detailSubtitle, detailTextWidth)}
            </Text>
          </Box>
        </Box>
      ) : null}

      <Box flexDirection="column" flexShrink={0} paddingBottom={nativePaneChrome ? 0 : 1}>
        <StatGrid items={stats} width={width} />
      </Box>

      {!nativePaneChrome && relatedSiblings.length > 0 && (
        <Box flexDirection="row" gap={1} height={1} paddingX={1} paddingBottom={1}>
          <Text fg={colors.textDim}>Related:</Text>
          {relatedSiblings.map((sibling) => (
            <Button stopPropagation
              key={sibling.key}
              label={sibling.label}
              displayLabel={`${truncatePredictionText(sibling.label, 10)} ${formatPredictionProbability(sibling.yesPrice)}`}
              variant="ghost"
              compact
              onPress={() => onSelectMarket(sibling.key)}
            />
          ))}
        </Box>
      )}

      {!nativePaneChrome && (
        <Box paddingX={1} paddingBottom={1}>
          <Tabs
            tabs={detailTabs.map((tab) => ({ label: tab.label, value: tab.value }))}
            activeValue={activeTab}
            onSelect={(value) => onDetailTabChange(value as PredictionDetailTab)}
            compact
            focused={focused && !rangeKeys}
          />
        </Box>
      )}

      {/* Text and the chart inset one cell; the book and trades tables bring
          their own cell gutters. */}
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        flexBasis={0}
        minHeight={0}
        paddingX={activeTab === "overview" || activeTab === "rules" ? 1 : 0}
        overflow="hidden"
      >
        {activeTab === "overview" || activeTab === "rules" ? (
          <ScrollBox
            ref={scrollRef}
            flexGrow={1}
            flexShrink={1}
            flexBasis={0}
            paddingTop={nativePaneChrome ? 1 : 0}
            scrollY
          >
            {activeTab === "overview" && (
              <PredictionMarketOverviewView
                detail={detail}
                detailWidth={detailWidth}
                focused={focused}
                height={height}
                historyRange={historyRange}
                loading={detailLoading}
                onHistoryRangeChange={onHistoryRangeChange}
                onSelectMarket={onSelectMarket}
                outcomeMarkets={catalogOutcomes ?? undefined}
                selectedMarketKey={selectedSummary.key}
                selectedRow={selectedRow}
                settlement={settlement}
                showChart={hasBook}
                showRangeTabs={!nativePaneChrome}
                summary={summaryMetrics}
              />
            )}

            {activeTab === "rules" && (
              <PredictionMarketRulesView
                detailWidth={detailTextWidth}
                failed={detailFailed}
                loading={detailPending}
                rules={detail?.rules ?? []}
                settlement={settlement}
              />
            )}
          </ScrollBox>
        ) : null}

        {activeTab === "book" && (
          <Box flexGrow={1} flexShrink={1} flexBasis={0} overflow="hidden">
            {detail ? (
              <PredictionMarketBookView
                detail={detail}
                focused={focused}
                loading={bookLoading}
                width={width}
              />
            ) : (
              <Box flexGrow={1} justifyContent="center">
                <EmptyState
                  title={detailFailed ? "Order book unavailable." : "Loading order book."}
                />
              </Box>
            )}
          </Box>
        )}

        {activeTab === "trades" && (
          <Box flexGrow={1} flexShrink={1} flexBasis={0} overflow="hidden">
            {detail ? (
              <PredictionMarketTradesView
                focused={focused}
                trades={detail.trades}
                width={width}
              />
            ) : (
              <Box flexGrow={1} justifyContent="center">
                <EmptyState
                  title={detailFailed ? "Trades unavailable." : "Loading recent trades."}
                />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
    </PredictionChartChromeContext.Provider>
  );
}

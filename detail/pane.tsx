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
import { useLayoutEffect, useState, type RefObject } from "react";
import { colors } from "gloomberb/theme";
import { isPlainKey } from "gloomberb/utils";
import { PREDICTION_HISTORY_RANGE_OPTIONS } from "../chart";
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
import { PredictionMarketBookView } from "./book";
import { PredictionMarketOverviewView } from "./overview";
import { PredictionMarketRulesView } from "./rules";
import { truncatePredictionText } from "./shared";
import { PredictionMarketTradesView } from "./trades";

const DETAIL_VIEW_OPTIONS = DETAIL_TABS.map((tab) => ({
  label: tab.label,
  value: tab.value,
}));

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
  width,
}: {
  detailTab: PredictionDetailTab;
  filters: QueryBarFilter[];
  focused: boolean;
  meta?: string;
  onDetailTabChange: (tab: PredictionDetailTab) => void;
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
    const index = DETAIL_TABS.findIndex((tab) => tab.value === detailTab);
    const next = DETAIL_TABS[
      Math.max(0, Math.min(index + direction, DETAIL_TABS.length - 1))
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
        options: DETAIL_VIEW_OPTIONS,
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
}: {
  detail: PredictionMarketDetail | null;
  detailLoadCount: number;
  detailTab: PredictionDetailTab;
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
}) {
  const { nativePaneChrome } = useUiCapabilities();

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
  const siblings =
    selectedRow?.kind === "group"
      ? []
      : (detail?.siblings?.filter(
          (sibling) => sibling.key !== selectedSummary.key,
        ) ?? []);
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
  if (detailTab === "overview") {
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
  const detailTextWidth = Math.max(detailWidth, 12);

  return (
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
          detailTab={detailTab}
          filters={barFilters}
          focused={focused}
          meta={detailSubtitle || undefined}
          onDetailTabChange={onDetailTabChange}
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
            tabs={DETAIL_VIEW_OPTIONS}
            activeValue={detailTab}
            onSelect={(value) => onDetailTabChange(value as PredictionDetailTab)}
            compact
            focused={focused}
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
        paddingX={detailTab === "overview" || detailTab === "rules" ? 1 : 0}
        overflow="hidden"
      >
        {detailTab === "overview" || detailTab === "rules" ? (
          <ScrollBox
            ref={scrollRef}
            flexGrow={1}
            flexShrink={1}
            flexBasis={0}
            paddingTop={nativePaneChrome ? 1 : 0}
            scrollY
          >
            {detailTab === "overview" && (
              <PredictionMarketOverviewView
                detail={detail}
                detailWidth={detailWidth}
                focused={focused}
                height={height}
                historyRange={historyRange}
                loading={detailLoading}
                onHistoryRangeChange={onHistoryRangeChange}
                onSelectMarket={onSelectMarket}
                selectedRow={selectedRow}
                showRangeTabs={!nativePaneChrome}
                summary={summaryMetrics}
              />
            )}

            {detailTab === "rules" && (
              <PredictionMarketRulesView
                detailWidth={detailTextWidth}
                rules={detail?.rules ?? []}
              />
            )}
          </ScrollBox>
        ) : null}

        {detailTab === "book" && (
          <Box flexGrow={1} flexShrink={1} flexBasis={0} overflow="hidden">
            {detail ? (
              <PredictionMarketBookView
                detail={detail}
                focused={focused}
                width={width}
              />
            ) : (
              <Box flexGrow={1} justifyContent="center">
                <EmptyState
                  title={detailLoading ? "Loading order book." : "No order book."}
                  hint="This venue did not return current order book depth."
                />
              </Box>
            )}
          </Box>
        )}

        {detailTab === "trades" && (
          <Box flexGrow={1} flexShrink={1} flexBasis={0} overflow="hidden">
            <PredictionMarketTradesView
              focused={focused}
              trades={detail?.trades ?? []}
              width={width}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

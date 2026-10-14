import { Box, Text } from "gloomberb/ui";
import { createContext, useContext, useMemo, type Dispatch, type SetStateAction } from "react";
import { Tabs } from "gloomberb/components";
import {
  CompositeChart,
  pricePointsToResolvedSeries,
} from "gloomberb/components";
import { EmptyState } from "gloomberb/components";
import { useShortcut } from "gloomberb/react";
import { colors } from "gloomberb/theme";
import { formatNumber, formatPercentRaw, isPlainKey, isPlainKeyboardEvent } from "gloomberb/utils";
import type { PricePoint } from "gloomberb/types/financials";
import type { PredictionHistoryPoint, PredictionHistoryRange } from "./types";

export interface PredictionChartChrome {
  rangeActive: boolean;
  setRangeActive: Dispatch<SetStateAction<boolean>>;
  loading: boolean;
  failed: boolean;
}

export const PredictionChartChromeContext = createContext<PredictionChartChrome | null>(null);

const RANGES: PredictionHistoryRange[] = ["1D", "1W", "1M", "ALL"];

function coercePredictionPointDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const next = new Date(value);
    return Number.isFinite(next.getTime()) ? next : null;
  }
  return null;
}

function toPricePoints(points: PredictionHistoryPoint[]): PricePoint[] {
  return points.flatMap((point) => {
    const date = coercePredictionPointDate(point.date);
    if (!date) return [];
    return [{
      date,
      close: point.close,
      open: point.open,
      high: point.high,
      low: point.low,
      volume: point.volume,
    }];
  });
}

export const PREDICTION_HISTORY_RANGE_OPTIONS = RANGES.map((entry) => ({
  label: entry,
  value: entry,
}));

/** Shared Tabs so the range picker keeps keyboard navigation, not just clicks. */
function PredictionRangeTabs({
  activeRange,
  focused,
  onRangeSelect,
}: {
  activeRange: PredictionHistoryRange;
  focused: boolean;
  onRangeSelect: (range: PredictionHistoryRange) => void;
}) {
  return (
    <Tabs
      tabs={PREDICTION_HISTORY_RANGE_OPTIONS}
      activeValue={activeRange}
      onSelect={(value) => onRangeSelect(value as PredictionHistoryRange)}
      compact
      variant="bare"
      focused={focused}
      // Four short ranges never need to scroll, and a scrolling strip takes the
      // whole row and hides the price and move readout beside it.
      scrollable={false}
    />
  );
}

export function PredictionMarketChart({
  history,
  width,
  height,
  loading = false,
  failed = false,
  focused = false,
  range,
  onRangeSelect,
  showRangeTabs = true,
}: {
  history: PredictionHistoryPoint[];
  width: number;
  height: number;
  loading?: boolean;
  failed?: boolean;
  focused?: boolean;
  range: PredictionHistoryRange;
  onRangeSelect: (range: PredictionHistoryRange) => void;
  /** Off where the range is picked in the detail's query bar instead. */
  showRangeTabs?: boolean;
}) {
  const chrome = useContext(PredictionChartChromeContext);
  const pricePoints = useMemo(() => toPricePoints(history), [history]);
  const showLoading = loading || chrome?.loading === true;
  const showFailed = !showLoading && (failed || chrome?.failed === true);
  const rangeFocused = chrome ? chrome.rangeActive : focused;
  useShortcut((event) => {
    if (!chrome || event.targetEditable || event.repeat || !isPlainKeyboardEvent(event)) return;
    if (event.defaultPrevented || event.propagationStopped) return;
    if (chrome.rangeActive) {
      if (!isPlainKey(event, "escape", "up")) return;
      event.preventDefault();
      event.stopPropagation();
      chrome.setRangeActive(false);
      return;
    }
    if (!isPlainKey(event, "return", "enter")) return;
    event.preventDefault();
    event.stopPropagation();
    chrome.setRangeActive(true);
  }, {
    enabled: showRangeTabs && focused && chrome != null,
    phase: "before",
  });

  if (pricePoints.length === 0) {
    return (
      <Box flexDirection="column" height={height}>
        {showRangeTabs && (
          <Box flexDirection="row" height={1}>
            <PredictionRangeTabs
              activeRange={range}
              focused={rangeFocused}
              onRangeSelect={onRangeSelect}
            />
          </Box>
        )}
        <Box flexGrow={1} justifyContent="center">
          {showLoading ? (
            <Text fg={colors.textDim}>Loading chart...</Text>
          ) : showFailed ? (
            <EmptyState title="Chart unavailable." />
          ) : (
            <EmptyState
              title="No chart history."
              hint="This venue did not return price history for the selected market."
            />
          )}
        </Box>
      </Box>
    );
  }

  const first = pricePoints[0] ?? null;
  const last = pricePoints[pricePoints.length - 1] ?? null;
  const delta = first && last ? last.close - first.close : 0;
  const deltaPct = first?.close ? (delta / first.close) * 100 : 0;
  const chartHeight = Math.max(height - 1, 2);
  const priceSeries = pricePointsToResolvedSeries(pricePoints, {
    id: "prediction-price",
    label: "YES price",
    color: delta > 0 ? colors.positive : delta < 0 ? colors.negative : colors.text,
    unit: "USD",
    style: "area",
    axis: "right",
    panelId: "price",
  });

  return (
    <Box flexDirection="column" height={height}>
      <Box flexDirection="row" height={1}>
        {showRangeTabs && (
          <PredictionRangeTabs
            activeRange={range}
            focused={rangeFocused}
            onRangeSelect={onRangeSelect}
          />
        )}
        <Box flexGrow={1} />
        <Text
          fg={
            delta > 0
              ? colors.positive
              : delta < 0
                ? colors.negative
                : colors.text
          }
        >
          {`${formatNumber(last?.close ?? 0, 3)}  ${formatPercentRaw(deltaPct)}`}
        </Text>
      </Box>

      <CompositeChart
        width={width}
        height={chartHeight}
        focused={focused}
        interactive
        navigable={false}
        series={[priceSeries]}
        panels={[{ id: "price" }]}
        axisWidth={8}
        showLegend={false}
      />
    </Box>
  );
}

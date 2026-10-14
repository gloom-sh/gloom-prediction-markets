import { Box, Text } from "gloomberb/ui";
import { SectionHeading } from "gloomberb/components";
import { colors } from "gloomberb/theme";
import { PredictionMarketChart } from "../chart";
import type { SettlementMatch } from "../settlement";
import type {
  PredictionHistoryRange,
  PredictionListRow,
  PredictionMarketDetail,
  PredictionMarketSummary,
} from "../types";
import { PredictionMarketOutcomesView } from "./outcomes";
import { PredictionSettlementBlock } from "./shared";

export function PredictionMarketOverviewView({
  detail,
  detailWidth,
  focused,
  height,
  historyRange,
  loading,
  onHistoryRangeChange,
  onSelectMarket,
  outcomeMarkets,
  selectedMarketKey,
  selectedRow,
  settlement,
  showChart,
  showRangeTabs,
  summary,
}: {
  detail: PredictionMarketDetail | null;
  detailWidth: number;
  focused: boolean;
  height: number;
  historyRange: PredictionHistoryRange;
  loading: boolean;
  onHistoryRangeChange: (range: PredictionHistoryRange) => void;
  onSelectMarket: (marketKey: string) => void;
  outcomeMarkets?: PredictionMarketSummary[];
  selectedMarketKey: string;
  selectedRow: PredictionListRow | null;
  settlement: SettlementMatch | null;
  showChart: boolean;
  showRangeTabs: boolean;
  summary: PredictionMarketSummary;
}) {
  const textWidth = Math.max(detailWidth, 12);

  return (
    <Box flexDirection="column" gap={1}>
      <PredictionMarketOutcomesView
        detailWidth={detailWidth}
        liveMarketKey={summary.key}
        liveYesPrice={summary.yesPrice}
        markets={outcomeMarkets}
        onSelectMarket={onSelectMarket}
        selectedMarketKey={selectedMarketKey}
        selectedRow={selectedRow}
      />
      {showChart && (
        <PredictionMarketChart
          history={detail?.history ?? []}
          width={detailWidth}
          height={Math.max(Math.floor(height * 0.36), 10)}
          loading={loading}
          focused={focused}
          range={historyRange}
          onRangeSelect={onHistoryRangeChange}
          showRangeTabs={showRangeTabs}
        />
      )}
      {/* The venue link is the footer's [o]pen, and the range move is in the
          chart header, so the overview ends with the description. */}
      {settlement && (
        <PredictionSettlementBlock match={settlement} width={textWidth} />
      )}
      {summary.description && (
        <Box flexDirection="column" width={textWidth}>
          <SectionHeading title="Description" />
          <Text fg={colors.text} width={textWidth} wrapMode="word" wrapText>
            {summary.description}
          </Text>
        </Box>
      )}
    </Box>
  );
}

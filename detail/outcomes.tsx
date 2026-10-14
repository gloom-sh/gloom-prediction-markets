import { Box } from "gloomberb/ui";
import { DataTableView, SectionHeading } from "gloomberb/components";
import { colors } from "gloomberb/theme";
import {
  formatPredictionMetric,
  formatPredictionPercent,
  getPredictionProbabilityColor,
} from "../metrics";
import type { PredictionListRow, PredictionMarketSummary } from "../types";
import { displayedOutcomeYesPrice } from "../controller/live-updates";
import { sortPredictionOutcomeMarkets } from "../outcome-order";

export function PredictionMarketOutcomesView({
  detailWidth,
  liveMarketKey,
  liveYesPrice,
  markets,
  onSelectMarket,
  selectedMarketKey,
  selectedRow,
}: {
  detailWidth: number;
  liveMarketKey?: string;
  liveYesPrice?: number | null;
  markets?: PredictionMarketSummary[];
  onSelectMarket: (marketKey: string) => void;
  selectedMarketKey: string;
  selectedRow: PredictionListRow | null;
}) {
  const source =
    markets && markets.length > 1
      ? markets
      : selectedRow?.kind === "group"
        ? selectedRow.markets
        : null;
  if (!source || source.length < 2) return null;

  const sortedOutcomes = sortPredictionOutcomeMarkets(source);
  const labelWidth = Math.max(detailWidth - 22, 12);
  // Header row plus one row per outcome, or room for the empty state. The
  // desktop table frame sizes itself with flex rather than the row count, so it
  // collapses to nothing next to the fixed-height chart in this scrolling
  // column unless a wrapper pins the height it needs.
  const tableHeight = sortedOutcomes.length > 0 ? sortedOutcomes.length + 1 : 4;

  return (
    <Box flexDirection="column">
      <SectionHeading title="Outcomes" />

      <Box flexDirection="column" height={tableHeight}>
        <DataTableView
          columns={[
            { id: "target", label: "TARGET", width: labelWidth, align: "left" },
            { id: "odds", label: "ODDS", width: 7, align: "right" },
            { id: "volume", label: "24H VOL", width: 12, align: "right" },
          ]}
          items={sortedOutcomes}
          getItemKey={(market) => market.key}
          selection={{ kind: "id", selectedId: selectedMarketKey, getId: (market) => market.key, onChange: onSelectMarket }}
          sortColumnId={null}
          sortDirection="desc"
          rootHeight={tableHeight}
          horizontalPadding={0}
          virtualize={false}
          emptyStateTitle="No outcomes"
          renderCell={(market, column) => {
            if (column.id === "target") return { text: market.marketLabel };
            if (column.id === "odds") {
              const yesPrice = displayedOutcomeYesPrice(
                market.key,
                market.yesPrice,
                liveMarketKey == null ? null : { key: liveMarketKey, yesPrice: liveYesPrice ?? null },
              );
              return {
                text: formatPredictionPercent(yesPrice),
                color: getPredictionProbabilityColor(yesPrice) ?? colors.text,
              };
            }
            return { text: formatPredictionMetric(market.volume24h, market.volume24hUnit), color: colors.textDim };
          }}
        />
      </Box>
    </Box>
  );
}

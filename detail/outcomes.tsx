import { Box } from "gloomberb/ui";
import { DataTableView, SectionHeading } from "gloomberb/components";
import { colors } from "gloomberb/theme";
import {
  formatPredictionMetric,
  formatPredictionPercent,
  getPredictionProbabilityColor,
} from "../metrics";
import type { PredictionListRow } from "../types";
import { sortPredictionOutcomeMarkets } from "../outcome-order";

export function PredictionMarketOutcomesView({
  detailWidth,
  onSelectMarket,
  selectedMarketKey,
  selectedRow,
}: {
  detailWidth: number;
  onSelectMarket: (marketKey: string) => void;
  selectedMarketKey: string;
  selectedRow: PredictionListRow;
}) {
  if (selectedRow.kind !== "group") return null;

  const sortedOutcomes = sortPredictionOutcomeMarkets(selectedRow.markets);
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
            if (column.id === "odds") return {
              text: formatPredictionPercent(market.yesPrice),
              color: getPredictionProbabilityColor(market.yesPrice) ?? colors.text,
            };
            return { text: formatPredictionMetric(market.volume24h, market.volume24hUnit), color: colors.textDim };
          }}
        />
      </Box>
    </Box>
  );
}

import { Box, Text } from "gloomberb/ui";
import { colors } from "gloomberb/theme";
import type { SettlementMatch } from "../settlement";
import { PredictionSettlementBlock } from "./shared";

export function PredictionMarketRulesView({
  rules,
  detailWidth,
  loading = false,
  failed = false,
  settlement,
}: {
  rules: string[];
  detailWidth: number;
  loading?: boolean;
  failed?: boolean;
  settlement: SettlementMatch | null;
}) {
  const textWidth = Math.max(detailWidth, 12);
  if (loading) {
    return <Text fg={colors.textDim}>Loading rules.</Text>;
  }
  if (failed) {
    return <Text fg={colors.textDim}>Rules unavailable.</Text>;
  }

  return (
    <Box flexDirection="column" gap={1}>
      {settlement && (
        <PredictionSettlementBlock match={settlement} width={textWidth} />
      )}
      {rules.map((rule, index) => (
        <Box
          key={`${index}:${rule.slice(0, 24)}`}
          flexDirection="column"
          width={textWidth}
        >
          <Text fg={colors.text} width={textWidth} wrapMode="word" wrapText>
            {rule}
          </Text>
        </Box>
      ))}
      {rules.length === 0 && (
        <Text fg={colors.textDim}>No rule text returned by the venue.</Text>
      )}
    </Box>
  );
}

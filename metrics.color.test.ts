import { expect, test } from "bun:test";
import { colors } from "gloomberb/theme";
import { getPredictionProbabilityColor } from "./metrics";

test("odds from 45% through 55% stay uncolored", () => {
  expect(getPredictionProbabilityColor(0.44)).toBe(colors.negative);
  expect(getPredictionProbabilityColor(0.45)).toBeUndefined();
  expect(getPredictionProbabilityColor(0.5)).toBeUndefined();
  expect(getPredictionProbabilityColor(0.55)).toBeUndefined();
  expect(getPredictionProbabilityColor(0.554)).toBeUndefined();
  expect(getPredictionProbabilityColor(0.56)).toBe(colors.positive);
  expect(getPredictionProbabilityColor(null)).toBeUndefined();
  expect(getPredictionProbabilityColor(Number.NaN)).toBeUndefined();
});

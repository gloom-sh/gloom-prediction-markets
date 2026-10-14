import { describe, expect, test } from "bun:test";
import type { AppConfig } from "gloomberb/types/config";
import {
  buildPredictionMarketsPaneSettingsDef,
  getPredictionMarketsPaneSettings,
} from "./settings";

describe("prediction markets settings", () => {
  test("ignores a saved hide header flag", () => {
    const parsed = getPredictionMarketsPaneSettings({
      hideHeader: true,
      hideTabs: true,
      lockedVenueScope: "kalshi",
    });
    expect(Object.hasOwn(parsed, "hideHeader")).toBe(false);
    expect(parsed.hideTabs).toBe(true);
    expect(parsed.lockedVenueScope).toBe("kalshi");
    const def = buildPredictionMarketsPaneSettingsDef({} as AppConfig, parsed);
    expect(def.fields.some((field) => field.key === "hideHeader" || field.label === "Hide Header")).toBe(false);
    expect(def.values).not.toHaveProperty("hideHeader");
  });
});

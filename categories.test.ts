import { describe, expect, test } from "bun:test";
import {
  categoryForPredictionQuery,
  matchesPredictionCategory,
} from "./categories";

describe("matchesPredictionCategory", () => {
  test("matches keywords of three characters or fewer on token boundaries", () => {
    const market = (title: string) => ({ title, eventLabel: title, category: "" });
    expect(matchesPredictionCategory(market("The Fed holds"), "macro")).toBe(true);
    expect(matchesPredictionCategory(market("Federal budget"), "macro")).toBe(false);
    expect(matchesPredictionCategory(market("War in Europe"), "world")).toBe(true);
    expect(matchesPredictionCategory(market("award show"), "world")).toBe(false);
    expect(matchesPredictionCategory(market("AI models"), "science")).toBe(true);
    expect(matchesPredictionCategory(market("he said nothing"), "science")).toBe(false);
    expect(matchesPredictionCategory(market("Taiwan semiconductors"), "science")).toBe(false);
    expect(matchesPredictionCategory(market("live tv ratings"), "entertainment")).toBe(true);
    expect(matchesPredictionCategory(market("stv bulletin"), "entertainment")).toBe(false);
  });

  test("keeps longer phrases as substrings", () => {
    expect(matchesPredictionCategory({
      title: "A foreign policy debate",
      eventLabel: "",
      category: "",
    }, "world")).toBe(true);
    expect(matchesPredictionCategory({
      title: "Taiwan semiconductors",
      eventLabel: "",
      category: "",
    }, "world")).toBe(true);
  });

  test("a non-empty query searches every category", () => {
    expect(categoryForPredictionQuery("fed", "sports")).toBe("all");
    expect(categoryForPredictionQuery("  ", "sports")).toBe("sports");
    expect(categoryForPredictionQuery("", "macro")).toBe("macro");
  });
});

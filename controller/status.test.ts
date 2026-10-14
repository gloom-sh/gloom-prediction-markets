import { describe, expect, test } from "bun:test";
import { formatPredictionLoadError } from "./status";

describe("formatPredictionLoadError", () => {
  test("strips the request URL and keeps the venue and status", () => {
    const message = formatPredictionLoadError(
      "polymarket",
      "markets",
      new Error("Request failed (503) for https://gamma-api.polymarket.com/events?limit=200"),
    );
    expect(message).toBe("Polymarket markets request failed (503).");
    expect(message).not.toContain("https://");
  });

  test("strips Crypto.com's request URL", () => {
    const message = formatPredictionLoadError(
      "crypto-com",
      "markets",
      new Error("Crypto.com request failed (40001: no book) for https://api.crypto.com/dcm/v1/public/get-events"),
    );
    expect(message).toBe("Crypto.com markets request failed (40001: no book).");
    expect(message).not.toContain("https://");
  });

  test("does not leave a URL in a non-status error", () => {
    const message = formatPredictionLoadError(
      "gemini",
      "market detail",
      new Error("Unexpected response from https://api.gemini.com/v1/prediction-markets/events"),
    );
    expect(message).toBe("Could not load Gemini market detail. Unexpected response from");
    expect(message).not.toContain("https://");
  });
});

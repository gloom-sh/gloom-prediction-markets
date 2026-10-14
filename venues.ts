import type { PredictionVenue, PredictionVenueScope } from "./types";

export const PREDICTION_VENUE_LABELS: Record<PredictionVenue, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  gemini: "Gemini",
  limitless: "Limitless",
  "crypto-com": "Crypto.com",
  "polymarket-us": "Polymarket US",
  pascal: "Pascal",
};

export const PREDICTION_VENUE_ORDER: readonly PredictionVenue[] = [
  "polymarket",
  "kalshi",
  "gemini",
  "limitless",
  "crypto-com",
  "polymarket-us",
  "pascal",
];

/** What "All venues" browses and searches. The other venues are picked one at a
 * time in the Venue menu, and still show up in the watchlist. */
export const PREDICTION_ALL_VENUES: readonly PredictionVenue[] = ["polymarket", "kalshi"];

/** Whether a venue's markets are fetched for a pane set to `scope`. */
export function venueInScope(venue: PredictionVenue, scope: PredictionVenueScope): boolean {
  return scope === "all" ? PREDICTION_ALL_VENUES.includes(venue) : scope === venue;
}

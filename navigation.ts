import type {
  PredictionBrowseTab,
  PredictionDetailTab,
  PredictionVenueScope,
} from "./types";
import { PREDICTION_VENUE_LABELS, PREDICTION_VENUE_ORDER } from "./venues";

export const VENUE_TABS: ReadonlyArray<{
  label: string;
  value: PredictionVenueScope;
}> = [
  { label: "All venues", value: "all" },
  ...PREDICTION_VENUE_ORDER.map((venue) => ({
    label: PREDICTION_VENUE_LABELS[venue],
    value: venue,
  })),
];

export const BROWSE_TABS: ReadonlyArray<{
  label: string;
  value: PredictionBrowseTab;
}> = [
  { label: "Top", value: "top" },
  { label: "Ending", value: "ending" },
  { label: "New", value: "new" },
  { label: "Watchlist", value: "watchlist" },
];

export const DETAIL_TABS: ReadonlyArray<{
  label: string;
  value: PredictionDetailTab;
}> = [
  { label: "Overview", value: "overview" },
  { label: "Book", value: "book" },
  { label: "Trades", value: "trades" },
  { label: "Rules", value: "rules" },
];

export function parsePredictionVenueScope(
  value: string | undefined,
): PredictionVenueScope | null {
  if (value && (value === "all" || value in PREDICTION_VENUE_LABELS)) {
    return value as PredictionVenueScope;
  }
  return null;
}

export function parsePredictionSearchShortcut(query: string): {
  venueScope: PredictionVenueScope;
  searchQuery: string;
} {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("polymarket:")) {
    return {
      venueScope: "polymarket",
      searchQuery: trimmed.slice("polymarket:".length).trim(),
    };
  }
  if (lower.startsWith("kalshi:")) {
    return {
      venueScope: "kalshi",
      searchQuery: trimmed.slice("kalshi:".length).trim(),
    };
  }
  return { venueScope: "all", searchQuery: trimmed };
}

export function getAdjacentPredictionBrowseTab(
  current: PredictionBrowseTab,
  direction: "previous" | "next",
): PredictionBrowseTab {
  const index = BROWSE_TABS.findIndex((tab) => tab.value === current);
  const safeIndex = index >= 0 ? index : 0;
  const offset = direction === "previous" ? -1 : 1;
  const nextIndex = (safeIndex + offset + BROWSE_TABS.length) % BROWSE_TABS.length;
  return BROWSE_TABS[nextIndex]?.value ?? current;
}

export function getAdjacentPredictionVenueScope(
  current: PredictionVenueScope,
  direction: "previous" | "next",
): PredictionVenueScope {
  const currentIndex = VENUE_TABS.findIndex((tab) => tab.value === current);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex =
    direction === "previous"
      ? Math.max(safeIndex - 1, 0)
      : Math.min(safeIndex + 1, VENUE_TABS.length - 1);
  return VENUE_TABS[nextIndex]!.value;
}

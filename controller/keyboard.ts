import { useCallback, useRef, type RefObject } from "react";
import { type ScrollBoxRenderable, useUiCapabilities } from "gloomberb/ui";
import { useShortcut } from "gloomberb/react";
import { isPlainArrowDown, stopSearchFocusNavigation } from "gloomberb/utils";
import { getAdjacentPredictionCategoryId } from "../categories";
import {
  adjacentPredictionQueryTarget,
  predictionArrowDirection,
  predictionTabDirection,
  resolvePredictionKeyboardCommand,
  type PredictionQueryTarget,
} from "../keyboard";
import { getAdjacentPredictionBrowseTab, getAdjacentPredictionVenueScope } from "../navigation";
import type {
  PredictionBrowseTab,
  PredictionCategoryId,
  PredictionDetailTab,
  PredictionListRow,
  PredictionMarketSummary,
  PredictionVenueScope,
} from "../types";

interface PredictionKeyboardEvent {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  super?: boolean;
  alt?: boolean;
  option?: boolean;
  shift?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
  propagationStopped?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

interface UsePredictionControllerKeyboardParams {
  categoryId: PredictionCategoryId;
  detailOpen: boolean;
  detailScrollRef: RefObject<ScrollBoxRenderable | null>;
  detailTab: PredictionDetailTab;
  effectiveVenueScope: PredictionVenueScope;
  focused: boolean;
  hideTabs: boolean;
  searchFocused: boolean;
  selectedRow: PredictionListRow | null;
  selectedSummaryKey: string | null;
  sortedOutcomeMarkets: PredictionMarketSummary[];
  browseTab: PredictionBrowseTab;
  queryTargetRef: RefObject<PredictionQueryTarget | null>;
  blurSearch: () => void;
  focusQueryTarget: (target: PredictionQueryTarget | null) => void;
  focusSearch: () => void;
  openVenueMenu: () => void;
  selectBrowseTab: (tab: PredictionBrowseTab) => void;
  selectCategory: (categoryId: PredictionCategoryId) => void;
  selectMarket: (marketKey: string) => void;
  setVenue: (venueScope: PredictionVenueScope) => void;
  toggleWatchlist: (row: PredictionListRow) => void;
}

export function usePredictionControllerKeyboard({
  categoryId,
  detailOpen,
  detailScrollRef,
  detailTab,
  effectiveVenueScope,
  focused,
  hideTabs,
  searchFocused,
  selectedRow,
  selectedSummaryKey,
  sortedOutcomeMarkets,
  browseTab,
  queryTargetRef,
  blurSearch,
  focusQueryTarget,
  focusSearch,
  openVenueMenu,
  selectBrowseTab,
  selectCategory,
  selectMarket,
  setVenue,
  toggleWatchlist,
}: UsePredictionControllerKeyboardParams) {
  // The desktop view is click buttons, so the pane walks it. The terminal
  // SegmentedControl walks itself while it is focused, and a second handler
  // would step twice.
  const cycleViewArrows = useUiCapabilities().nativePaneChrome === true;
  const categoryRef = useRef(categoryId);
  const venueRef = useRef(effectiveVenueScope);
  const browseRef = useRef(browseTab);
  categoryRef.current = categoryId;
  venueRef.current = effectiveVenueScope;
  browseRef.current = browseTab;

  const moveQueryTarget = useCallback((direction: -1 | 1) => {
    const next = adjacentPredictionQueryTarget(queryTargetRef.current, direction, hideTabs);
    if (next == null) {
      if (queryTargetRef.current != null) focusQueryTarget(null);
      return false;
    }
    focusQueryTarget(next);
    return true;
  }, [focusQueryTarget, hideTabs, queryTargetRef]);

  const handleSearchNavigation = useCallback(
    (event: PredictionKeyboardEvent) => {
      if (!focused || !searchFocused) return;
      if (event.repeat) {
        if (isPlainArrowDown(event) || resolvePredictionKeyboardCommand(event) === "escape") {
          event.stopPropagation?.();
          event.preventDefault?.();
        }
        return;
      }

      if (isPlainArrowDown(event)) {
        stopSearchFocusNavigation(event);
        blurSearch();
        return;
      }

      if (resolvePredictionKeyboardCommand(event) === "escape") {
        event.stopPropagation?.();
        event.preventDefault?.();
        blurSearch();
        return;
      }

      // Tab leaves the field for Venue, then the view. Shift+Tab leaves the
      // field and continues to the previous pane.
      const tab = predictionTabDirection(event);
      if (tab === 1 && queryTargetRef.current === "search" && moveQueryTarget(1)) {
        event.stopPropagation?.();
        event.preventDefault?.();
      } else if (tab === -1 && queryTargetRef.current === "search") {
        focusQueryTarget(null);
      }
    },
    [blurSearch, focusQueryTarget, focused, moveQueryTarget, queryTargetRef, searchFocused],
  );

  const cycleDetailOutcome = useCallback(
    (direction: "previous" | "next") => {
      if (detailTab !== "overview" || sortedOutcomeMarkets.length === 0) {
        return;
      }
      const currentIndex = sortedOutcomeMarkets.findIndex(
        (market) => market.key === selectedSummaryKey,
      );
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        direction === "previous"
          ? Math.max(safeIndex - 1, 0)
          : Math.min(safeIndex + 1, sortedOutcomeMarkets.length - 1);
      const nextMarket = sortedOutcomeMarkets[nextIndex];
      if (nextMarket) {
        selectMarket(nextMarket.key);
      }
    },
    [detailTab, selectMarket, selectedSummaryKey, sortedOutcomeMarkets],
  );

  const scrollDetailBy = useCallback((delta: number) => {
    const scrollBox = detailScrollRef.current;
    if (!scrollBox) return;
    const maxScrollTop = Math.max(
      0,
      scrollBox.scrollHeight - (scrollBox.viewport?.height ?? 0),
    );
    scrollBox.scrollTop = Math.max(
      0,
      Math.min(maxScrollTop, scrollBox.scrollTop + delta),
    );
  }, [detailScrollRef]);

  const handleKeyboard = useCallback(
    (event: PredictionKeyboardEvent) => {
      if (event.defaultPrevented || event.propagationStopped) return;
      if (!focused) return;
      const command = resolvePredictionKeyboardCommand(event);

      if (searchFocused) {
        return;
      }

      if (detailOpen) {
        if (detailTab === "overview" && sortedOutcomeMarkets.length > 0) {
          if (command === "move-down" || command === "move-up") {
            event.stopPropagation?.();
            event.preventDefault?.();
            cycleDetailOutcome(command === "move-down" ? "next" : "previous");
          }
          return;
        }

        if (
          (detailTab === "overview" || detailTab === "rules")
          && (command === "move-down" || command === "move-up")
        ) {
          event.stopPropagation?.();
          event.preventDefault?.();
          scrollDetailBy(command === "move-down" ? 1 : -1);
        }
        return;
      }

      const tab = predictionTabDirection(event);
      if (tab && moveQueryTarget(tab)) {
        event.stopPropagation?.();
        event.preventDefault?.();
        return;
      }

      const queryTarget = queryTargetRef.current;
      if (queryTarget === "venue" || queryTarget === "view") {
        if (command === "escape" || command === "move-down") {
          event.stopPropagation?.();
          event.preventDefault?.();
          focusQueryTarget(null);
          return;
        }
        if (command === "move-up") {
          event.stopPropagation?.();
          event.preventDefault?.();
          focusQueryTarget("search");
          return;
        }
        const name = event.name?.toLowerCase();
        if (name === "enter" || name === "return" || name === "space" || event.sequence === "\r" || event.sequence === " ") {
          event.stopPropagation?.();
          event.preventDefault?.();
          if (queryTarget === "venue") openVenueMenu();
          else focusQueryTarget(null);
          return;
        }
        const arrow = predictionArrowDirection(event);
        if (arrow && queryTarget === "view" && !cycleViewArrows) return;
        if (arrow) {
          event.stopPropagation?.();
          event.preventDefault?.();
          if (queryTarget === "venue") {
            const nextVenue = getAdjacentPredictionVenueScope(venueRef.current, arrow);
            venueRef.current = nextVenue;
            setVenue(nextVenue);
          } else {
            const nextBrowse = getAdjacentPredictionBrowseTab(browseRef.current, arrow);
            browseRef.current = nextBrowse;
            selectBrowseTab(nextBrowse);
          }
          return;
        }
      }

      // Holding Left, Right, h, or l keeps walking. A one-shot such as w or 1-4
      // still runs once.
      if (
        event.repeat
        && command
        && command !== "move-down"
        && command !== "move-up"
        && command !== "previous-category"
        && command !== "next-category"
        && command !== "previous-venue-tab"
        && command !== "next-venue-tab"
      ) {
        event.stopPropagation?.();
        event.preventDefault?.();
        return;
      }

      if (command === "search") {
        event.stopPropagation?.();
        event.preventDefault?.();
        focusSearch();
        return;
      }

      if (!hideTabs && (command === "previous-venue-tab" || command === "next-venue-tab")) {
        event.stopPropagation?.();
        event.preventDefault?.();
        const nextVenue = getAdjacentPredictionVenueScope(
          venueRef.current,
          command === "next-venue-tab" ? "next" : "previous",
        );
        venueRef.current = nextVenue;
        setVenue(nextVenue);
        return;
      }

      if (command === "previous-category" || command === "next-category") {
        event.stopPropagation?.();
        event.preventDefault?.();
        const nextCategory = getAdjacentPredictionCategoryId(
          categoryRef.current,
          command === "next-category" ? "next" : "previous",
        );
        categoryRef.current = nextCategory;
        selectCategory(nextCategory);
        return;
      }

      if (command === "toggle-watchlist" && selectedRow) {
        event.stopPropagation?.();
        event.preventDefault?.();
        toggleWatchlist(selectedRow);
        return;
      }

      if (command === "browse-top") {
        selectBrowseTab("top");
        return;
      }
      if (command === "browse-ending") {
        selectBrowseTab("ending");
        return;
      }
      if (command === "browse-new") {
        selectBrowseTab("new");
        return;
      }
      if (command === "browse-watchlist") {
        selectBrowseTab("watchlist");
      }
    },
    [
      browseRef,
      categoryRef,
      cycleDetailOutcome,
      cycleViewArrows,
      detailOpen,
      detailTab,
      focusQueryTarget,
      focusSearch,
      focused,
      hideTabs,
      moveQueryTarget,
      openVenueMenu,
      queryTargetRef,
      scrollDetailBy,
      searchFocused,
      selectBrowseTab,
      selectCategory,
      selectedRow,
      setVenue,
      sortedOutcomeMarkets.length,
      toggleWatchlist,
      venueRef,
    ],
  );

  useShortcut(handleSearchNavigation, {
    allowEditable: true,
    enabled: focused && searchFocused,
    phase: "before",
  });

  useShortcut(handleKeyboard);
}

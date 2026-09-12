import type { ReactNode } from "react";
import { openPaneForLaunch, seedPaneLaunchSession } from "gloomberb/layout";
import type { AppConfig } from "gloomberb/types/config";
import type { AppSessionSnapshot, CliLaunchRequest, PaneDef } from "gloomberb/types/plugin";
import { PREDICTION_CATEGORY_OPTIONS, type PredictionCategoryId } from "./categories";
import { BROWSE_TABS } from "./navigation";
import type { PredictionBrowseTab, PredictionVenueScope } from "./types";

const PREDICTION_PANE_ID = "prediction-markets";
const PREDICTION_MAIN_INSTANCE_ID = `${PREDICTION_PANE_ID}:main`;

const VENUE_SCOPE_SET = new Set<PredictionVenueScope>([
  "all",
  "polymarket",
  "kalshi",
]);
const CATEGORY_ID_SET = new Set<PredictionCategoryId>(
  PREDICTION_CATEGORY_OPTIONS.map((option) => option.id),
);
const BROWSE_TAB_SET = new Set<PredictionBrowseTab>(
  BROWSE_TABS.map((tab) => tab.value),
);

const PREDICTION_FLOATING_PANE_DEF: PaneDef = {
  id: PREDICTION_PANE_ID,
  name: "Prediction Markets",
  component: () => null as ReactNode,
  defaultPosition: "left",
  defaultMode: "floating",
  defaultFloatingSize: { width: 132, height: 36 },
};

export interface PredictionLaunchIntent {
  venueScope: PredictionVenueScope;
  categoryId: PredictionCategoryId;
  browseTab: PredictionBrowseTab;
  searchQuery: string;
}

function normalizeArg(value: string): string {
  return value.trim().toLowerCase();
}

export function parsePredictionCommandArgs(args: string[]): PredictionLaunchIntent {
  let venueScope: PredictionVenueScope = "all";
  let categoryId: PredictionCategoryId = "all";
  let browseTab: PredictionBrowseTab = "top";
  let venueExplicit = false;
  let categoryExplicit = false;
  let browseExplicit = false;
  const searchTokens: string[] = [];

  for (const arg of args) {
    const normalized = normalizeArg(arg);
    if (!normalized) continue;

    if (!venueExplicit && VENUE_SCOPE_SET.has(normalized as PredictionVenueScope)) {
      venueScope = normalized as PredictionVenueScope;
      venueExplicit = true;
      continue;
    }
    if (!categoryExplicit && CATEGORY_ID_SET.has(normalized as PredictionCategoryId)) {
      categoryId = normalized as PredictionCategoryId;
      categoryExplicit = true;
      continue;
    }
    if (!browseExplicit && BROWSE_TAB_SET.has(normalized as PredictionBrowseTab)) {
      browseTab = normalized as PredictionBrowseTab;
      browseExplicit = true;
      continue;
    }
    searchTokens.push(arg);
  }

  return {
    venueScope,
    categoryId,
    browseTab,
    searchQuery: searchTokens.join(" ").trim(),
  };
}

export function parsePredictionLaunchArgs(
  args: string[],
): PredictionLaunchIntent | null {
  const [command, ...rest] = args;
  if (!command) return null;
  const normalizedCommand = normalizeArg(command);
  if (
    normalizedCommand !== "predictions" &&
    normalizedCommand !== "prediction-markets" &&
    normalizedCommand !== "pm"
  ) {
    return null;
  }

  return parsePredictionCommandArgs(rest);
}

function launchParams(intent: PredictionLaunchIntent): Record<string, string> {
  return {
    scope: intent.venueScope,
    category: intent.categoryId,
    browseTab: intent.browseTab,
    query: intent.searchQuery,
  };
}

export function applyPredictionLaunchIntentToConfig(
  config: AppConfig,
  intent: PredictionLaunchIntent,
  terminalSize: { width: number; height: number },
): { config: AppConfig; paneInstanceId: string } {
  return openPaneForLaunch(config, {
    paneId: PREDICTION_PANE_ID,
    instanceId: PREDICTION_MAIN_INSTANCE_ID,
    paneDef: PREDICTION_FLOATING_PANE_DEF,
    params: launchParams(intent),
    terminalSize,
  });
}

export function applyPredictionLaunchIntentToSessionSnapshot(
  config: AppConfig,
  sessionSnapshot: AppSessionSnapshot | null,
  paneInstanceId: string,
  intent: PredictionLaunchIntent,
): AppSessionSnapshot {
  return seedPaneLaunchSession(config, sessionSnapshot, {
    paneInstanceId,
    pluginId: PREDICTION_PANE_ID,
    pluginState: {
      venueScope: intent.venueScope,
      categoryId: intent.categoryId,
      browseTab: intent.browseTab,
      searchQuery: intent.searchQuery,
      // A launch names what to show, so it cannot inherit the previous
      // session's selection: that row is from another query.
      selectedRowKey: null,
      selectedDetailMarketKey: null,
    },
  });
}

export function createPredictionLaunchRequest(
  intent: PredictionLaunchIntent,
): CliLaunchRequest<{ paneInstanceId: string; intent: PredictionLaunchIntent }> {
  return {
    applyConfig(config, env) {
      const result = applyPredictionLaunchIntentToConfig(config, intent, {
        width: Math.max(env.terminalWidth, 120),
        height: Math.max(env.terminalHeight, 40),
      });
      return {
        config: result.config,
        launchState: {
          paneInstanceId: result.paneInstanceId,
          intent,
        },
      };
    },
    applySessionSnapshot(config, snapshot, launchState) {
      if (!launchState) {
        return applyPredictionLaunchIntentToSessionSnapshot(config, snapshot, PREDICTION_MAIN_INSTANCE_ID, intent);
      }
      return applyPredictionLaunchIntentToSessionSnapshot(
        config,
        snapshot,
        launchState.paneInstanceId,
        launchState.intent,
      );
    },
  };
}

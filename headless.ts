import type {
  HeadlessPaneDefinition,
  HeadlessPaneLoadArgs,
  HeadlessRowsResult,
} from "gloomberb/types/plugin";
import { PREDICTION_CATEGORY_OPTIONS } from "./categories";
import {
  filterPredictionMarkets,
  getDefaultPredictionSort,
  sortPredictionMarkets,
} from "./metrics";
import { parsePredictionSearchShortcut } from "./navigation";
import { buildPredictionListRows } from "./rows";
import { loadKalshiCatalog } from "./services/kalshi/adapter";
import { loadPolymarketCatalog } from "./services/polymarket/adapter";
import { PREDICTION_VENUE_LABELS, venueInScope } from "./venues";
import type {
  PredictionBrowseTab,
  PredictionCategoryId,
  PredictionListRow,
  PredictionMarketSummary,
  PredictionVenueScope,
} from "./types";

const PREDICTION_COLUMNS = [
  { key: "venue", header: "Venue" },
  { key: "title", header: "Market" },
  { key: "target", header: "Target" },
  { key: "yesProbability", header: "Yes", align: "right" as const },
  { key: "spread", header: "Spread", align: "right" as const },
  { key: "volume24h", header: "24h volume", align: "right" as const },
  { key: "openInterest", header: "Open interest", align: "right" as const },
  { key: "endsAt", header: "Ends" },
  { key: "status", header: "Status" },
  { key: "category", header: "Category" },
];

export interface PredictionMarketsHeadlessDependencies {
  loadPolymarket(
    query: string,
    category: PredictionCategoryId,
    limit: number,
  ): Promise<PredictionMarketSummary[]>;
  loadKalshi(
    query: string,
    category: PredictionCategoryId,
    limit: number,
  ): Promise<PredictionMarketSummary[]>;
  now(): Date;
}

const defaultDependencies: PredictionMarketsHeadlessDependencies = {
  loadPolymarket: (query, category, limit) => loadPolymarketCatalog(
    query,
    category,
    { limit },
  ),
  loadKalshi: (query, category, limit) => loadKalshiCatalog(
    query,
    category,
    { limit },
  ),
  now: () => new Date(),
};

interface PredictionSelection {
  query: string;
  venue: PredictionVenueScope;
  category: PredictionCategoryId;
  tab: PredictionBrowseTab;
  limit: number;
  /** List markets whose prices have not refreshed in a day, which the report otherwise leaves out. */
  stale: boolean;
}

/** Prices a venue last refreshed longer ago than this are not the market's current odds. */
const STALE_AFTER_MS = 24 * 60 * 60_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The latest time the venue refreshed any of the row's markets, where it says; null when they are read live. */
function rowRefreshedAt(row: PredictionListRow): string | null {
  let latest: { at: string; time: number } | null = null;
  for (const market of row.markets) {
    const time = market.refreshedAt ? Date.parse(market.refreshedAt) : Number.NaN;
    if (Number.isFinite(time) && (!latest || time > latest.time)) latest = { at: market.refreshedAt!, time };
  }
  return latest?.at ?? null;
}

/** When the row's prices stopped refreshing, if that was more than a day before `now`. */
function staleSince(row: PredictionListRow, now: Date): string | null {
  const refreshedAt = rowRefreshedAt(row);
  return refreshedAt && now.getTime() - Date.parse(refreshedAt) > STALE_AFTER_MS ? refreshedAt : null;
}

/** `28 Sep 2026`, in UTC. */
function utcDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function selectionFor(args: HeadlessPaneLoadArgs): PredictionSelection {
  const parsed = parsePredictionSearchShortcut(
    typeof args.argument === "string" ? args.argument : "",
  );
  const optionVenue = String(args.options.venue ?? "all") as PredictionVenueScope;
  return {
    query: parsed.searchQuery,
    venue: optionVenue === "all" ? parsed.venueScope : optionVenue,
    category: String(args.options.category ?? "all") as PredictionCategoryId,
    tab: String(args.options.tab ?? "top") as PredictionBrowseTab,
    limit: Number(args.options.limit ?? 50),
    stale: args.options.stale === true,
  };
}

function rowForHeadless(row: PredictionListRow, now: Date) {
  const focusMarket = row.markets.find((market) => market.key === row.focusMarketKey)
    ?? row.representative;
  const stale = staleSince(row, now);
  return {
    key: row.key,
    kind: row.kind,
    venue: row.venue,
    title: row.title,
    target: row.focusMarketLabel,
    yesProbability: row.focusYesPrice,
    noProbability: focusMarket.noPrice,
    targetMarketId: focusMarket.marketId,
    marketId: row.marketId,
    event: row.eventLabel,
    category: row.category ?? null,
    tags: row.tags ?? [],
    // A market whose odds the venue stopped refreshing is not open trading at them: the row says since when.
    status: stale ? `not refreshed since ${utcDay(stale)}` : row.status,
    url: row.url,
    description: row.description,
    endsAt: row.endsAt,
    // When the venue refreshed these prices; none when they were read live with the request.
    updatedAt: rowRefreshedAt(row),
    spread: row.spread,
    lastTradePrice: row.lastTradePrice,
    volume24h: row.volume24h,
    volume24hUnit: row.volume24hUnit,
    totalVolume: row.totalVolume,
    totalVolumeUnit: row.totalVolumeUnit,
    openInterest: row.openInterest,
    openInterestUnit: row.openInterestUnit,
    liquidity: row.liquidity,
    liquidityUnit: row.liquidityUnit,
    marketCount: row.kind === "group" ? row.marketCount : 1,
    yesProbabilityLow: row.kind === "group" ? row.yesPriceLow : row.yesPrice,
    yesProbabilityHigh: row.kind === "group" ? row.yesPriceHigh : row.yesPrice,
  };
}

export function projectPredictionMarketsHeadless(
  markets: PredictionMarketSummary[],
  errors: string[],
  args: HeadlessPaneLoadArgs,
  now: Date,
): HeadlessRowsResult {
  const selection = selectionFor(args);
  const listed = sortPredictionMarkets(
    filterPredictionMarkets(
      buildPredictionListRows(markets),
      selection.tab,
      selection.venue,
      selection.category,
      selection.query,
      new Set(),
    ),
    getDefaultPredictionSort(selection.tab),
  );
  // Markets the venue stopped refreshing a day ago or more are left out of the open markets unless asked for.
  const rows = selection.stale ? listed : listed.filter((row) => staleSince(row, now) == null);
  const leftOut = listed.length - rows.length;
  const selectedRows = rows.slice(0, selection.limit).map((row) => rowForHeadless(row, now));
  const venues = [...new Set(markets.map((market) => PREDICTION_VENUE_LABELS[market.venue] ?? market.venue))];

  return {
    columns: PREDICTION_COLUMNS,
    rows: selectedRows,
    errors: errors.length > 0 ? errors : undefined,
    ...(leftOut > 0 ? { notes: [`${leftOut} ${leftOut === 1 ? "market" : "markets"} not refreshed in a day ${leftOut === 1 ? "is" : "are"} left out; --stale lists ${leftOut === 1 ? "it" : "them"}.`] } : {}),
    // Read from the venues themselves, not through Gloom Cloud.
    ...(venues.length > 0 ? { freshness: { source: venues.join(" and ") } } : {}),
    metadata: {
      staleLeftOut: leftOut,
      fetchedAt: now.toISOString(),
      query: selection.query || null,
      venue: selection.venue,
      category: selection.category,
      tab: selection.tab,
      sourceMarkets: markets.length,
      total: rows.length,
      returned: selectedRows.length,
      truncated: selectedRows.length < rows.length,
    },
  };
}

export function createPredictionMarketsHeadless(
  dependencies: PredictionMarketsHeadlessDependencies = defaultDependencies,
): HeadlessPaneDefinition<"rows"> {
  return {
    shape: "rows",
    argument: {
      kind: "free-text",
      placeholder: "query",
      description: "Optional market query, including polymarket: or kalshi: shorthand.",
      optional: true,
    },
    options: [
      {
        key: "venue",
        description: "Prediction venue to include.",
        type: "enum",
        values: [
          { value: "all" },
          { value: "polymarket" },
          { value: "kalshi" },
        ],
        defaultValue: "all",
      },
      {
        key: "category",
        description: "Market category to include.",
        type: "enum",
        values: PREDICTION_CATEGORY_OPTIONS.map((option) => ({ value: option.id })),
        defaultValue: "all",
        // Also seeds the rendered pane, so `gloomberb shot PM --category macro`
        // opens on that category rather than filtering only the report rows.
        pluginState: { pluginId: "prediction-markets", key: "categoryId" },
      },
      {
        key: "tab",
        description: "Browse ordering to apply.",
        type: "enum",
        values: [
          { value: "top" },
          { value: "ending" },
          { value: "new" },
        ],
        defaultValue: "top",
        pluginState: { pluginId: "prediction-markets", key: "browseTab" },
      },
      {
        key: "limit",
        description: "Maximum market rows to return.",
        type: "integer",
        defaultValue: 50,
        minimum: 1,
        maximum: 200,
      },
      {
        key: "stale",
        description: "Also list markets whose prices the venue has not refreshed in a day, marked with the day they stopped.",
        type: "boolean",
        defaultValue: false,
      },
    ],
    columns: PREDICTION_COLUMNS,
    describe: (args) => {
      const selection = selectionFor(args);
      return selection.query
        ? `Prediction Markets | ${selection.query}`
        : "Prediction Markets";
    },
    async load(args) {
      const selection = selectionFor(args);
      const requested: Array<{
        venue: "polymarket" | "kalshi";
        load: Promise<PredictionMarketSummary[]>;
      }> = [];
      if (venueInScope("polymarket", selection.venue)) {
        requested.push({
          venue: "polymarket",
          load: dependencies.loadPolymarket(selection.query, selection.category, 200),
        });
      }
      if (venueInScope("kalshi", selection.venue)) {
        requested.push({
          venue: "kalshi",
          load: dependencies.loadKalshi(selection.query, selection.category, 200),
        });
      }
      const settled = await Promise.allSettled(requested.map((request) => request.load));
      const markets: PredictionMarketSummary[] = [];
      const errors: string[] = [];
      for (const [index, result] of settled.entries()) {
        if (result.status === "fulfilled") {
          markets.push(...result.value);
        } else {
          const message = result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
          errors.push(`${requested[index]?.venue ?? "venue"}: ${message}`);
        }
      }
      return projectPredictionMarketsHeadless(markets, errors, args, dependencies.now());
    },
  };
}

export const predictionMarketsHeadless = createPredictionMarketsHeadless();

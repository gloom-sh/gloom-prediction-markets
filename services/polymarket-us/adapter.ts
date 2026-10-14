import { buildPredictionCatalogResourceKey } from "../../cache";
import type {
  PredictionCategoryId,
  PredictionMarketSummary,
} from "../../types";
import {
  fetchJson,
  loadSharedPredictionResource,
  PREDICTION_CACHE_POLICIES,
} from "../fetch";
import { filterPolymarketUsCatalog, normalizePolymarketUsCatalog } from "./normalize";
import type { PolymarketUsMarketsResponse } from "./types";

const POLYMARKET_US_PAGE_LIMIT = 100;

function buildPolymarketUsCatalogUrl(): string {
  const url = new URL("https://gateway.polymarket.us/v1/markets");
  url.searchParams.set("limit", String(POLYMARKET_US_PAGE_LIMIT));
  url.searchParams.set("closed", "false");
  return url.toString();
}

export async function loadPolymarketUsCatalog(
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
  options?: { signal?: AbortSignal },
): Promise<PredictionMarketSummary[]> {
  // The request takes no search or category, so one download serves them all.
  const markets = await loadSharedPredictionResource(
    "catalog",
    buildPredictionCatalogResourceKey("polymarket-us", "all", ""),
    async () => {
      const response = await fetchJson<PolymarketUsMarketsResponse>(
        buildPolymarketUsCatalogUrl(),
      );
      return normalizePolymarketUsCatalog(response.markets ?? []);
    },
    PREDICTION_CACHE_POLICIES.catalog,
    options?.signal,
  );
  return filterPolymarketUsCatalog(markets, searchQuery, categoryId);
}

import { buildPredictionCatalogResourceKey } from "../../cache";
import type { PredictionCategoryId, PredictionMarketSummary } from "../../types";
import {
  fetchJson,
  loadSharedPredictionResource,
  PREDICTION_CACHE_POLICIES,
} from "../fetch";
import { filterLimitlessCatalog, normalizeLimitlessCatalog } from "./normalize";
import type {
  LimitlessActiveMarket,
  LimitlessActiveMarketsResponse,
} from "./types";

const LIMITLESS_PAGE_LIMIT = 25;
const LIMITLESS_MAX_PAGES = 4;

function buildLimitlessActiveUrl(page: number): string {
  const url = new URL("https://api.limitless.exchange/markets/active");
  url.searchParams.set("limit", String(LIMITLESS_PAGE_LIMIT));
  url.searchParams.set("page", String(page));
  return url.toString();
}

async function fetchLimitlessActiveMarkets(
  signal?: AbortSignal,
): Promise<LimitlessActiveMarket[]> {
  const markets: LimitlessActiveMarket[] = [];
  let total = Number.POSITIVE_INFINITY;

  for (let page = 1; page <= LIMITLESS_MAX_PAGES; page += 1) {
    const response = await fetchJson<LimitlessActiveMarketsResponse>(
      buildLimitlessActiveUrl(page),
      signal,
    );
    const batch = response.data ?? [];
    markets.push(...batch);
    if (typeof response.totalMarketsCount === "number") {
      total = response.totalMarketsCount;
    }
    if (batch.length < LIMITLESS_PAGE_LIMIT || markets.length >= total) break;
  }

  return markets;
}

export async function loadLimitlessCatalogPage(
  page: number,
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
  signal?: AbortSignal,
): Promise<{ markets: PredictionMarketSummary[]; hasMore: boolean }> {
  const response = await fetchJson<LimitlessActiveMarketsResponse>(
    buildLimitlessActiveUrl(page),
    signal,
  );
  const batch = response.data ?? [];
  const total = response.totalMarketsCount ?? Number.POSITIVE_INFINITY;
  return {
    markets: normalizeLimitlessCatalog(batch, searchQuery, categoryId),
    hasMore: batch.length >= LIMITLESS_PAGE_LIMIT && page * LIMITLESS_PAGE_LIMIT < total,
  };
}

export async function loadLimitlessCatalog(
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
  options?: { signal?: AbortSignal },
): Promise<PredictionMarketSummary[]> {
  // The active list takes no search or category, so one download serves them all.
  const markets = await loadSharedPredictionResource(
    "catalog",
    buildPredictionCatalogResourceKey("limitless", "all", ""),
    async () => normalizeLimitlessCatalog(await fetchLimitlessActiveMarkets()),
    PREDICTION_CACHE_POLICIES.catalog,
    options?.signal,
  );
  return filterLimitlessCatalog(markets, searchQuery, categoryId);
}

import { buildPredictionCatalogResourceKey } from "../../cache";
import type { PredictionCategoryId, PredictionMarketSummary } from "../../types";
import {
  fetchJson,
  loadCachedPredictionResource,
  PREDICTION_CACHE_POLICIES,
} from "../fetch";
import { normalizePascalMarkets, selectPascalBrowse } from "./normalize";
import type { PascalMarket, PascalMarketsEnvelope } from "./types";

const PASCAL_READ = "https://data.pascal.trade";
export const PASCAL_TEXT_SEARCH_LIMIT = 100;

function readMarkets(body: PascalMarketsEnvelope): PascalMarket[] {
  if (Array.isArray(body.data)) return body.data;
  if (body.status === "error") {
    const message = body.data && !Array.isArray(body.data) ? body.data.message?.trim() : "";
    throw new Error(message || "Pascal markets request failed.");
  }
  return [];
}

async function fetchPascalMarkets(signal?: AbortSignal): Promise<PascalMarket[]> {
  const body = await fetchJson<PascalMarketsEnvelope>(`${PASCAL_READ}/api/v1/markets`, signal);
  return readMarkets(body);
}

async function searchPascalMarkets(query: string, signal?: AbortSignal): Promise<PascalMarket[]> {
  const body = await fetchJson<PascalMarketsEnvelope>(
    `${PASCAL_READ}/api/v1/markets/text-search`,
    signal,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.slice(0, 64),
        status: "live",
        order_by: "volume_24h",
        limit: PASCAL_TEXT_SEARCH_LIMIT,
      }),
    },
  );
  return readMarkets(body);
}

export async function loadPascalCatalog(
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
  options?: { signal?: AbortSignal },
): Promise<PredictionMarketSummary[]> {
  const trimmed = searchQuery.trim();
  const normalized = trimmed.toLowerCase();
  // Text search rejects queries shorter than 3 characters.
  if (trimmed.length >= 3) {
    return await loadCachedPredictionResource(
      "catalog",
      buildPredictionCatalogResourceKey("pascal", "all", normalized),
      async () => normalizePascalMarkets(await searchPascalMarkets(trimmed, options?.signal)),
      PREDICTION_CACHE_POLICIES.catalog,
    );
  }
  const markets = await loadCachedPredictionResource(
    "catalog",
    buildPredictionCatalogResourceKey("pascal", "all", ""),
    async () => normalizePascalMarkets(await fetchPascalMarkets(options?.signal)),
    PREDICTION_CACHE_POLICIES.catalog,
  );
  return selectPascalBrowse(markets, categoryId, normalized);
}

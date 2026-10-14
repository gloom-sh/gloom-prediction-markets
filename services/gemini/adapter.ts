import { buildPredictionCatalogResourceKey } from "../../cache";
import type {
  PredictionCategoryId,
  PredictionMarketSummary,
} from "../../types";
import {
  fetchJson,
  loadCachedPredictionResource,
  loadSharedPredictionResource,
  PREDICTION_CACHE_POLICIES,
} from "../fetch";
import { filterGeminiCatalog, normalizeGeminiCatalog } from "./normalize";
import type { GeminiEventRecord, GeminiEventsResponse } from "./types";

const GEMINI_EVENT_LIMIT = 100;
const MAX_GEMINI_EVENT_PAGES = 10;

function buildGeminiCatalogUrl(searchQuery: string, offset: number): string {
  const url = new URL("https://api.gemini.com/v1/prediction-markets/events");
  url.searchParams.set("status", "active");
  url.searchParams.set("limit", String(GEMINI_EVENT_LIMIT));
  url.searchParams.set("offset", String(offset));
  if (searchQuery.length > 0) url.searchParams.set("search", searchQuery);
  return url.toString();
}

function readCount(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function geminiEventIdentity(event: GeminiEventRecord): string {
  return event.id?.trim() || event.ticker?.trim() || event.slug?.trim() || "";
}

async function fetchGeminiEvents(
  searchQuery: string,
  signal?: AbortSignal,
): Promise<GeminiEventRecord[]> {
  const events: GeminiEventRecord[] = [];
  const seenOffsets = new Set<number>();
  const seenIds = new Set<string>();
  let offset = 0;
  for (let page = 0; page < MAX_GEMINI_EVENT_PAGES; page += 1) {
    if (seenOffsets.has(offset)) break;
    seenOffsets.add(offset);
    const response = await fetchJson<GeminiEventsResponse>(
      buildGeminiCatalogUrl(searchQuery, offset),
      signal,
    );
    const data = Array.isArray(response.data) ? response.data : [];
    if (data.length === 0) break;
    let fresh = 0;
    for (const event of data) {
      const id = geminiEventIdentity(event);
      if (id) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      events.push(event);
      fresh += 1;
    }
    if (fresh === 0) break;
    const pageLimit = readCount(response.pagination?.limit) ?? GEMINI_EVENT_LIMIT;
    const pageOffset = readCount(response.pagination?.offset) ?? offset;
    const total = readCount(response.pagination?.total);
    const nextOffset = pageOffset + data.length;
    if (nextOffset <= offset) break;
    if (total != null && nextOffset >= total) break;
    if (data.length < pageLimit) break;
    offset = nextOffset;
  }
  return events;
}

export async function loadGeminiCatalog(
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
  options?: { signal?: AbortSignal },
): Promise<PredictionMarketSummary[]> {
  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  // The API searches but has no category filter: one download per search
  // serves every category tab. A search stops when its query is replaced; the
  // whole-venue list is shared with whoever else is waiting for it.
  const resourceKey = buildPredictionCatalogResourceKey("gemini", "all", normalizedQuery);
  const markets = normalizedQuery
    ? await loadCachedPredictionResource(
        "catalog",
        resourceKey,
        async () => normalizeGeminiCatalog(
          await fetchGeminiEvents(trimmedQuery, options?.signal),
          normalizedQuery,
        ),
        PREDICTION_CACHE_POLICIES.catalog,
      )
    : await loadSharedPredictionResource(
        "catalog",
        resourceKey,
        async () => normalizeGeminiCatalog(await fetchGeminiEvents("")),
        PREDICTION_CACHE_POLICIES.catalog,
        options?.signal,
      );
  return filterGeminiCatalog(markets, normalizedQuery, categoryId);
}

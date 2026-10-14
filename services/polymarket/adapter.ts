import {
  buildPredictionCatalogResourceKey,
} from "../../cache";
import {
  getPolymarketCategoryTagSlugs,
} from "../../categories";
import type {
  PredictionCategoryId,
  PredictionMarketSummary,
} from "../../types";
import {
  fetchJson,
  loadCachedPredictionResource,
  PREDICTION_CACHE_POLICIES,
} from "../fetch";
import {
  normalizePolymarketCatalog,
} from "./normalize";
import type {
  PolymarketEventRecord,
  PolymarketSearchResponse,
} from "./types";

export { normalizePolymarketMarket } from "./normalize";
export { loadPolymarketDetail } from "./detail";

// Gamma sends at most 100 events a page whatever `limit` says, and the busiest events carry up to
// 900 KB of rules text each, so a page of 100 was 9 to 15 MB. The web proxy answers at most 5 MB.
// Ten events a page stays under 3 MB, and the first screens only need the top of the volume order.
const POLYMARKET_PAGE_SIZE = 10;
const POLYMARKET_CATALOG_PAGES = 12;
const POLYMARKET_CATEGORY_PAGES = 4;
const POLYMARKET_MORE_PAGES = 4;

function pageOffsets(pages: number, from = 0): number[] {
  return Array.from({ length: pages }, (_, index) => from + index * POLYMARKET_PAGE_SIZE);
}

const POLYMARKET_CATALOG_OFFSETS = pageOffsets(POLYMARKET_CATALOG_PAGES);
const POLYMARKET_CATEGORY_OFFSETS = pageOffsets(POLYMARKET_CATEGORY_PAGES);
const polymarketNextOffset = new Map<PredictionCategoryId, number>();

interface PolymarketPageBatch {
  events: PolymarketEventRecord[];
  retainedOffsets: number[];
}

function emptyPolymarketPages(): PolymarketPageBatch {
  return { events: [], retainedOffsets: [] };
}

function resumeAfterRetainedPages(
  planned: readonly number[],
  retained: readonly number[],
  pageSize: number,
): number | null {
  if (planned.length === 0 || retained.length === 0) return null;
  const retainedSet = new Set(retained);
  let lastKept = -1;
  for (const offset of planned) {
    if (!retainedSet.has(offset)) break;
    lastKept = offset;
  }
  if (lastKept < 0) return planned[0] ?? null;
  return lastKept + pageSize;
}

function rememberPolymarketResume(
  categoryId: PredictionCategoryId,
  planned: readonly number[],
  batches: readonly PolymarketPageBatch[],
  pageSize: number,
): void {
  const resumes: number[] = [];
  for (const batch of batches) {
    const resume = resumeAfterRetainedPages(planned, batch.retainedOffsets, pageSize);
    if (resume != null) resumes.push(resume);
  }
  if (resumes.length === 0) return;
  polymarketNextOffset.set(categoryId, Math.min(...resumes));
}

export function nextPolymarketCatalogOffset(
  categoryId: PredictionCategoryId,
  searchQuery = "",
): number | null {
  if (searchQuery.trim()) return null;
  const remembered = polymarketNextOffset.get(categoryId);
  if (remembered != null) return remembered;
  const offsets = categoryId === "all" ? POLYMARKET_CATALOG_OFFSETS : POLYMARKET_CATEGORY_OFFSETS;
  return (offsets.at(-1) ?? 0) + POLYMARKET_PAGE_SIZE;
}

function buildPolymarketCatalogUrl(offset: number, tagSlug?: string, limit = POLYMARKET_PAGE_SIZE): string {
  const url = new URL("https://gamma-api.polymarket.com/events");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("order", "volume24hr");
  url.searchParams.set("ascending", "false");
  if (tagSlug) url.searchParams.set("tag_slug", tagSlug);
  return url.toString();
}

function buildPolymarketSearchUrl(query: string, limit = 40): string {
  const url = new URL("https://gamma-api.polymarket.com/public-search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit_per_type", String(limit));
  url.searchParams.set("search_profiles", "false");
  url.searchParams.set("search_tags", "false");
  url.searchParams.set("events_status", "open");
  url.searchParams.set("optimized", "true");
  return url.toString();
}

async function loadPolymarketCatalogPages(
  offsets: number[],
  tagSlug?: string,
  limit = POLYMARKET_PAGE_SIZE,
  signal?: AbortSignal,
): Promise<PolymarketPageBatch> {
  const results = await Promise.allSettled(
    offsets.map((offset) =>
      fetchJson<PolymarketEventRecord[]>(
        buildPolymarketCatalogUrl(offset, tagSlug, limit),
        signal,
      ),
    ),
  );
  const events: PolymarketEventRecord[] = [];
  const retainedOffsets: number[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const offset = offsets[index];
    if (result?.status !== "fulfilled" || offset == null) continue;
    events.push(...result.value);
    retainedOffsets.push(offset);
  }
  if (events.length > 0 || retainedOffsets.length > 0) return { events, retainedOffsets };

  const rejected = results.find((result) => result.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  return emptyPolymarketPages();
}

/** One search request. The search payload is enough for the list. Detail still loads the event. */
export async function loadPolymarketSearchHits(
  searchQuery: string,
  categoryId: PredictionCategoryId,
  limit = 40,
  signal?: AbortSignal,
): Promise<PredictionMarketSummary[]> {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const requestedLimit = Math.max(1, Math.min(40, limit));
  const response = await fetchJson<PolymarketSearchResponse>(
    buildPolymarketSearchUrl(normalizedQuery, requestedLimit),
    signal,
  );
  return normalizePolymarketCatalog(
    (response.events ?? []).slice(0, requestedLimit),
    normalizedQuery,
    categoryId,
  ).slice(0, requestedLimit);
}

export async function loadPolymarketCatalog(
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<PredictionMarketSummary[]> {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const requestedLimit = Math.max(1, Math.min(200, options.limit ?? 200));
  const pageLimit = POLYMARKET_PAGE_SIZE;
  // An explicit limit (the CLI report, the chart composer) reads that many events, as one request used
  // to, but never more than Gamma sends in a page. It is not a browse, so it leaves the resume offset alone.
  const limitedOffsets = pageOffsets(Math.ceil(Math.min(requestedLimit, 100) / POLYMARKET_PAGE_SIZE));
  return await loadCachedPredictionResource(
    "catalog",
    `${buildPredictionCatalogResourceKey("polymarket", categoryId, normalizedQuery)}:${requestedLimit}`,
    async () => {
      if (normalizedQuery.length > 0) {
        return loadPolymarketSearchHits(normalizedQuery, categoryId, requestedLimit, options.signal);
      }

      if (categoryId !== "all") {
        const tagSlugs = getPolymarketCategoryTagSlugs(categoryId);
        const planned = options.limit ? limitedOffsets : POLYMARKET_CATEGORY_OFFSETS;
        const categoryPages = await Promise.all(
          tagSlugs.map((tagSlug) =>
            loadPolymarketCatalogPages(
              planned,
              tagSlug,
              pageLimit,
              options.signal,
            ).catch(() => emptyPolymarketPages()),
          ),
        );
        const categorized = normalizePolymarketCatalog(
          categoryPages.flatMap((page) => page.events),
          "",
          categoryId,
        );
        if (categorized.length > 0) {
          if (!options.limit) rememberPolymarketResume(categoryId, planned, categoryPages, pageLimit);
          return categorized;
        }
      }

      const planned = options.limit ? limitedOffsets : POLYMARKET_CATALOG_OFFSETS;
      const pages = await loadPolymarketCatalogPages(
        planned,
        undefined,
        pageLimit,
        options.signal,
      );
      if (!options.limit) rememberPolymarketResume(categoryId, planned, [pages], pageLimit);
      return normalizePolymarketCatalog(pages.events, "", categoryId);
    },
    PREDICTION_CACHE_POLICIES.catalog,
  );
}

export async function loadMorePolymarketCatalog(
  searchQuery: string,
  categoryId: PredictionCategoryId,
  offset: number,
  signal?: AbortSignal,
): Promise<{ markets: PredictionMarketSummary[]; hasMore: boolean; nextOffset: number }> {
  if (searchQuery.trim()) {
    return { markets: [], hasMore: false, nextOffset: offset };
  }
  const tagSlugs = categoryId === "all" ? [undefined] : getPolymarketCategoryTagSlugs(categoryId);
  const planned = pageOffsets(POLYMARKET_MORE_PAGES, offset);
  const end = offset + planned.length * POLYMARKET_PAGE_SIZE;
  const pages = await Promise.all(
    tagSlugs.map((tagSlug) =>
      loadPolymarketCatalogPages(planned, tagSlug, POLYMARKET_PAGE_SIZE, signal).catch(() => emptyPolymarketPages()),
    ),
  );
  const raw = pages.flatMap((page) => page.events);
  // A page that failed is where the next load starts, so it is retried rather than skipped.
  const resumes = pages.flatMap((page) => {
    const resume = resumeAfterRetainedPages(planned, page.retainedOffsets, POLYMARKET_PAGE_SIZE);
    return resume == null ? [] : [resume];
  });
  const nextOffset = resumes.length > 0 ? Math.min(...resumes) : end;
  return {
    markets: normalizePolymarketCatalog(raw, "", categoryId),
    hasMore: resumes.length > 0 && (
      nextOffset < end || pages.some((page) => page.events.length >= planned.length * POLYMARKET_PAGE_SIZE)
    ),
    nextOffset,
  };
}

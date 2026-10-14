import { buildPredictionCatalogResourceKey } from "../../cache";
import type { PredictionCategoryId, PredictionMarketSummary } from "../../types";
import {
  fetchJson,
  loadSharedPredictionResource,
  PREDICTION_CACHE_POLICIES,
} from "../fetch";
import { filterCryptoComCatalog, normalizeCryptoComCatalog } from "./normalize";
import type {
  CryptoComEvent,
  CryptoComInstrument,
  CryptoComResponse,
  CryptoComTicker,
} from "./types";

const CRYPTO_COM_PUBLIC = "https://api.crypto.com/dcm/v1/public";
const EVENT_LIMIT = 100;
const MAX_EVENT_PAGES = 10;
const EVENT_SYMBOL_BATCH = 10;
const INSTRUMENT_PAGE_LIMIT = 1000;
const MAX_INSTRUMENT_PAGES = 2;
const MAX_INSTRUMENTS = 1000;
const TICKER_BATCH = 50;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function unwrapData<T>(response: CryptoComResponse<T>, url: string): { data: T[]; nextCursor: string | null } {
  if (response.code != null && response.code !== 0) {
    const reason = response.message?.trim();
    throw new Error(`Crypto.com request failed (${response.code}${reason ? `: ${reason}` : ""}) for ${url}`);
  }
  return {
    data: response.result?.data ?? [],
    nextCursor: response.result?.next_cursor?.trim() || null,
  };
}

async function fetchEvents(signal?: AbortSignal): Promise<CryptoComEvent[]> {
  const events: CryptoComEvent[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
    if (cursor) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
    }
    const url = new URL(`${CRYPTO_COM_PUBLIC}/get-events`);
    url.searchParams.set("limit", String(EVENT_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);
    const href = url.toString();
    const response = await fetchJson<CryptoComResponse<CryptoComEvent>>(href, signal);
    const pageResult = unwrapData(response, href);
    events.push(...pageResult.data);
    if (!pageResult.nextCursor || pageResult.data.length === 0) break;
    cursor = pageResult.nextCursor;
  }
  return events;
}

async function fetchInstruments(eventSymbols: string[], signal?: AbortSignal): Promise<CryptoComInstrument[]> {
  const instruments: CryptoComInstrument[] = [];
  for (const batch of chunk(eventSymbols, EVENT_SYMBOL_BATCH)) {
    if (instruments.length >= MAX_INSTRUMENTS) break;
    let cursor: string | null = null;
    for (let page = 0; page < MAX_INSTRUMENT_PAGES; page += 1) {
      const url = new URL(`${CRYPTO_COM_PUBLIC}/get-instruments`);
      url.searchParams.set("event_symbols", batch.join(","));
      url.searchParams.set("limit", String(INSTRUMENT_PAGE_LIMIT));
      if (cursor) url.searchParams.set("cursor", cursor);
      const href = url.toString();
      const response = await fetchJson<CryptoComResponse<CryptoComInstrument>>(href, signal);
      const pageResult = unwrapData(response, href);
      instruments.push(...pageResult.data);
      cursor = pageResult.nextCursor;
      if (!cursor || pageResult.data.length === 0 || instruments.length >= MAX_INSTRUMENTS) break;
    }
  }
  return instruments.slice(0, MAX_INSTRUMENTS);
}

async function fetchTickers(symbols: string[], signal?: AbortSignal): Promise<CryptoComTicker[]> {
  const tickers: CryptoComTicker[] = [];
  const unique = [...new Set(symbols.map((symbol) => symbol.trim()).filter((symbol) => symbol.length > 0))];
  for (const batch of chunk(unique, TICKER_BATCH)) {
    const url = new URL(`${CRYPTO_COM_PUBLIC}/get-tickers`);
    url.searchParams.set("instrument_names", batch.join(","));
    const href = url.toString();
    const response = await fetchJson<CryptoComResponse<CryptoComTicker>>(href, signal);
    tickers.push(...unwrapData(response, href).data);
  }
  return tickers;
}

export async function loadCryptoComCatalog(
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
  options?: { signal?: AbortSignal },
): Promise<PredictionMarketSummary[]> {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  // The API has no search or category filter, so the whole venue is one
  // download (about 70 requests) shared by every tab and search.
  const markets = await loadSharedPredictionResource(
    "catalog",
    buildPredictionCatalogResourceKey("crypto-com", "all", ""),
    async () => {
      const events = await fetchEvents();
      const eventSymbols = events
        .map((event) => event.symbol?.trim())
        .filter((symbol): symbol is string => !!symbol);
      const instruments = eventSymbols.length > 0 ? await fetchInstruments(eventSymbols) : [];
      const instrumentSymbols = instruments
        .map((instrument) => instrument.symbol?.trim())
        .filter((symbol): symbol is string => !!symbol);
      const tickers = instrumentSymbols.length > 0 ? await fetchTickers(instrumentSymbols) : [];
      return normalizeCryptoComCatalog(events, instruments, tickers);
    },
    PREDICTION_CACHE_POLICIES.catalog,
    options?.signal,
  );
  return filterCryptoComCatalog(markets, normalizedQuery, categoryId);
}

import { chunkForUrl, fetchJson } from "../fetch";
import { readKalshiMarketQuote, type KalshiMarketQuote } from "./normalize";
import type { KalshiMarketRecord } from "./types";

const KALSHI_QUOTE_BATCH = 100;
const KALSHI_QUOTE_URL_BASE = `https://api.elections.kalshi.com/trade-api/v2/markets?tickers=&limit=${KALSHI_QUOTE_BATCH}`;

export async function fetchKalshiMarketQuotes(
  tickers: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, KalshiMarketQuote>> {
  const quotes = new Map<string, KalshiMarketQuote>();
  for (const batch of chunkForUrl(tickers, KALSHI_QUOTE_URL_BASE, KALSHI_QUOTE_BATCH)) {
    const url = new URL("https://api.elections.kalshi.com/trade-api/v2/markets");
    url.searchParams.set("tickers", batch.join(","));
    url.searchParams.set("limit", String(batch.length));
    const body = await fetchJson<{ markets?: KalshiMarketRecord[] }>(url.toString(), signal);
    for (const record of body.markets ?? []) {
      const quote = readKalshiMarketQuote(record);
      if (quote) quotes.set(quote.key, quote);
    }
  }
  return quotes;
}

import { matchesPredictionCategory } from "../../categories";
import type { PredictionCategoryId, PredictionMarketSummary } from "../../types";
import { parseFloatSafe } from "../fetch";
import type {
  CryptoComEvent,
  CryptoComInstrument,
  CryptoComTicker,
} from "./types";

const EXCHANGE_URL = "https://crypto.com/exchange";

const CATEGORY_KEYWORDS: Record<Exclude<PredictionCategoryId, "all">, readonly string[]> = {
  politics: ["politics", "elections"],
  world: [
    "world",
    "geopolitics",
    "foreign policy",
    "middle east",
    "global",
    "iran",
    "israel",
    "gaza",
    "ukraine",
    "russia",
    "china",
    "taiwan",
    "war",
    "conflict",
    "ceasefire",
    "military",
    "strike",
  ],
  macro: ["economics", "financials", "companies", "macro", "fed", "inflation", "tariffs", "jobs", "debt"],
  crypto: ["crypto", "bitcoin", "ethereum", "solana", "defi", "altcoin"],
  science: ["science", "technology", "ai"],
  sports: ["sports"],
  entertainment: ["entertainment", "movies", "music", "tv", "celebrity"],
  climate: ["climate", "weather"],
  social: ["social", "health", "education", "transportation"],
};

const TAG_TERMS: Array<{ tag: string; terms: string[] }> = [
  {
    tag: "sports",
    terms: [
      "mlb",
      "nfl",
      "nba",
      "nhl",
      "ncaa",
      "soccer",
      "fifa",
      "ufc",
      "mma",
      "tennis",
      "baseball",
      "football",
      "basketball",
      "hockey",
      "sports",
      "wnba",
      "mls",
      "tten",
      "epl",
    ],
  },
  {
    tag: "crypto",
    terms: ["bitcoin", "btc", "crypto", "crypt", "ethereum", "eth", "solana"],
  },
  {
    tag: "politics",
    terms: ["election", "president", "politics", "elect", "senate", "congress", "midterm"],
  },
  {
    tag: "macro",
    terms: ["fed", "federal", "cpi", "inflation", "unemployment", "jobs", "gdp", "fomc", "macro", "economics"],
  },
];

function metaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = meta?.[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasTerm(haystack: string, term: string): boolean {
  const pattern = new RegExp(`(?:^|[^a-z])${term}(?:[^a-z]|$)`, "i");
  return pattern.test(haystack);
}

export function inferCryptoComTags(parts: Array<string | null | undefined>): string[] {
  const haystack = parts.filter((part): part is string => !!part && part.trim().length > 0).join(" ").toLowerCase();
  return TAG_TERMS.filter((entry) => entry.terms.some((term) => hasTerm(haystack, term))).map((entry) => entry.tag);
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    const closeTime = /^(\d{4})(\d{2})(\d{2})-(\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(trimmed);
    if (closeTime) {
      const ms = Date.parse(`${closeTime[1]}-${closeTime[2]}-${closeTime[3]}T${closeTime[4]}Z`);
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
  }
  const numeric = typeof value === "number" ? value : parseFloatSafe(value);
  if (numeric == null || numeric <= 0) return null;
  const ms = numeric >= 1e17 ? numeric / 1e6 : numeric >= 1e14 ? numeric / 1e3 : numeric;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Probability in 0..1. Tickers quote 0..1; values above 1 are cents. */
function toProbability(value: unknown): number | null {
  const parsed = parseFloatSafe(value);
  if (parsed == null) return null;
  const scaled = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
  if (scaled < 0 || scaled > 1) return null;
  return scaled;
}

function complement(price: number | null): number | null {
  if (price == null) return null;
  return Math.min(1, Math.max(0, 1 - price));
}

function resolveStatus(event: CryptoComEvent, instrument?: CryptoComInstrument): string {
  const text = [
    event.status,
    instrument?.status,
    metaString(event.event_details?.metaData, "STATUS"),
    metaString(event.event_details?.metaData, "STATE"),
    metaString(instrument?.event_details?.metaData, "STATUS"),
    metaString(instrument?.event_details?.metaData, "STATE"),
  ]
    .filter((value): value is string => !!value)
    .join(" ")
    .toLowerCase();
  if (text.includes("settled")) return "settled";
  if (text.includes("closed")) return "closed";
  return "open";
}

function eventName(event: CryptoComEvent): string {
  return (
    event.name?.trim() ||
    metaString(event.event_details?.metaData, "NAME") ||
    event.event_details?.eventName?.trim() ||
    event.symbol?.trim() ||
    "Crypto.com market"
  );
}

function tagParts(event: CryptoComEvent, instrument?: CryptoComInstrument): string[] {
  const eventMeta = event.event_details?.metaData;
  const contractMeta = instrument?.event_details?.metaData;
  return [
    event.symbol,
    ...(event.series_symbols ?? []),
    event.name,
    event.description,
    metaString(eventMeta, "PREDICT_CATEGORY"),
    metaString(eventMeta, "SPORTS_GROUPING"),
    metaString(eventMeta, "LEAGUE"),
    instrument?.symbol,
    instrument?.display_name,
    instrument?.event_details?.eventName,
    metaString(contractMeta, "PARTICIPANT"),
    metaString(contractMeta, "PREDICT_CATEGORY"),
    metaString(contractMeta, "SPORTS_GROUPING"),
    metaString(contractMeta, "LEAGUE"),
    metaString(contractMeta, "PREDICT_CONTRACT_TYPE"),
  ].filter((part): part is string => typeof part === "string");
}

function quoteFromTicker(ticker: CryptoComTicker | undefined): {
  yesPrice: number | null;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  spread: number | null;
  lastTradePrice: number | null;
  volume24h: number | null;
  openInterest: number | null;
  updatedAt: string | null;
} {
  const yesBid = toProbability(ticker?.b);
  const yesAsk = toProbability(ticker?.k);
  const lastTradePrice = toProbability(ticker?.a);
  const midpoint = yesBid != null && yesAsk != null ? (yesBid + yesAsk) / 2 : null;
  const yesPrice = lastTradePrice ?? midpoint ?? yesBid ?? yesAsk;
  return {
    yesPrice,
    yesBid,
    yesAsk,
    noBid: complement(yesAsk),
    noAsk: complement(yesBid),
    spread: yesBid != null && yesAsk != null ? yesAsk - yesBid : null,
    lastTradePrice,
    volume24h: parseFloatSafe(ticker?.vv),
    openInterest: parseFloatSafe(ticker?.oi),
    updatedAt: toIsoTimestamp(ticker?.t),
  };
}

function summaryShell(
  identity: {
    key: string;
    marketId: string;
    title: string;
    marketLabel: string;
    eventLabel: string;
    eventId?: string;
    seriesTicker?: string;
    category?: string;
    tags: string[];
    status: string;
    description: string;
    endsAt: string | null;
    updatedAt: string | null;
  },
  quote: ReturnType<typeof quoteFromTicker>,
): PredictionMarketSummary {
  return {
    key: identity.key,
    venue: "crypto-com",
    marketId: identity.marketId,
    title: identity.title,
    marketLabel: identity.marketLabel,
    eventLabel: identity.eventLabel,
    ...(identity.eventId ? { eventId: identity.eventId } : {}),
    ...(identity.seriesTicker ? { seriesTicker: identity.seriesTicker } : {}),
    ...(identity.category ? { category: identity.category } : {}),
    tags: identity.tags,
    status: identity.status,
    url: EXCHANGE_URL,
    description: identity.description,
    endsAt: identity.endsAt,
    updatedAt: identity.updatedAt ?? quote.updatedAt,
    yesPrice: quote.yesPrice,
    noPrice: complement(quote.yesPrice),
    yesBid: quote.yesBid,
    yesAsk: quote.yesAsk,
    noBid: quote.noBid,
    noAsk: quote.noAsk,
    spread: quote.spread,
    lastTradePrice: quote.lastTradePrice,
    volume24h: quote.volume24h,
    volume24hUnit: "usd",
    totalVolume: null,
    totalVolumeUnit: "usd",
    openInterest: quote.openInterest,
    openInterestUnit: "usd",
    liquidity: null,
    liquidityUnit: "usd",
  };
}

function contractId(instrument: CryptoComInstrument): string | null {
  const symbol = instrument.symbol?.trim();
  if (symbol) return symbol;
  if (instrument.inst_id != null && String(instrument.inst_id).trim()) return String(instrument.inst_id);
  const code = instrument.event_details?.eventCode?.trim();
  return code || null;
}

function normalizeContract(
  event: CryptoComEvent,
  instrument: CryptoComInstrument,
  ticker: CryptoComTicker | undefined,
  multipleContracts: boolean,
): PredictionMarketSummary | null {
  const id = contractId(instrument);
  const eventSymbol = event.symbol?.trim();
  if (!id) return null;
  const name = eventName(event);
  const meta = instrument.event_details?.metaData;
  const marketLabel =
    metaString(meta, "PARTICIPANT") ||
    instrument.event_details?.eventName?.trim() ||
    instrument.display_name?.trim() ||
    name;
  const seriesTicker = event.series_symbols?.find((symbol) => symbol.trim().length > 0)?.trim();
  const category =
    metaString(meta, "PREDICT_CATEGORY") || metaString(event.event_details?.metaData, "PREDICT_CATEGORY");
  const quote = quoteFromTicker(ticker);
  return summaryShell(
    {
      key: `crypto-com:${id}`,
      marketId: id,
      title: name,
      marketLabel,
      eventLabel: name,
      ...(multipleContracts && eventSymbol ? { eventId: eventSymbol } : {}),
      ...(seriesTicker ? { seriesTicker } : {}),
      ...(category ? { category } : {}),
      tags: inferCryptoComTags(tagParts(event, instrument)),
      status: resolveStatus(event, instrument),
      description: event.description?.trim() || instrument.display_name?.trim() || "",
      endsAt:
        toIsoTimestamp(instrument.expiry_timestamp_ms) ??
        toIsoTimestamp(instrument.event_details?.attributes?.CLOSE_TIME) ??
        toIsoTimestamp(event.event_end_date) ??
        toIsoTimestamp(event.event_date),
      updatedAt: toIsoTimestamp(instrument.last_updated_time) ?? quote.updatedAt ?? toIsoTimestamp(event.last_updated_time),
    },
    quote,
  );
}

function normalizeEvent(event: CryptoComEvent): PredictionMarketSummary | null {
  const eventSymbol = event.symbol?.trim();
  if (!eventSymbol) return null;
  const name = eventName(event);
  const seriesTicker = event.series_symbols?.find((symbol) => symbol.trim().length > 0)?.trim();
  const category = metaString(event.event_details?.metaData, "PREDICT_CATEGORY");
  return summaryShell(
    {
      key: `crypto-com:${eventSymbol}`,
      marketId: eventSymbol,
      title: name,
      marketLabel: name,
      eventLabel: name,
      ...(seriesTicker ? { seriesTicker } : {}),
      ...(category ? { category } : {}),
      tags: inferCryptoComTags(tagParts(event)),
      status: resolveStatus(event),
      description: event.description?.trim() || "",
      endsAt: toIsoTimestamp(event.event_end_date) ?? toIsoTimestamp(event.event_date),
      updatedAt: toIsoTimestamp(event.last_updated_time),
    },
    quoteFromTicker(undefined),
  );
}

function matchesCryptoComCategory(
  market: PredictionMarketSummary,
  categoryId: PredictionCategoryId,
): boolean {
  if (categoryId === "all") return true;
  if (!matchesPredictionCategory(market, categoryId)) return false;
  const haystack = [market.category ?? "", ...(market.tags ?? []), market.eventLabel, market.title].join(" ");
  return CATEGORY_KEYWORDS[categoryId].some((keyword) => hasTerm(haystack, keyword));
}

function matchesSearch(market: PredictionMarketSummary, query: string): boolean {
  if (!query) return true;
  return [
    market.title,
    market.marketLabel,
    market.eventLabel,
    market.description,
    market.marketId,
    market.category ?? "",
    ...(market.tags ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function normalizeCryptoComCatalog(
  events: CryptoComEvent[],
  instruments: CryptoComInstrument[],
  tickers: CryptoComTicker[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  const query = searchQuery.trim().toLowerCase();
  const tickersBySymbol = new Map<string, CryptoComTicker>();
  for (const ticker of tickers) {
    const symbol = ticker.i?.trim();
    if (symbol) tickersBySymbol.set(symbol, ticker);
  }
  const instrumentsByEvent = new Map<string, CryptoComInstrument[]>();
  for (const instrument of instruments) {
    const symbol = instrument.underlying_symbol?.trim();
    if (!symbol) continue;
    const group = instrumentsByEvent.get(symbol) ?? [];
    group.push(instrument);
    instrumentsByEvent.set(symbol, group);
  }

  const markets: PredictionMarketSummary[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const eventSymbol = event.symbol?.trim();
    if (!eventSymbol) continue;
    const contracts = instrumentsByEvent.get(eventSymbol) ?? [];
    const rows =
      contracts.length > 0
        ? contracts.map((contract) =>
            normalizeContract(
              event,
              contract,
              tickersBySymbol.get(contract.symbol?.trim() ?? ""),
              contracts.length > 1,
            ),
          )
        : [normalizeEvent(event)];
    for (const market of rows) {
      if (!market || seen.has(market.key)) continue;
      if (!matchesCryptoComCategory(market, categoryId)) continue;
      if (!matchesSearch(market, query)) continue;
      seen.add(market.key);
      markets.push(market);
    }
  }
  return markets;
}

/** Narrows a catalog normalized with no query or category. One download then
 * serves every category tab and search instead of crawling the venue again. */
export function filterCryptoComCatalog(
  markets: readonly PredictionMarketSummary[],
  searchQuery = "",
  categoryId: PredictionCategoryId = "all",
): PredictionMarketSummary[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query && categoryId === "all") return [...markets];
  return markets.filter((market) =>
    matchesCryptoComCategory(market, categoryId) && matchesSearch(market, query));
}

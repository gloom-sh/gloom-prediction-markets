import { describe, expect, test } from "bun:test";
import { normalizePolymarketUsCatalog } from "./normalize";
import type { PolymarketUsMarketRecord } from "./types";

/**
 * Trimmed from GET https://gateway.polymarket.us/v1/markets?limit=3&closed=false
 * on 2026-10-08. outcomePrices is not aligned with outcomes.
 */
const GATEWAY_MARKETS: PolymarketUsMarketRecord[] = [
  {
    id: "7909",
    question: "National League Champion",
    slug: "tec-mlb-nlchamp-2026-09-27-lad",
    endDate: "2026-11-06T21:20:09Z",
    category: "sports",
    description:
      "Will Los Angeles Dodgers win the 2026 National League pennant, scheduled for October 23, 2026? If the event is postponed, delayed, or rescheduled, the expiration date will be amended to align with the new event date. If the event is not rescheduled within two weeks of the originally scheduled date, the instrument may settle at last fair market prices. If the event is canceled, the instrument may settle at last fair market prices. If the team is eliminated from contention, the instrument will settle to $0.00.",
    active: true,
    closed: false,
    updatedAt: "2026-10-08T16:11:20Z",
    outcomes: "[\"No\",\"Yes\"]",
    outcomePrices: "[\"0.6010\",\"0.4\"]",
    title: "Los Angeles Dodgers",
    titleShort: "Los Angeles Dodgers",
    tags: [],
    bestBidQuote: { value: "0.6000", currency: "USD" },
    bestAskQuote: { value: "0.6010", currency: "USD" },
    marketSides: [
      {
        id: "15817",
        description: "Yes",
        price: "0.6010",
        long: true,
        quote: { value: "0.6010", currency: "USD" },
      },
      {
        id: "15818",
        description: "No",
        price: "0.4",
        long: false,
        quote: { value: "0.4", currency: "USD" },
      },
    ],
  },
  {
    id: "7910",
    question: "World Series Champion",
    slug: "tec-mlb-champ-2026-09-27-cws",
    endDate: "2026-11-06T21:20:09Z",
    category: "sports",
    description:
      "Will Chicago White Sox win the 2026 MLB World Series, scheduled for October 23-November 2026?",
    active: true,
    closed: false,
    updatedAt: "2026-10-08T16:11:20Z",
    outcomes: "[\"Yes\",\"No\"]",
    outcomePrices: "[\"0.0770\",\"0.926\"]",
    title: "Chicago White Sox",
    titleShort: "Chicago White Sox",
    tags: [],
    bestBidQuote: { value: "0.0740", currency: "USD" },
    bestAskQuote: { value: "0.0770", currency: "USD" },
    marketSides: [
      {
        id: "15819",
        description: "Yes",
        price: "0.0770",
        long: true,
        quote: { value: "0.0770", currency: "USD" },
      },
      {
        id: "15820",
        description: "No",
        price: "0.926",
        long: false,
        quote: { value: "0.926", currency: "USD" },
      },
    ],
  },
  {
    id: "7913",
    question: "National League Champion",
    slug: "tec-mlb-nlchamp-2026-09-27-mil",
    endDate: "2026-11-06T21:20:09Z",
    category: "sports",
    description:
      "Will Milwaukee Brewers win the 2026 National League pennant, scheduled for October 23, 2026?",
    active: true,
    closed: false,
    updatedAt: "2026-10-08T16:11:20Z",
    outcomes: "[\"No\",\"Yes\"]",
    outcomePrices: "[\"0.4060\",\"0.607\"]",
    title: "Milwaukee Brewers",
    titleShort: "Milwaukee Brewers",
    tags: [],
    bestBidQuote: { value: "0.3930", currency: "USD" },
    bestAskQuote: { value: "0.4060", currency: "USD" },
    marketSides: [
      {
        id: "15825",
        description: "Yes",
        price: "0.4060",
        long: true,
        quote: { value: "0.4060", currency: "USD" },
      },
      {
        id: "15826",
        description: "No",
        price: "0.607",
        long: false,
        quote: { value: "0.607", currency: "USD" },
      },
    ],
  },
];

describe("polymarket us catalog normalize", () => {
  test("reads the long-side dollar price as a 0..1 probability", () => {
    const markets = normalizePolymarketUsCatalog(GATEWAY_MARKETS);
    const dodgers = markets.find((market) => market.marketId === "7909");
    const brewers = markets.find((market) => market.marketId === "7913");
    const whiteSox = markets.find((market) => market.marketId === "7910");

    expect(dodgers?.yesPrice).toBeGreaterThanOrEqual(0);
    expect(dodgers?.yesPrice).toBeLessThanOrEqual(1);
    expect(dodgers?.yesPrice).toBeCloseTo(0.601, 5);
    expect(dodgers?.noPrice).toBeCloseTo(0.4, 5);
    expect(dodgers?.yesBid).toBeCloseTo(0.6, 5);
    expect(dodgers?.yesAsk).toBeCloseTo(0.601, 5);
    expect(dodgers?.key).toBe("polymarket-us:7909");
    expect(dodgers?.venue).toBe("polymarket-us");
    expect(dodgers?.title).toBe("National League Champion");
    expect(dodgers?.eventLabel).toBe("National League Champion");
    expect(dodgers?.marketLabel).toBe("Los Angeles Dodgers");
    expect(dodgers?.eventId).toBe("National League Champion");
    expect(brewers?.eventId).toBe("National League Champion");
    expect(brewers?.yesPrice).toBeCloseTo(0.406, 5);
    expect(whiteSox?.eventId).toBeUndefined();
    expect(whiteSox?.yesPrice).toBeCloseTo(0.077, 5);
    expect(dodgers?.status).toBe("open");
    expect(dodgers?.category).toBe("sports");
    expect(dodgers?.tags).toEqual(["sports"]);
    expect(dodgers?.url).toBe("https://polymarket.us");
    expect(dodgers?.endsAt).toBe("2026-11-06T21:20:09Z");
    expect(dodgers?.volume24h).toBeNull();
    expect(dodgers?.openInterest).toBeNull();
    expect(dodgers?.volume24hUnit).toBe("usd");
    expect(dodgers?.openInterestUnit).toBe("usd");
  });

  test("converts a cent quote and does not zip outcomePrices onto outcomes", () => {
    const [dodgers] = GATEWAY_MARKETS;
    const markets = normalizePolymarketUsCatalog([
      {
        ...dodgers,
        marketSides: [
          {
            description: "Yes",
            long: true,
            price: "60.10",
            quote: { value: "60.10", currency: "USD" },
          },
          {
            description: "No",
            long: false,
            price: "40",
            quote: { value: "40", currency: "USD" },
          },
        ],
        outcomePrices: "[\"0.6010\",\"0.4\"]",
        outcomes: "[\"No\",\"Yes\"]",
      },
    ]);

    expect(markets[0]?.yesPrice).toBeCloseTo(0.601, 5);
    expect(markets[0]?.yesPrice).toBeLessThanOrEqual(1);
    expect(markets[0]?.noPrice).toBeCloseTo(0.4, 5);
  });

  test("keeps event open interest off each outcome", () => {
    const markets = normalizePolymarketUsCatalog(
      GATEWAY_MARKETS.filter((market) => market.question === "National League Champion").map(
        (market) => ({
          ...market,
          volume24hr: market.id === "7909" ? 1250 : undefined,
          event: {
            id: "6435",
            openInterest: 50000,
            volume24hr: 80000,
          },
        }),
      ),
    );

    expect(markets).toHaveLength(2);
    for (const market of markets) {
      expect(market.eventId).toBe("6435");
      expect(market.openInterest).toBeNull();
      expect(market.eventOpenInterest).toBe(50000);
      expect(market.eventVolume24h).toBe(80000);
    }
    expect(markets.find((market) => market.marketId === "7909")?.volume24h).toBe(1250);
    expect(markets.find((market) => market.marketId === "7913")?.volume24h).toBeNull();
  });

  test("filters search and category on labels, tags, and category", () => {
    expect(
      normalizePolymarketUsCatalog(GATEWAY_MARKETS, "brewers").map((market) => market.marketId),
    ).toEqual(["7913"]);
    expect(
      normalizePolymarketUsCatalog(GATEWAY_MARKETS, "", "politics"),
    ).toEqual([]);
    expect(
      normalizePolymarketUsCatalog(GATEWAY_MARKETS, "champion", "sports").map(
        (market) => market.marketId,
      ),
    ).toEqual(["7909", "7910", "7913"]);
  });
});

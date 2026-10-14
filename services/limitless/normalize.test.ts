import { describe, expect, test } from "bun:test";
import { normalizeLimitlessCatalog } from "./normalize";
import type { LimitlessActiveMarket } from "./types";

/** Trimmed from GET /markets/active page 1 (single) and page 2 (group), October 2026. */
const LIVE_FIXTURE: LimitlessActiveMarket[] = [
  {
    id: 424498,
    title: "BTC Up or Down - 5 Min",
    slug: "btc-up-or-down-5-min-1791476700",
    description: "<p>This market will resolve to \"Up\" if the Chainlink BTC/USD price is higher.</p>",
    status: "FUNDED",
    expired: false,
    marketType: "single",
    groupId: null,
    categories: ["Minutely", "5 min"],
    tags: ["Lumy", "Recurring", "Minutely", "Minutes 5"],
    properties: [
      { propertyKeySlug: "domain", value: ["crypto"] },
      { propertyKeySlug: "duration", value: ["5-min"] },
      { propertyKeySlug: "ticker", value: ["btc"] },
    ],
    prices: [0.4625, 0.5375],
    volume: "0",
    volumeFormatted: "0.000000",
    expirationTimestamp: 1791477000000,
    expirationDate: "Oct 8, 2026",
    updatedAt: "2026-10-08T16:25:02.693Z",
    conditionId: "0x8731bc75ab66120b8fea48a8700006341dc18f6b61ad83393e31918c44373e40",
    collateralToken: { decimals: 6 },
    tokens: { yes: "yes-token", no: "no-token" },
  },
  {
    id: 10014613,
    title: "Br Série A, Santos vs Flamengo",
    slug: "br-serie-a-santos-vs-flamengo-1791018008212",
    status: "FUNDED",
    expired: false,
    marketType: "group",
    categories: ["Football Matches"],
    tags: ["Football", "Lumy"],
    properties: [
      { propertyKeySlug: "domain", value: ["sport"] },
      { propertyKeySlug: "sport-type", value: ["football"] },
    ],
    expirationTimestamp: 1791585000000,
    updatedAt: "2026-10-03T10:00:40.368Z",
    volume: "0",
    volumeFormatted: "0.000000",
    markets: [
      {
        id: 418443,
        title: "Santos",
        slug: "santos-1791018008222",
        groupId: 10014613,
        status: "FUNDED",
        expired: false,
        categories: ["Football Matches"],
        tags: ["Football", "Lumy"],
        prices: [0.215, 0.785],
        tradePrices: {
          buy: { market: [0.23, 0.8] },
          sell: { market: [0.2, 0.77] },
        },
        volume: "0",
        volumeFormatted: "0.000000",
        expirationTimestamp: 1791585000000,
      },
      {
        id: 418444,
        title: "Flamengo",
        slug: "flamengo-1791018008233",
        groupId: 10014613,
        status: "FUNDED",
        expired: false,
        prices: [0.545, 0.455],
        volume: "0",
        volumeFormatted: "0.000000",
        expirationTimestamp: 1791585000000,
      },
      {
        id: 418999,
        title: "Already settled",
        slug: "settled-1791018008299",
        groupId: 10014613,
        status: "RESOLVED",
        prices: [1, 0],
        volumeFormatted: "0.000000",
      },
    ],
  },
  {
    id: 7495,
    title: "DOGE Up or Down - Hourly",
    slug: "doge-up-or-down-1-hour-1756724413009",
    description: "This market will resolve to \"Up\" if the price of DOGE is above the opening price.",
    status: "FUNDED",
    expired: false,
    marketType: "single",
    categories: ["Hourly"],
    tags: ["Lumy", "Recurring", "Hourly"],
    prices: [42.8, 57.2],
    volume: "164109293",
    volumeFormatted: "164.109293",
    openInterest: "48310707",
    openInterestFormatted: "48.310707",
    liquidity: "50000000",
    liquidityFormatted: "50.000000",
    expirationTimestamp: 1756728000000,
    collateralToken: { decimals: 6 },
  },
];

describe("limitless catalog normalize", () => {
  test("keeps yes prices on a 0..1 probability scale", () => {
    const markets = normalizeLimitlessCatalog(LIVE_FIXTURE, "", "all");
    expect(markets.length).toBeGreaterThan(0);
    for (const market of markets) {
      expect(market.venue).toBe("limitless");
      expect(market.yesPrice).not.toBeNull();
      expect(market.yesPrice!).toBeGreaterThanOrEqual(0);
      expect(market.yesPrice!).toBeLessThanOrEqual(1);
      expect(market.volume24hUnit).toBe("usd");
      expect(market.totalVolumeUnit).toBe("usd");
      expect(market.liquidityUnit).toBe("usd");
      expect(market.openInterestUnit).toBe("usd");
    }

    const btc = markets.find((market) => market.marketId === "424498");
    expect(btc?.yesPrice).toBe(0.4625);
    expect(btc?.noPrice).toBe(0.5375);
    expect(btc?.eventId).toBeUndefined();
    expect(btc?.title).toBe("BTC Up or Down - 5 Min");
    expect(btc?.eventLabel).toBe("BTC Up or Down - 5 Min");
    expect(btc?.status).toBe("open");
    expect(btc?.key).toBe("limitless:btc-up-or-down-5-min-1791476700");
    expect(btc?.url).toBe(
      "https://limitless.exchange/markets/btc-up-or-down-5-min-1791476700",
    );
    expect(btc?.category).toBe("crypto");
    expect(btc?.tags).toContain("crypto");
    expect(btc?.totalVolume).toBe(0);
    expect(btc?.volume24h).toBeNull();
    expect(btc?.liquidity).toBeNull();
    expect(btc?.openInterest).toBeNull();

    const cents = markets.find((market) => market.marketId === "7495");
    expect(cents?.yesPrice).toBeCloseTo(0.428, 5);
    expect(cents?.noPrice).toBeCloseTo(0.572, 5);
    expect(cents?.totalVolume).toBeCloseTo(164.109293, 5);
    expect(cents?.liquidity).toBeCloseTo(50, 5);
    expect(cents?.openInterest).toBeCloseTo(48.310707, 5);
    expect(cents?.volume24h).toBeNull();
  });

  test("splits a group into outcomes and drops resolved legs", () => {
    const markets = normalizeLimitlessCatalog(LIVE_FIXTURE, "", "all");
    const outcomes = markets.filter((market) => market.eventId === "10014613");
    expect(outcomes.map((market) => market.marketLabel)).toEqual(["Santos", "Flamengo"]);
    expect(outcomes.every((market) => market.title === "Br Série A, Santos vs Flamengo")).toBe(true);
    expect(outcomes.every((market) => market.eventLabel === "Br Série A, Santos vs Flamengo")).toBe(true);
    expect(markets.some((market) => market.marketLabel === "Already settled")).toBe(false);

    const santos = outcomes[0];
    expect(santos?.yesPrice).toBe(0.215);
    expect(santos?.yesBid).toBe(0.2);
    expect(santos?.yesAsk).toBe(0.23);
    expect(santos?.noBid).toBe(0.77);
    expect(santos?.noAsk).toBe(0.8);
    expect(santos?.url).toBe("https://limitless.exchange/markets/santos-1791018008222");
  });

  test("filters search text and category keywords", () => {
    const crypto = normalizeLimitlessCatalog(LIVE_FIXTURE, "", "crypto");
    expect(crypto.map((market) => market.marketId).sort()).toEqual(["424498", "7495"]);

    const sports = normalizeLimitlessCatalog(LIVE_FIXTURE, "", "sports");
    expect(sports.map((market) => market.marketLabel)).toEqual(["Santos", "Flamengo"]);

    const byOutcome = normalizeLimitlessCatalog(LIVE_FIXTURE, "Draw", "sports");
    expect(byOutcome).toEqual([]);

    const byTitle = normalizeLimitlessCatalog(LIVE_FIXTURE, "up or down", "all");
    expect(byTitle.map((market) => market.marketId).sort()).toEqual(["424498", "7495"]);
  });
});

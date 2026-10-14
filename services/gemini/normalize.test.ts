import { describe, expect, test } from "bun:test";
import { normalizeGeminiCatalog } from "./normalize";
import type { GeminiEventRecord } from "./types";

const election: GeminiEventRecord = {
  title: "Who will win the election?",
  status: "active",
  category: "Politics",
  ticker: "ELEC2026",
  slug: "who-will-win-the-election",
  expiryDate: "2026-11-04T00:00:00.000Z",
  volume: "20.5",
  volume24h: "10.25",
  contracts: [
    {
      label: "Democrat",
      instrumentSymbol: "GEMI-ELEC2026-DEM",
      expiryDate: "2026-11-03T23:59:59.000Z",
      prices: {
        bestBid: "0.40",
        bestAsk: "0.44",
        lastTradePrice: "0.27",
      },
    },
    {
      label: "Republican",
      instrumentSymbol: "GEMI-ELEC2026-GOP",
      prices: {
        bestBid: "0.50",
        bestAsk: "0.56",
        lastTradePrice: "0.55",
      },
    },
  ],
};

describe("gemini catalog normalize", () => {
  test("maps one politics event into two grouped contracts", () => {
    const summaries = normalizeGeminiCatalog([election], "", "all");

    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.eventId).toBe("ELEC2026");
    expect(summaries[1]?.eventId).toBe(summaries[0]?.eventId);
    expect(summaries[0]).toMatchObject({
      venue: "gemini",
      key: "gemini:GEMI-ELEC2026-DEM",
      marketId: "GEMI-ELEC2026-DEM",
      title: "Who will win the election?",
      eventLabel: "Who will win the election?",
      marketLabel: "Democrat",
      yesPrice: 0.27,
      yesBid: 0.4,
      yesAsk: 0.44,
      category: "politics",
      tags: ["politics"],
      status: "open",
      description: "",
      endsAt: "2026-11-03T23:59:59.000Z",
      url: "https://exchange.gemini.com/predictions/ELEC2026/who-will-win-the-election",
      volume24h: null,
      eventVolume24h: 10.25,
      totalVolume: 20.5,
      openInterest: null,
      liquidity: null,
      volume24hUnit: "usd",
      totalVolumeUnit: "usd",
      openInterestUnit: "usd",
      liquidityUnit: "usd",
    });
    expect(summaries[0]?.noPrice).toBe(1 - 0.27);
    expect(summaries[0]?.spread).toBeCloseTo(0.04);
    expect(summaries[1]?.yesPrice).toBe(0.55);
    expect(summaries[1]?.key).toBe("gemini:GEMI-ELEC2026-GOP");
  });

  test("falls back from last trade to the bid-ask midpoint, then best bid", () => {
    const event: GeminiEventRecord = {
      title: "Bitcoin price",
      status: "active",
      category: "Crypto",
      ticker: "BTC",
      slug: "bitcoin-price",
      contracts: [
        {
          label: "Mid",
          instrumentSymbol: "GEMI-BTC-MID",
          prices: { bestBid: "0.20", bestAsk: "0.40" },
        },
        {
          label: "Bid only",
          instrumentSymbol: "GEMI-BTC-BID",
          prices: { bestBid: "0.20" },
        },
        {
          label: "No book",
          instrumentSymbol: "GEMI-BTC-NONE",
          prices: {},
        },
      ],
    };

    const summaries = normalizeGeminiCatalog([event], "", "crypto");
    expect(summaries[0]?.yesPrice).toBeCloseTo(0.3);
    expect(summaries[1]?.yesPrice).toBe(0.2);
    expect(summaries[2]?.yesPrice).toBeNull();
    expect(summaries[2]?.noPrice).toBeNull();
    expect(summaries[1]?.spread).toBeNull();
    expect(normalizeGeminiCatalog([event], "", "politics")).toEqual([]);
  });

  test("filters search against the event title or contract label", () => {
    expect(normalizeGeminiCatalog([election], "democrat", "politics")).toHaveLength(1);
    expect(normalizeGeminiCatalog([election], "Democrat", "all")[0]?.marketLabel).toBe("Democrat");
    expect(normalizeGeminiCatalog([election], "election", "all")).toHaveLength(2);
    expect(normalizeGeminiCatalog([election], "zec", "all")).toEqual([]);
    expect(
      normalizeGeminiCatalog([{ ...election, status: "closed" }], "", "all")[0]?.status,
    ).toBe("closed");
  });
});

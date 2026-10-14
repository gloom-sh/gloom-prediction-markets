import { describe, expect, test } from "bun:test";
import { cryptoComCatalogFixture } from "./fixture";
import { normalizeCryptoComCatalog } from "./normalize";
import type { PredictionCategoryId, PredictionMarketSummary } from "../../types";

const REQUIRED_FIELDS = [
  "key",
  "venue",
  "marketId",
  "title",
  "marketLabel",
  "eventLabel",
  "status",
  "url",
  "description",
  "endsAt",
  "updatedAt",
  "yesPrice",
  "noPrice",
  "yesBid",
  "yesAsk",
  "noBid",
  "noAsk",
  "spread",
  "lastTradePrice",
  "volume24h",
  "volume24hUnit",
  "totalVolume",
  "totalVolumeUnit",
  "openInterest",
  "openInterestUnit",
  "liquidity",
  "liquidityUnit",
] as const satisfies ReadonlyArray<keyof PredictionMarketSummary>;

function catalog(
  searchQuery = "",
  categoryId: "all" | "sports" | "crypto" | "politics" | "macro" = "all",
) {
  return normalizeCryptoComCatalog(
    cryptoComCatalogFixture.events,
    cryptoComCatalogFixture.instruments,
    cryptoComCatalogFixture.tickers,
    searchQuery,
    categoryId,
  );
}

describe("crypto.com catalog normalize", () => {
  test("maps contracts and a contract-less event from the live fixture", () => {
    const markets = catalog();
    expect(markets.map((market) => market.key)).toEqual([
      "crypto-com:NX.F.OPT.CRYPT-00042-26.O.1.1",
      "crypto-com:NX.F.OPT.ELECT-00128-26.O.1.3.20271031",
      "crypto-com:NX.F.OPT.ELECT-00128-26.O.1.2.20271031",
      "crypto-com:NX.F.OPT.MLB-00063-2026.O.1.3.20261231",
      "crypto-com:NX.F.OPT.MLB-00063-2026.O.1.2.20261231",
      "crypto-com:EC-00046-26",
    ]);

    for (const market of markets) {
      expect(market.venue).toBe("crypto-com");
      expect(market.url).toBe("https://crypto.com/exchange");
      expect(market.status).toBe("open");
      expect(market.volume24hUnit).toBe("usd");
      expect(market.totalVolumeUnit).toBe("usd");
      expect(market.openInterestUnit).toBe("usd");
      expect(market.liquidityUnit).toBe("usd");
      expect(market.liquidity).toBeNull();
      expect(market.totalVolume).toBeNull();
      for (const field of REQUIRED_FIELDS) {
        expect(field in market).toBe(true);
      }
    }

    const bitcoin = markets[0];
    expect(bitcoin).toBeDefined();
    expect(bitcoin?.title).toBe("Will Bitcoin be above $200k by next year?");
    expect(bitcoin?.eventLabel).toBe("Will Bitcoin be above $200k by next year?");
    expect(bitcoin?.marketLabel).toBe("Yes");
    expect(bitcoin?.eventId).toBeUndefined();
    expect(bitcoin?.tags).toEqual(["crypto"]);
    expect(bitcoin?.category).toBe("Crypto");
    expect(bitcoin?.yesPrice).toBeCloseTo(0.02);
    expect(bitcoin?.noPrice).toBeCloseTo(0.98);
    expect(bitcoin?.yesBid).toBeCloseTo(0.01);
    expect(bitcoin?.yesAsk).toBeCloseTo(0.12);
    expect(bitcoin?.spread).toBeCloseTo(0.11);
    expect(bitcoin?.lastTradePrice).toBeCloseTo(0.02);
    expect(bitcoin?.volume24h).toBe(151);
    expect(bitcoin?.openInterest).toBeNull();
    expect(bitcoin?.endsAt).toBe("2027-01-31T23:00:00.000Z");

    const bennett = markets[1];
    const netanyahu = markets[2];
    expect(bennett?.marketLabel).toBe("Naftali Bennett (Together)");
    expect(bennett?.eventId).toBe("ELECT-00128-26");
    expect(bennett?.tags).toEqual(["politics"]);
    expect(bennett?.yesPrice).toBeCloseTo(0.08);
    expect(bennett?.lastTradePrice).toBeNull();
    expect(bennett?.openInterest).toBe(0);
    expect(netanyahu?.marketLabel).toBe("Benjamin Netanyahu (Likud)");
    expect(netanyahu?.eventId).toBe("ELECT-00128-26");
    expect(netanyahu?.yesPrice).toBeCloseTo(0.365);
    expect(netanyahu?.yesBid).toBeCloseTo(0.32);
    expect(netanyahu?.yesAsk).toBeCloseTo(0.41);

    const totalGames = markets[3];
    expect(totalGames?.eventLabel).toBe("Dodgers vs Brewers Series Total Games");
    expect(totalGames?.marketLabel).toBe("Over 6.5 total games");
    expect(totalGames?.eventId).toBe("MLB-00063-2026");
    expect(totalGames?.tags).toEqual(["sports"]);
    expect(totalGames?.yesPrice).toBeNull();
    expect(totalGames?.yesBid).toBeNull();
    expect(totalGames?.yesAsk).toBeNull();
    expect(totalGames?.volume24h).toBeNull();
    expect(totalGames?.openInterest).toBeNull();

    const unemployment = markets[5];
    expect(unemployment?.title).toBe("Unemployment Rate in Oct 2026");
    expect(unemployment?.marketLabel).toBe("Unemployment Rate in Oct 2026");
    expect(unemployment?.eventId).toBeUndefined();
    expect(unemployment?.tags).toEqual(["macro"]);
    expect(unemployment?.yesPrice).toBeNull();
    expect(unemployment?.endsAt).toBe("2026-11-06T13:30:00.000Z");
    expect(unemployment?.updatedAt).toBe("2026-10-08T16:19:24.717Z");
  });

  test("filters search and category from the inferred tags", () => {
    expect(catalog("BITCOIN").map((market) => market.marketId)).toEqual([
      "NX.F.OPT.CRYPT-00042-26.O.1.1",
    ]);
    expect(catalog("netanyahu").map((market) => market.marketLabel)).toEqual([
      "Benjamin Netanyahu (Likud)",
    ]);
    expect(catalog("no-such-market")).toEqual([]);
    expect(catalog("", "crypto").map((market) => market.tags)).toEqual([["crypto"]]);
    expect(catalog("", "politics")).toHaveLength(2);
    expect(catalog("", "sports").every((market) => market.yesPrice == null)).toBe(true);
    expect(catalog("", "sports")).toHaveLength(2);
    expect(catalog("", "macro").map((market) => market.marketId)).toEqual(["EC-00046-26"]);
  });

  test("scales cent quotes into 0..1 and keeps sub-dollar probabilities", () => {
    const [event] = cryptoComCatalogFixture.events;
    const [instrument] = cryptoComCatalogFixture.instruments;
    const [ticker] = cryptoComCatalogFixture.tickers;
    expect(event && instrument && ticker).toBeTruthy();
    if (!event || !instrument || !ticker) return;

    const cents = normalizeCryptoComCatalog(
      [event],
      [instrument],
      [{ ...ticker, a: "65", b: "64", k: "66" }],
    );
    expect(cents[0]?.yesPrice).toBeCloseTo(0.65);
    expect(cents[0]?.yesBid).toBeCloseTo(0.64);
    expect(cents[0]?.yesAsk).toBeCloseTo(0.66);

    const probability = normalizeCryptoComCatalog([event], [instrument], [ticker]);
    expect(probability[0]?.yesPrice).toBeCloseTo(0.02);
  });

  test("matches world and other tabs by token, not only inferred tags", () => {
    const israel = normalizeCryptoComCatalog(
      cryptoComCatalogFixture.events,
      cryptoComCatalogFixture.instruments,
      cryptoComCatalogFixture.tickers,
      "",
      "world",
    );
    expect(israel.map((market) => market.marketId)).toEqual([
      "NX.F.OPT.ELECT-00128-26.O.1.3.20271031",
      "NX.F.OPT.ELECT-00128-26.O.1.2.20271031",
    ]);

    const rows = [
      { symbol: "UA-1", name: "Ukraine ceasefire before 2027" },
      { symbol: "AI-1", name: "Will AI pass the bar" },
      { symbol: "CAMP-1", name: "Campaign rally attendance" },
      { symbol: "PLAYER-1", name: "Federer wins the open" },
      { symbol: "WEA-1", name: "NYC weather above 90" },
      { symbol: "TV-1", name: "TV awards tonight" },
    ];
    const ids = (categoryId: PredictionCategoryId) =>
      normalizeCryptoComCatalog(rows, [], [], "", categoryId).map((market) => market.marketId);

    expect(ids("world")).toEqual(["UA-1"]);
    expect(ids("science")).toEqual(["AI-1"]);
    expect(ids("macro")).toEqual([]);
    expect(ids("climate")).toEqual(["WEA-1"]);
    expect(ids("entertainment")).toEqual(["TV-1"]);
  });

  test("marks closed or settled only when the payload says so", () => {
    const event = cryptoComCatalogFixture.events[3];
    expect(event).toBeDefined();
    if (!event) return;
    const closed = normalizeCryptoComCatalog([{ ...event, status: "closed" }], [], []);
    const settled = normalizeCryptoComCatalog([{ ...event, status: "settled" }], [], []);
    expect(closed[0]?.status).toBe("closed");
    expect(settled[0]?.status).toBe("settled");
  });
});

import { describe, expect, test } from "bun:test";
import { normalizePascalCatalog, selectPascalBrowse } from "./normalize";
import type { PascalMarket } from "./types";

/** Trimmed from POST /api/v1/markets/text-search query "fed", October 2026. */
const FED: PascalMarket = {
  symbol: "FED_DECISION_26OCT.NO_CHANGE",
  mark_price: "0.834500",
  open_interest: "1286",
  long_interest: "1286",
  listing_ts_ms: "1783990237481",
  display_attributes: {
    event_description: "Fed decision in October",
    market_description: "No change",
    expected_resolution_time_ms: "1793210400000",
    tags: ["Finance", "Macro"],
    topic: { id: "2026-fed-rates", description: "2026 Fed Rates" },
  },
  stats: {
    last_24h: {
      taker_buy_volume_notional: "2403.450000",
      taker_sell_volume_notional: "6768.422000",
    },
    all_time: {
      taker_buy_volume_notional: "23210.353000",
      taker_sell_volume_notional: "23018.787000",
    },
  },
};

const FED_CUT: PascalMarket = {
  symbol: "FED_DECISION_26OCT.CUT_25",
  mark_price: "0.120000",
  best_bid: "0.110000",
  best_ask: "0.130000",
  long_interest: "40",
  display_attributes: {
    event_description: "Fed decision in October",
    market_description: "Cut 25bps",
    tags: ["Finance", "Macro"],
  },
  stats: {
    last_24h: {
      taker_buy_volume_notional: "10.000000",
      taker_sell_volume_notional: "5.000000",
    },
  },
};

describe("pascal catalog normalize", () => {
  test("maps a contract and groups it with the other outcome", () => {
    const markets = normalizePascalCatalog([FED, FED_CUT, {
      symbol: "FED_DECISION_26OCT.SETTLED",
      mark_price: "1.000000",
      resolution: { price: "1.000000" },
      display_attributes: {
        event_description: "Fed decision in October",
        market_description: "Settled",
      },
    }]);
    expect(markets.map((market) => market.marketId)).toEqual([
      "FED_DECISION_26OCT.NO_CHANGE",
      "FED_DECISION_26OCT.CUT_25",
    ]);
    const hold = markets[0];
    expect(hold).toMatchObject({
      venue: "pascal",
      key: "pascal:FED_DECISION_26OCT.NO_CHANGE",
      eventId: "FED_DECISION_26OCT",
      title: "Fed decision in October",
      marketLabel: "No change",
      eventLabel: "Fed decision in October",
      description: "Fed decision in October. No change",
      status: "open",
      yesPrice: 0.8345,
      volume24h: 2403.45 + 6768.422,
      totalVolume: 23210.353 + 23018.787,
      openInterest: 1286,
      openInterestUnit: "contracts",
      volume24hUnit: "usd",
      spread: null,
      url: "https://app.pascal.trade/trade/FED_DECISION_26OCT?marketSymbol=FED_DECISION_26OCT.NO_CHANGE",
    });
    expect(hold?.noPrice).toBeCloseTo(1 - 0.8345);
    expect(hold?.tags).toEqual(["Finance", "Macro", "2026 Fed Rates"]);
    expect(hold?.endsAt).toBe(new Date(1793210400000).toISOString());
    expect(hold?.updatedAt).toBe(new Date(1783990237481).toISOString());
    expect(markets[1]?.eventId).toBe("FED_DECISION_26OCT");
    expect(markets[1]?.yesBid).toBeCloseTo(0.11);
    expect(markets[1]?.yesAsk).toBeCloseTo(0.13);
    expect(markets[1]?.spread).toBeCloseTo(0.02);
  });

  test("keeps a whole event when the next one would pass the browse cap", () => {
    const markets = normalizePascalCatalog([
      FED,
      FED_CUT,
      {
        symbol: "SENATE_2026_CTRL.DEM",
        mark_price: "0.400000",
        long_interest: "9",
        display_attributes: {
          event_description: "Senate control",
          market_description: "Democrats",
          tags: ["Politics"],
        },
        stats: {
          last_24h: {
            taker_buy_volume_notional: "1.000000",
            taker_sell_volume_notional: "0.000000",
          },
        },
      },
    ], "", "all");
    const browse = selectPascalBrowse(markets, "all", "", 2);
    expect(browse.map((market) => market.marketId)).toEqual([
      "FED_DECISION_26OCT.NO_CHANGE",
      "FED_DECISION_26OCT.CUT_25",
    ]);
    expect(selectPascalBrowse(markets, "politics").map((market) => market.marketId)).toEqual([
      "SENATE_2026_CTRL.DEM",
    ]);
  });
});

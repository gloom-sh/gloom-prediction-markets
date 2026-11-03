import type { KalshiEventsResponse } from "./types";

/**
 * Trimmed live Kalshi responses, recorded 2026-11-03: the first page of open
 * events (none of the first 200 was a Senate race), part of the series list,
 * and the open events of two Senate series.
 */
export const kalshiSenateSearchFixture: {
  newestEvents: KalshiEventsResponse;
  seriesList: { series: Array<{ ticker: string; title: string; category: string; tags: string[] | null; volume_fp: string }> };
  seriesEvents: Record<string, KalshiEventsResponse>;
} = {
  newestEvents: {
    "events": [
      {
        "title": "Will Elon Musk visit Mars in his lifetime?",
        "sub_title": "Before 2099",
        "category": "Science and Technology",
        "event_ticker": "KXELONMARS-99",
        "series_ticker": "KXELONMARS",
        "markets": [
          {
            "ticker": "KXELONMARS-99",
            "title": "Will Elon Musk visit Mars before Aug 1, 2099?",
            "yes_sub_title": "Mars",
            "no_sub_title": "Mars",
            "event_ticker": "KXELONMARS-99",
            "market_type": "binary",
            "status": "active",
            "open_time": "2025-08-28T20:45:00Z",
            "close_time": "2099-08-01T04:59:00Z",
            "updated_time": "2026-10-16T03:23:52.413222Z",
            "yes_bid_dollars": "0.0900",
            "yes_ask_dollars": "0.1000",
            "no_bid_dollars": "0.9000",
            "no_ask_dollars": "0.9100",
            "last_price_dollars": "0.0900",
            "volume_24h_fp": "7.46",
            "volume_fp": "123776.63",
            "open_interest_fp": "39984.78"
          }
        ]
      },
      {
        "title": "Who will be the next Secretary General of NATO?",
        "sub_title": "Before Jan 1, 2099",
        "category": "Elections",
        "event_ticker": "KXNEXTNATOSECGEN-99",
        "series_ticker": "KXNEXTNATOSECGEN",
        "markets": [
          {
            "ticker": "KXNEXTNATOSECGEN-99-KKAL",
            "title": "Will Kaja Kallas be the next Secretary General of NATO?",
            "yes_sub_title": "Kaja Kallas",
            "no_sub_title": "Kaja Kallas",
            "event_ticker": "KXNEXTNATOSECGEN-99",
            "market_type": "binary",
            "status": "active",
            "open_time": "2026-06-29T19:47:00Z",
            "close_time": "2099-01-08T15:00:00Z",
            "updated_time": "2026-10-23T17:10:06.496396Z",
            "strike_type": "custom",
            "custom_strike": {
              "Holder": "Kaja Kallas"
            },
            "yes_bid_dollars": "0.1200",
            "yes_ask_dollars": "0.2000",
            "no_bid_dollars": "0.8000",
            "no_ask_dollars": "0.8800",
            "last_price_dollars": "0.2100",
            "volume_24h_fp": "0.00",
            "volume_fp": "1936.64",
            "open_interest_fp": "1174.50"
          },
          {
            "ticker": "KXNEXTNATOSECGEN-99-BWAL",
            "title": "Will Ben Wallace be the next Secretary General of NATO?",
            "yes_sub_title": "Ben Wallace",
            "no_sub_title": "Ben Wallace",
            "event_ticker": "KXNEXTNATOSECGEN-99",
            "market_type": "binary",
            "status": "active",
            "open_time": "2026-06-29T19:47:00Z",
            "close_time": "2099-01-08T15:00:00Z",
            "updated_time": "2026-10-23T17:10:06.496396Z",
            "strike_type": "custom",
            "custom_strike": {
              "Holder": "Ben Wallace"
            },
            "yes_bid_dollars": "0.0100",
            "yes_ask_dollars": "0.0600",
            "no_bid_dollars": "0.9400",
            "no_ask_dollars": "0.9900",
            "last_price_dollars": "0.0500",
            "volume_24h_fp": "0.00",
            "volume_fp": "1145.86",
            "open_interest_fp": "89.61"
          }
        ]
      },
      {
        "title": "Who will the next Pope be?",
        "sub_title": "Before 2070",
        "category": "Elections",
        "event_ticker": "KXNEWPOPE-70",
        "series_ticker": "KXNEWPOPE",
        "markets": [
          {
            "ticker": "KXNEWPOPE-70-PPAR",
            "title": "Who will the next Pope be?",
            "yes_sub_title": "Pietro Parolin",
            "no_sub_title": "Pietro Parolin",
            "event_ticker": "KXNEWPOPE-70",
            "market_type": "binary",
            "status": "active",
            "open_time": "2025-07-18T14:00:00Z",
            "close_time": "2070-01-01T15:00:00Z",
            "updated_time": "2026-10-23T16:05:38.081718Z",
            "yes_bid_dollars": "0.0400",
            "yes_ask_dollars": "0.0580",
            "no_bid_dollars": "0.9420",
            "no_ask_dollars": "0.9600",
            "last_price_dollars": "0.0580",
            "volume_24h_fp": "0.00",
            "volume_fp": "25542.02",
            "open_interest_fp": "5060.26"
          },
          {
            "ticker": "KXNEWPOPE-70-LANT",
            "title": "Who will the next Pope be?",
            "yes_sub_title": "Luis Antonio Tagle",
            "no_sub_title": "Luis Antonio Tagle",
            "event_ticker": "KXNEWPOPE-70",
            "market_type": "binary",
            "status": "active",
            "open_time": "2025-07-18T14:00:00Z",
            "close_time": "2070-01-01T15:00:00Z",
            "updated_time": "2026-10-23T16:05:38.081718Z",
            "yes_bid_dollars": "0.0910",
            "yes_ask_dollars": "0.1300",
            "no_bid_dollars": "0.8700",
            "no_ask_dollars": "0.9090",
            "last_price_dollars": "0.1300",
            "volume_24h_fp": "133.00",
            "volume_fp": "24578.28",
            "open_interest_fp": "5828.78"
          }
        ]
      }
    ],
    "cursor": ""
  },
  seriesList: {
    "series": [
      {
        "ticker": "SENATETX",
        "title": "Texas Senate race",
        "category": "Elections",
        "tags": [
          "Senate"
        ],
        "volume_fp": "90849632.00"
      },
      {
        "ticker": "KXFEDDECISION",
        "title": "Fed meeting",
        "category": "Economics",
        "tags": [
          "Fed"
        ],
        "volume_fp": "635350027.00"
      },
      {
        "ticker": "CONTROLS",
        "title": "Senate winner",
        "category": "Elections",
        "tags": [
          "US Elections"
        ],
        "volume_fp": "37774053.00"
      },
      {
        "ticker": "KXHIGHNY",
        "title": "Highest temperature in NYC",
        "category": "Climate and Weather",
        "tags": [
          "Daily temperature"
        ],
        "volume_fp": "152383595.00"
      },
      {
        "ticker": "CONTROLH",
        "title": "House winner",
        "category": "Elections",
        "tags": [
          "US Elections"
        ],
        "volume_fp": "118146475.00"
      }
    ]
  },
  seriesEvents: {
    "CONTROLS": {
      "events": [
        {
          "title": "Who will control the Senate?",
          "sub_title": "In 2026",
          "category": "Elections",
          "event_ticker": "CONTROLS-2026",
          "series_ticker": "CONTROLS",
          "markets": [
            {
              "ticker": "CONTROLS-2026-R",
              "title": "Will Republicans win the U.S. Senate in 2026?",
              "yes_sub_title": "Republican Party",
              "no_sub_title": "Republican Party",
              "event_ticker": "CONTROLS-2026",
              "market_type": "binary",
              "status": "active",
              "open_time": "2024-11-06T15:00:00Z",
              "close_time": "2027-02-01T15:00:00Z",
              "updated_time": "2026-10-28T22:25:08.836821Z",
              "strike_type": "structured",
              "custom_strike": {
                "politician": "9244ed4c-9dfd-45cc-8211-996dc902f315"
              },
              "yes_bid_dollars": "0.2600",
              "yes_ask_dollars": "0.2700",
              "no_bid_dollars": "0.7300",
              "no_ask_dollars": "0.7400",
              "last_price_dollars": "0.2700",
              "volume_24h_fp": "4683310.04",
              "volume_fp": "21432293.65",
              "open_interest_fp": "15360467.78"
            },
            {
              "ticker": "CONTROLS-2026-D",
              "title": "Will Democrats win the U.S. Senate in 2026?",
              "yes_sub_title": "Democratic Party",
              "no_sub_title": "Democratic Party",
              "event_ticker": "CONTROLS-2026",
              "market_type": "binary",
              "status": "active",
              "open_time": "2024-11-06T15:00:00Z",
              "close_time": "2027-02-01T15:00:00Z",
              "updated_time": "2026-10-28T22:25:08.836821Z",
              "strike_type": "structured",
              "custom_strike": {
                "politician": "57fa2293-3102-463b-9087-68cd9f6da0a6"
              },
              "yes_bid_dollars": "0.7400",
              "yes_ask_dollars": "0.7500",
              "no_bid_dollars": "0.2500",
              "no_ask_dollars": "0.2600",
              "last_price_dollars": "0.7500",
              "volume_24h_fp": "3540991.04",
              "volume_fp": "14560315.81",
              "open_interest_fp": "9317789.66"
            }
          ]
        },
        {
          "title": "2028 Senate winner",
          "sub_title": "In 2028",
          "category": "Elections",
          "event_ticker": "CONTROLS-2028",
          "series_ticker": "CONTROLS",
          "markets": [
            {
              "ticker": "CONTROLS-2028-D",
              "title": "Will the Democratic party win the Senate in 2028?",
              "yes_sub_title": "Democratic party",
              "no_sub_title": "Democratic party",
              "event_ticker": "CONTROLS-2028",
              "market_type": "binary",
              "status": "active",
              "open_time": "2026-05-15T21:00:00Z",
              "close_time": "2029-02-01T15:00:00Z",
              "updated_time": "2026-10-10T09:24:31.210243Z",
              "strike_type": "custom",
              "custom_strike": {
                "Chamber of Congress": "Senate",
                "Party": "Democratic"
              },
              "yes_bid_dollars": "0.6800",
              "yes_ask_dollars": "0.6900",
              "no_bid_dollars": "0.3100",
              "no_ask_dollars": "0.3200",
              "last_price_dollars": "0.6900",
              "volume_24h_fp": "469.76",
              "volume_fp": "21684.36",
              "open_interest_fp": "9714.09"
            },
            {
              "ticker": "CONTROLS-2028-R",
              "title": "Will the Republican party win the Senate in 2028?",
              "yes_sub_title": "Republican party",
              "no_sub_title": "Republican party",
              "event_ticker": "CONTROLS-2028",
              "market_type": "binary",
              "status": "active",
              "open_time": "2026-05-15T21:00:00Z",
              "close_time": "2029-02-01T15:00:00Z",
              "updated_time": "2026-10-10T09:24:32.172812Z",
              "strike_type": "custom",
              "custom_strike": {
                "Chamber of Congress": "Senate",
                "Party": "Republican"
              },
              "yes_bid_dollars": "0.2700",
              "yes_ask_dollars": "0.3100",
              "no_bid_dollars": "0.6900",
              "no_ask_dollars": "0.7300",
              "last_price_dollars": "0.3900",
              "volume_24h_fp": "594.55",
              "volume_fp": "11933.26",
              "open_interest_fp": "6878.23"
            }
          ]
        }
      ],
      "cursor": ""
    },
    "SENATETX": {
      "events": [
        {
          "title": "Texas Senate winner?",
          "sub_title": "In 2026",
          "category": "Elections",
          "event_ticker": "SENATETX-26",
          "series_ticker": "SENATETX",
          "markets": [
            {
              "ticker": "SENATETX-26-R",
              "title": "Will Republicans win the Senate race in Texas?",
              "yes_sub_title": "Ken Paxton",
              "no_sub_title": "Ken Paxton",
              "event_ticker": "SENATETX-26",
              "market_type": "binary",
              "status": "active",
              "open_time": "2024-12-03T15:00:00Z",
              "close_time": "2027-11-03T15:00:00Z",
              "updated_time": "2026-10-16T16:28:02.227352Z",
              "strike_type": "structured",
              "custom_strike": {
                "political_party": "9244ed4c-9dfd-45cc-8211-996dc902f315",
                "politician": "d4bfe1e1-5c3a-4f03-8535-ad8f3b4e3e3a"
              },
              "yes_bid_dollars": "0.3000",
              "yes_ask_dollars": "0.3100",
              "no_bid_dollars": "0.6900",
              "no_ask_dollars": "0.7000",
              "last_price_dollars": "0.3100",
              "volume_24h_fp": "11709904.13",
              "volume_fp": "61267766.27",
              "open_interest_fp": "49392138.86"
            },
            {
              "ticker": "SENATETX-26-D",
              "title": "Will Democratics win the Senate race in Texas?",
              "yes_sub_title": "James Talarico",
              "no_sub_title": "James Talarico",
              "event_ticker": "SENATETX-26",
              "market_type": "binary",
              "status": "active",
              "open_time": "2024-12-03T15:00:00Z",
              "close_time": "2027-11-03T15:00:00Z",
              "updated_time": "2026-09-15T21:47:35.149756Z",
              "strike_type": "structured",
              "custom_strike": {
                "political_party": "57fa2293-3102-463b-9087-68cd9f6da0a6",
                "politician": "167db0b1-561c-4537-9516-ec3689250308"
              },
              "yes_bid_dollars": "0.6900",
              "yes_ask_dollars": "0.7000",
              "no_bid_dollars": "0.3000",
              "no_ask_dollars": "0.3100",
              "last_price_dollars": "0.7000",
              "volume_24h_fp": "3715191.65",
              "volume_fp": "25345425.05",
              "open_interest_fp": "18457113.70"
            }
          ]
        }
      ],
      "cursor": ""
    }
  },
};

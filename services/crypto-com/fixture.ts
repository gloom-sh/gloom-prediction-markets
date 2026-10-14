import type {
  CryptoComEvent,
  CryptoComInstrument,
  CryptoComTicker,
} from "./types";

/** Trimmed live responses from public/get-events, public/get-instruments, and public/get-tickers. */
export const cryptoComCatalogFixture: {
  events: CryptoComEvent[];
  instruments: CryptoComInstrument[];
  tickers: CryptoComTicker[];
} = {
  "events": [
    {
      "symbol": "CRYPT-00042-26",
      "series_symbols": [],
      "name": "Will Bitcoin be above $200k by next year?",
      "description": "Will Bitcoin be above $200k by next year?",
      "event_date": 1801436400000000000,
      "event_end_date": 1798779540000000000,
      "last_updated_time": 1776793136531000000,
      "event_details": {
        "metaData": {
          "NAME": "Will Bitcoin be above $200k by next year?",
          "VERSION": "3.0",
          "FEED_TYPE": "SINGLES",
          "EVENT_DATE": "2027-01-31T23:00:00+00:00",
          "EVENT_END_DATE": "2027-01-01T04:59:00+00:00",
          "SPORTS_GROUPING": "",
          "PREDICT_CATEGORY": "Crypto"
        },
        "eventName": "Will Bitcoin be above $200k by next year?"
      }
    },
    {
      "symbol": "ELECT-00128-26",
      "series_symbols": [
        "ELECT2027"
      ],
      "name": "Prime Minister of Israel After the 2026 Election",
      "description": "Prime Minister of Israel After the 2026 Election",
      "event_date": 1825020000000000000,
      "event_end_date": 1793159940000000000,
      "last_updated_time": 1790969223957000000,
      "event_details": {
        "metaData": {
          "NAME": "Prime Minister of Israel After the 2026 Election",
          "VERSION": "3.0",
          "FEED_TYPE": "SINGLES",
          "EVENT_DATE": "2027-10-31T22:00:00+00:00",
          "EVENT_END_DATE": "2026-10-28T03:59:00+00:00",
          "PREDICT_CATEGORY": "Politics",
          "METADATA_EVENT_DATE": "2027-10-31T22:00:00+00:00",
          "SPORTS_GROUPING": null
        },
        "eventName": "Prime Minister of Israel After the 2026 Election"
      }
    },
    {
      "symbol": "MLB-00063-2026",
      "series_symbols": [
        "MLB2026"
      ],
      "name": "Dodgers vs Brewers Series Total Games",
      "description": "Dodgers vs Brewers Series Total Games",
      "event_date": 1791691200000000000,
      "event_end_date": null,
      "last_updated_time": 1791475969792000000,
      "event_details": {
        "metaData": {
          "NAME": "Dodgers vs Brewers Series Total Games",
          "LEAGUE": "MLB",
          "VERSION": "3.0",
          "FEED_TYPE": "SINGLES",
          "EVENT_DATE": "2026-10-11T04:00:00+00:00",
          "SPORTS_GROUPING": "MLB",
          "AWAY_PARTICIPANT": "Dodgers",
          "EXTERNAL_AWAY_ID": "10000001",
          "EXTERNAL_HOME_ID": "10000032",
          "HOME_PARTICIPANT": "Brewers",
          "PREDICT_CATEGORY": "Sports",
          "PREDICT_EVENT_TYPE": "Tournament",
          "METADATA_EVENT_DATE": "2026-10-11T04:00:00+00:00"
        },
        "eventName": "Dodgers vs Brewers Series Total Games"
      }
    },
    {
      "symbol": "EC-00046-26",
      "series_symbols": [
        "EC2026"
      ],
      "name": "Unemployment Rate in Oct 2026",
      "description": "Unemployment Rate in Oct 2026",
      "event_date": 1794092400000000000,
      "event_end_date": 1793971800000000000,
      "last_updated_time": 1791476364717000000,
      "event_details": {
        "metaData": {
          "NAME": "Unemployment Rate in Oct 2026",
          "VERSION": "3.0",
          "FEED_TYPE": "SINGLES",
          "EVENT_DATE": "2026-11-07T23:00:00+00:00",
          "EVENT_END_DATE": "2026-11-06T13:30:00+00:00",
          "PREDICT_CATEGORY": "Economics",
          "METADATA_EVENT_DATE": "2026-11-07T23:00:00+00:00",
          "SPORTS_GROUPING": null
        },
        "eventName": "Unemployment Rate in Oct 2026"
      }
    }
  ],
  "instruments": [
    {
      "symbol": "NX.F.OPT.CRYPT-00042-26.O.1.1",
      "inst_id": 841157,
      "inst_type": "BINARY_OPTION",
      "display_name": "Will Bitcoin be above $200k by next year? ; Yes",
      "tradable": true,
      "expiry_timestamp_ms": 1801436400000,
      "underlying_symbol": "CRYPT-00042-26",
      "last_updated_time": 1789714222794866109,
      "price_tick_size": "0.01",
      "quote_decimals": 2,
      "event_details": {
        "eventName": "Yes to win",
        "eventCode": "20260421123453397",
        "metaData": {
          "NAME": "Will Bitcoin be above $200k by next year?",
          "PARTICIPANT": "Yes",
          "ALPHA_STRIKE": "Yes to win",
          "PREDICT_CATEGORY": "Crypto",
          "PREDICT_CONTRACT_TYPE": "Will Bitcoin be above $200k by next year?",
          "EVENT_DATE": "2027-01-31T23:00:00+00:00",
          "EVENT_END_DATE": "2027-01-01T04:59:00+00:00"
        },
        "attributes": {
          "STRIKE_PRICE": "1",
          "OPEN_TIME": "20260421-03:00:00.000",
          "CLOSE_TIME": "20270131-23:00:00.000",
          "STRIKE_OPERATOR": ">=",
          "UNDERLYING_ROUNDING_VALUE": "0.01",
          "STRIKE_INDEX": "1",
          "DISPLAY_PRECISION": "2",
          "PERIOD_CODE": "O",
          "PERIOD_INDEX": "1"
        }
      }
    },
    {
      "symbol": "NX.F.OPT.ELECT-00128-26.O.1.3.20271031",
      "inst_id": 9480588,
      "inst_type": "BINARY_OPTION",
      "display_name": "Prime Minister of Israel After the 2026 Election ; Naftali Bennett (Together)",
      "tradable": true,
      "expiry_timestamp_ms": 1825020000000,
      "underlying_symbol": "ELECT-00128-26",
      "last_updated_time": 1790969225656320048,
      "price_tick_size": "0.01",
      "quote_decimals": 2,
      "event_details": {
        "eventName": "Naftali Bennett (Together) to win",
        "eventCode": "202610021927031790969223034925957",
        "metaData": {
          "NAME": "Prime Minister of Israel After the 2026 Election",
          "PARTICIPANT": "Naftali Bennett (Together)",
          "ALPHA_STRIKE": "Naftali Bennett (Together) to win",
          "PREDICT_CATEGORY": "Politics",
          "PREDICT_CONTRACT_TYPE": "Prime Minister of Israel After the 2026 Election",
          "EVENT_DATE": "2027-10-31T22:00:00+00:00",
          "EVENT_END_DATE": "2026-10-28T03:59:00+00:00"
        },
        "attributes": {
          "STRIKE_PRICE": "0.03",
          "OPEN_TIME": "20261002-03:00:00.000",
          "CLOSE_TIME": "20271031-22:00:00.000",
          "STRIKE_OPERATOR": ">=",
          "UNDERLYING_ROUNDING_VALUE": "0.01",
          "STRIKE_INDEX": "3",
          "DISPLAY_PRECISION": "2",
          "PERIOD_CODE": "O",
          "PERIOD_INDEX": "1"
        }
      }
    },
    {
      "symbol": "NX.F.OPT.ELECT-00128-26.O.1.2.20271031",
      "inst_id": 9480587,
      "inst_type": "BINARY_OPTION",
      "display_name": "Prime Minister of Israel After the 2026 Election ; Benjamin Netanyahu (Likud)",
      "tradable": true,
      "expiry_timestamp_ms": 1825020000000,
      "underlying_symbol": "ELECT-00128-26",
      "last_updated_time": 1790969224763976688,
      "price_tick_size": "0.01",
      "quote_decimals": 2,
      "event_details": {
        "eventName": "Benjamin Netanyahu (Likud) to win",
        "eventCode": "202610021927031790969223011262905",
        "metaData": {
          "NAME": "Prime Minister of Israel After the 2026 Election",
          "PARTICIPANT": "Benjamin Netanyahu (Likud)",
          "ALPHA_STRIKE": "Benjamin Netanyahu (Likud) to win",
          "PREDICT_CATEGORY": "Politics",
          "PREDICT_CONTRACT_TYPE": "Prime Minister of Israel After the 2026 Election",
          "EVENT_DATE": "2027-10-31T22:00:00+00:00",
          "EVENT_END_DATE": "2026-10-28T03:59:00+00:00"
        },
        "attributes": {
          "STRIKE_PRICE": "0.02",
          "OPEN_TIME": "20261002-03:00:00.000",
          "CLOSE_TIME": "20271031-22:00:00.000",
          "STRIKE_OPERATOR": ">=",
          "UNDERLYING_ROUNDING_VALUE": "0.01",
          "STRIKE_INDEX": "2",
          "DISPLAY_PRECISION": "2",
          "PERIOD_CODE": "O",
          "PERIOD_INDEX": "1"
        }
      }
    },
    {
      "symbol": "NX.F.OPT.MLB-00063-2026.O.1.3.20261231",
      "inst_id": 9843230,
      "inst_type": "BINARY_OPTION",
      "display_name": "Dodgers vs Brewers Series Total Games ; Over 6.5 total games",
      "tradable": true,
      "expiry_timestamp_ms": 1798758000000,
      "underlying_symbol": "MLB-00063-2026",
      "last_updated_time": 1791475971482649899,
      "price_tick_size": "0.01",
      "quote_decimals": 2,
      "event_details": {
        "eventName": "Over 6.5 total games to win",
        "eventCode": "202610081612481791475968857708430",
        "metaData": {
          "NAME": "Dodgers vs Brewers Series Total Games",
          "PARTICIPANT": "Over 6.5 total games",
          "ALPHA_STRIKE": "Over 6.5 total games to win",
          "PREDICT_CATEGORY": "Sports",
          "PREDICT_CONTRACT_TYPE": "Series Total Games",
          "SPORTS_GROUPING": "MLB",
          "LEAGUE": "MLB",
          "EVENT_DATE": "2026-10-11T04:00:00+00:00"
        },
        "attributes": {
          "STRIKE_PRICE": "0.03",
          "OPEN_TIME": "20261008-03:00:00.000",
          "CLOSE_TIME": "20261231-23:00:00.000",
          "STRIKE_OPERATOR": ">=",
          "UNDERLYING_ROUNDING_VALUE": "0.01",
          "STRIKE_INDEX": "3",
          "DISPLAY_PRECISION": "2",
          "PERIOD_CODE": "O",
          "PERIOD_INDEX": "1"
        }
      }
    },
    {
      "symbol": "NX.F.OPT.MLB-00063-2026.O.1.2.20261231",
      "inst_id": 9843229,
      "inst_type": "BINARY_OPTION",
      "display_name": "Dodgers vs Brewers Series Total Games ; Over 5.5 total games",
      "tradable": true,
      "expiry_timestamp_ms": 1798758000000,
      "underlying_symbol": "MLB-00063-2026",
      "last_updated_time": 1791475970643521723,
      "price_tick_size": "0.01",
      "quote_decimals": 2,
      "event_details": {
        "eventName": "Over 5.5 total games to win",
        "eventCode": "202610081612481791475968832263034",
        "metaData": {
          "NAME": "Dodgers vs Brewers Series Total Games",
          "PARTICIPANT": "Over 5.5 total games",
          "ALPHA_STRIKE": "Over 5.5 total games to win",
          "PREDICT_CATEGORY": "Sports",
          "PREDICT_CONTRACT_TYPE": "Series Total Games",
          "SPORTS_GROUPING": "MLB",
          "LEAGUE": "MLB",
          "EVENT_DATE": "2026-10-11T04:00:00+00:00"
        },
        "attributes": {
          "STRIKE_PRICE": "0.02",
          "OPEN_TIME": "20261008-03:00:00.000",
          "CLOSE_TIME": "20261231-23:00:00.000",
          "STRIKE_OPERATOR": ">=",
          "UNDERLYING_ROUNDING_VALUE": "0.01",
          "STRIKE_INDEX": "2",
          "DISPLAY_PRECISION": "2",
          "PERIOD_CODE": "O",
          "PERIOD_INDEX": "1"
        }
      }
    }
  ],
  "tickers": [
    {
      "i": "NX.F.OPT.CRYPT-00042-26.O.1.1",
      "h": "0.02",
      "l": "0.02",
      "a": "0.02",
      "v": "151",
      "vv": "151.00",
      "c": "0",
      "b": "0.01",
      "k": "0.12",
      "oi": null,
      "w": "4556",
      "ww": "4556.00",
      "t": 1791470054718
    },
    {
      "i": "NX.F.OPT.ELECT-00128-26.O.1.3.20271031",
      "h": null,
      "l": null,
      "a": null,
      "v": "0",
      "vv": "0",
      "c": "0",
      "b": "0.01",
      "k": "0.15",
      "oi": "0",
      "w": "0",
      "ww": "0",
      "t": 1791454782161
    },
    {
      "i": "NX.F.OPT.ELECT-00128-26.O.1.2.20271031",
      "h": null,
      "l": null,
      "a": null,
      "v": "0",
      "vv": "0",
      "c": "0",
      "b": "0.32",
      "k": "0.41",
      "oi": "0",
      "w": "0",
      "ww": "0",
      "t": 1791475533549
    }
  ]
};

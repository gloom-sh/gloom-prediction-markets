export interface PascalWindowStats {
  taker_buy_volume_notional?: string;
  taker_sell_volume_notional?: string;
}

export interface PascalMarket {
  symbol?: string;
  mark_price?: string;
  best_bid?: string;
  best_ask?: string;
  open_interest?: string;
  long_interest?: string;
  listing_ts_ms?: string;
  resolution?: { price?: string };
  stats?: {
    last_24h?: PascalWindowStats;
    all_time?: PascalWindowStats;
  };
  display_attributes?: {
    event_description?: string;
    market_description?: string;
    expected_resolution_time_ms?: string;
    tags?: string[];
    topic?: { id?: string; description?: string };
  };
}

export interface PascalMarketsEnvelope {
  status?: string;
  data?: PascalMarket[] | { message?: string; code?: string };
}

export interface CryptoComEvent {
  symbol?: string;
  series_symbols?: string[];
  name?: string;
  description?: string;
  event_date?: number | string | null;
  event_end_date?: number | string | null;
  last_updated_time?: number | string | null;
  status?: string;
  event_details?: {
    eventName?: string;
    metaData?: Record<string, unknown>;
  };
}

export interface CryptoComInstrument {
  symbol?: string;
  inst_id?: number | string;
  inst_type?: string;
  display_name?: string;
  tradable?: boolean;
  expiry_timestamp_ms?: number | string | null;
  underlying_symbol?: string;
  last_updated_time?: number | string | null;
  price_tick_size?: string | number;
  quote_decimals?: number;
  status?: string;
  event_details?: {
    eventCode?: string;
    eventName?: string;
    metaData?: Record<string, unknown>;
    attributes?: Record<string, string>;
  };
}

/** public/get-tickers. `a` is the latest trade, `b` the best bid, and `k` the best ask. */
export interface CryptoComTicker {
  i?: string;
  a?: string | number | null;
  b?: string | number | null;
  k?: string | number | null;
  h?: string | number | null;
  l?: string | number | null;
  c?: string | number | null;
  v?: string | number | null;
  vv?: string | number | null;
  oi?: string | number | null;
  w?: string | number | null;
  ww?: string | number | null;
  t?: number | string | null;
}

export interface CryptoComResponse<T> {
  code?: number;
  message?: string;
  result?: {
    data?: T[];
    next_cursor?: string | null;
  };
}

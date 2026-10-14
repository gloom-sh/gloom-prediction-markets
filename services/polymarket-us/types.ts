export interface PolymarketUsAmount {
  value?: string | number | null;
  currency?: string | null;
}

export interface PolymarketUsMarketSide {
  id?: string | number | null;
  description?: string | null;
  price?: string | number | null;
  long?: boolean | null;
  quote?: PolymarketUsAmount | null;
}

/** Event fields are not on the markets list. Present when a parent event is attached. */
export interface PolymarketUsEventRef {
  id?: string | number | null;
  title?: string | null;
  openInterest?: string | number | null;
  volume24hr?: string | number | null;
  volume?: string | number | null;
}

export interface PolymarketUsTag {
  label?: string | null;
  slug?: string | null;
}

export interface PolymarketUsMarketRecord {
  id?: string | number | null;
  question?: string | null;
  slug?: string | null;
  title?: string | null;
  titleShort?: string | null;
  subtitle?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: Array<string | PolymarketUsTag> | null;
  endDate?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  closed?: boolean | null;
  active?: boolean | null;
  outcomes?: string | string[] | null;
  outcomePrices?: string | string[] | null;
  marketSides?: PolymarketUsMarketSide[] | null;
  bestBidQuote?: PolymarketUsAmount | null;
  bestAskQuote?: PolymarketUsAmount | null;
  volume?: string | number | null;
  volumeNum?: string | number | null;
  volume24hr?: string | number | null;
  volume24h?: string | number | null;
  openInterest?: string | number | null;
  liquidity?: string | number | null;
  liquidityNum?: string | number | null;
  event?: PolymarketUsEventRef | null;
}

export interface PolymarketUsMarketsResponse {
  markets?: PolymarketUsMarketRecord[] | null;
}

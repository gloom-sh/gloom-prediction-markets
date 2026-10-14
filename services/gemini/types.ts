export interface GeminiContractPrices {
  bestBid?: string | number | null;
  bestAsk?: string | number | null;
  lastTradePrice?: string | number | null;
}

export interface GeminiContractRecord {
  id?: string;
  label?: string | null;
  instrumentSymbol?: string | null;
  status?: string | null;
  prices?: GeminiContractPrices | null;
  expiryDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  volume?: string | number | null;
  volume24h?: string | number | null;
  openInterest?: string | number | null;
  liquidity?: string | number | null;
}

export interface GeminiEventRecord {
  id?: string;
  title?: string | null;
  slug?: string | null;
  ticker?: string | null;
  status?: string | null;
  category?: string | null;
  tags?: Array<string | null> | null;
  contracts?: GeminiContractRecord[] | null;
  expiryDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  volume?: string | number | null;
  volume24h?: string | number | null;
  openInterest?: string | number | null;
  liquidity?: string | number | null;
}

export interface GeminiEventsResponse {
  data?: GeminiEventRecord[];
  pagination?: {
    limit?: number;
    offset?: number;
    total?: number;
  };
}

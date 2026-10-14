export interface LimitlessTradeQuote {
  market?: Array<number | string | null>;
  limit?: Array<number | string | null>;
}

export interface LimitlessProperty {
  propertyKeySlug?: string;
  value?: string[];
}

export interface LimitlessActiveMarket {
  id?: number | string;
  title?: string;
  proxyTitle?: string | null;
  slug?: string | null;
  description?: string | null;
  status?: string;
  expired?: boolean;
  hidden?: boolean;
  winningOutcomeIndex?: number | null;
  marketType?: string;
  groupId?: number | string | null;
  categories?: string[];
  tags?: string[];
  properties?: LimitlessProperty[];
  prices?: Array<number | string | null>;
  tradePrices?: {
    buy?: LimitlessTradeQuote;
    sell?: LimitlessTradeQuote;
  };
  volume?: string | number | null;
  volumeFormatted?: string | number | null;
  volume24h?: string | number | null;
  volume24hFormatted?: string | number | null;
  volume24hr?: string | number | null;
  volume24hrFormatted?: string | number | null;
  liquidity?: string | number | null;
  liquidityFormatted?: string | number | null;
  openInterest?: string | number | null;
  openInterestFormatted?: string | number | null;
  expirationTimestamp?: number | null;
  expirationDate?: string | null;
  updatedAt?: string | null;
  conditionId?: string | null;
  tokens?: {
    yes?: string;
    no?: string;
  };
  collateralToken?: {
    decimals?: number;
  };
  markets?: LimitlessActiveMarket[];
}

export interface LimitlessActiveMarketsResponse {
  data?: LimitlessActiveMarket[];
  totalMarketsCount?: number;
}

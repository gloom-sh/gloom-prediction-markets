import { describe, expect, test } from "bun:test";
import { matchSettlement, type SettlementMatch } from "./settlement";

type ListedMatch = Omit<SettlementMatch, "chart" | "catalog">;

const cf = {
  label: "CF Benchmarks index",
  command: null,
};

const pyth = {
  label: "Pyth price at the settle time",
  command: null,
};

const binance = {
  label: "Binance price",
  command: null,
};

const cpi = {
  label: "CPI-U",
  command: "CPI",
};

const payrolls = {
  label: "Payrolls and unemployment",
  command: "ECST",
};

const gdp = {
  label: "GDP and PCE",
  command: "ECST",
};

const recession = {
  label: "NBER recession dates",
  command: null,
};

const treasury = {
  label: "Treasury yield",
  command: "GC",
};

const aaa = {
  label: "AAA regular gasoline",
  command: null,
};

const eia = {
  label: "EIA petroleum",
  command: "DOE",
};

const exchange = {
  label: "Exchange settlement",
  command: "CTM",
};

const weather = {
  label: "Station temperature",
  command: null,
};

const fed = {
  label: "Fed funds target",
  command: "WIRP",
};

const score = {
  label: "Final score",
  command: null,
};

const bill = {
  label: "Congress bill",
  command: null,
};

const register = {
  label: "Federal Register",
  command: null,
};

const strait = {
  label: "Strait traffic",
  command: "CHOKE",
};

const quake = {
  label: "Earthquake",
  command: null,
};

const cases: Array<{
  name: string;
  input: Parameters<typeof matchSettlement>[0];
  match: ListedMatch | null;
  chart?: string | null;
  catalog?: string | null;
}> = [
  { name: "matches a BTC series to CF Benchmarks", input: { seriesTicker: "KXBTC" }, match: cf },
  { name: "matches an ETH series prefix to CF Benchmarks", input: { seriesTicker: "KXETHMAX" }, match: cf },
  { name: "matches a lowercase SOL series to CF Benchmarks", input: { seriesTicker: "kxsol" }, match: cf },
  { name: "matches an XRP event suffix to CF Benchmarks", input: { eventTicker: "KXXRP-26DEC" }, match: cf },
  {
    name: "matches cfbenchmarks.com",
    input: { resolutionSource: "https://www.cfbenchmarks.com/indices/BRTI" },
    match: cf,
  },
  {
    name: "matches a www-prefixed uppercase CF Benchmarks host",
    input: { resolutionSource: "https://WWW.CFBENCHMARKS.COM/indices" },
    match: cf,
  },
  { name: "matches KXBTC15M to CF Benchmarks, not Pyth", input: { seriesTicker: "KXBTC15M" }, match: cf },
  { name: "matches KXSOL15M to CF Benchmarks, not Pyth", input: { seriesTicker: "KXSOL15M" }, match: cf },
  {
    name: "prefers CF Benchmarks when the series is BTC and the host is Binance",
    input: { seriesTicker: "KXBTC", resolutionSource: "https://www.binance.com/en" },
    match: cf,
  },
  { name: "matches KXWTI15M to Pyth, not CTM", input: { seriesTicker: "KXWTI15M" }, match: pyth },
  { name: "matches a pyth host", input: { resolutionSource: "https://hermes.pyth.network/v2/price" }, match: pyth },
  { name: "matches www.pyth.network", input: { resolutionSource: "https://www.pyth.network/price" }, match: pyth },
  {
    name: "prefers Pyth when the host contains pyth and the series is KXWTI",
    input: { seriesTicker: "KXWTI", resolutionSource: "https://pyth.network/price" },
    match: pyth,
  },
  { name: "matches binance.com", input: { resolutionSource: "https://www.binance.com/en/price/bitcoin" }, match: binance },
  { name: "matches KXCPI", input: { seriesTicker: "KXCPI" }, match: cpi, chart: "FRED:CPIAUCSL" },
  { name: "matches KXCPIYOY-26SEP to CPI", input: { eventTicker: "KXCPIYOY-26SEP" }, match: cpi, chart: "FRED:CPIAUCNS" },
  { name: "matches a lowercase CPI event suffix", input: { seriesTicker: "kxcpiyoy-26sep" }, match: cpi, chart: "FRED:CPIAUCNS" },
  { name: "matches KXCPICORE", input: { seriesTicker: "KXCPICORE" }, match: cpi, chart: "FRED:CPILFESL" },
  { name: "matches KXCPICOREYOY", input: { seriesTicker: "KXCPICOREYOY" }, match: cpi, chart: "FRED:CPILFENS" },
  { name: "matches KXECONSTATCPI", input: { seriesTicker: "KXECONSTATCPI" }, match: cpi, chart: "FRED:CPIAUCSL" },
  {
    name: "matches bls.gov when the title mentions inflation",
    input: { resolutionSource: "https://www.bls.gov/cpi/", title: "Year-over-year inflation" },
    match: cpi,
    chart: "FRED:CPIAUCNS",
  },
  {
    name: "matches bls.gov when the title mentions CPI",
    input: { resolutionSource: "https://bls.gov/news", title: "CPI-U rose" },
    match: cpi,
    chart: "FRED:CPIAUCSL",
  },
  {
    name: "prefers CPI when a BLS title mentions both CPI and unemployment",
    input: { resolutionSource: "https://www.bls.gov/news", title: "CPI and unemployment" },
    match: cpi,
    chart: "FRED:CPIAUCSL",
  },
  { name: "matches KXPAYROLLS", input: { seriesTicker: "KXPAYROLLS" }, match: payrolls, chart: "FRED:PAYEMS" },
  { name: "matches KXU3", input: { seriesTicker: "KXU3" }, match: payrolls, chart: "FRED:UNRATE" },
  { name: "matches KXJOBLESS", input: { eventTicker: "KXJOBLESS-26OCT" }, match: payrolls, chart: "FRED:ICSA" },
  {
    name: "matches bls.gov when the title mentions unemployment",
    input: { resolutionSource: "https://www.bls.gov/lau/", title: "Unemployment rate" },
    match: payrolls,
    chart: "FRED:UNRATE",
  },
  {
    name: "matches dol.gov when the title mentions jobless claims",
    input: { resolutionSource: "https://www.dol.gov/ui/data.pdf", title: "Weekly jobless claims" },
    match: payrolls,
    chart: "FRED:ICSA",
  },
  {
    name: "matches dol.gov when the title mentions payrolls",
    input: { resolutionSource: "https://dol.gov/news", title: "Nonfarm payrolls" },
    match: payrolls,
    chart: "FRED:PAYEMS",
  },
  { name: "matches KXGDP", input: { seriesTicker: "KXGDP" }, match: gdp, chart: "FRED:GDPC1" },
  { name: "matches KXPCECORE", input: { seriesTicker: "KXPCECORE" }, match: gdp, chart: "FRED:PCEPILFE" },
  {
    name: "matches bea.gov when the title mentions GDP",
    input: { resolutionSource: "https://www.bea.gov/data/gdp", title: "Real GDP growth" },
    match: gdp,
    chart: "FRED:GDPC1",
  },
  {
    name: "matches bea.gov when the title mentions PCE",
    input: { resolutionSource: "https://bea.gov/data/pce", title: "Core PCE" },
    match: gdp,
    chart: "FRED:PCEPILFE",
  },
  {
    name: "prefers GDP when a BEA title also mentions a recession",
    input: { resolutionSource: "https://www.bea.gov/gdp", title: "GDP during a recession" },
    match: gdp,
    chart: "FRED:GDPC1",
  },
  {
    name: "matches a BEA recession title that is not the GDP print",
    input: { resolutionSource: "https://www.bea.gov/news", title: "NBER recession dates" },
    match: recession,
  },
  { name: "matches a T-note series prefix", input: { seriesTicker: "KXTNOTE10Y" }, match: treasury, chart: "UST:10Y" },
  { name: "matches a Treasury series prefix", input: { eventTicker: "KXUST2Y-26" }, match: treasury, chart: "UST:2Y" },
  {
    name: "matches home.treasury.gov when the title mentions yield",
    input: { resolutionSource: "https://home.treasury.gov/data", title: "10-year yield" },
    match: treasury,
    chart: "UST:10Y",
  },
  {
    name: "matches home.treasury.gov when the title mentions treasuries",
    input: { resolutionSource: "https://www.home.treasury.gov/auctions", title: "Treasury auctions" },
    match: treasury,
    chart: "UST:10Y",
  },
  { name: "matches an AAA gasoline series prefix", input: { seriesTicker: "KXAAAGASW" }, match: aaa },
  {
    name: "matches gasprices.aaa.com",
    input: { resolutionSource: "https://gasprices.aaa.com/state-gas-price-averages/" },
    match: aaa,
  },
  { name: "matches KXGAS", input: { seriesTicker: "KXGAS" }, match: eia },
  { name: "matches KXOIL", input: { seriesTicker: "KXOIL" }, match: eia },
  {
    name: "matches eia.gov when the title mentions gas",
    input: { resolutionSource: "https://www.eia.gov/petroleum/", title: "Weekly gasoline stocks" },
    match: eia,
  },
  {
    name: "matches eia.gov when the title mentions oil",
    input: { resolutionSource: "https://eia.gov/petroleum/supply", title: "Crude oil" },
    match: eia,
  },
  { name: "matches KXWTI", input: { seriesTicker: "KXWTI" }, match: exchange, chart: "FUT:CL" },
  {
    name: "matches theice.com",
    input: { resolutionSource: "https://www.theice.com/products/futures" },
    match: exchange,
  },
  { name: "matches ice.com", input: { resolutionSource: "https://ice.com/energy" }, match: exchange },
  { name: "matches a high-temperature series prefix", input: { seriesTicker: "KXHIGHNY" }, match: weather, chart: "WX:NYC:high", catalog: null },
  { name: "matches a low-temperature series prefix", input: { seriesTicker: "KXLOWT" }, match: weather },
  { name: "matches a rain series prefix", input: { seriesTicker: "KXRAIN" }, match: weather },
  { name: "matches a temperature series prefix", input: { eventTicker: "KXTEMP-26SEP" }, match: weather },
  { name: "matches weather.com", input: { resolutionSource: "https://weather.com/forecast" }, match: weather },
  { name: "matches weather.gov", input: { resolutionSource: "https://www.weather.gov/obs" }, match: weather },
  {
    name: "matches forecast.weather.gov",
    input: { resolutionSource: "https://forecast.weather.gov/MapClick.php" },
    match: weather,
  },
  {
    name: "strips one leading www from forecast.weather.gov",
    input: { resolutionSource: "https://www.forecast.weather.gov/MapClick.php" },
    match: weather,
  },
  { name: "matches KXFEDDECISION", input: { seriesTicker: "KXFEDDECISION" }, match: fed, chart: "FRED:DFEDTARU" },
  { name: "matches KXFED", input: { seriesTicker: "KXFED" }, match: fed, chart: "FRED:DFEDTARU" },
  { name: "matches KXFED from an event suffix", input: { eventTicker: "KXFED-27APR" }, match: fed, chart: "FRED:DFEDTARU" },
  { name: "matches KXRATECUT", input: { seriesTicker: "KXRATECUT" }, match: fed, chart: "FRED:DFEDTARU" },
  {
    name: "matches federalreserve.gov when the title mentions the Fed",
    input: { resolutionSource: "https://www.federalreserve.gov/monetarypolicy", title: "Fed holds" },
    match: fed,
    chart: "FRED:DFEDTARU",
  },
  {
    name: "matches federalreserve.gov when the title mentions the FOMC",
    input: { resolutionSource: "https://federalreserve.gov/fomc", title: "FOMC minutes" },
    match: fed,
    chart: "FRED:DFEDTARU",
  },
  {
    name: "matches federalreserve.gov when the title mentions a rate",
    input: { resolutionSource: "https://www.federalreserve.gov/", title: "Target rate" },
    match: fed,
    chart: "FRED:DFEDTARU",
  },
  { name: "matches espn.com", input: { resolutionSource: "https://www.espn.com/nfl/game" }, match: score },
  { name: "matches foxsports.com", input: { resolutionSource: "https://www.foxsports.com/nba" }, match: score },
  { name: "matches nfl.com", input: { resolutionSource: "https://www.nfl.com/scores" }, match: score },
  { name: "matches nba.com", input: { resolutionSource: "https://www.nba.com/game" }, match: score },
  { name: "matches mlb.com", input: { resolutionSource: "https://www.mlb.com/scores" }, match: score },
  { name: "matches ncaa.com", input: { resolutionSource: "https://www.ncaa.com/game" }, match: score },
  { name: "matches fifa.com", input: { resolutionSource: "https://www.fifa.com/match" }, match: score },
  { name: "matches nhl.com", input: { resolutionSource: "https://www.nhl.com/game" }, match: score },
  { name: "matches a Sports category", input: { category: "Sports", title: "Who wins?" }, match: score },
  {
    name: "matches congress.gov when the title mentions a bill",
    input: { resolutionSource: "https://www.congress.gov/bill/119th-congress", title: "The bill failed" },
    match: bill,
  },
  {
    name: "matches congress.gov when the title mentions H.R.",
    input: { resolutionSource: "https://congress.gov/bill", title: "H.R. 1" },
    match: bill,
  },
  {
    name: "matches congress.gov when the title mentions an act",
    input: { resolutionSource: "https://www.congress.gov/bill", title: "An Act to provide funding" },
    match: bill,
  },
  {
    name: "matches federalregister.gov",
    input: { resolutionSource: "https://www.federalregister.gov/documents/2026/01/01" },
    match: register,
  },
  {
    name: "matches portwatch.imf.org",
    input: { resolutionSource: "https://portwatch.imf.org/pages/data" },
    match: strait,
  },
  {
    name: "graphs a named strait",
    input: { resolutionSource: "https://portwatch.imf.org/pages/data", title: "Strait of Hormuz traffic" },
    match: strait,
    chart: "GEO:HORMUZ",
  },
  {
    name: "matches earthquake.usgs.gov",
    input: { resolutionSource: "https://earthquake.usgs.gov/earthquakes/eventpage/abc" },
    match: quake,
  },
  {
    name: "returns null for an nytimes.com resolution source",
    input: {
      resolutionSource: "https://www.nytimes.com/2026/04/01/business/cpi.html",
      title: "CPI rose more than expected",
    },
    match: null,
  },
  {
    name: "returns null for a congress.gov title that is a senate race",
    input: {
      resolutionSource: "https://www.congress.gov/member/senate",
      title: "Senate race in Ohio",
    },
    match: null,
  },
  { name: "returns null for an empty input", input: {}, match: null },
  {
    name: "returns null when every field is null",
    input: {
      seriesTicker: null,
      eventTicker: null,
      title: null,
      resolutionSource: null,
      category: null,
    },
    match: null,
  },
  {
    name: "returns null when the resolution source is not a URL",
    input: { resolutionSource: "BLS", title: "CPI rose" },
    match: null,
  },
  {
    name: "returns null when pyth is only in the path",
    input: { resolutionSource: "https://example.com/pyth/price" },
    match: null,
  },
  {
    name: "returns null for bls.gov without a CPI or labor title",
    input: { resolutionSource: "https://www.bls.gov/eci/", title: "Employment cost index" },
    match: null,
  },
  {
    name: "returns null for bea.gov without GDP, PCE, or a recession",
    input: { resolutionSource: "https://www.bea.gov/news", title: "Personal income" },
    match: null,
  },
  {
    name: "returns null for eia.gov without gas or oil",
    input: { resolutionSource: "https://www.eia.gov/electricity/", title: "Electricity generation" },
    match: null,
  },
  {
    name: "returns null for federalreserve.gov without a Fed, FOMC, or rate title",
    input: { resolutionSource: "https://www.federalreserve.gov/publications", title: "Beige book" },
    match: null,
  },
  {
    name: "does not strip an event suffix that does not start with digits",
    input: { seriesTicker: "KXFED-DEC" },
    match: null,
  },
  {
    name: "uses the series ticker before the event ticker",
    input: { seriesTicker: "KXCPI", eventTicker: "KXWTI15M" },
    match: cpi,
    chart: "FRED:CPIAUCSL",
  },
];

function settled(entry: (typeof cases)[number]): SettlementMatch | null {
  if (!entry.match) return null;
  const chart = entry.chart ?? null;
  return {
    ...entry.match,
    chart,
    catalog: entry.catalog === undefined ? chart : entry.catalog,
  };
}

describe("matchSettlement", () => {
  for (const entry of cases) {
    test(entry.name, () => {
      expect(matchSettlement(entry.input)).toEqual(settled(entry));
    });
  }
});

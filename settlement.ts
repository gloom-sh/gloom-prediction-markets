export interface SettlementMatch {
  label: string;
  command: string | null;
  chart: string | null;
  catalog: string | null;
}

type SettlementPrint = Pick<SettlementMatch, "chart" | "catalog">;

interface SettlementFacts {
  series: string;
  host: string;
  title: string;
  category: string;
}

interface SettlementRule {
  label: string;
  command: string | null;
  when: (facts: SettlementFacts) => boolean;
}

// A command must be a function in the released app (v0.17.0): typed in the
// command bar, a code it does not know opens a ticker of the same name.
const RULES: readonly SettlementRule[] = [
  {
    label: "CF Benchmarks index",
    command: null,
    when: ({ series, host }) =>
      startsWith(series, ["KXBTC", "KXETH", "KXSOL", "KXXRP"]) ||
      host === "cfbenchmarks.com",
  },
  {
    label: "Pyth price at the settle time",
    command: null,
    when: ({ series, host }) => series.endsWith("15M") || host.includes("pyth"),
  },
  {
    label: "Binance price",
    command: null,
    when: ({ host }) => host === "binance.com",
  },
  {
    label: "CPI-U",
    command: "CPI",
    when: ({ series, host, title }) =>
      seriesIs(series, ["KXCPI", "KXCPIYOY", "KXCPICORE", "KXCPICOREYOY", "KXECONSTATCPI"]) ||
      (host === "bls.gov" && titleHas(title, ["cpi", "inflation"])),
  },
  {
    label: "Payrolls and unemployment",
    command: "ECST",
    when: ({ series, host, title }) =>
      seriesIs(series, ["KXPAYROLLS", "KXU3", "KXJOBLESS"]) ||
      ((host === "bls.gov" || host === "dol.gov") &&
        titleHas(title, ["payroll", "unemployment", "jobless"])),
  },
  {
    label: "GDP and PCE",
    command: "ECST",
    when: ({ series, host, title }) =>
      seriesIs(series, ["KXGDP", "KXPCECORE"]) ||
      (host === "bea.gov" && titleHas(title, ["gdp", "pce"])),
  },
  {
    label: "NBER recession dates",
    command: null,
    when: ({ host, title }) => host === "bea.gov" && titleHas(title, ["recession"]),
  },
  {
    label: "Treasury yield",
    command: "GC",
    when: ({ series, host, title }) =>
      startsWith(series, ["KXTNOTE", "KXUST"]) ||
      (host === "home.treasury.gov" && titleHas(title, ["yield", "treasury"])),
  },
  {
    label: "AAA regular gasoline",
    command: null,
    when: ({ series, host }) =>
      startsWith(series, ["KXAAAGAS"]) || host === "gasprices.aaa.com",
  },
  {
    label: "EIA petroleum",
    command: "DOE",
    when: ({ series, host, title }) =>
      seriesIs(series, ["KXGAS", "KXOIL"]) ||
      (host === "eia.gov" && titleHas(title, ["gas", "oil"])),
  },
  {
    label: "Exchange settlement",
    command: "CTM",
    when: ({ series, host }) =>
      series === "KXWTI" || host === "theice.com" || host === "ice.com",
  },
  {
    label: "Station temperature",
    command: null,
    when: ({ series, host }) =>
      startsWith(series, ["KXHIGH", "KXLOW", "KXRAIN", "KXTEMP"]) ||
      host === "weather.com" ||
      host === "weather.gov" ||
      host === "forecast.weather.gov",
  },
  {
    label: "Fed funds target",
    command: "WIRP",
    when: ({ series, host, title }) =>
      seriesIs(series, ["KXFEDDECISION", "KXFED", "KXRATECUT"]) ||
      (host === "federalreserve.gov" && titleHas(title, ["fed", "fomc", "rate"])),
  },
  {
    label: "Final score",
    command: null,
    when: ({ host, category }) =>
      hostIs(host, [
        "espn.com",
        "foxsports.com",
        "nfl.com",
        "nba.com",
        "mlb.com",
        "ncaa.com",
        "fifa.com",
        "nhl.com",
      ]) || category === "Sports",
  },
  {
    label: "Congress bill",
    command: null,
    when: ({ host, title }) =>
      host === "congress.gov" && titleHas(title, ["bill", "h.r.", "act"]),
  },
  {
    label: "Federal Register",
    command: null,
    when: ({ host }) => host === "federalregister.gov",
  },
  {
    label: "Strait traffic",
    command: "CHOKE",
    when: ({ host }) => host === "portwatch.imf.org",
  },
  {
    label: "Earthquake",
    command: null,
    when: ({ host }) => host === "earthquake.usgs.gov",
  },
];

export function matchSettlement(input: {
  seriesTicker?: string | null;
  eventTicker?: string | null;
  title?: string | null;
  resolutionSource?: string | null;
  category?: string | null;
}): SettlementMatch | null {
  const facts = readFacts(input);
  const hit = RULES.find((rule) => rule.when(facts));
  if (!hit) return null;
  const view = catalogPrint(facts, hit.label);
  return {
    label: hit.label,
    command: hit.command,
    chart: view.chart,
    catalog: view.catalog,
  };
}

const NONE: SettlementPrint = { chart: null, catalog: null };

// Kalshi's high series are not KXHIGH plus the station id. KXHIGHNY is NYC.
const HIGH_STATION: Record<string, string> = {
  KXHIGHNY: "NYC",
  KXHIGHCHI: "MDW",
  KXHIGHPHIL: "PHL",
  KXHIGHTDC: "DCA",
  KXHIGHTBOS: "BOS",
  KXHIGHTATL: "ATL",
  KXHIGHTPHX: "PHX",
  KXHIGHTSEA: "SEA",
  KXHIGHTSFO: "SFO",
  KXHIGHTSAN: "SAN",
  KXHIGHTDAL: "DFW",
  KXHIGHTLV: "LAS",
  KXHIGHTSATX: "SAT",
  KXHIGHTNOLA: "MSY",
  KXHIGHTMIN: "MSP",
  KXHIGHTOKC: "OKC",
  KXHOBBYTEMP: "HOU",
  KXHIGHDEN: "DEN",
};

const TENORS = ["30Y", "20Y", "10Y", "7Y", "6M", "5Y", "3Y", "3M", "2Y", "1Y", "1M"] as const;

const STRAITS: Array<readonly [string, string]> = [
  ["hormuz", "HORMUZ"],
  ["suez", "SUEZ"],
  ["panama", "PANAMA"],
  ["malacca", "MALACCA"],
  ["bosphorus", "BOSPHORUS"],
  ["mandeb", "BABELMANDEB"],
];

function fred(id: string): SettlementPrint {
  const chart = `FRED:${id}`;
  return { chart, catalog: chart };
}

function catalogPrint(facts: SettlementFacts, label: string): SettlementPrint {
  if (label === "CPI-U") {
    if (facts.series === "KXCPICOREYOY") return fred("CPILFENS");
    if (facts.series === "KXCPICORE") return fred("CPILFESL");
    if (facts.series === "KXCPIYOY" || titleHas(facts.title, ["y/y", "yoy", "year-over-year"])) return fred("CPIAUCNS");
    return fred("CPIAUCSL");
  }
  if (label === "Payrolls and unemployment") {
    if (facts.series === "KXU3" || titleHas(facts.title, ["unemployment"])) return fred("UNRATE");
    if (facts.series === "KXJOBLESS" || titleHas(facts.title, ["jobless"])) return fred("ICSA");
    return fred("PAYEMS");
  }
  if (label === "GDP and PCE") {
    if (facts.series === "KXPCECORE" || (titleHas(facts.title, ["pce"]) && !titleHas(facts.title, ["gdp"]))) {
      return fred("PCEPILFE");
    }
    return fred("GDPC1");
  }
  if (label === "Treasury yield") {
    const tenor = TENORS.find((item) => facts.series.includes(item)) ?? "10Y";
    const chart = `UST:${tenor}`;
    return { chart, catalog: chart };
  }
  if (label === "Exchange settlement" && (facts.series === "KXWTI" || titleHas(facts.title, ["wti"]))) {
    return { chart: "FUT:CL", catalog: "FUT:CL" };
  }
  if (label === "Fed funds target") return fred("DFEDTARU");
  if (label === "Station temperature") {
    const station = HIGH_STATION[facts.series];
    if (!station) return NONE;
    return { chart: `WX:${station}:high`, catalog: null };
  }
  if (label === "Strait traffic") {
    const strait = STRAITS.find(([word]) => facts.title.includes(word));
    if (!strait) return NONE;
    const chart = `GEO:${strait[1]}`;
    return { chart, catalog: chart };
  }
  return NONE;
}

function readFacts(input: {
  seriesTicker?: string | null;
  eventTicker?: string | null;
  title?: string | null;
  resolutionSource?: string | null;
  category?: string | null;
}): SettlementFacts {
  return {
    series: seriesKey(input.seriesTicker, input.eventTicker),
    host: resolutionHost(input.resolutionSource),
    title: input.title?.trim().toLowerCase() ?? "",
    category: input.category?.trim() ?? "",
  };
}

function seriesKey(
  seriesTicker?: string | null,
  eventTicker?: string | null,
): string {
  const preferred = seriesTicker?.trim() || eventTicker?.trim() || "";
  return preferred.toUpperCase().replace(/-\d.*$/, "");
}

function resolutionHost(resolutionSource?: string | null): string {
  const raw = resolutionSource?.trim() ?? "";
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function seriesIs(series: string, names: readonly string[]): boolean {
  return names.includes(series);
}

function startsWith(series: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => series.startsWith(prefix));
}

function hostIs(host: string, names: readonly string[]): boolean {
  return names.includes(host);
}

function titleHas(title: string, words: readonly string[]): boolean {
  return words.some((word) => title.includes(word));
}

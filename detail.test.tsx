import { afterEach, describe, expect, test } from "bun:test";
import { act, useReducer, useRef, useState, type ReactNode } from "react";
import type { ScrollBoxRenderable } from "gloomberb/ui";
import {
  AppContext,
  PaneInstanceProvider,
  appReducer,
  createInitialState,
  testRender,
} from "gloomberb/test-support";
import { createDefaultConfig } from "gloomberb/types/config";
import { PredictionMarketChart } from "./chart";
import { PredictionMarketDetailPane } from "./detail/pane";
import { buildPredictionListRows } from "./rows";
import { normalizeKalshiMarket } from "./services/kalshi/adapter";
import {
  ChartHarness,
  GroupedDetailHarness,
  cleanupPredictionTest,
  emitKeypress,
  flushFrames,
} from "./test-helpers";
import type {
  PredictionDetailTab,
  PredictionHistoryRange,
  PredictionMarketDetail,
  PredictionMarketSummary,
} from "./types";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(async () => {
  await cleanupPredictionTest(testSetup);
  testSetup = undefined;
});

describe("prediction markets detail views", () => {
  test("renders chart history even when cached dates are plain strings", async () => {
    testSetup = await testRender(
      <ChartHarness
        history={[
          { date: "2026-04-01T00:00:00Z", close: 0.45 },
          { date: "2026-04-02T00:00:00Z", close: 0.48 },
        ]}
      />,
      { width: 80, height: 12 },
    );
    await flushFrames(testSetup);

    const frame = testSetup.captureCharFrame();
    expect(frame).toContain("1M");
    expect(frame).not.toContain("TypeError");
    // The range move sits beside the range tabs, which must not take the row.
    expect(frame.split("\n")[0]).toContain("+6.67%");
  });

  test("renders grouped outcomes with their chart directly below", async () => {
    testSetup = await testRender(<GroupedDetailHarness />, {
      width: 64,
      height: 24,
    });
    await flushFrames(testSetup);

    const frame = testSetup.captureCharFrame();
    expect(frame).toContain("Outcomes");
    expect(frame).toContain("Above 4.25%");
    expect(frame).toContain("Above 4.50%");
    expect(frame).toContain("1M");
    expect(frame.indexOf("1M")).toBeGreaterThan(frame.indexOf("Above 4.50%"));
    expect(frame).not.toContain(" Chart ");
    expect(frame).not.toContain("Ranked by implied YES probability.");
    expect(frame).not.toContain("TOP Above 4.25%");
    expect(frame).not.toContain("Kalshi");
    expect(frame).not.toContain("targets");
  });

  test("keeps grouped outcomes in place while selected detail is loading", async () => {
    testSetup = await testRender(<GroupedDetailHarness loading />, {
      width: 64,
      height: 24,
    });
    await flushFrames(testSetup);

    const frame = testSetup.captureCharFrame();
    expect(frame).toContain("Outcomes");
    expect(frame).toContain("Above 4.25%");
    expect(frame).toContain("Loading chart...");
    expect(frame).not.toContain("No chart history.");
    expect(frame).not.toContain("Loading market detail...");
  });

  test("shows the chart crosshair on pointer movement", async () => {
    testSetup = await testRender(
      <ChartHarness
        history={[
          { date: "2026-04-01T00:00:00Z", close: 0.45 },
          { date: "2026-04-02T00:00:00Z", close: 0.48 },
          { date: "2026-04-03T00:00:00Z", close: 0.51 },
        ]}
      />,
      { width: 80, height: 12 },
    );
    await flushFrames(testSetup);
    const initialFrame = testSetup.captureCharFrame();

    await act(async () => {
      await testSetup!.mockMouse.moveTo(30, 5);
      await testSetup!.renderOnce();
    });
    await flushFrames(testSetup);

    expect(testSetup.captureCharFrame()).not.toBe(initialFrame);
  });

  test("keeps the pointer crosshair when the chart is focused and leaves arrow down alone", async () => {
    testSetup = await testRender(<FocusedChartHarness />, { width: 80, height: 12 });
    await flushFrames(testSetup);
    const initialFrame = testSetup.captureCharFrame();

    await emitKeypress(testSetup, { name: "down", sequence: "\u001b[B" });
    await emitKeypress(testSetup, { name: "enter", sequence: "\r" });
    await flushFrames(testSetup);
    expect(testSetup.captureCharFrame()).toBe(initialFrame);

    await act(async () => {
      await testSetup!.mockMouse.moveTo(30, 5);
      await testSetup!.renderOnce();
    });
    await flushFrames(testSetup);
    expect(testSetup.captureCharFrame()).not.toBe(initialFrame);
  });

  test("shows loading copy while detail is in flight and failure copy after it fails", async () => {
    const failure = "https://api.example.test/book?token=1 Kalshi Polymarket";
    testSetup = await testRender(
      <DetailCopyHarness mode="pending" tab="overview" />,
      { width: 80, height: 24 },
    );
    await flushFrames(testSetup);
    let frame = testSetup.captureCharFrame();
    expect(frame).toContain("Loading chart...");
    expect(frame).not.toContain("No chart history.");
    expect(frame).not.toContain("Chart unavailable.");

    testSetup = await renderCopy("pending", "book", testSetup);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Loading order book.");
    expect(frame).not.toContain("No order book.");

    testSetup = await renderCopy("pending", "trades", testSetup);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Loading recent trades.");
    expect(frame).not.toContain("No recent trades.");

    testSetup = await renderCopy("pending", "rules", testSetup);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Loading rules.");
    expect(frame).not.toContain("No rule text returned by the venue.");

    testSetup = await renderCopy("failed", "overview", testSetup, failure);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Chart unavailable.");
    expect(frame).not.toContain("No chart history.");
    expect(frame).not.toContain("api.example.test");
    expect(frame).not.toContain("Kalshi");
    expect(frame).not.toContain("Polymarket");

    testSetup = await renderCopy("failed", "book", testSetup, failure);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Order book unavailable.");
    expect(frame).not.toContain("No order book.");
    expect(frame).not.toContain("api.example.test");

    testSetup = await renderCopy("failed", "trades", testSetup, failure);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Trades unavailable.");
    expect(frame).not.toContain("No recent trades.");

    testSetup = await renderCopy("failed", "rules", testSetup, failure);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Rules unavailable.");
    expect(frame).not.toContain("No rule text returned by the venue.");
  });

  test("shows empty copy only after a successful empty payload", async () => {
    testSetup = await testRender(
      <DetailCopyHarness mode="empty" tab="overview" />,
      { width: 80, height: 24 },
    );
    await flushFrames(testSetup);
    expect(testSetup.captureCharFrame()).toContain("No chart history.");
    expect(testSetup.captureCharFrame()).not.toContain("Chart unavailable.");

    testSetup = await renderCopy("empty", "book", testSetup);
    expect(testSetup.captureCharFrame()).toContain("No order book.");

    testSetup = await renderCopy("empty", "trades", testSetup);
    expect(testSetup.captureCharFrame()).toContain("No recent trades.");

    testSetup = await renderCopy("empty", "rules", testSetup);
    expect(testSetup.captureCharFrame()).toContain("No rule text returned by the venue.");
  });

  test("keeps h and l on the detail tabs until enter moves into the range", async () => {
    testSetup = await testRender(<DetailKeysHarness />, { width: 80, height: 24 });
    await flushFrames(testSetup);

    await emitKeypress(testSetup, { name: "l", sequence: "l" });
    await flushFrames(testSetup);
    expect(detailKeys.tab).toBe("book");
    expect(detailKeys.range).toBe("1M");

    await emitKeypress(testSetup, { name: "h", sequence: "h" });
    await flushFrames(testSetup);
    expect(detailKeys.tab).toBe("overview");

    await emitKeypress(testSetup, { name: "enter", sequence: "\r" });
    await emitKeypress(testSetup, { name: "l", sequence: "l" });
    await flushFrames(testSetup);
    expect(detailKeys.tab).toBe("overview");
    expect(detailKeys.range).toBe("ALL");

    await emitKeypress(testSetup, { name: "escape", sequence: "\u001b" });
    await emitKeypress(testSetup, { name: "l", sequence: "l" });
    await flushFrames(testSetup);
    expect(detailKeys.range).toBe("ALL");
    expect(detailKeys.tab).toBe("book");
  });

  test("hides the range strip when the chart is not showing it", async () => {
    testSetup = await testRender(
      <DetailShell>
        <PredictionMarketChart
          focused
          height={12}
          history={[
            { date: new Date("2026-04-01T00:00:00Z"), close: 0.45 },
            { date: new Date("2026-04-02T00:00:00Z"), close: 0.48 },
          ]}
          onRangeSelect={() => {}}
          range="1M"
          showRangeTabs={false}
          width={80}
        />
      </DetailShell>,
      { width: 80, height: 24 },
    );
    await flushFrames(testSetup);
    expect(testSetup.captureCharFrame()).not.toContain("1D");
  });

  test("shows the on-screen settlement above the description and the rules", async () => {
    testSetup = await testRender(
      <SettlementHarness mode="detail" tab="overview" />,
      { width: 80, height: 32 },
    );
    await flushFrames(testSetup);
    let frame = testSetup.captureCharFrame();
    expect(frame).toContain("Settlement");
    expect(frame).toContain("Exchange settlement (CTM)");
    expect(frame).not.toContain("CPI-U");
    expect(frame.indexOf("Settlement")).toBeLessThan(frame.indexOf("Description"));
    expect(frame.indexOf("Description")).toBeLessThan(frame.indexOf("Settles on the exchange print."));

    testSetup = await renderSettlement("detail", "rules", testSetup);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Exchange settlement (CTM)");
    expect(frame.indexOf("Exchange settlement (CTM)")).toBeLessThan(
      frame.indexOf("Resolves on the exchange print."),
    );
    expect(frame).not.toContain("CPI-U");
  });

  test("keeps a settlement match off the rules view while rules load or fail", async () => {
    testSetup = await testRender(
      <SettlementHarness mode="pending" tab="rules" />,
      { width: 80, height: 32 },
    );
    await flushFrames(testSetup);
    let frame = testSetup.captureCharFrame();
    expect(frame).toContain("Loading rules.");
    expect(frame).not.toContain("Settlement");
    expect(frame).not.toContain("CPI-U");

    testSetup = await renderSettlement("failed", "rules", testSetup);
    frame = testSetup.captureCharFrame();
    expect(frame).toContain("Rules unavailable.");
    expect(frame).not.toContain("Settlement");
    expect(frame).not.toContain("CPI-U");
  });

});

const detailKeys = { tab: "overview" as PredictionDetailTab, range: "1M" as PredictionHistoryRange };

function kalshiSummary() {
  const summary = normalizeKalshiMarket({
    ticker: "KAL-1",
    title: "Will the Fed cut rates?",
    yes_sub_title: "Yes",
    event_ticker: "FED-1",
    status: "open",
    market_type: "binary",
    last_price_dollars: "0.48",
    volume_24h_fp: "15000",
  } as any);
  const [row] = buildPredictionListRows([summary!]);
  return { row: row!, summary: summary! };
}

function DetailShell({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    const initial = createInitialState(createDefaultConfig("/tmp/gloomberb-prediction-markets"));
    initial.focusedPaneId = "prediction-markets:main";
    return initial;
  });
  return (
    <AppContext value={{ state, dispatch }}>
      <PaneInstanceProvider paneId="prediction-markets:main">
        {children}
      </PaneInstanceProvider>
    </AppContext>
  );
}

function DetailCopyHarness({
  mode,
  tab,
  failure = "https://api.example.test/book?token=1 Kalshi Polymarket",
}: {
  mode: "pending" | "failed" | "empty";
  tab: PredictionDetailTab;
  failure?: string;
}) {
  const { row, summary } = kalshiSummary();
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const emptyDetail: PredictionMarketDetail = {
    summary,
    siblings: [],
    rules: [],
    history: [],
    book: { yesBids: [], yesAsks: [], noBids: [], noAsks: [], lastTradePrice: null },
    trades: [],
  };
  return (
    <DetailShell>
      <PredictionMarketDetailPane
        detail={mode === "empty" ? emptyDetail : null}
        detailError={mode === "failed" ? failure : null}
        detailLoadCount={0}
        detailTab={tab}
        focused
        height={24}
        historyRange="1M"
        onDetailTabChange={() => {}}
        onHistoryRangeChange={() => {}}
        onSelectMarket={() => {}}
        scrollRef={scrollRef}
        selectedRow={row}
        selectedSummary={summary}
        width={80}
      />
    </DetailShell>
  );
}

function settlementSummary(
  overrides: Partial<PredictionMarketSummary> = {},
): PredictionMarketSummary {
  return {
    key: "gemini:cpi",
    venue: "gemini",
    marketId: "cpi",
    title: "Will CPI rise?",
    marketLabel: "Yes",
    eventLabel: "CPI",
    seriesTicker: "KXCPI",
    category: "Economics",
    tags: [],
    status: "open",
    url: "https://example.test/cpi",
    description: "The print is CPI-U.",
    endsAt: null,
    updatedAt: null,
    yesPrice: 0.5,
    noPrice: 0.5,
    yesBid: null,
    yesAsk: null,
    noBid: null,
    noAsk: null,
    spread: null,
    lastTradePrice: null,
    volume24h: null,
    volume24hUnit: "usd",
    totalVolume: null,
    totalVolumeUnit: "usd",
    openInterest: null,
    openInterestUnit: "usd",
    liquidity: null,
    liquidityUnit: "usd",
    ...overrides,
  };
}

function SettlementHarness({
  mode,
  tab,
}: {
  mode: "detail" | "pending" | "failed";
  tab: PredictionDetailTab;
}) {
  const selected = settlementSummary();
  const onScreen = settlementSummary({
    key: "gemini:wti",
    marketId: "wti",
    title: "WTI settle",
    eventLabel: "WTI",
    seriesTicker: "KXWTI",
    description: "Settles on the exchange print.",
  });
  const [row] = buildPredictionListRows([selected]);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const detail: PredictionMarketDetail | null = mode === "detail"
    ? {
        summary: onScreen,
        siblings: [],
        rules: ["Resolves on the exchange print."],
        history: [],
        book: { yesBids: [], yesAsks: [], noBids: [], noAsks: [], lastTradePrice: null },
        trades: [],
      }
    : null;
  return (
    <DetailShell>
      <PredictionMarketDetailPane
        detail={detail}
        detailError={mode === "failed" ? "nope" : null}
        detailLoadCount={0}
        detailTab={tab}
        focused
        height={32}
        historyRange="1M"
        onDetailTabChange={() => {}}
        onHistoryRangeChange={() => {}}
        onSelectMarket={() => {}}
        scrollRef={scrollRef}
        selectedRow={row!}
        selectedSummary={selected}
        width={80}
      />
    </DetailShell>
  );
}

async function renderSettlement(
  mode: "detail" | "pending" | "failed",
  tab: PredictionDetailTab,
  current: Awaited<ReturnType<typeof testRender>>,
) {
  await cleanupPredictionTest(current);
  const next = await testRender(
    <SettlementHarness mode={mode} tab={tab} />,
    { width: 80, height: 32 },
  );
  await flushFrames(next);
  return next;
}

async function renderCopy(
  mode: "pending" | "failed" | "empty",
  tab: PredictionDetailTab,
  current: Awaited<ReturnType<typeof testRender>>,
  failure?: string,
) {
  await cleanupPredictionTest(current);
  const next = await testRender(
    <DetailCopyHarness failure={failure} mode={mode} tab={tab} />,
    { width: 80, height: 24 },
  );
  await flushFrames(next);
  return next;
}

function DetailKeysHarness() {
  const { row, summary } = kalshiSummary();
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const [tab, setTab] = useState<PredictionDetailTab>("overview");
  const [range, setRange] = useState<PredictionHistoryRange>("1M");
  detailKeys.tab = tab;
  detailKeys.range = range;
  return (
    <DetailShell>
      <PredictionMarketDetailPane
        detail={null}
        detailLoadCount={0}
        detailTab={tab}
        focused
        height={24}
        historyRange={range}
        onDetailTabChange={setTab}
        onHistoryRangeChange={setRange}
        onSelectMarket={() => {}}
        scrollRef={scrollRef}
        selectedRow={row}
        selectedSummary={summary}
        width={80}
      />
    </DetailShell>
  );
}

function FocusedChartHarness() {
  return (
    <DetailShell>
      <PredictionMarketChart
        focused
        height={12}
        history={[
          { date: new Date("2026-04-01T00:00:00Z"), close: 0.45 },
          { date: new Date("2026-04-02T00:00:00Z"), close: 0.48 },
          { date: new Date("2026-04-03T00:00:00Z"), close: 0.51 },
        ]}
        onRangeSelect={() => {}}
        range="1M"
        width={80}
      />
    </DetailShell>
  );
}

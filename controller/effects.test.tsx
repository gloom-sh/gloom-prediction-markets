import { afterEach, describe, expect, test } from "bun:test";
import { act, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Text } from "gloomberb/ui";
import { testRender } from "gloomberb/test-support";
import { cleanupPredictionTest, flushFrames } from "../test-helpers";
import { usePredictionControllerEffects } from "./effects";
import type { PredictionListRow } from "../types";

interface ProbeState {
  catalogLoadCount: number;
  detailKey: string | null;
  detailSiblings?: ReadonlyArray<{ key: string }>;
  open: boolean;
  rowKey: string | null;
  rows: readonly PredictionListRow[];
  searchPending?: boolean;
}

const snapshot: { current: Pick<ProbeState, "detailKey" | "open" | "rowKey"> | null } = {
  current: null,
};
let applyProbe: ((patch: Partial<ProbeState>) => void) | null = null;
let rendered: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(async () => {
  await cleanupPredictionTest(rendered);
  rendered = undefined;
  applyProbe = null;
  snapshot.current = null;
});

describe("prediction controller effects", () => {
  test("keeps a restored selection until the catalog settles", async () => {
    rendered = await testRender(
      <EffectsHost initial={{
        catalogLoadCount: 0,
        detailKey: "market-1",
        open: true,
        rowKey: "saved-row",
        rows: [],
      }}
      />,
      { width: 20, height: 4 },
    );
    await flushFrames(rendered);
    expect(snapshot.current).toEqual({ rowKey: "saved-row", detailKey: "market-1", open: true });

    await actPatch({ catalogLoadCount: 1 });
    expect(snapshot.current?.rowKey).toBe("saved-row");
    expect(snapshot.current?.open).toBe(true);

    await actPatch({ catalogLoadCount: 0 });
    expect(snapshot.current).toEqual({ rowKey: null, detailKey: null, open: false });
  });

  test("selects a collapsed group instead of clearing its child", async () => {
    const group = {
      key: "group:fed",
      kind: "group",
      markets: [{ key: "child-key" }],
    } as PredictionListRow;
    rendered = await testRender(
      <EffectsHost initial={{
        catalogLoadCount: 0,
        detailKey: "child-key",
        open: true,
        rowKey: "child-key",
        rows: [group],
      }}
      />,
      { width: 20, height: 4 },
    );
    await flushFrames(rendered);
    expect(snapshot.current).toEqual({ rowKey: "group:fed", detailKey: "child-key", open: true });
  });

  test("keeps a detail sibling key that is not on the list row", async () => {
    const row = {
      key: "row-1",
      kind: "market",
      focusMarketKey: "focus",
      markets: [{ key: "focus" }],
    } as PredictionListRow;
    rendered = await testRender(
      <EffectsHost initial={{
        catalogLoadCount: 0,
        detailKey: "sibling",
        detailSiblings: [{ key: "sibling" }],
        open: true,
        rowKey: "row-1",
        rows: [row],
      }}
      />,
      { width: 20, height: 4 },
    );
    await flushFrames(rendered);
    expect(snapshot.current?.detailKey).toBe("sibling");
    expect(snapshot.current?.rowKey).toBe("row-1");
    expect(snapshot.current?.open).toBe(true);
  });

  test("an in-flight search does not close detail when the visible list is empty", async () => {
    const row = {
      key: "row-1",
      kind: "market",
      markets: [{ key: "row-1" }],
    } as PredictionListRow;
    rendered = await testRender(
      <EffectsHost initial={{
        catalogLoadCount: 1,
        detailKey: "row-1",
        open: true,
        rowKey: "row-1",
        rows: [row],
      }}
      />,
      { width: 20, height: 4 },
    );
    await flushFrames(rendered);
    await actPatch({ catalogLoadCount: 0 });
    expect(snapshot.current).toEqual({ rowKey: "row-1", detailKey: "row-1", open: true });

    await actPatch({ rows: [], searchPending: true });
    expect(snapshot.current).toEqual({ rowKey: "row-1", detailKey: "row-1", open: true });

    await actPatch({ searchPending: false });
    expect(snapshot.current).toEqual({ rowKey: null, detailKey: null, open: false });
  });
});

function EffectsHost({ initial }: { initial: ProbeState }) {
  const [state, setState] = useState(initial);
  applyProbe = (patch) => setState((current) => ({ ...current, ...patch }));
  const setRowKey = (value: SetStateAction<string | null>) => {
    setState((current) => ({
      ...current,
      rowKey: typeof value === "function" ? value(current.rowKey) : value,
    }));
  };
  const setDetailKey = (value: SetStateAction<string | null>) => {
    setState((current) => ({
      ...current,
      detailKey: typeof value === "function" ? value(current.detailKey) : value,
    }));
  };
  const setOpen = (value: SetStateAction<boolean>) => {
    setState((current) => ({
      ...current,
      open: typeof value === "function" ? value(current.open) : value,
    }));
  };
  snapshot.current = { rowKey: state.rowKey, detailKey: state.detailKey, open: state.open };
  useProbeEffects(state, setRowKey, setDetailKey, setOpen);
  return <Text>{state.rowKey ?? "cleared"}</Text>;
}

function useProbeEffects(
  state: ProbeState,
  setRowKey: Dispatch<SetStateAction<string | null>>,
  setDetailKey: Dispatch<SetStateAction<string | null>>,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  const scrollRef = useRef(null);
  const headerScrollRef = useRef(null);
  const searchInputRef = useRef(null);
  const previousFilterResetKeyRef = useRef<string | null>(null);
  usePredictionControllerEffects({
    appViewportHeight: 20,
    browseTab: "top",
    catalogLoadCount: state.catalogLoadCount,
    categoryId: "all",
    debouncedSearchQuery: "",
    detailOpen: state.open,
    detailSiblings: state.detailSiblings,
    effectiveVenueScope: "all",
    headerScrollRef,
    hideTabs: false,
    initialParams: undefined,
    initialParamsApplied: true,
    lastVenueScope: "all",
    lockedVenueScope: "all",
    previousFilterResetKeyRef,
    scrollRef,
    searchFocused: false,
    searchInputRef,
    selectedDetailMarketKey: state.detailKey,
    selectedIndex: -1,
    selectedRow: state.rows.find((row) => row.key === state.rowKey) ?? null,
    selectedRowKey: state.rowKey,
    setDetailOpen: setOpen,
    setInitialParamsApplied: noop,
    setLastVenueScope: noop,
    setSearchQuery: noop,
    setSelectedDetailMarketKey: setDetailKey,
    setSelectedRowKey: setRowKey,
    setVenueScope: noop,
    visibleRows: state.rows,
    searchPending: state.searchPending ?? false,
  });
}

function noop() {}

async function actPatch(patch: Partial<ProbeState>) {
  await act(async () => {
    applyProbe?.(patch);
  });
  await flushFrames(rendered!);
}

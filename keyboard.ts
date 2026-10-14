
export type PredictionKeyboardCommand =
  | "escape"
  | "search"
  | "move-down"
  | "move-up"
  | "previous-category"
  | "next-category"
  | "previous-venue-tab"
  | "next-venue-tab"
  | "toggle-watchlist"
  | "browse-top"
  | "browse-ending"
  | "browse-new"
  | "browse-watchlist";

export type PredictionQueryTarget = "search" | "venue" | "view";

export interface PredictionKeyboardEventLike {
  name?: string;
  sequence?: string;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  super?: boolean;
  alt?: boolean;
  option?: boolean;
}

function matchesPredictionKey(
  event: PredictionKeyboardEventLike,
  names: string[],
  sequences: string[] = [],
): boolean {
  const normalizedName = event.name?.toLowerCase();
  if (normalizedName && names.includes(normalizedName)) return true;
  return sequences.includes(event.sequence ?? "");
}

export function resolvePredictionKeyboardCommand(
  event: PredictionKeyboardEventLike,
): PredictionKeyboardCommand | null {
  if (matchesPredictionKey(event, ["escape", "esc"], ["\u001b"]))
    return "escape";
  if (matchesPredictionKey(event, ["/"], ["/"])) return "search";
  if (matchesPredictionKey(event, ["down", "j"], ["j", "\u001b[B", "\u001bOB"]))
    return "move-down";
  if (matchesPredictionKey(event, ["up", "k"], ["k", "\u001b[A", "\u001bOA"]))
    return "move-up";
  if (
    event.shift &&
    matchesPredictionKey(event, ["left", "h"], ["H", "\u001b[1;2D"])
  )
    return "previous-venue-tab";
  if (
    event.shift &&
    matchesPredictionKey(event, ["right", "l"], ["L", "\u001b[1;2C"])
  )
    return "next-venue-tab";
  if (matchesPredictionKey(event, ["left", "h"], ["h", "\u001b[D", "\u001bOD"]))
    return "previous-category";
  if (
    matchesPredictionKey(event, ["right", "l"], ["l", "\u001b[C", "\u001bOC"])
  )
    return "next-category";
  if (matchesPredictionKey(event, ["w"], ["w"])) return "toggle-watchlist";
  if (matchesPredictionKey(event, ["1"], ["1"])) return "browse-top";
  if (matchesPredictionKey(event, ["2"], ["2"])) return "browse-ending";
  if (matchesPredictionKey(event, ["3"], ["3"])) return "browse-new";
  if (matchesPredictionKey(event, ["4"], ["4"])) return "browse-watchlist";
  return null;
}

function queryTargetOrder(hideVenue: boolean): readonly PredictionQueryTarget[] {
  if (hideVenue) return ["search", "view"];
  return ["search", "venue", "view"];
}

/** Tab order of the query row. Null is past either end, where Tab changes panes. */
export function adjacentPredictionQueryTarget(
  current: PredictionQueryTarget | null,
  direction: -1 | 1,
  hideVenue: boolean,
): PredictionQueryTarget | null {
  const order = queryTargetOrder(hideVenue);
  if (current == null) return direction > 0 ? order[0] ?? null : null;
  const index = order.indexOf(current);
  if (index < 0) return direction > 0 ? order[0] ?? null : null;
  return order[index + direction] ?? null;
}

/** Plain Left or Right. h and l stay with the categories. */
export function predictionArrowDirection(
  event: PredictionKeyboardEventLike,
): "previous" | "next" | null {
  if (event.shift || event.ctrl || event.meta || event.super || event.alt || event.option) return null;
  const name = event.name?.toLowerCase();
  if (name === "left" || event.sequence === "\u001b[D" || event.sequence === "\u001bOD") return "previous";
  if (name === "right" || event.sequence === "\u001b[C" || event.sequence === "\u001bOC") return "next";
  return null;
}

export function predictionTabDirection(event: PredictionKeyboardEventLike): -1 | 1 | null {
  if (event.ctrl || event.meta || event.super || event.alt || event.option) return null;
  const name = event.name?.toLowerCase();
  if (name !== "tab" && event.sequence !== "\t") return null;
  return event.shift ? -1 : 1;
}

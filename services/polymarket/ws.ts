import type { PredictionBookLevel, PredictionTrade } from "../../types";
import { parseFloatSafe } from "../fetch";

const POLYMARKET_HEARTBEAT_MS = 10_000;
const POLYMARKET_RECONNECT_MIN_MS = 1_500;
const POLYMARKET_RECONNECT_MAX_MS = 30_000;

interface PolymarketLiveCallbacks {
  onBestBidAsk?: (
    assetId: string,
    bestBid: number | null,
    bestAsk: number | null,
    spread: number | null,
  ) => void;
  onBook?: (
    assetId: string,
    bids: PredictionBookLevel[],
    asks: PredictionBookLevel[],
    lastTradePrice: number | null,
  ) => void;
  onTrade?: (assetId: string, trade: PredictionTrade) => void;
  onBookLevel?: (
    assetId: string,
    side: "bid" | "ask",
    price: number,
    size: number,
  ) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toBookLevels(levels: unknown): PredictionBookLevel[] {
  if (!Array.isArray(levels)) return [];
  return levels
    .map((level) => {
      if (!isRecord(level)) return null;
      const price = parseFloatSafe(level.price);
      const size = parseFloatSafe(level.size);
      return price == null || size == null ? null : { price, size };
    })
    .filter((level): level is PredictionBookLevel => level != null);
}

function bookSide(value: unknown): "bid" | "ask" | null {
  const side = String(value ?? "").toUpperCase();
  if (side === "BUY") return "bid";
  if (side === "SELL") return "ask";
  return null;
}

function dispatchPolymarketMarketEvent(
  payload: Record<string, unknown>,
  callbacks: PolymarketLiveCallbacks,
): void {
  switch (payload.event_type) {
    case "book":
      callbacks.onBook?.(
        String(payload.asset_id),
        toBookLevels(payload.bids),
        toBookLevels(payload.asks),
        parseFloatSafe(payload.last_trade_price),
      );
      break;
    case "price_change": {
      const changes = Array.isArray(payload.price_changes) ? payload.price_changes : [];
      for (const change of changes) {
        if (!isRecord(change)) continue;
        const assetId = String(change.asset_id ?? "");
        if (!assetId) continue;
        const bestBid = parseFloatSafe(change.best_bid);
        const bestAsk = parseFloatSafe(change.best_ask);
        if (bestBid != null || bestAsk != null) {
          callbacks.onBestBidAsk?.(assetId, bestBid, bestAsk, null);
        }
        const price = parseFloatSafe(change.price);
        const size = parseFloatSafe(change.size);
        const side = bookSide(change.side);
        if (price == null || size == null || !side) continue;
        callbacks.onBookLevel?.(assetId, side, price, size);
      }
      break;
    }
    case "best_bid_ask":
      callbacks.onBestBidAsk?.(
        String(payload.asset_id),
        parseFloatSafe(payload.best_bid),
        parseFloatSafe(payload.best_ask),
        parseFloatSafe(payload.spread),
      );
      break;
    case "last_trade_price": {
      const price = parseFloatSafe(payload.price);
      if (price == null) break;
      callbacks.onTrade?.(String(payload.asset_id), {
        id: `${payload.asset_id}:${payload.timestamp}:${payload.price}`,
        timestamp: Number.parseInt(String(payload.timestamp), 10),
        side: String(payload.side).toUpperCase() === "SELL" ? "sell" : "buy",
        outcome: "yes",
        price,
        size: parseFloatSafe(payload.size) ?? 0,
      });
      break;
    }
  }
}

export function dispatchPolymarketMarketFrame(
  data: unknown,
  callbacks: PolymarketLiveCallbacks,
): void {
  try {
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const event of events) {
      if (!isRecord(event)) continue;
      dispatchPolymarketMarketEvent(event, callbacks);
    }
  } catch {
    // ignore malformed messages
  }
}

export function subscribePolymarketMarket(
  assetIds: string[],
  callbacks: PolymarketLiveCallbacks,
): () => void {
  if (assetIds.length === 0) return () => {};

  let closed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  // Doubles after each close that never opened, so a refused or offline socket
  // backs off instead of reconnecting every 1.5 s for as long as the pane is up.
  let reconnectDelayMs = POLYMARKET_RECONNECT_MIN_MS;

  const clearHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const sendHeartbeat = () => {
    try {
      socket?.send("PING");
    } catch {
      // The close handler will schedule reconnects for broken sockets.
    }
  };

  const connect = () => {
    clearHeartbeat();
    socket = new WebSocket(
      "wss://ws-subscriptions-clob.polymarket.com/ws/market",
    );
    socket.addEventListener("open", () => {
      reconnectDelayMs = POLYMARKET_RECONNECT_MIN_MS;
      socket?.send(
        JSON.stringify({
          assets_ids: assetIds,
          type: "market",
          custom_feature_enabled: true,
        }),
      );
      heartbeatTimer = setInterval(sendHeartbeat, POLYMARKET_HEARTBEAT_MS);
    });
    socket.addEventListener("message", (event) => {
      dispatchPolymarketMarketFrame(event.data, callbacks);
    });
    socket.addEventListener("close", () => {
      clearHeartbeat();
      socket = null;
      if (closed) return;
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, POLYMARKET_RECONNECT_MAX_MS);
    });
    socket.addEventListener("error", () => {
      socket?.close();
    });
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    clearHeartbeat();
    socket?.close();
  };
}

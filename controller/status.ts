import type {
  PredictionMarketSummary,
  PredictionVenue,
} from "../types";
import { PREDICTION_VENUE_LABELS } from "../venues";

export interface PredictionCatalogSource {
  venue: PredictionVenue;
  cacheKey: string;
  error: string | null;
  markets: PredictionMarketSummary[];
}

export interface PredictionCatalogStatus {
  tone: "warning" | "danger";
  message: string;
}

function formatPredictionVenueLabel(venue: PredictionVenue): string {
  return PREDICTION_VENUE_LABELS[venue];
}

function joinPredictionVenueLabels(venues: PredictionVenue[]): string {
  const labels = [...new Set(venues.map(formatPredictionVenueLabel))];
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(" and ")} and ${labels.at(-1)}`;
}

function stripRequestUrls(message: string): string {
  return message
    .replace(/\s+for\s+https?:\/\/\S+/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

export function formatPredictionLoadError(
  venue: PredictionVenue,
  subject: "markets" | "market detail",
  error: unknown,
): string {
  const venueLabel = formatPredictionVenueLabel(venue);
  const fallback = `Could not load ${venueLabel} ${subject}.`;
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = stripRequestUrls(error.message);
  if (message.length === 0) {
    return fallback;
  }

  const requestFailureMatch = message.match(/request failed \(([^)]+)\)/i);
  if (requestFailureMatch?.[1]) {
    return `${venueLabel} ${subject} request failed (${requestFailureMatch[1].trim()}).`;
  }

  if (
    /typo in the url or port|access the url|unable to connect|could not resolve host|connection refused/i.test(
      message,
    )
  ) {
    return `${venueLabel} is unavailable right now.`;
  }

  if (
    /socket connection|socket hang up|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network connection|connection closed/i.test(
      message,
    )
  ) {
    return `${venueLabel} is unavailable right now.`;
  }

  const detail = stripRequestUrls(message);
  if (!detail || /https?:\/\//i.test(detail)) return fallback;
  return `${fallback} ${detail}`;
}

const RETRYABLE_PREDICTION_LOAD_ERROR =
  /socket|bridge|timeout|timed out|did not open in time|econnreset|econnrefused|etimedout|enotfound|eai_again|econnaborted|enetunreach|ehostunreach|connection|unable to connect|could not resolve host|fetch failed|failed to fetch|network|typo in the url or port|access the url/i;

function predictionLoadErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  return typeof error === "string" ? error.trim() : "";
}

function predictionLoadErrorRetryText(error: unknown): string {
  const parts: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (!(value instanceof Error)) return;
    parts.push(value.name, value.message);
    const code = (value as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      parts.push(String(code));
    }
  };
  visit(error);
  if (error instanceof Error && error.cause != null) visit(error.cause);
  return parts.join(" ");
}

/** Socket, bridge, timeout, and connection failures only. A definite HTTP status is not retried. */
export function isRetryablePredictionLoadError(error: unknown): boolean {
  if (/Request failed \(\d+\)/i.test(predictionLoadErrorMessage(error))) {
    return false;
  }
  return RETRYABLE_PREDICTION_LOAD_ERROR.test(predictionLoadErrorRetryText(error));
}

export function getPredictionCatalogStatus(
  sources: PredictionCatalogSource[],
): PredictionCatalogStatus | null {
  const failingSources = sources.filter((source) => !!source.error);
  if (failingSources.length === 0) {
    return null;
  }

  const loadedSources = sources.filter(
    (source) => !source.error && source.markets.length > 0,
  );
  if (failingSources.length < sources.length) {
    const unavailableVenues = joinPredictionVenueLabels(
      failingSources.map((source) => source.venue),
    );
    if (loadedSources.length > 0) {
      return {
        tone: "warning",
        message: `${unavailableVenues} unavailable right now; showing ${joinPredictionVenueLabels(
          loadedSources.map((source) => source.venue),
        )} markets.`,
      };
    }
    return {
      tone: "warning",
      message: `${unavailableVenues} unavailable right now.`,
    };
  }

  return {
    tone: "danger",
    message: failingSources
      .map((source) => source.error)
      .filter((value): value is string => !!value)
      .join(" "),
  };
}

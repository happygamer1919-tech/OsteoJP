// R11 (owner ruling on Q-W12-03) — TIERED inbound-SMS reply classification.
//
// A patient's free-text reply is classified by EXACT, normalized keyword match
// only. There is NO free-text interpretation beyond the keyword tier: anything
// that is not an exact keyword is flagged "resposta por rever" for a human at
// reception to resolve. This is deliberately conservative — the platform never
// auto-confirms or auto-cancels on a guess.
//
// Pure module: no DB, no SDK, no network. Unit-tested in isolation.

/**
 * The keyword sets are a CONFIG VALUE (single source of truth), not literals
 * scattered across the classifier and the reminder copy. Matching is done on the
 * NORMALIZED reply (lower-case, accent-stripped, punctuation-stripped), so the
 * keywords here are stored normalized. Tune the sets here to change the policy.
 */
export const INBOUND_KEYWORDS: {
  readonly confirm: readonly string[];
  readonly cancel: readonly string[];
  readonly optOut: readonly string[];
} = {
  confirm: ["sim", "confirmo", "confirmar"],
  cancel: ["nao", "cancelo", "cancelar"],
  // STOP is the standard carrier opt-out keyword (R11). Kept as config so a
  // future consent ruling can extend it (e.g. "sair") without a code change.
  optOut: ["stop"],
};

/** The tier an inbound reply fell into. */
export type InboundTier = "confirm" | "cancel" | "opt_out" | "unmatched";

/** The downstream action a classified reply maps to. */
export type InboundIntent = "confirmada" | "cancelada" | "opt_out" | "review";

export type InboundClassification = {
  tier: InboundTier;
  intent: InboundIntent;
  /** True for unmatched replies — flagged "resposta por rever" for reception. */
  needsReview: boolean;
};

// Unicode combining-diacritics range, stripped after NFD decomposition.
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Normalize an inbound reply for keyword matching: strip accents, lower-case,
 * collapse punctuation/whitespace. "SIM!", "Sim.", " sim " all normalize to
 * "sim". A multi-word reply ("sim, obrigado") normalizes to "sim obrigado",
 * which is NOT an exact keyword -> unmatched (never guessed).
 */
export function normalizeReply(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify an inbound reply into exactly one tier. Order matters: opt-out is
 * checked first (legal precedence), then confirm, then cancel; anything else is
 * unmatched and flagged for reception review. Never classifies free text beyond
 * an exact keyword match.
 */
export function classifyInboundReply(raw: string): InboundClassification {
  const norm = normalizeReply(raw);
  if (INBOUND_KEYWORDS.optOut.includes(norm)) {
    return { tier: "opt_out", intent: "opt_out", needsReview: false };
  }
  if (INBOUND_KEYWORDS.confirm.includes(norm)) {
    return { tier: "confirm", intent: "confirmada", needsReview: false };
  }
  if (INBOUND_KEYWORDS.cancel.includes(norm)) {
    return { tier: "cancel", intent: "cancelada", needsReview: false };
  }
  return { tier: "unmatched", intent: "review", needsReview: true };
}

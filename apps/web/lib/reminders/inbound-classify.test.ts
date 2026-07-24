import { describe, expect, it } from "vitest";

import {
  classifyInboundReply,
  INBOUND_KEYWORDS,
  normalizeReply,
} from "./inbound-classify";

// R11 tiered inbound classification — exact normalized keyword match only.

describe("normalizeReply", () => {
  it("strips accents, case, and surrounding punctuation/whitespace", () => {
    expect(normalizeReply("SIM!")).toBe("sim");
    expect(normalizeReply("  Sim. ")).toBe("sim");
    expect(normalizeReply("Não")).toBe("nao");
    expect(normalizeReply("NÃO,")).toBe("nao");
    expect(normalizeReply("Confirmar")).toBe("confirmar");
  });

  it("collapses multi-word replies without merging tokens", () => {
    expect(normalizeReply("sim, obrigado")).toBe("sim obrigado");
  });
});

describe("classifyInboundReply — confirm tier -> Confirmada", () => {
  it.each(["SIM", "sim", "Confirmo", "CONFIRMAR", "confirmar.", " Sim! "])(
    "%s -> confirm/confirmada",
    (reply) => {
      const c = classifyInboundReply(reply);
      expect(c.tier).toBe("confirm");
      expect(c.intent).toBe("confirmada");
      expect(c.needsReview).toBe(false);
    },
  );
});

describe("classifyInboundReply — cancel tier -> Cancelada", () => {
  it.each(["NAO", "Não", "nao", "Cancelo", "CANCELAR", "cancelar!"])(
    "%s -> cancel/cancelada",
    (reply) => {
      const c = classifyInboundReply(reply);
      expect(c.tier).toBe("cancel");
      expect(c.intent).toBe("cancelada");
      expect(c.needsReview).toBe(false);
    },
  );
});

describe("classifyInboundReply — opt-out tier", () => {
  it.each(["STOP", "stop", " Stop. "])("%s -> opt_out", (reply) => {
    const c = classifyInboundReply(reply);
    expect(c.tier).toBe("opt_out");
    expect(c.intent).toBe("opt_out");
    expect(c.needsReview).toBe(false);
  });
});

describe("classifyInboundReply — unmatched free text is flagged for review, never guessed", () => {
  it.each([
    "sim confirmo",
    "pode ser",
    "talvez",
    "quero remarcar",
    "obrigado",
    "sim mas para as 15h",
    "",
    "   ",
    "👍",
  ])("%j -> unmatched/review", (reply) => {
    const c = classifyInboundReply(reply);
    expect(c.tier).toBe("unmatched");
    expect(c.intent).toBe("review");
    expect(c.needsReview).toBe(true);
  });
});

describe("keyword sets are config values (single source of truth)", () => {
  it("exposes the three tiers with normalized keywords", () => {
    expect(INBOUND_KEYWORDS.confirm).toContain("sim");
    expect(INBOUND_KEYWORDS.cancel).toContain("nao");
    expect(INBOUND_KEYWORDS.optOut).toEqual(["stop"]);
  });
});

/**
 * THE OWNER'S OWN TABLE, 2026-08-31, asserted word for word.
 *
 * The dispatch named the replies the clinic expects to receive:
 *
 *   positives — si, sim, s, ok, claro, confirmo, pode ser
 *   negatives — nao, nao (with the accent), n, cancelar, cancela, nao posso
 *   ambiguous — anything else, INCLUDING a message containing both words and
 *               an empty body
 *
 * WHY THIS IS A SECOND FILE AND NOT MORE CASES IN inbound-classify.test.ts.
 * That file tests the CLASSIFIER - normalization, tier precedence, the
 * never-guess rule - and its tables are chosen to exercise those mechanics.
 * This one tests the POLICY: the exact set of words the owner said the clinic
 * accepts. They fail for different reasons and should be read separately: a
 * red here means the vocabulary drifted from what was agreed, not that the
 * matcher broke.
 *
 * FOUR OF THESE WORDS DID NOT CLASSIFY BEFORE TODAY. `si`, `s`, `ok`, `claro`
 * and `pode ser` all fell to the unmatched tier, as did `n`, `cancela` and
 * `nao posso` - so a patient answering "ok" got nothing and reception got a
 * review item. The keyword sets grew to close that; the exact-match rule (R11)
 * is unchanged.
 */
import { describe, expect, it } from "vitest";

import { classifyInboundReply, INBOUND_KEYWORDS } from "./inbound-classify";

const POSITIVES = ["si", "sim", "s", "ok", "claro", "confirmo", "pode ser"];
const NEGATIVES = ["nao", "não", "n", "cancelar", "cancela", "nao posso"];

describe("owner table — positives move scheduled to confirmed", () => {
  it.each(POSITIVES)("%j -> confirm", (reply) => {
    const c = classifyInboundReply(reply);
    expect(c.tier).toBe("confirm");
    expect(c.intent).toBe("confirmada");
    expect(c.needsReview).toBe(false);
  });

  // The same words as a real handset sends them: capitalised, punctuated,
  // padded. The normalizer is what makes one keyword cover all of these, so a
  // regression in it shows up here as a policy failure, which is what it is.
  it.each(["SIM", "Sim.", " ok ", "OK!", "Claro,", "Pode ser.", "CONFIRMO"])(
    "%j -> confirm, however the handset spelled it",
    (reply) => {
      expect(classifyInboundReply(reply).intent).toBe("confirmada");
    },
  );
});

describe("owner table — negatives move scheduled to cancelled", () => {
  it.each(NEGATIVES)("%j -> cancel", (reply) => {
    const c = classifyInboundReply(reply);
    expect(c.tier).toBe("cancel");
    expect(c.intent).toBe("cancelada");
    expect(c.needsReview).toBe(false);
  });

  it("the accented and unaccented spellings of nao are the SAME answer", () => {
    expect(classifyInboundReply("não")).toEqual(classifyInboundReply("nao"));
    expect(classifyInboundReply("NÃO!")).toEqual(classifyInboundReply("nao"));
  });
});

describe("owner table — ambiguous changes nothing and goes to review", () => {
  /**
   * A MESSAGE CONTAINING BOTH WORDS IS THE CASE THE OWNER CALLED OUT BY NAME,
   * and it is the one where a substring matcher would be actively dangerous:
   * "sim" and "nao" are both present, so a `.includes()` implementation would
   * pick whichever it tested first and act on a message that says the
   * opposite. Exact match cannot: "sim ou nao" is not a keyword.
   */
  it.each([
    "sim ou nao",
    "sim, nao sei",
    "nao sei se sim",
    "SIM NAO",
  ])("%j -> review, because it says both", (reply) => {
    const c = classifyInboundReply(reply);
    expect(c.tier).toBe("unmatched");
    expect(c.intent).toBe("review");
    expect(c.needsReview).toBe(true);
  });

  /**
   * AN EMPTY BODY. Twilio can deliver one - a message with only an attachment,
   * or a carrier stripping the text - and the danger is specific: if any
   * keyword set ever contained "", `includes("")` would match it and an empty
   * message would confirm or cancel an appointment. The second assertion pins
   * that no set contains an empty string, so this case cannot become an action
   * by way of a config edit.
   */
  it.each(["", " ", "   ", "\n", "\t "])("%j -> review, never an action", (reply) => {
    expect(classifyInboundReply(reply).needsReview).toBe(true);
  });

  /**
   * A REAL RISK THE OWNER'S VOCABULARY CARRIES, pinned rather than argued
   * away. `n` is now a cancel keyword and the normalizer strips punctuation,
   * so any message whose only alphanumeric content is the letter n - "n.",
   * "N!", "(n)" - cancels an appointment. That is the cost of a
   * one-letter keyword and it was the owner's call; this asserts it is TRUE
   * rather than leaving it to be discovered, and it is the arm that would go
   * red if the vocabulary is ever reconsidered.
   */
  it.each(["n.", "N!", " n "])("%j cancels - the one-letter keyword is real", (reply) => {
    expect(classifyInboundReply(reply).intent).toBe("cancelada");
  });

  it("no keyword set contains an empty string", () => {
    for (const set of [INBOUND_KEYWORDS.confirm, INBOUND_KEYWORDS.cancel, INBOUND_KEYWORDS.optOut]) {
      expect(set).not.toContain("");
    }
  });

  it.each([
    "talvez",
    "quero remarcar",
    "obrigado",
    "sim mas para as 15h",
    "pode ser as 16h",
    "👍",
    "cancelar a de sexta",
  ])("%j -> review, because it is not exactly a keyword", (reply) => {
    expect(classifyInboundReply(reply).needsReview).toBe(true);
  });
});

describe("the two vocabularies do not overlap", () => {
  /**
   * A word in both sets would be decided by the ORDER of the checks in
   * `classifyInboundReply` - confirm is tested before cancel - so a
   * cancellation keyword that had crept into the confirm list would silently
   * confirm instead. Nothing in the classifier notices; this does.
   */
  it("no word is both a confirm and a cancel", () => {
    const overlap = INBOUND_KEYWORDS.confirm.filter((w) =>
      INBOUND_KEYWORDS.cancel.includes(w),
    );
    expect(overlap).toEqual([]);
  });

  it("opt-out beats both, because it is a legal instruction and not an answer", () => {
    expect(classifyInboundReply("STOP").intent).toBe("opt_out");
    expect(INBOUND_KEYWORDS.optOut.some((w) => INBOUND_KEYWORDS.confirm.includes(w))).toBe(false);
    expect(INBOUND_KEYWORDS.optOut.some((w) => INBOUND_KEYWORDS.cancel.includes(w))).toBe(false);
  });

  /**
   * THE REMINDER COPY IS DERIVED FROM `confirm[0]` AND `cancel[0]`
   * (reminder-copy.ts), so appending to these arrays is safe and REORDERING
   * them silently rewrites a body JP approved. This pins the two positions the
   * copy depends on.
   */
  it("sim and nao stay first, because the patient-facing copy is derived from them", () => {
    expect(INBOUND_KEYWORDS.confirm[0]).toBe("sim");
    expect(INBOUND_KEYWORDS.cancel[0]).toBe("nao");
  });
});

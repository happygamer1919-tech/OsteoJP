import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isSmsCapablePT } from "@osteojp/notify";
import { normalizePhonePT } from "@osteojp/notify";

/**
 * Q-LE-REMINDERS-LANDLINE-1 — THE SQL PREDICATE AND THE TYPESCRIPT ONE AGREE.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS.
 * ==========================================================================
 * `listPatientsUnreachableBySms` filters in SQL with `phone_e164 LIKE '+3512%'`
 * because pulling every patient in the tenant through `isSmsCapablePT` in
 * JavaScript would read the whole table. That makes it a SECOND COPY of a rule
 * this repo already has one of — and this repo has just spent a card on what two
 * copies of a phone predicate cost when nothing compares them.
 *
 * So they are compared, on a shared corpus, in BOTH directions. A number the SQL
 * would list and the predicate would send to is a patient told they have a
 * problem they do not have; a number the SQL would skip and the predicate would
 * refuse is a patient who silently gets no reminder and never appears on
 * reception's screen. **The second is the one that hides.**
 *
 * THE CORPUS IS THE ONE THE OTHER PHONE GUARDS USE, traps included, for the
 * reason `phone-parity.test.ts` gives: a guard with an easier corpus than its
 * siblings passes while a sibling fails.
 */

/** The predicate the SQL applies, expressed over the same normalised value. */
const sqlWouldList = (e164: string) => e164.startsWith("+3512");

const CORPUS: Array<{ input: string; why: string }> = [
  { input: "912345678", why: "bare mobile, how a patient writes their own" },
  { input: "+351912345678", why: "mobile, already E.164" },
  { input: "00351912345678", why: "mobile, international 00 prefix" },
  { input: "351912345678", why: "mobile, country code with no + and no 00" },
  { input: "+351 912 345 678", why: "mobile with spaces - the seed's format" },
  { input: "+351-912-345-678", why: "mobile with dashes" },
  { input: "922345678", why: "92x mobile block" },
  { input: "932345678", why: "93x mobile block" },
  { input: "962345678", why: "96x mobile block" },
  { input: "942345678", why: "94x - NOT a consumer block, and deliberately still SMS-capable" },

  // THE WHOLE SUBJECT OF THE CARD. Geographic lines, which normalise fine and
  // cannot receive SMS.
  { input: "212345678", why: "21x Lisboa fixed line" },
  { input: "222345678", why: "22x Porto fixed line" },
  { input: "272328221", why: "the clinic's own Castelo Branco fixed line" },
  { input: "+351 212 345 678", why: "geographic with spaces" },
  { input: "00351212345678", why: "geographic, international 00 prefix" },
];

describe("the SQL landline filter and isSmsCapablePT cannot drift", () => {
  it("the corpus is not vacuous and contains BOTH verdicts", () => {
    // Two empty sets agree perfectly. Without this, a corpus that normalised to
    // nothing would make the agreement assertion pass over no comparisons.
    expect(CORPUS.length).toBeGreaterThanOrEqual(12);
    const normalised = CORPUS.map((c) => normalizePhonePT(c.input)).filter(
      (x): x is string => x !== null,
    );
    expect(normalised.length).toBe(CORPUS.length);
    expect(normalised.filter((n) => sqlWouldList(n)).length).toBeGreaterThanOrEqual(4);
    expect(normalised.filter((n) => !sqlWouldList(n)).length).toBeGreaterThanOrEqual(8);
  });

  it.each(CORPUS)("agrees on $input ($why)", ({ input }) => {
    const e164 = normalizePhonePT(input);
    expect(e164, `${input} must normalise for this comparison to mean anything`).not.toBeNull();
    // THE INVARIANT: the SQL lists exactly the numbers the predicate refuses.
    expect(sqlWouldList(e164!)).toBe(!isSmsCapablePT(e164!));
  });

  it("lists the geographic numbers and no others - stated as a set, not a loop", () => {
    // The loop above proves agreement case by case; this proves the SET is the
    // one the card is about, so an agreement reached by BOTH sides going wrong
    // in the same direction would still fail here.
    const listed = CORPUS.map((c) => normalizePhonePT(c.input)!)
      .filter(sqlWouldList)
      .map((n) => n.slice(4, 6));
    expect([...new Set(listed)].sort()).toEqual(["21", "22", "27"]);
  });
});

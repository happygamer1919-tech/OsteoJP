import { describe, expect, it } from "vitest";
import { normalizePhonePT as canonical } from "./phone";
import { normalizePhonePT as mirror } from "../../../api/lib/notify/phone";

/**
 * PARITY GUARD for the deliberate duplication of `normalizePhonePT`.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS, AND WHAT WAS HOLDING THE PROPERTY BEFORE: A SENTENCE.
 * ==========================================================================
 * `apps/api/lib/notify/phone.ts` opens by declaring itself a MIRROR and
 * `apps/web/lib/reminders/phone.ts` the CANONICAL copy — "keep in sync". That
 * comment was the whole of the enforcement. Nothing compared them, so the day
 * somebody edited one the other would carry on being correct about a rule the
 * product no longer had, and both apps would keep passing their own suites.
 *
 * `LE-reminders-landline-dispatch` names the gap in its own words: "whichever
 * way it goes, the two phone.ts copies must move TOGETHER or the mirror comment
 * at phone.ts:7 becomes false. A drift check between them would be a cheap guard
 * and none exists today." This is that guard. It is the same move #976 made on
 * `auth_user_id`: a claim that was true because somebody had walked it becomes a
 * claim that is true because something fails when it stops being.
 *
 * ==========================================================================
 * WHAT THIS GUARD DOES NOT DECIDE, and it is the larger half of that card.
 * ==========================================================================
 * The card asks a PRODUCT question: when a patient's stored number is a
 * landline, should the 48h/24h reminder skip it, skip it and tell reception, or
 * carry on paying Twilio for a message nobody can receive? That is an owner or
 * JP ruling and no terminal may guess it (standing rule 15). **This file takes
 * no position on it.** It asserts only that the two copies AGREE — whatever they
 * agree on — so that when the ruling lands, a change to one that misses the
 * other cannot ship green.
 *
 * ==========================================================================
 * BEHAVIOURAL, NOT TEXTUAL, and that is deliberate.
 * ==========================================================================
 * The two files are not byte-identical today and should not be: their header
 * comments differ on purpose, one naming the other as canonical. A diff of the
 * source would be red on arrival and would have to be taught to ignore comments,
 * at which point it is comparing something nobody can describe.
 *
 * So this compares OUTPUTS over a corpus, exactly as
 * `slot-lock-parity.test.ts` does for the other deliberate duplication in this
 * monorepo. A test-time import across the workspace, never bundled into either
 * app — the two are separate Next builds and cannot import each other at
 * runtime, which is why the duplication exists at all.
 *
 * THE CORPUS IS THE ONE `phone-e164-parity.db.test.ts` ALREADY USES, including
 * the traps it found worth pinning: the over-long number, the non-breaking
 * space, the geographic prefix. A parity test with an easier corpus than its
 * sibling would pass while the sibling failed, which is worse than having no
 * test at all.
 */

const CORPUS: Array<{ input: string; why: string }> = [
  // The four documented accepted forms.
  { input: "912345678", why: "bare 9-digit subscriber, how a patient writes their own" },
  { input: "+351912345678", why: "already E.164, passthrough" },
  { input: "00351912345678", why: "international 00 prefix" },
  { input: "351912345678", why: "country code with no + and no 00" },

  // Separators, which is the whole reason the normalizer exists.
  { input: "+351 912 345 678", why: "spaces - the seed's format and a receptionist's" },
  { input: "912 345 678", why: "spaces, no country code" },
  { input: "+351-912-345-678", why: "dashes" },
  { input: "+351.912.345.678", why: "dots" },
  { input: "(351) 912345678", why: "parentheses" },
  { input: " 912345678 ", why: "leading and trailing space" },

  // GEOGRAPHIC (LANDLINE) NUMBERS ARE THE CARD'S OWN SUBJECT, so they are in the
  // corpus twice. Both copies must agree that these NORMALIZE - normalization is
  // a separate rule from SMS capability, and neither copy may quietly start
  // doing `isSmsCapablePT`'s job. If the pending ruling changes that, it must
  // change on BOTH sides, and this is what refuses a change to one.
  { input: "212345678", why: "geographic line, valid subscriber, not SMS-capable" },
  { input: "+351 212 345 678", why: "geographic with spaces" },

  // Rejections. Each must be null on BOTH sides.
  { input: "", why: "empty" },
  { input: "   ", why: "whitespace only" },
  { input: "812345678", why: "leading 8 - not a PT subscriber range" },
  { input: "91234567", why: "eight digits, one short" },
  { input: "9123456789", why: "ten digits, one long" },
  { input: "+3519123456789", why: "ten digits after +351 - the over-long trap" },
  { input: "3519123456789", why: "thirteen digits - fails the exactly-twelve gate" },
  { input: "+44 20 7946 0958", why: "a UK number - foreign numbers are NOT normalized" },
  { input: "not a phone", why: "free text somebody typed into the field" },
  { input: "912345678 ext 4", why: "an extension appended" },

  // THE KNOWN BOUNDARY. U+00A0 is stripped by JS \s. Kept because the sibling
  // corpus keeps it: a disagreement here should be a dated fact, not a surprise.
  { input: "+351 912 345 678", why: "non-breaking spaces, as pasted from a document" },
];

describe("phone parity: the apps/api mirror matches the canonical apps/web copy", () => {
  it("the corpus is not vacuous, and exercises both verdicts", () => {
    // LEARNINGS entry 5. Without this, an empty or all-rejecting corpus would
    // make every assertion below pass over a normalizer that returns null for
    // everything - the two copies would "agree" and the reminder path would send
    // nothing at all.
    expect(CORPUS.length).toBeGreaterThanOrEqual(20);
    const accepted = CORPUS.filter((c) => canonical(c.input) !== null);
    const rejected = CORPUS.filter((c) => canonical(c.input) === null);
    expect(accepted.length, "the corpus must contain numbers that normalize").toBeGreaterThanOrEqual(12);
    expect(rejected.length, "and numbers that do not").toBeGreaterThanOrEqual(8);
  });

  it("the two are not the same module object, so agreeing means something", () => {
    // A positive control on the harness itself. If a path alias ever resolved
    // both imports to ONE file, every assertion below would compare a function
    // with itself and pass forever - green, and proving nothing.
    expect(canonical).not.toBe(mirror);
  });

  it.each(CORPUS)("agrees on $input ($why)", ({ input }) => {
    expect(mirror(input)).toBe(canonical(input));
  });

  it("agrees on the landline verdict specifically, which is what the open ruling will move", () => {
    // Named separately from the corpus loop so that a future reader looking for
    // "does this guard cover the thing the card is about" finds it by name.
    // TODAY both copies NORMALIZE a geographic number. This assertion pins the
    // AGREEMENT, not the value: if the ruling makes landlines rejected, this
    // line still holds and still refuses a one-sided change.
    expect(mirror("212345678")).toBe(canonical("212345678"));
    expect(mirror("+351212345678")).toBe(canonical("+351212345678"));
  });
});

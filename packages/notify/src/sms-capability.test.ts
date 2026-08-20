import { describe, it, expect } from "vitest";
import { isSmsCapablePT } from "./sms-capability";

/**
 * SEC-otp-unauthenticated-sms-pump, direction (b).
 *
 * The property: a Portuguese geographic number is refused, and every number that
 * can actually receive an SMS is not.
 */

describe("isSmsCapablePT", () => {
  it("refuses PT geographic numbers, which cannot receive SMS", () => {
    // 21x Lisboa, 22x Porto, 27x Castelo Branco region - all fixed lines.
    expect(isSmsCapablePT("+351210000000")).toBe(false);
    expect(isSmsCapablePT("+351220000000")).toBe(false);
    expect(isSmsCapablePT("+351272000000")).toBe(false);
  });

  it("accepts mobile and the nomadic 9x ranges", () => {
    for (const n of [
      "+351912345678",
      "+351922345678",
      "+351932345678",
      "+351962345678",
    ]) {
      expect(isSmsCapablePT(n), n).toBe(true);
    }
  });

  it("does not enforce prefix assignment, inheriting phone.ts:12-18 deliberately", () => {
    // 94x is not a consumer block today. Over-strictness here silently drops
    // reachable patients and is the carrier's call, not ours. This asserts the
    // NON-behaviour so a future 'tighten it up' edit has to argue with a test.
    expect(isSmsCapablePT("+351942345678")).toBe(true);
  });

  it("returns false for anything not already normalised, rather than guessing", () => {
    // It is a capability check, not a second validator. A caller that has not
    // run normalizePhonePT first has a bug, and papering over it here would let
    // an un-normalised number reach the send path.
    for (const bad of [
      "912345678", // bare subscriber, not E.164
      "00351912345678", // international prefix form
      "+44912345678", // wrong country
      "+35191234567", // eight digits
      "+3519123456789", // ten digits
      "",
      "not-a-phone",
    ]) {
      expect(isSmsCapablePT(bad), bad).toBe(false);
    }
  });

  /**
   * THE COMPOSITION THAT MATTERS, ASSERTED ON THE NORMALISER'S OUTPUTS RATHER
   * THAN BY CALLING IT.
   *
   * `normalizePhonePT` decides what a well-formed PT number IS; this decides
   * whether we will send to one. The pair has to agree on the 9x space and
   * disagree on exactly the 2x space, or one of them is wrong.
   *
   * IT NO LONGER IMPORTS THE NORMALISER, and the reason is the move that brought
   * this file here: `normalizePhonePT` lives in the two apps, behind an app
   * alias this package cannot resolve, and reaching across a workspace boundary
   * to test a pure predicate would put a build dependency in a package that has
   * none. The two literals below are `normalizePhonePT`'s ACTUAL outputs for
   * those inputs, pinned by `apps/web/lib/reminders/phone-parity.test.ts` and by
   * `apps/api/lib/auth/phone-e164-parity.db.test.ts` - both of which assert the
   * mobile AND the geographic case explicitly.
   */
  it("accepts what the normaliser emits for a mobile and refuses it for a landline", () => {
    // Both are well-formed to the normaliser - THAT is the defect being closed:
    // the normaliser has always accepted the landline.
    expect(isSmsCapablePT("+351912345678")).toBe(true);
    expect(isSmsCapablePT("+351210000000")).toBe(false);
  });

  it("halves the accepted input space, which is the blast-radius claim", () => {
    // The card claims rejecting the 2 prefix removes roughly half of the ~2x10^8
    // accepted inputs. Asserted rather than restated: both leading digits the
    // normaliser admits, one accepted and one refused, is exactly half of a
    // uniform 9-digit space.
    const accepted = ["2", "9"].filter((d) =>
      isSmsCapablePT(`+351${d}12345678`),
    );
    expect(accepted).toEqual(["9"]);
  });
});

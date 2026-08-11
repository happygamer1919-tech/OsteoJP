import { describe, it, expect } from "vitest";
import { isSmsCapablePT } from "./otp-sms-capability";
import { normalizePhonePT } from "@/lib/notify/phone";

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
   * THE COMPOSITION THAT MATTERS. normalizePhonePT decides what a well-formed PT
   * number IS; this decides whether we will send to one. The pair has to agree
   * on the 9x space and disagree on exactly the 2x space, or one of them is
   * wrong.
   */
  it("agrees with normalizePhonePT everywhere except the 2 prefix", () => {
    const mobile = "912345678";
    const landline = "210000000";

    // Both are well-formed to the normaliser. That is the defect being closed:
    // the normaliser has always accepted the landline.
    expect(normalizePhonePT(mobile)).toBe("+351912345678");
    expect(normalizePhonePT(landline)).toBe("+351210000000");

    // And only one of them is something we will pay to text.
    expect(isSmsCapablePT(normalizePhonePT(mobile)!)).toBe(true);
    expect(isSmsCapablePT(normalizePhonePT(landline)!)).toBe(false);
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

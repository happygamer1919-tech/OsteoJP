import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { isSmsCapablePT } from "@osteojp/notify";
import { normalizePhonePT } from "@osteojp/notify";

/**
 * Q-LE-REMINDERS-LANDLINE-1 — the SKIP half, and the source guard that keeps it
 * where it has to be.
 *
 * ==========================================================================
 * WHY A SOURCE GUARD AND NOT ONLY A BEHAVIOURAL TEST.
 * ==========================================================================
 * `sendPatientSms` is a module-private function on the reminder dispatch path,
 * behind the R9 live-send flag and a transport. Driving it end to end here would
 * mock the transport, the flag, the store and the clock — and would then prove
 * that the MOCKS behave, which is the shape `pedido-confirm.db.test.ts` was
 * written to escape.
 *
 * What can be asserted exactly is the ORDER and the CONDITION: the landline
 * check runs AFTER normalisation (it takes an E.164 value and returns false for
 * anything else, so running it first would refuse every well-formed number) and
 * BEFORE `sendSms` (the whole point is not to pay for the message). Both are
 * facts about the source, and both are invisible in any unit that mocks the
 * transport.
 */

const dispatchSrc = () =>
  readFileSync(new URL("./dispatch.ts", import.meta.url), "utf8");

import { readFileSync } from "node:fs";

/** Comments stripped, for the reason the agenda freshness guard learned the hard
 *  way: a scan cannot tell a prohibition from an instance of the thing it
 *  prohibits, and this file's own explanation names every symbol it checks. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the reminder path skips a landline", () => {
  let src: string;
  beforeEach(() => {
    src = code(dispatchSrc());
  });

  it("the stripper leaves the code and removes the prose", () => {
    // Two positive controls, so the assertions below cannot pass over "".
    expect(src).toContain("async function sendPatientSms");
    expect(src).not.toContain("Q-LE-REMINDERS-LANDLINE-1");
  });

  it("calls isSmsCapablePT on the dispatch path at all", () => {
    expect(src).toContain("isSmsCapablePT(");
  });

  it("checks capability AFTER normalising, never before", () => {
    // isSmsCapablePT returns false for anything that is not already E.164, so
    // running it on the raw stored number would refuse EVERY patient - the
    // total-outage failure, and it would look exactly like "no landlines found".
    const norm = src.indexOf("normalizePhonePT(args.phone)");
    const cap = src.indexOf("isSmsCapablePT(");
    expect(norm).toBeGreaterThan(-1);
    expect(cap).toBeGreaterThan(norm);
  });

  it("checks capability BEFORE sendSms, which is the point of the ruling", () => {
    // Skipping after the send would log the right thing and still pay the bill.
    //
    // THE ANCHOR IS `sendSms({`, NOT `return sendSms(`, AND THE CHANGE IS THE
    // REASON THIS COMMENT EXISTS. The send moved inside a callback when the
    // provider_error ledger write was wired in - `return sendRecordingProviderError(..., () => sendSms({...}))`
    // - so the old literal vanished and this guard went red while the property
    // it guards was untouched. A test pinned to a line's PUNCTUATION fails on
    // refactors and passes on regressions; pinning it to the CALL keeps it
    // asserting the ordering it was written for. Both spellings are accepted so
    // the guard survives the shape moving back, too.
    const cap = src.indexOf("isSmsCapablePT(");
    const send = src.indexOf("sendSms({");
    expect(cap).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(cap).toBeLessThan(send);
  });

  it("the landline skip RETURNS, so nothing downstream can send anyway", () => {
    // The ordering assertion above is positional, and position alone would not
    // catch a capability check that logged and fell through. This is the arm
    // that makes the skip a skip: the landline branch ends in `return null`.
    const cap = src.indexOf("isSmsCapablePT(");
    const after = src.slice(cap, cap + 900);
    expect(after).toContain("return null;");
  });

  it("gives the landline skip its OWN reason, not invalid_phone", () => {
    // They are different facts about different problems: invalid_phone is a
    // number nobody can use and the record is wrong; landline is a perfectly
    // good number that cannot receive THIS channel. Reception acts on them
    // differently, and one log line saying "invalid" sends them to correct a
    // number that is correct.
    expect(src).toMatch(/sms skipped: landline/);
    expect(src).toMatch(/sms skipped: invalid_phone/);
  });

  it("the two reasons are separate branches, not one message", () => {
    const invalid = src.indexOf("sms skipped: invalid_phone");
    const landline = src.indexOf("sms skipped: landline");
    expect(invalid).toBeGreaterThan(-1);
    expect(landline).toBeGreaterThan(invalid);
  });
});

describe("the predicate the skip relies on", () => {
  it("refuses the clinic's own fixed lines and accepts its mobiles", () => {
    // The real numbers from the guest booking form, so this is about the
    // clinic's actual data rather than a fixture.
    for (const landline of ["214191988", "272328221"]) {
      expect(isSmsCapablePT(normalizePhonePT(landline)!), landline).toBe(false);
    }
    for (const mobile of ["969472111", "969877553"]) {
      expect(isSmsCapablePT(normalizePhonePT(mobile)!), mobile).toBe(true);
    }
  });
});

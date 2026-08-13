/**
 * patient-linkage.db.test.ts — WF-07 linkage against a REAL Postgres, and the
 * defect the mocked suite could never see.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS, AND IT IS NOT "more coverage"
 * ============================================================================
 * `patient-linkage.test.ts` mocks `@osteojp/db` entirely. Its fake `select()`
 * returns whatever `H.rows` was set to, and the assertions inspect the SHAPE of
 * the `where` clause — that it contains an `eq` on `phone`, an `isNull` on
 * `auth_user_id`, and so on. **It never matches a phone string against a stored
 * value, because there is no stored value.**
 *
 * That is the self-mocking shape LOOP 6's citation audit found in
 * `fichas/read.test.ts`: a test whose mock supplies its own answer. It proves the
 * query is ASSEMBLED correctly. It cannot prove the query FINDS anything.
 *
 * So this suite comes to the database, following `otp-claim.db.test.ts` and
 * `redeem.db.test.ts`.
 *
 * ============================================================================
 * WHAT IT FOUND, ON ITS FIRST RUN
 * ============================================================================
 * `resolvePatientByProvenPhone` matches with `eq(patients.phone, phoneE164)` —
 * an EXACT string comparison against the raw stored column. `patients.phone` is
 * free text: `optionalText` (apps/web/lib/patients/validation.ts:117-124) trims
 * it and normalizes nothing, and the module header of
 * `apps/api/lib/notify/phone.ts` says so outright — *"numbers arrive as
 * '912 345 678', '00351912345678', '+351 912-345-678', etc."*
 *
 * **A patient whose number is stored the way a human writes it cannot log in to
 * the portal.** Not "logs in with a warning" — refused, with the same single
 * `otp_refused` string that a wrong code produces, because the API deliberately
 * collapses all six failures into one response.
 *
 * Every patient in the e2e seed except the OTP fixture is stored with spaces.
 * Portuguese numbers are conventionally written with spaces.
 *
 * ============================================================================
 * THE SECOND TEST PINS A DEFECT, AND IT IS GREEN ON PURPOSE. READ THIS.
 * ============================================================================
 * `SEC-otp-linkage-exact-phone-match` is **launch-blocking and HALTED for the
 * owner**: every candidate fix needs a migration (an expression index or a
 * normalized column plus a backfill), and this lane does not author migrations
 * without the owner — `0062` is unoccupied and stays that way.
 *
 * So the defect is RECORDED here rather than fixed. The assertion states the
 * behaviour as it is today. **When the defect is fixed, this test MUST go red**,
 * and its message says so, so the fix cannot land while quietly leaving a test
 * that asserts the broken behaviour. A card can be missed; a red test cannot.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

/** One number, written two ways. The E.164 form is what a caller ever proves. */
const E164 = "+351900000101";
const HUMAN = "+351 900 000 102";
const HUMAN_E164 = "+351900000102";

d("WF-07 linkage against a real database", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let resolve: typeof import("./patient-linkage").resolvePatientByProvenPhone;
  let tenantId: string;
  let canonicalId: string;
  let humanId: string;

  beforeAll(async () => {
    db = (await import("@osteojp/db")).getDbAdmin();
    resolve = (await import("./patient-linkage")).resolvePatientByProvenPhone;

    tenantId = randomUUID();
    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Linkage Co', ${"lnk-" + tenantId.slice(0, 8)})`);

    // Stored the way the code expects.
    canonicalId = randomUUID();
    await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${canonicalId}, ${tenantId}, 'Paciente Canonico', ${E164})`);

    // Stored the way a human types it — the SAME number, different text.
    humanId = randomUUID();
    await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${humanId}, ${tenantId}, 'Paciente Humano', ${HUMAN})`);
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /* ------------------------------------------------------------------ */

  it("links a patient whose number is stored as bare E.164", async () => {
    // THE POSITIVE CONTROL, AND IT IS LOAD-BEARING. Without it, the refusal
    // below would be satisfied by a query that finds nothing under any
    // circumstances — a broken connection, a wrong tenant, an empty table — and
    // the "defect" would be an artifact of the fixture.
    const result = await resolve(tenantId, E164);
    expect(result.ok, "the canonical row must link, or nothing below means anything").toBe(true);
    if (result.ok) expect(result.patientId).toBe(canonicalId);
  });

  it("REFUSES a patient whose number is stored the way a human writes it — SEC-otp-linkage-exact-phone-match", async () => {
    // ================================================================= //
    // THIS ASSERTION RECORDS A DEFECT. IT IS NOT A PROPERTY WORTH HAVING.
    // ================================================================= //
    // The row IS this number. `normalizePhonePT("+351 900 000 102")` returns
    // exactly HUMAN_E164, so the two are the same phone by the repo's own
    // definition. Linkage refuses because it compares raw text.
    //
    // WHEN THE DEFECT IS FIXED THIS TEST GOES RED, WHICH IS THE POINT. Invert it
    // then: `expect(result.ok).toBe(true)` and `result.patientId === humanId`.
    // Do not delete it — the inverted form is the regression guard the fix wants.
    const result = await resolve(tenantId, HUMAN_E164);
    expect(
      result.ok,
      "IF THIS IS NOW TRUE, THE DEFECT IS FIXED AND THIS TEST MUST BE INVERTED. " +
        "SEC-otp-linkage-exact-phone-match: resolvePatientByProvenPhone compares " +
        "eq(patients.phone, phoneE164) against a free-text column that nothing " +
        "normalizes on write, so a patient stored as '+351 900 000 102' cannot log " +
        "in with +351900000102 — the same number. Flip this to toBe(true) and " +
        "assert the patientId.",
    ).toBe(false);
  });

  it("still refuses when TWO live rows carry the same canonical number", async () => {
    // The property the refusal exists for, proven against real rows rather than
    // against `H.rows.length = 2`. A second canonical row makes the count 2, and
    // ambiguity must refuse rather than pick one — mis-linking a medical record
    // is the failure class this guard exists to prevent.
    const twinId = randomUUID();
    await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${twinId}, ${tenantId}, 'Paciente Gemeo', ${E164})`);
    try {
      const result = await resolve(tenantId, E164);
      expect(result.ok, "two live rows with one number must REFUSE, never pick").toBe(false);
    } finally {
      await db.execute(raw`delete from patients where id = ${twinId}`);
    }
  });

  it("refuses a row that is already claimed, and a soft-deleted one", async () => {
    // Both predicates asserted against real column values rather than against
    // the shape of an `isNull()` call.
    await db.execute(raw`update patients set auth_user_id = ${randomUUID()} where id = ${canonicalId}`);
    const claimed = await resolve(tenantId, E164);
    expect(claimed.ok, "an already-claimed row must refuse").toBe(false);

    await db.execute(raw`update patients set auth_user_id = null, deleted_at = now() where id = ${canonicalId}`);
    const deleted = await resolve(tenantId, E164);
    expect(deleted.ok, "a soft-deleted row must refuse").toBe(false);

    await db.execute(raw`update patients set deleted_at = null where id = ${canonicalId}`);
    const restored = await resolve(tenantId, E164);
    expect(restored.ok, "and the restore must put it back, or the two above prove nothing").toBe(
      true,
    );
  });
});

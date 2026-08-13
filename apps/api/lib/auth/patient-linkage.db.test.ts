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
 * WHAT IT FOUND ON ITS FIRST RUN, AND WHAT FIXED IT
 * ============================================================================
 * `resolvePatientByProvenPhone` matched `eq(patients.phone, phoneE164)` — an
 * EXACT string comparison against the raw stored column. `patients.phone` is
 * free text: `optionalText` (apps/web/lib/patients/validation.ts:117-124) trims
 * it and normalizes nothing, and the module header of
 * `apps/api/lib/notify/phone.ts` says so outright — *"numbers arrive as
 * '912 345 678', '00351912345678', '+351 912-345-678', etc."*
 *
 * **A patient whose number was stored the way a human writes it could not log in
 * to the portal.** Not "logged in with a warning" — refused, with the same
 * single `otp_refused` string that a wrong code produces, because the API
 * deliberately collapses all six failures into one response.
 *
 * **Fixed by migration 0062**, which added `phone_e164` — GENERATED ALWAYS from
 * `phone`, so it cannot drift and no write path can forget it — and by pointing
 * the linkage query at it. `phone` itself is untouched: owner ruling, it is what
 * a receptionist typed and it stays that.
 *
 * ============================================================================
 * THE PINNED-DEFECT PATTERN, WHICH IS WORTH MORE THAN THIS ONE DEFECT
 * ============================================================================
 * Between 2026-08-13's discovery and its fix, the second test here asserted
 * `.toBe(false)` — **it stated the broken behaviour as fact** — and carried its
 * own instruction: *"IF THIS IS NOW TRUE, THE DEFECT IS FIXED AND THIS TEST MUST
 * BE INVERTED."*
 *
 * That is the shape to reach for whenever a defect cannot be fixed today.
 * `SEC-otp-linkage-exact-phone-match` needed a migration, migrations need the
 * owner, and `0062` was unoccupied at the time. A card would have carried the
 * knowledge; only a test carries it into CI, changes colour the day the world
 * changes, and cannot be missed by someone who did not read the board.
 *
 * It has now been inverted, exactly as instructed, and two counterweights were
 * added with it — see the tests below. **An inversion that only proves the new
 * happy path is half a test**: a normalization too permissive would satisfy it
 * while linking patients to numbers they do not have, which is the mis-link this
 * whole module exists to prevent and strictly worse than the defect fixed.
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

  it("LINKS a patient whose number is stored the way a human writes it — SEC-otp-linkage-exact-phone-match, FIXED", async () => {
    // ================================================================= //
    // INVERTED 2026-08-13, EXACTLY AS THE PREVIOUS VERSION INSTRUCTED.
    // ================================================================= //
    // This assertion used to read `.toBe(false)` and to say, in its own message,
    // "IF THIS IS NOW TRUE, THE DEFECT IS FIXED AND THIS TEST MUST BE INVERTED".
    // Migration 0062 added `phone_e164`, GENERATED ALWAYS from `phone`, and
    // resolvePatientByProvenPhone now matches on it. So it is true, and this is
    // the inverted form: the regression guard the fix wanted.
    //
    // THE PINNED-DEFECT PATTERN, WORTH KEEPING FOR THE NEXT ONE. A defect that
    // cannot be fixed today — this one needed a migration, and migrations need
    // the owner — goes into CI as an assertion of what IS true, carrying its own
    // instruction to be flipped. A card can be missed. A test that changes
    // colour the day the world changes cannot.
    const result = await resolve(tenantId, HUMAN_E164);
    expect(
      result.ok,
      "a patient stored as '+351 900 000 102' must link when +351900000102 is " +
        "proven — the same number. If this is false, either migration 0062 has not " +
        "been applied to this database, or the linkage query has regressed to " +
        "matching the raw free-text `phone` column.",
    ).toBe(true);
    if (result.ok) expect(result.patientId).toBe(humanId);
  });

  it("still refuses a number no patient carries, so the fix did not widen the match", async () => {
    // THE COUNTERWEIGHT TO THE INVERSION ABOVE, and it is not decoration. The
    // fix moved the comparison to a DERIVED column; a normalization that was too
    // permissive — one that stripped digits, or that matched NULL against NULL —
    // would make the test above pass while linking patients to numbers they do
    // not have. That is the mis-link this whole module exists to prevent, and it
    // would be strictly worse than the defect just fixed.
    const stranger = await resolve(tenantId, "+351900000199");
    expect(stranger.ok, "a number belonging to nobody must refuse").toBe(false);
  });

  it("refuses a patient whose stored number does not normalize at all", async () => {
    // `phone_e164` is NULL for free text, a foreign number, or an extension —
    // and `eq` on NULL is never true in SQL, so the row is unreachable by login
    // rather than reachable by accident. Asserted rather than reasoned about,
    // because "NULL never matches" is exactly the kind of claim that is true
    // until somebody writes `IS NOT DISTINCT FROM`.
    const oddId = randomUUID();
    await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${oddId}, ${tenantId}, 'Paciente Estrangeiro', '+44 20 7946 0958')`);
    try {
      const uk = await resolve(tenantId, "+442079460958");
      expect(uk.ok, "a foreign number is not a PT subscriber number and must refuse").toBe(false);
    } finally {
      await db.execute(raw`delete from patients where id = ${oddId}`);
    }
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

/**
 * consultations-rls.test.ts — migration 0064.
 *
 * The table is written BEFORE the M1 fire so a failed fire is recoverable. Its
 * RLS shape is deliberately asymmetric and this suite is what pins it:
 *
 *   SELECT  — `authenticated`, tenant-scoped. A stuck consultation must be
 *             visible to a human in its own clinic and to nobody else.
 *   INSERT / UPDATE / DELETE — NO POLICY FOR ANY ROLE.
 *
 * THE MISSING UPDATE POLICY IS THE LOAD-BEARING PART. fire_status is a machine
 * verdict about whether the AI partner received the consultation, written only
 * through the service-role seam. If a staff session could set it to 'fired', the
 * row would read as delivered, the retry scanner would skip it forever, and the
 * audio would age out of the 7-day bucket lifecycle with nobody told. A row that
 * says 'fired' has to mean a machine observed a terminal response.
 *
 * RLS here is ENABLE, not FORCE, so it binds `authenticated` and not the owner
 * or a BYPASSRLS role. Every isolation assertion therefore runs through
 * asRole("authenticated", …); an assertion on the owner connection would pass
 * for the wrong reason. The SELECT case carries the usual sanity arm — a known
 * tenant-B row is NOT visible under a tenant-A JWT — which fails loudly if RLS
 * is not actually in effect.
 *
 * GATING: requires a live privileged DATABASE_URL with migrations applied.
 * Skipped without one so `vitest run` stays green.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  role: string;
  user: string;
  patient: string;
  consultation: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  patient: randomUUID(),
  consultation: randomUUID(),
});

const A = newIds();
const B = newIds();

// CANONICAL ISO, milliseconds included — exactly the shape machineStamp()
// produces. Not incidental: the DB half of the round-trip guard below compares
// the stored value's toISOString() to this literal, and a stamp written without
// milliseconds would come back as a different STRING for the same instant.
const STARTED = "2026-08-16T09:00:00.000Z";
const ENDED = "2026-08-16T09:42:00.000Z";

async function seed(sql: Sql, x: Ids, label: string): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, ${label}, ${`consult-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.role}, ${x.tenant}, 'admin', 'Admin')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role},
                    ${`c-${x.user}@example.pt`}, 'Seed Staff')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${x.patient}, ${x.tenant}, 'Seed Patient')`;
  await sql`insert into consultations
              (id, tenant_id, patient_id, doctor_id, audio_object_key,
               consultation_started_at, consultation_ended_at)
            values (${x.consultation}, ${x.tenant}, ${x.patient}, ${x.user},
                    ${`${x.tenant}/${x.patient}/seed/consultation.webm`},
                    ${STARTED}, ${ENDED})`;
}

describe.skipIf(!live)("consultations RLS + constraints (migration 0064)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql, A, "Consultations Tenant A");
    await seed(sql, B, "Consultations Tenant B");
  });

  afterAll(async () => {
    if (!sql) return;
    for (const x of [A, B]) {
      await sql`delete from consultations where tenant_id = ${x.tenant}`;
      await sql`delete from patients where tenant_id = ${x.tenant}`;
      await sql`delete from users where tenant_id = ${x.tenant}`;
      await sql`delete from roles where tenant_id = ${x.tenant}`;
      await sql`delete from tenants where id = ${x.tenant}`;
    }
    await sql.end();
  });

  // --- SELECT: tenant-scoped, with the RLS-is-really-on sanity arm ---------

  it("SELECT under a tenant-A JWT returns only tenant-A rows", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
      tx<{ id: string; tenant_id: string }[]>`select id, tenant_id from consultations`,
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenant_id === A.tenant)).toBe(true);

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(A.consultation);
    // SANITY: if RLS were off or bypassed, tenant B's seed row would be here.
    expect(ids).not.toContain(B.consultation);
  });

  it("a JWT with no tenant claim sees nothing — fail-closed, not fail-open", async () => {
    const rows = await asRole(sql, "authenticated", null, (tx) =>
      tx<{ id: string }[]>`select id from consultations`,
    );
    expect(rows).toHaveLength(0);
  });

  // --- The TABLE gate: writes are refused before RLS is consulted ----------
  //
  // WHICH GATE REFUSES WHICH, because the two are easy to confuse and the
  // difference decides what these assertions prove. 0064 grants `authenticated`
  // SELECT and revokes INSERT / UPDATE / DELETE / TRUNCATE. So a staff write is
  // refused by the TABLE gate with `permission denied`, before any policy is
  // evaluated; cross-tenant READS are refused by the ROW gate above, silently,
  // by filtering. Asserting the wrong one would pass for the wrong reason - and
  // did: the first draft of this migration shipped no GRANT at all, every
  // statement was refused including SELECT, and only the positive control above
  // failed. Every negative assertion here was green over a table reception
  // could not read.

  it("a staff session CANNOT mark a consultation delivered", async () => {
    // THE ONE THAT MATTERS. fire_status is a machine verdict; a session that
    // could set 'fired' would make the retry scanner skip a consultation the
    // partner never received, and the audio would age out of the 7-day bucket
    // with nobody told.
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx`update consultations set fire_status = 'fired' where id = ${A.consultation}`,
      ),
    ).rejects.toThrow(/permission denied/i);

    // And the row is untouched, read back on the privileged connection.
    const rows = await sql<{ fire_status: string }[]>`
      select fire_status from consultations where id = ${A.consultation}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fire_status).toBe("pending");
  });

  it("a staff session cannot INSERT a consultation, even in its own tenant", async () => {
    // Writes are the service-role seam with tenant_id set explicitly (rule 3).
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx`
          insert into consultations
            (tenant_id, patient_id, doctor_id, audio_object_key,
             consultation_started_at, consultation_ended_at)
          values (${A.tenant}, ${A.patient}, ${A.user}, 'k', ${STARTED}, ${ENDED})
        `,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("a staff session cannot DELETE a consultation — a failed fire must not vanish", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx`delete from consultations where id = ${A.consultation}`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("the table gate is closed on writes but OPEN on reads — not shut altogether", async () => {
    // The anti-vacuous arm for the three assertions above. With no GRANT at all
    // they would all pass while `authenticated` could not touch the table in any
    // direction, so this pins that the refusals above are the REVOKE doing its
    // job and not a missing GRANT doing it by accident.
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
      tx<{ id: string }[]>`select id from consultations where id = ${A.consultation}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a tenant-A JWT cannot READ a tenant-B row — the ROW gate, silently", async () => {
    // SELECT is granted, so this one reaches RLS and is answered by filtering
    // rather than by an error. Zero rows, no exception: that IS the policy
    // working, and it is a different mechanism from the three above.
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
      tx<{ id: string }[]>`select id from consultations where id = ${B.consultation}`,
    );
    expect(rows).toHaveLength(0);
  });

  // --- Sanctioned exception: the writers -----------------------------------

  it("service_role writes the fire verdict — the sanctioned bypass the retry job uses", async () => {
    const updated = await asRole(sql, "service_role", null, (tx) =>
      tx<{ id: string; fire_status: string }[]>`
        update consultations set fire_status = 'fired', attempt_count = 2
        where id = ${A.consultation} returning id, fire_status
      `,
    );
    expect(updated).toHaveLength(1);
    expect(updated[0]?.fire_status).toBe("fired");
    // The harness rolls back, so tenant A's row is still pending afterwards.
  });

  // --- Constraints ---------------------------------------------------------

  it("fire_status is pinned to the three states", async () => {
    await expect(
      sql`update consultations set fire_status = 'done' where id = ${A.consultation}`,
    ).rejects.toThrow(/consultations_fire_status_check/);
  });

  it("the partner's idempotency grain is unique: patient + both instants", async () => {
    // Two rows sharing (tenant, patient, started, ended) would be two of our
    // consultations for ONE of the partner's records, because that triple is
    // what their idempotency key is derived from. The DB refuses at the same
    // grain they dedupe at.
    await expect(
      sql`insert into consultations
            (tenant_id, patient_id, doctor_id, audio_object_key,
             consultation_started_at, consultation_ended_at)
          values (${A.tenant}, ${A.patient}, ${A.user}, 'other-key',
                  ${STARTED}, ${ENDED})`,
    ).rejects.toThrow(/consultations_recording_unique/);
  });

  it("a stored timestamp reads back as the SAME STRING the first fire sent", async () => {
    // The DB half of the property the retry depends on. The first fire sends the
    // recorder's machineStamp text; a retry sends the stored value re-formatted.
    // The partner keys on those strings plus patient_id, so a round trip that
    // changed the TEXT (dropped milliseconds, an offset instead of Z) would make
    // attempt 2 a new key and produce a duplicate clinical record on their side.
    const rows = await sql<{ started: Date; ended: Date }[]>`
      select consultation_started_at as started, consultation_ended_at as ended
      from consultations where id = ${A.consultation}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.started.toISOString()).toBe(STARTED);
    expect(rows[0]?.ended.toISOString()).toBe(ENDED);
  });

  it("a consultation cannot end before it started", async () => {
    await expect(
      sql`insert into consultations
            (tenant_id, patient_id, doctor_id, audio_object_key,
             consultation_started_at, consultation_ended_at)
          values (${A.tenant}, ${A.patient}, ${A.user}, 'backwards',
                  ${ENDED}, ${STARTED})`,
    ).rejects.toThrow(/consultations_window_check/);
  });

  it("the audio object key is NOT NULL — it is the only handle on the recording", async () => {
    // The scoped S3 credential has no list permission, so a row without the key
    // is a record of something that cannot be found again by any means.
    await expect(
      sql`insert into consultations
            (tenant_id, patient_id, doctor_id, audio_object_key,
             consultation_started_at, consultation_ended_at)
          values (${A.tenant}, ${A.patient}, ${A.user}, null,
                  ${STARTED}, ${ENDED})`,
    ).rejects.toThrow(/audio_object_key/);
  });
});

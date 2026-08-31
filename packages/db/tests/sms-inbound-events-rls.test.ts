/**
 * sms-inbound-events-rls.test.ts — the mandatory isolation proof for 0069.
 *
 * CLAUDE.md: "Every migration adding a domain table must ship with: tenant_id
 * column, RLS policy, and an isolation test in the same PR." This is that test.
 *
 * WHAT IT PROVES, and each arm names the failure it refuses:
 *
 *   1. CROSS-TENANT. Clinic B cannot see, resolve or file a reply belonging to
 *      clinic A. The table holds patient-authored message text; one leak is one
 *      clinic reading another's correspondence.
 *   2. THERAPIST IS REFUSED. The owner's ruling is "reception and admin read
 *      and resolve, nobody else", and the repo has TWICE shipped a queue gated
 *      on a capability every role holds - `guest_requests:read` exists because
 *      a therapist saw the whole tenant's guest queue on deployed production.
 *      The application check is not the thing under test here; the POLICY is,
 *      because it is what still holds when a future page forgets the check.
 *   3. THE PATIENT ROLE IS REFUSED AT THE TABLE GATE, before RLS is consulted,
 *      because the GRANT was never given. Two independent enforcement points.
 *   4. The dedupe index makes a Twilio redelivery a refusal, not a duplicate.
 *   5. The resolved-pair CHECK cannot be half-written.
 *
 * RLS is ENABLE-not-FORCE, so every scoped assertion runs on the role-switched
 * `authenticated` (or `patient`) connection via asRole, never on the owner
 * connection which BYPASSes RLS and would pass for the wrong reason. asRole
 * always rolls back. Skipped when DATABASE_URL is absent — and hard-required in
 * .github/scripts/assert-rls-executed.mjs so a silent skip reddens the gate.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

type Ids = {
  tenant: string;
  staff: string;
  patient: string;
  event: string;
};
const newIds = (): Ids => ({
  tenant: randomUUID(),
  staff: randomUUID(),
  patient: randomUUID(),
  event: randomUUID(),
});
const A = newIds();
const B = newIds();

async function seedTenant(sql: Sql, x: Ids): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, 'Inbound RLS', ${`ir-${x.tenant}`})`;
  await sql`insert into users (id, tenant_id, email, full_name)
            values (${x.staff}, ${x.tenant}, ${`s-${x.staff}@example.pt`}, 'Staff')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${x.patient}, ${x.tenant}, 'Paciente')`;
  await sql`insert into sms_inbound_events
              (id, tenant_id, provider_message_sid, from_phone_hash, body,
               classification, review_reason, patient_id)
            values (${x.event}, ${x.tenant}, ${`sid-${x.event}`},
                    ${"hash-" + x.event}, 'talvez para sexta', 'review',
                    'ambiguous', ${x.patient})`;
}

describe.skipIf(!live)("sms_inbound_events — tenant + role isolation (0069)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A);
    await seedTenant(sql, B);
  });

  afterAll(async () => {
    if (!sql) return;
    // tenant_id cascades, so the events go with the tenants.
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end({ timeout: 5 });
  });

  /* ------------------------------ 1. tenant ------------------------------ */

  it("reception sees ONLY its own tenant's replies", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "reception", A.staff), (tx) =>
      tx`select id, tenant_id from sms_inbound_events`,
    );
    expect(rows.map((r) => r.id)).toEqual([A.event]);
    expect(rows.every((r) => r.tenant_id === A.tenant)).toBe(true);
  });

  it("a foreign tenant cannot read another clinic's reply by id", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(B.tenant, "admin", B.staff), (tx) =>
      tx`select id from sms_inbound_events where id = ${A.event}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("a foreign tenant cannot RESOLVE another clinic's reply", async () => {
    const updated = await asRole(
      sql,
      "authenticated",
      claimsFor(B.tenant, "admin", B.staff),
      (tx) => tx`update sms_inbound_events
                    set resolution = 'read', resolved_at = now()
                  where id = ${A.event}
                  returning id`,
    );
    // Zero rows, not an error: RLS makes the row invisible to the UPDATE.
    expect(updated).toHaveLength(0);
  });

  it("a reply cannot be filed INTO another tenant", async () => {
    // WITH CHECK is what refuses this. Without it a receptionist could write a
    // row addressed to a clinic they do not belong to.
    await expect(
      asRole(sql, "authenticated", claimsFor(B.tenant, "reception", B.staff), (tx) =>
        tx`insert into sms_inbound_events
             (tenant_id, provider_message_sid, from_phone_hash, body, classification)
           values (${A.tenant}, ${"sid-" + randomUUID()}, 'h', 'x', 'review')`,
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it("a resolved row cannot be moved to another tenant", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.staff), (tx) =>
        tx`update sms_inbound_events set tenant_id = ${B.tenant} where id = ${A.event}`,
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  /* ------------------------------- 2. role ------------------------------- */

  it("a THERAPIST of the owning tenant reads NOTHING — the ruling's excluded role", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.staff), (tx) =>
      tx`select id from sms_inbound_events`,
    );
    expect(rows).toHaveLength(0);
  });

  it("a THERAPIST cannot resolve a reply either", async () => {
    const updated = await asRole(
      sql,
      "authenticated",
      claimsFor(A.tenant, "therapist", A.staff),
      (tx) => tx`update sms_inbound_events
                    set resolution = 'read', resolved_at = now()
                  where id = ${A.event}
                  returning id`,
    );
    expect(updated).toHaveLength(0);
  });

  it("owner, admin and reception all read it — the grant is not accidentally empty", async () => {
    // The mirror of the therapist arm. Without it, a policy that refused
    // EVERYONE would pass every assertion above and look like tight security.
    for (const role of ["owner", "admin", "reception"] as const) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, role, A.staff), (tx) =>
        tx`select id from sms_inbound_events where id = ${A.event}`,
      );
      expect(rows, `role=${role}`).toHaveLength(1);
    }
  });

  it("reception CAN resolve, and the write is visible inside the transaction", async () => {
    const updated = await asRole(
      sql,
      "authenticated",
      claimsFor(A.tenant, "reception", A.staff),
      (tx) => tx`update sms_inbound_events
                    set resolution = 'read', resolved_at = now(), resolved_by = ${A.staff}
                  where id = ${A.event}
                  returning id, resolution`,
    );
    expect(updated).toHaveLength(1);
    expect(updated[0]!.resolution).toBe("read");
  });

  /* ------------------------------ 3. patient ----------------------------- */

  it("the PATIENT role is refused at the TABLE gate, before RLS is consulted", async () => {
    // The load-bearing denial. Every row holds another person's message text.
    // The grant was never given, so this is `permission denied for table`, not
    // an empty result — a different and earlier refusal than the policy's.
    await expect(
      asRole(sql, "patient", patientClaims(A.tenant, A.patient), (tx) =>
        tx`select id from sms_inbound_events`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("the patient role cannot insert either", async () => {
    await expect(
      asRole(sql, "patient", patientClaims(A.tenant, A.patient), (tx) =>
        tx`insert into sms_inbound_events
             (tenant_id, provider_message_sid, from_phone_hash, body, classification)
           values (${A.tenant}, ${"sid-" + randomUUID()}, 'h', 'x', 'review')`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  /* --------------------------- 4. dedupe + CHECK -------------------------- */

  it("a Twilio REDELIVERY is refused by the unique index, not filed twice", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.staff), (tx) =>
        tx`insert into sms_inbound_events
             (tenant_id, provider_message_sid, from_phone_hash, body, classification)
           values (${A.tenant}, ${`sid-${A.event}`}, 'h', 'again', 'review')`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("the SAME sid in a DIFFERENT tenant is legal — the index is tenant-scoped", async () => {
    const rows = await asRole(
      sql,
      "authenticated",
      claimsFor(B.tenant, "admin", B.staff),
      (tx) => tx`insert into sms_inbound_events
                   (tenant_id, provider_message_sid, from_phone_hash, body, classification)
                 values (${B.tenant}, ${`sid-${A.event}`}, 'h', 'x', 'review')
                 returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a resolution without its timestamp is refused by the CHECK", async () => {
    // The half-written shape the queue predicate would misread: `resolution IS
    // NULL` is what puts a row in the queue, so a row with a resolution and no
    // instant would be done, and a row with an instant and no resolution would
    // be waiting forever with a record of having been handled.
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.staff), (tx) =>
        tx`update sms_inbound_events set resolution = 'read' where id = ${A.event}`,
      ),
    ).rejects.toThrow(/sms_inbound_events_resolved_pair_check|violates check/i);

    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.staff), (tx) =>
        tx`update sms_inbound_events set resolved_at = now() where id = ${A.event}`,
      ),
    ).rejects.toThrow(/sms_inbound_events_resolved_pair_check|violates check/i);
  });

  it("an unknown classification is refused by the CHECK", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.staff), (tx) =>
        tx`insert into sms_inbound_events
             (tenant_id, provider_message_sid, from_phone_hash, body, classification)
           values (${A.tenant}, ${"sid-" + randomUUID()}, 'h', 'x', 'maybe')`,
      ),
    ).rejects.toThrow(/classification_check|violates check/i);
  });

  /* ---------------------------- 5. no deletes ---------------------------- */

  it("nobody may DELETE a reply — the grant is revoked", async () => {
    // "Resolve" is the whole state machine, exactly as "mark read" is for
    // staff_notifications. A queue you can empty by deleting is not a record.
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.staff), (tx) =>
        tx`delete from sms_inbound_events where id = ${A.event}`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

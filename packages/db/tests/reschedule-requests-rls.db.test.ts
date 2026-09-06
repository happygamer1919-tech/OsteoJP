/**
 * 0080's gate — appointment_reschedule_requests.
 *
 * ==========================================================================
 * THE POLICY IS A DELEGATION, SO THE TEST IS ABOUT WHAT IT DELEGATES TO
 * ==========================================================================
 * 0080's policy is `tenant_id = jwt_tenant_id() AND EXISTS (SELECT 1 FROM
 * appointments a WHERE a.id = appointment_id)`. That EXISTS is evaluated under
 * `appointments_rls` like any other read, so the access rule for a request is
 * "can you see the appointment it is about" — stated once, in the table that
 * owns it, rather than copied here and left to drift.
 *
 * A DELEGATED RULE STILL HAS TO BE PROVEN, and proven through the delegation
 * rather than around it: every case below sets up an APPOINTMENT visibility and
 * asserts the REQUEST follows it. If somebody later replaces the EXISTS with a
 * denormalised copy of location_id and practitioner_id — the design 0080's
 * header rejects — these go red the moment the appointment moves.
 *
 * ==========================================================================
 * THE "BOTH PRACTITIONERS" RULING IS THE THERAPIST CASE, NOT A COUNT
 * ==========================================================================
 * Owner, 2026-09-04: both practitioners are notified when practitioner_2_id is
 * set. 0080 writes ONE row rather than fanning out, so that ruling is satisfied
 * by `appointments_rls`'s therapist arm — `practitioner_id = auth.uid() OR
 * practitioner_2_id = auth.uid()` — and the assertion that proves it is that
 * the SECOND practitioner sees the request. A fan-out design would need a test
 * that two rows were written AND that neither insert failed; this needs one
 * that the expression covers both people, which it cannot half-do.
 *
 * ==========================================================================
 * THE WRITER IS TESTED AS THE WRITER ACTUALLY RUNS
 * ==========================================================================
 * The patient's press writes through `withReminderTenantContext`, which is
 * `set local role authenticated` with `user_role = 'admin'` and NO `sub` — a
 * background job has no session. Under `appointments_rls` that makes
 * `auth.uid()` null, so `viewer_has_location_assignment()` is false, so the
 * admin arm's `NOT (...)` is true and every in-tenant appointment is visible.
 * That is the condition the INSERT's WITH CHECK depends on, and it is asserted
 * here rather than reasoned about in a comment — because if a later migration
 * gives that helper a different answer for a null uid, the confirm link starts
 * failing silently and nothing else would catch it.
 */

import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const A = {
  tenant: randomUUID(),
  ownerU: randomUUID(),
  receptionA: randomUUID(),
  therapistT: randomUUID(),
  otherT: randomUUID(),
  locA: randomUUID(),
  locB: randomUUID(),
  pX: randomUUID(),
  apA: randomUUID(), // LocA, practitioner therapistT
  apB: randomUUID(), // LocB, practitioner otherT
  apSecondary: randomUUID(), // LocA, practitioner otherT, practitioner_2 therapistT
  apFresh: randomUUID(), // LocA, no request yet — the writer case needs one
  reqA: randomUUID(),
  reqB: randomUUID(),
  reqSecondary: randomUUID(),
};

const Z = {
  tenant: randomUUID(),
  admin: randomUUID(),
  loc: randomUUID(),
  patient: randomUUID(),
  appt: randomUUID(),
  req: randomUUID(),
};

const W0 = "2026-05-04T09:00:00Z";
const W1 = "2026-05-04T10:00:00Z";
const R0 = "2026-05-03T08:00:00Z";

/** Claims exactly as `withReminderTenantContext` sets them: role admin, NO sub. */
const reminderClaims = (tenantId: string): string =>
  JSON.stringify({ tenant_id: tenantId, user_role: "admin" });

async function seed(p: Sql): Promise<void> {
  await p`insert into tenants (id, name, slug) values (${A.tenant}, '0080 A', ${`m80-a-${A.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${A.ownerU},     ${A.tenant}, ${`o-${A.ownerU}@x.pt`},     'Owner'),
    (${A.receptionA}, ${A.tenant}, ${`r-${A.receptionA}@x.pt`}, 'Reception A'),
    (${A.therapistT}, ${A.tenant}, ${`t-${A.therapistT}@x.pt`}, 'Therapist T'),
    (${A.otherT},     ${A.tenant}, ${`ot-${A.otherT}@x.pt`},    'Other T')`;
  await p`insert into locations (id, tenant_id, name) values
    (${A.locA}, ${A.tenant}, 'Loc A'), (${A.locB}, ${A.tenant}, 'Loc B')`;
  await p`insert into staff_locations (tenant_id, user_id, location_id) values
    (${A.tenant}, ${A.receptionA}, ${A.locA})`;
  await p`insert into patients (id, tenant_id, full_name, created_by) values
    (${A.pX}, ${A.tenant}, 'Patient X', ${A.otherT})`;
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at) values
    (${A.apA}, ${A.tenant}, ${A.pX}, ${A.therapistT}, ${A.locA}, ${W0}, ${W1}),
    (${A.apB}, ${A.tenant}, ${A.pX}, ${A.otherT},     ${A.locB}, ${W0}, ${W1})`;
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, starts_at, ends_at)
          values (${A.apSecondary}, ${A.tenant}, ${A.pX}, ${A.otherT}, ${A.therapistT}, ${A.locA}, ${W0}, ${W1})`;
  // No request against this one: the writer case must not collide with the
  // one-open-request index, which is a DIFFERENT assertion further down.
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${A.apFresh}, ${A.tenant}, ${A.pX}, ${A.therapistT}, ${A.locA}, ${W0}, ${W1})`;
  await p`insert into appointment_reschedule_requests (id, tenant_id, appointment_id, patient_id, requested_at, via) values
    (${A.reqA},         ${A.tenant}, ${A.apA},         ${A.pX}, ${R0}, 'sms_code'),
    (${A.reqB},         ${A.tenant}, ${A.apB},         ${A.pX}, ${R0}, 'sms_code'),
    (${A.reqSecondary}, ${A.tenant}, ${A.apSecondary}, ${A.pX}, ${R0}, 'sms_code')`;

  await p`insert into tenants (id, name, slug) values (${Z.tenant}, '0080 Z', ${`m80-z-${Z.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values (${Z.admin}, ${Z.tenant}, ${`z-${Z.admin}@x.pt`}, 'Z Admin')`;
  await p`insert into locations (id, tenant_id, name) values (${Z.loc}, ${Z.tenant}, 'Z Loc')`;
  await p`insert into patients (id, tenant_id, full_name) values (${Z.patient}, ${Z.tenant}, 'Z Patient')`;
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${Z.appt}, ${Z.tenant}, ${Z.patient}, ${Z.admin}, ${Z.loc}, ${W0}, ${W1})`;
  await p`insert into appointment_reschedule_requests (id, tenant_id, appointment_id, patient_id, requested_at, via)
          values (${Z.req}, ${Z.tenant}, ${Z.appt}, ${Z.patient}, ${R0}, 'sms_code')`;
}

async function visible(sql: Sql, claims: string): Promise<Set<string>> {
  const rows = await asRole(sql, "authenticated", claims, async (tx) =>
    (await tx`select id::text as id from appointment_reschedule_requests`) as { id: string }[],
  );
  return new Set(rows.map((r) => r.id));
}

describe.skipIf(!live)("0080 appointment_reschedule_requests RLS", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${Z.tenant})`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: the owning connection sees every seeded row, so absence below is RLS and not a bad fixture", async () => {
    const all = await sql<{ id: string }[]>`
      select id::text as id from appointment_reschedule_requests
       where id in (${A.reqA}, ${A.reqB}, ${A.reqSecondary}, ${Z.req})`;
    expect(all.length).toBe(4);
  });

  it("CROSS-TENANT: tenant Z's request is invisible to every tenant A principal", async () => {
    for (const claims of [
      claimsFor(A.tenant, "owner", A.ownerU),
      claimsFor(A.tenant, "reception", A.receptionA),
      claimsFor(A.tenant, "therapist", A.therapistT),
    ]) {
      expect((await visible(sql, claims)).has(Z.req)).toBe(false);
    }
  });

  it("owner sees every in-tenant request", async () => {
    const seen = await visible(sql, claimsFor(A.tenant, "owner", A.ownerU));
    for (const id of [A.reqA, A.reqB, A.reqSecondary]) expect(seen.has(id)).toBe(true);
  });

  it("THE OWNER RULING: the SECOND practitioner sees the request, through the same expression as the first", async () => {
    const seen = await visible(sql, claimsFor(A.tenant, "therapist", A.therapistT));
    // primary practitioner on apA
    expect(seen.has(A.reqA)).toBe(true);
    // practitioner_2 on apSecondary — this is "both practitioners are notified"
    expect(seen.has(A.reqSecondary)).toBe(true);
    // otherT's appointment at LocB: not theirs
    expect(seen.has(A.reqB)).toBe(false);
  });

  it("reception is LOCATION-SCOPED, and the request follows the appointment's location", async () => {
    const seen = await visible(sql, claimsFor(A.tenant, "reception", A.receptionA));
    expect(seen.has(A.reqA)).toBe(true); // LocA
    expect(seen.has(A.reqSecondary)).toBe(true); // LocA
    expect(seen.has(A.reqB)).toBe(false); // LocB
  });

  it("THE DELEGATION IS LIVE: moving the appointment to another clinic moves who can see the request", async () => {
    // The reason 0080 does NOT denormalise location_id onto the request row.
    // A copy taken at request time would leave reqA visible to LocA reception
    // after the booking moved to LocB — silently, in the direction that leaks.
    await sql`update appointments set location_id = ${A.locB} where id = ${A.apA}`;
    try {
      const seen = await visible(sql, claimsFor(A.tenant, "reception", A.receptionA));
      expect(seen.has(A.reqA)).toBe(false);
    } finally {
      await sql`update appointments set location_id = ${A.locA} where id = ${A.apA}`;
    }
    const restored = await visible(sql, claimsFor(A.tenant, "reception", A.receptionA));
    expect(restored.has(A.reqA)).toBe(true);
  });

  it("THE WRITER'S OWN CONDITIONS: the reminder context (admin role, NO sub) can INSERT a request", async () => {
    const id = randomUUID();
    const rows = await asRole(sql, "authenticated", reminderClaims(A.tenant), (tx) =>
      tx<{ id: string }[]>`insert into appointment_reschedule_requests
        (id, tenant_id, appointment_id, patient_id, requested_at, via)
        values (${id}, ${A.tenant}, ${A.apFresh}, ${A.pX}, ${R0}, 'sms_code') returning id::text as id`,
    );
    expect(rows.length).toBe(1);
    await sql`delete from appointment_reschedule_requests where id = ${id}`;
  });

  it("the reminder context cannot write into ANOTHER tenant, even naming that tenant", async () => {
    await expect(
      asRole(sql, "authenticated", reminderClaims(A.tenant), (tx) =>
        tx`insert into appointment_reschedule_requests
           (tenant_id, appointment_id, patient_id, requested_at, via)
           values (${Z.tenant}, ${Z.appt}, ${Z.patient}, ${R0}, 'sms_code')`,
      ),
    ).rejects.toThrow();
  });

  it("ONE OPEN REQUEST PER APPOINTMENT: a second open row is refused, and a HANDLED one does not block a later genuine request", async () => {
    await expect(
      sql`insert into appointment_reschedule_requests (tenant_id, appointment_id, patient_id, requested_at, via)
          values (${A.tenant}, ${A.apA}, ${A.pX}, ${R0}, 'sms_code')`,
    ).rejects.toThrow();

    await sql`update appointment_reschedule_requests
                 set handled_at = now(), handled_by = ${A.receptionA}
               where id = ${A.reqA}`;
    const second = randomUUID();
    await sql`insert into appointment_reschedule_requests (id, tenant_id, appointment_id, patient_id, requested_at, via)
              values (${second}, ${A.tenant}, ${A.apA}, ${A.pX}, ${R0}, 'sms_code')`;
    await sql`delete from appointment_reschedule_requests where id = ${second}`;
    await sql`update appointment_reschedule_requests set handled_at = null, handled_by = null where id = ${A.reqA}`;
  });

  it("handled_at and handled_by are refused apart", async () => {
    await expect(
      sql`update appointment_reschedule_requests set handled_at = now() where id = ${A.reqB}`,
    ).rejects.toThrow();
    await expect(
      sql`update appointment_reschedule_requests set handled_by = ${A.receptionA} where id = ${A.reqB}`,
    ).rejects.toThrow();
  });

  it("`via` is CHECK-pinned, so a second channel is a migration and not a typo", async () => {
    await expect(
      sql`insert into appointment_reschedule_requests (tenant_id, appointment_id, patient_id, requested_at, via)
          values (${A.tenant}, ${A.apB}, ${A.pX}, ${R0}, 'whatsapp')`,
    ).rejects.toThrow();
  });

  it("anon and patient hold NO table privilege, read with has_table_privilege rather than by attempting a call", async () => {
    const rows = await sql<{ role: string; sel: boolean; ins: boolean; upd: boolean; del: boolean }[]>`
      select r as role,
             has_table_privilege(r, 'public.appointment_reschedule_requests', 'SELECT') as sel,
             has_table_privilege(r, 'public.appointment_reschedule_requests', 'INSERT') as ins,
             has_table_privilege(r, 'public.appointment_reschedule_requests', 'UPDATE') as upd,
             has_table_privilege(r, 'public.appointment_reschedule_requests', 'DELETE') as del
        from unnest(array['anon','patient']) as r`;
    for (const row of rows) {
      expect(row.sel, `${row.role} SELECT`).toBe(false);
      expect(row.ins, `${row.role} INSERT`).toBe(false);
      expect(row.upd, `${row.role} UPDATE`).toBe(false);
      expect(row.del, `${row.role} DELETE`).toBe(false);
    }
  });

  it("NOBODY may DELETE — a handled request is a record, and the queue clears by UPDATE", async () => {
    const rows = await sql<{ del: boolean }[]>`
      select has_table_privilege('authenticated', 'public.appointment_reschedule_requests', 'DELETE') as del`;
    expect(rows[0]?.del).toBe(false);
  });
});

/**
 * 0087's gate - guest_clinical_intakes (INTAKE-01), the guest clinical intake.
 *
 * ==========================================================================
 * WHAT THIS FILE PROVES, AND AGAINST WHAT
 * ==========================================================================
 * The table holds GDPR Article 9 answers from a person who may never become a
 * patient. Every rule 0087 carries is about who can see a row and how long it
 * may exist, so the suite is three matrices and one job:
 *
 *   READ     who sees which intake, through RLS, for every staff role, the
 *            patient principal and another tenant. Compared as ID SETS, never
 *            counts: two different sets of the same size pass a count.
 *   WRITE    no application role but the guest route's (service_role, INSERT)
 *            may write, and nobody may UPDATE or DELETE. Refusals are asserted
 *            by SQLSTATE 42501, so a refusal for the wrong reason is red.
 *   SHAPE    the CHECKs, the tenant-match trigger, the UNIQUE per request and
 *            the ON DELETE CASCADE, each driven to its refusal.
 *   PURGE    purge_expired_guest_intakes(tenant): the four stamped conditions
 *            (SPEC section 8) held TOGETHER, and the one column it must never
 *            read (converted_appointment_id) proven unread from BOTH sides:
 *            an unconverted row that HAS an appointment id is still purged, and
 *            a converted row with NO appointment id is still kept.
 *
 * NEGATIVE CONTROLS. Every "sees nothing" case is paired with the owner
 * connection seeing the same ids, so an empty set is RLS and not a bad fixture;
 * and the matrix requires the sets to DIFFER between principals, so a policy
 * returning everything, or nothing, cannot satisfy it.
 *
 * SHARED DATABASE. Vitest runs files in parallel against one database, so every
 * query here is filtered to ids this file created, and the purge runs only on
 * tenants this file owns (it is one tenant per call by design).
 *
 * GATING: needs a live privileged DATABASE_URL with 0087 applied. Skipped
 * without one, exactly like every other suite in this directory. On this branch
 * CI's `supabase db reset` applies 0087 from supabase/migrations, so it runs.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

/** The READ matrix's tenant. */
const T = {
  tenant: randomUUID(),
  ownerU: randomUUID(),
  adminA: randomUUID(),
  adminUnassigned: randomUUID(),
  receptionA: randomUUID(),
  receptionB: randomUUID(),
  therapistT: randomUUID(), // treats patient P, through an appointment
  therapistO: randomUUID(), // treats nobody
  locA: randomUUID(),
  locB: randomUUID(),
  svc: randomUUID(),
  patientP: randomUUID(),
  patientQ: randomUUID(),
  apptP: randomUUID(),
  rA: randomUUID(), // locA, unconverted
  rB: randomUUID(), // locB, unconverted
  rConvP: randomUUID(), // locA, converted to P
  rConvQ: randomUUID(), // locB, converted to Q
  rShape: randomUUID(), // locA, no intake: the constraint cases' request
  rOk: randomUUID(), // locA, the accepted-at-the-limit case
  iA: randomUUID(),
  iB: randomUUID(),
  iConvP: randomUUID(),
  iConvQ: randomUUID(),
};

/** Another tenant, for isolation. */
const Z = {
  tenant: randomUUID(),
  loc: randomUUID(),
  svc: randomUUID(),
  r: randomUUID(),
  i: randomUUID(),
};

/** The PURGE's tenant, so its counts are this file's alone. */
const P = {
  tenant: randomUUID(),
  loc: randomUUID(),
  svc: randomUUID(),
  // purged
  rOld: randomUUID(),
  rJustOver: randomUUID(),
  rOldWithApptId: randomUUID(),
  // kept
  rOldConverted: randomUUID(),
  rJustUnder: randomUUID(),
  rFresh: randomUUID(),
};

const MATRIX_IDS = [T.iA, T.iB, T.iConvP, T.iConvQ, Z.i];
const CONSENT = "rgpd-intake-2026-09-11";

type IntakeRow = {
  id?: string;
  tenant_id: string;
  guest_booking_request_id: string;
  date_of_birth?: string;
  reason?: string;
  pacemaker?: string;
  pregnancy?: string;
  consent_ticked?: boolean;
  consent_version?: string;
};

function intake(row: IntakeRow): Record<string, unknown> {
  return {
    id: row.id ?? randomUUID(),
    date_of_birth: "1980-05-01",
    reason: "Dor lombar",
    pacemaker: "nao",
    pregnancy: "nao",
    consent_ticked: true,
    consent_at: new Date(),
    consent_version: CONSENT,
    ...row,
  };
}

async function request(
  p: Sql,
  id: string,
  tenant: string,
  loc: string,
  svc: string,
  convertedPatientId: string | null = null,
  convertedAppointmentId: string | null = null,
): Promise<void> {
  await p`insert into guest_booking_requests
            (id, tenant_id, full_name, phone, service_id, location_id,
             requested_starts_at, requested_ends_at, converted_patient_id, converted_appointment_id)
          values (${id}, ${tenant}, 'Convidado 0087', '912345678', ${svc}, ${loc},
                  '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z',
                  ${convertedPatientId}, ${convertedAppointmentId})`;
}

async function seed(p: Sql): Promise<void> {
  // ---- tenant T ----------------------------------------------------------
  await p`insert into tenants (id, name, slug) values (${T.tenant}, '0087 T', ${`m87-t-${T.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${T.ownerU},          ${T.tenant}, ${`o-${T.ownerU}@x.pt`},          'Owner'),
    (${T.adminA},          ${T.tenant}, ${`a-${T.adminA}@x.pt`},          'Admin A'),
    (${T.adminUnassigned}, ${T.tenant}, ${`au-${T.adminUnassigned}@x.pt`}, 'Admin unassigned'),
    (${T.receptionA},      ${T.tenant}, ${`ra-${T.receptionA}@x.pt`},     'Reception A'),
    (${T.receptionB},      ${T.tenant}, ${`rb-${T.receptionB}@x.pt`},     'Reception B'),
    (${T.therapistT},      ${T.tenant}, ${`t-${T.therapistT}@x.pt`},      'Therapist T'),
    (${T.therapistO},      ${T.tenant}, ${`to-${T.therapistO}@x.pt`},     'Therapist O')`;
  await p`insert into locations (id, tenant_id, name) values
    (${T.locA}, ${T.tenant}, 'Loc A'), (${T.locB}, ${T.tenant}, 'Loc B')`;
  await p`insert into services (id, tenant_id, name) values (${T.svc}, ${T.tenant}, 'Osteopatia')`;
  await p`insert into staff_locations (tenant_id, user_id, location_id) values
    (${T.tenant}, ${T.adminA},     ${T.locA}),
    (${T.tenant}, ${T.receptionA}, ${T.locA}),
    (${T.tenant}, ${T.receptionB}, ${T.locB})`;
  await p`insert into patients (id, tenant_id, full_name, created_by) values
    (${T.patientP}, ${T.tenant}, 'Paciente P', ${T.ownerU}),
    (${T.patientQ}, ${T.tenant}, 'Paciente Q', ${T.ownerU})`;
  // therapistT treats P: clinical_therapist_sees_patient(P) is true for them.
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${T.apptP}, ${T.tenant}, ${T.patientP}, ${T.therapistT}, ${T.locA},
                  '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z')`;
  await request(p, T.rA, T.tenant, T.locA, T.svc);
  await request(p, T.rB, T.tenant, T.locB, T.svc);
  await request(p, T.rConvP, T.tenant, T.locA, T.svc, T.patientP);
  await request(p, T.rConvQ, T.tenant, T.locB, T.svc, T.patientQ);
  await request(p, T.rShape, T.tenant, T.locA, T.svc);
  await request(p, T.rOk, T.tenant, T.locA, T.svc);
  for (const [id, r] of [
    [T.iA, T.rA],
    [T.iB, T.rB],
    [T.iConvP, T.rConvP],
    [T.iConvQ, T.rConvQ],
  ] as const) {
    await p`insert into guest_clinical_intakes ${p(intake({ id, tenant_id: T.tenant, guest_booking_request_id: r }))}`;
  }

  // ---- tenant Z ----------------------------------------------------------
  await p`insert into tenants (id, name, slug) values (${Z.tenant}, '0087 Z', ${`m87-z-${Z.tenant}`})`;
  await p`insert into locations (id, tenant_id, name) values (${Z.loc}, ${Z.tenant}, 'Z Loc')`;
  await p`insert into services (id, tenant_id, name) values (${Z.svc}, ${Z.tenant}, 'Z Svc')`;
  await request(p, Z.r, Z.tenant, Z.loc, Z.svc);
  await p`insert into guest_clinical_intakes ${p(intake({ id: Z.i, tenant_id: Z.tenant, guest_booking_request_id: Z.r }))}`;

  // ---- tenant P (the purge) ---------------------------------------------
  await p`insert into tenants (id, name, slug) values (${P.tenant}, '0087 P', ${`m87-p-${P.tenant}`})`;
  await p`insert into locations (id, tenant_id, name) values (${P.loc}, ${P.tenant}, 'P Loc')`;
  await p`insert into services (id, tenant_id, name) values (${P.svc}, ${P.tenant}, 'P Svc')`;
  await request(p, P.rOld, P.tenant, P.loc, P.svc);
  await request(p, P.rJustOver, P.tenant, P.loc, P.svc);
  // Unconverted, but converted_appointment_id is set. Nothing in the repository
  // writes that column; if the job predicated on it, this row would be KEPT.
  await request(p, P.rOldWithApptId, P.tenant, P.loc, P.svc, null, randomUUID());
  // Converted to a person, converted_appointment_id NULL: the treated patient
  // whose intake a predicate on the appointment id would delete.
  await request(p, P.rOldConverted, P.tenant, P.loc, P.svc, randomUUID(), null);
  await request(p, P.rJustUnder, P.tenant, P.loc, P.svc);
  await request(p, P.rFresh, P.tenant, P.loc, P.svc);
  const arrivals: [string, string][] = [
    [P.rOld, "8 days"],
    [P.rJustOver, "7 days 1 minute"],
    [P.rOldWithApptId, "8 days"],
    [P.rOldConverted, "8 days"],
    [P.rJustUnder, "6 days 23 hours"],
    [P.rFresh, "0 seconds"],
  ];
  for (const [r, age] of arrivals) {
    await p`insert into guest_clinical_intakes
              (tenant_id, guest_booking_request_id, date_of_birth, reason, pacemaker, pregnancy,
               consent_ticked, consent_at, consent_version, created_at)
            values (${P.tenant}, ${r}, '1975-01-01', 'Cervicalgia', 'sim', 'nao_perguntado',
                    true, now() - ${age}::interval, ${CONSENT}, now() - ${age}::interval)`;
  }
}

describe.skipIf(!live)("0087 guest_clinical_intakes", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    if (!sql) return;
    const tenants = [T.tenant, Z.tenant, P.tenant];
    // THE CHILDREN FIRST: guest_booking_requests.tenant_id has no ON DELETE
    // CASCADE, on purpose. Deleting the requests cascades the intakes.
    await sql`delete from guest_booking_requests where tenant_id in ${sql(tenants)}`;
    await sql`delete from appointments where tenant_id in ${sql(tenants)}`;
    await sql`delete from patients where tenant_id in ${sql(tenants)}`;
    await sql`delete from staff_locations where tenant_id in ${sql(tenants)}`;
    await sql`delete from services where tenant_id in ${sql(tenants)}`;
    await sql`delete from locations where tenant_id in ${sql(tenants)}`;
    await sql`delete from users where tenant_id in ${sql(tenants)}`;
    // audit_log.tenant_id cascades, so the purge's audit rows go with the tenant.
    await sql`delete from tenants where id in ${sql(tenants)}`;
    await sql.end();
  });

  // ------------------------------------------------------------------ READ

  async function staffSees(role: "owner" | "admin" | "reception" | "therapist", tenant: string, user: string) {
    const rows = await asRole(sql, "authenticated", claimsFor(tenant, role, user), async (tx) =>
      (await tx`select id::text as id from guest_clinical_intakes where id in ${tx(MATRIX_IDS)}`) as {
        id: string;
      }[],
    );
    return rows.map((r) => r.id).sort();
  }

  async function patientSees(tenant: string, patientId: string) {
    const rows = await asRole(sql, "patient", patientClaims(tenant, patientId), async (tx) =>
      (await tx`select id::text as id from guest_clinical_intakes where id in ${tx(MATRIX_IDS)}`) as {
        id: string;
      }[],
    );
    return rows.map((r) => r.id).sort();
  }

  const sorted = (...ids: string[]) => [...ids].sort();

  it("NEGATIVE CONTROL: the owning connection sees every seeded intake, so an absence below is RLS", async () => {
    const rows = await sql<{ id: string }[]>`
      select id::text as id from guest_clinical_intakes where id in ${sql(MATRIX_IDS)}`;
    expect(rows.map((r) => r.id).sort()).toEqual(sorted(...MATRIX_IDS));
  });

  it("owner sees every intake in the tenant, and none of another tenant's", async () => {
    expect(await staffSees("owner", T.tenant, T.ownerU)).toEqual(sorted(T.iA, T.iB, T.iConvP, T.iConvQ));
  });

  it("admin and reception see the intakes at THEIR location only", async () => {
    const adminA = await staffSees("admin", T.tenant, T.adminA);
    const receptionA = await staffSees("reception", T.tenant, T.receptionA);
    const receptionB = await staffSees("reception", T.tenant, T.receptionB);
    expect(adminA).toEqual(sorted(T.iA, T.iConvP));
    expect(receptionA).toEqual(sorted(T.iA, T.iConvP));
    expect(receptionB).toEqual(sorted(T.iB, T.iConvQ));
    // The sets differ, so "everything" or "nothing" cannot satisfy this case.
    expect(receptionA).not.toEqual(receptionB);
  });

  it("an admin with NO location assignment sees every intake in the tenant (0047's rule)", async () => {
    expect(await staffSees("admin", T.tenant, T.adminUnassigned)).toEqual(
      sorted(T.iA, T.iB, T.iConvP, T.iConvQ),
    );
  });

  it("a therapist sees an intake ONLY after conversion, and only of a patient they treat", async () => {
    // therapistT treats P: sees P's converted intake, not Q's, and no unconverted one.
    expect(await staffSees("therapist", T.tenant, T.therapistT)).toEqual([T.iConvP]);
    // therapistO treats nobody: sees nothing, converted or not.
    expect(await staffSees("therapist", T.tenant, T.therapistO)).toEqual([]);
  });

  it("another tenant's owner sees none of T's intakes, and sees its own", async () => {
    expect(await staffSees("owner", Z.tenant, randomUUID())).toEqual([Z.i]);
  });

  it("a patient sees their OWN converted intake and nothing else", async () => {
    expect(await patientSees(T.tenant, T.patientP)).toEqual([T.iConvP]);
    expect(await patientSees(T.tenant, T.patientQ)).toEqual([T.iConvQ]);
    // The right patient id under the wrong tenant claim sees nothing.
    expect(await patientSees(Z.tenant, T.patientP)).toEqual([]);
  });

  it("patient_guest_request_ids() answers the patient's own converted requests only", async () => {
    const ids = await asRole(sql, "patient", patientClaims(T.tenant, T.patientP), async (tx) => {
      const [row] = await tx<{ ids: string[] }[]>`select public.patient_guest_request_ids()::text[] as ids`;
      return row!.ids;
    });
    expect(ids).toEqual([T.rConvP]);
  });

  // ----------------------------------------------------------------- WRITE

  it("authenticated may not INSERT, UPDATE or DELETE (42501, by privilege)", async () => {
    const claims = claimsFor(T.tenant, "owner", T.ownerU);
    await expect(
      asRole(sql, "authenticated", claims, (tx) =>
        tx`insert into guest_clinical_intakes ${tx(intake({ tenant_id: T.tenant, guest_booking_request_id: T.rShape }))}`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asRole(sql, "authenticated", claims, (tx) =>
        tx`update guest_clinical_intakes set created_at = now() where id = ${T.iA}`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asRole(sql, "authenticated", claims, (tx) => tx`delete from guest_clinical_intakes where id = ${T.iA}`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("the patient role may not INSERT (42501)", async () => {
    await expect(
      asRole(sql, "patient", patientClaims(T.tenant, T.patientP), (tx) =>
        tx`insert into guest_clinical_intakes ${tx(intake({ tenant_id: T.tenant, guest_booking_request_id: T.rShape }))}`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("service_role (the guest route) may INSERT, and may not UPDATE or DELETE", async () => {
    // POSITIVE ARM first: without it, the refusals below would pass on a table
    // that refused the guest route too, which is a broken booking flow.
    const inserted = await asRole(sql, "service_role", null, async (tx) => {
      const rows = await tx`insert into guest_clinical_intakes
        ${tx(intake({ tenant_id: T.tenant, guest_booking_request_id: T.rShape }))} returning id`;
      return rows.length;
    });
    expect(inserted).toBe(1);
    await expect(
      asRole(sql, "service_role", null, (tx) =>
        tx`update guest_clinical_intakes set reason = 'x' where id = ${T.iA}`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asRole(sql, "service_role", null, (tx) => tx`delete from guest_clinical_intakes where id = ${T.iA}`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("the privilege END STATE is exactly: readers SELECT, writer SELECT+INSERT, anon nothing", async () => {
    const rows = await sql<{ role: string; privs: string }[]>`
      select r as role,
             coalesce((select string_agg(p, '+' order by p)
                         from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p
                        where has_table_privilege(r, 'public.guest_clinical_intakes', p)), '-') as privs
        from unnest(array['anon','authenticated','patient','service_role']) as r
       order by r`;
    expect(Object.fromEntries(rows.map((r) => [r.role, r.privs]))).toEqual({
      anon: "-",
      authenticated: "SELECT",
      patient: "SELECT",
      service_role: "INSERT+SELECT",
    });
  });

  // ----------------------------------------------------------------- SHAPE

  it("intake_answer is exactly sim, nao, nao_perguntado, in that order", async () => {
    const [row] = await sql<{ labels: string }[]>`
      select string_agg(enumlabel, ',' order by enumsortorder) as labels
        from pg_enum where enumtypid = 'public.intake_answer'::regtype`;
    expect(row?.labels).toBe("sim,nao,nao_perguntado");
  });

  it("there is no updated_at: the retention clock runs on arrival and nothing can move it", async () => {
    const rows = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'guest_clinical_intakes' and column_name = 'updated_at'`;
    expect(rows).toEqual([]);
  });

  const refusals: [string, Partial<IntakeRow>, string][] = [
    ["an unticked consent", { consent_ticked: false }, "23514"],
    ["a blank reason", { reason: "   " }, "23514"],
    ["a reason over 2000 characters", { reason: "a".repeat(2001) }, "23514"],
    ["a blank consent version", { consent_version: " " }, "23514"],
    ["a date of birth before 1900", { date_of_birth: "1899-12-31" }, "23514"],
    ["a fourth answer state", { pacemaker: "talvez" }, "22P02"],
  ];
  for (const [what, override, code] of refusals) {
    it(`refuses ${what} (${code})`, async () => {
      await expect(
        sql`insert into guest_clinical_intakes ${sql(
          intake({ tenant_id: T.tenant, guest_booking_request_id: T.rShape, ...override }),
        )}`,
      ).rejects.toMatchObject({ code });
    });
  }

  it("accepts the limits: a 2000-character reason and a never-asked answer", async () => {
    // The positive arm of the refusals above: without it, a CHECK that refused
    // everything would pass all six of them.
    const id = randomUUID();
    await sql`insert into guest_clinical_intakes ${sql(
      intake({
        id,
        tenant_id: T.tenant,
        guest_booking_request_id: T.rOk,
        reason: "a".repeat(2000),
        pregnancy: "nao_perguntado",
      }),
    )}`;
    const rows = await sql`select 1 from guest_clinical_intakes where id = ${id}`;
    expect(rows).toHaveLength(1);
  });

  it("refuses an intake whose tenant is not its request's (the trigger, 23514)", async () => {
    await expect(
      sql`insert into guest_clinical_intakes ${sql(intake({ tenant_id: Z.tenant, guest_booking_request_id: T.rA }))}`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a second intake for the same request (23505)", async () => {
    await expect(
      sql`insert into guest_clinical_intakes ${sql(intake({ tenant_id: T.tenant, guest_booking_request_id: T.rA }))}`,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("deleting a request deletes its intake (ON DELETE CASCADE), inside a rolled-back transaction", async () => {
    const left = await sql
      .begin(async (tx) => {
        await tx`delete from guest_booking_requests where id = ${T.rB}`;
        const rows = await tx`select 1 from guest_clinical_intakes where id = ${T.iB}`;
        throw Object.assign(new Error("rollback"), { rows: rows.length });
      })
      .catch((e: { rows?: number }) => e.rows);
    expect(left).toBe(0);
    // And the rollback held: the shared fixture is intact.
    expect(await sql`select 1 from guest_clinical_intakes where id = ${T.iB}`).toHaveLength(1);
  });

  // ----------------------------------------------------------------- PURGE

  it("purge(NULL) is refused 22004: the job never runs globally", async () => {
    await expect(sql`select public.purge_expired_guest_intakes(null)`).rejects.toMatchObject({
      code: "22004",
    });
  });

  it("purge deletes the unconverted arrivals older than 7 days, and only those", async () => {
    const intakeOf = async (r: string) =>
      (await sql`select 1 from guest_clinical_intakes where guest_booking_request_id = ${r}`).length;
    // Z's intake is old too, so a job that ignored its tenant argument would take it.
    await sql`update guest_clinical_intakes set created_at = now() - interval '9 days' where id = ${Z.i}`;

    const [row] = await sql<{ n: number }[]>`select public.purge_expired_guest_intakes(${P.tenant}) as n`;
    expect(row?.n).toBe(3);

    // Purged: 8 days, 7 days + 1 minute, and the one with an appointment id.
    expect(await intakeOf(P.rOld)).toBe(0);
    expect(await intakeOf(P.rJustOver)).toBe(0);
    expect(await intakeOf(P.rOldWithApptId)).toBe(0);
    // Kept: converted (clock ended), just under 7 days, fresh, and another tenant's.
    expect(await intakeOf(P.rOldConverted)).toBe(1);
    expect(await intakeOf(P.rJustUnder)).toBe(1);
    expect(await intakeOf(P.rFresh)).toBe(1);
    expect(await intakeOf(Z.r)).toBe(1);

    // The ANSWERS go, never the request.
    const requests = await sql`select 1 from guest_booking_requests where tenant_id = ${P.tenant}`;
    expect(requests).toHaveLength(6);
  });

  it("purge writes ONE PII-free audit row per deletion, and none on a second run", async () => {
    const audit = await sql<
      { entity_id: string; entity_type: string; actor: string | null; keys: string[]; reason: string; arrived_ok: boolean }[]
    >`
      select a.entity_id::text as entity_id, a.entity_type, a.actor_user_id::text as actor,
             (select array_agg(k order by k) from jsonb_object_keys(a.metadata) as k) as keys,
             a.metadata ->> 'reason' as reason,
             (a.metadata ->> 'intake_arrived_at')::timestamptz < now() - interval '7 days' as arrived_ok
        from audit_log a
       where a.tenant_id = ${P.tenant} and a.action = 'guest_intake.purged'
       order by a.entity_id`;
    expect(audit.map((a) => a.entity_id)).toEqual(sorted(P.rOld, P.rJustOver, P.rOldWithApptId));
    for (const a of audit) {
      expect(a.entity_type).toBe("guest_booking_request");
      expect(a.actor).toBeNull();
      expect(a.keys).toEqual(["intake_arrived_at", "reason"]);
      expect(a.reason).toBe("retention_7d_unconverted");
      expect(a.arrived_ok).toBe(true);
    }

    const [again] = await sql<{ n: number }[]>`select public.purge_expired_guest_intakes(${P.tenant}) as n`;
    expect(again?.n).toBe(0);
    const after = await sql`select 1 from audit_log where tenant_id = ${P.tenant} and action = 'guest_intake.purged'`;
    expect(after).toHaveLength(3);
  });

  it("the purge and the patient helper are SECURITY DEFINER, owned by postgres, path pinned", async () => {
    const rows = await sql<{ name: string; secdef: boolean; owner: string; config: string | null }[]>`
      select p.proname as name, p.prosecdef as secdef, pg_get_userbyid(p.proowner) as owner,
             array_to_string(p.proconfig, ';') as config
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('purge_expired_guest_intakes', 'patient_guest_request_ids')
       order by p.proname`;
    expect(rows).toEqual([
      { name: "patient_guest_request_ids", secdef: true, owner: "postgres", config: "search_path=public" },
      { name: "purge_expired_guest_intakes", secdef: true, owner: "postgres", config: "search_path=public" },
    ]);
  });

  it("NO application role can execute the purge; only patient can execute the helper", async () => {
    // Read from the ACL, never by calling it: a role calling a SECURITY DEFINER
    // function it lacks EXECUTE on has crashed Supabase's backend before.
    const rows = await sql<{ name: string; role: string; allowed: boolean }[]>`
      select p.proname as name, r as role, has_function_privilege(r, p.oid, 'EXECUTE') as allowed
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
             unnest(array['anon','authenticated','patient','service_role']) as r
       where n.nspname = 'public' and p.proname in ('purge_expired_guest_intakes', 'patient_guest_request_ids')`;
    const allowed = rows.filter((r) => r.allowed).map((r) => `${r.name}:${r.role}`);
    expect(allowed).toEqual(["patient_guest_request_ids:patient"]);
  });

  it("the deployed purge never reads converted_appointment_id, and no 0087 body names a contraindication", async () => {
    const rows = await sql<{ name: string; def: string }[]>`
      select p.proname as name, pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('purge_expired_guest_intakes', 'patient_guest_request_ids',
                           'guest_clinical_intake_tenant_matches')`;
    expect(rows).toHaveLength(3);
    const purge = rows.find((r) => r.name === "purge_expired_guest_intakes");
    // NEGATIVE CONTROL for the text match: the column it must not read is one it
    // DOES read the sibling of, so a match that found nothing at all is caught.
    expect(purge?.def).toContain("converted_patient_id");
    expect(purge?.def).not.toContain("converted_appointment_id");
    for (const r of rows) expect(r.def.toLowerCase()).not.toContain("contraindication");
  });

  it("the migration file never writes patients (comments and COMMENT ON text stripped)", () => {
    const file = readFileSync(join(__dirname, "..", "migrations", "0087_guest_clinical_intake.sql"), "utf8");
    // The COMMENT ON TABLE text SAYS "Never feeds patients.contraindication_*",
    // which is documentation, not a statement against the table; strip it too.
    const live0087 = file
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/COMMENT ON [A-Z]+ [a-z_.]+ IS\s+'(?:[^']|'')*';/g, " ");
    // NEGATIVE CONTROL: the stripping left the statements in place.
    expect(live0087).toContain("CREATE TABLE public.guest_clinical_intakes");
    expect(live0087).toContain("CREATE OR REPLACE FUNCTION public.purge_expired_guest_intakes");
    expect(file).toMatch(/patients\.contraindication_/);
    expect(live0087).not.toMatch(/\bpatients\b/);
    expect(live0087).not.toMatch(/contraindication/i);
  });
});

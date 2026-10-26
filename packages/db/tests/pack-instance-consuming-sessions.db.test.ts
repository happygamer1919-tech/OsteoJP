/**
 * pack-instance-consuming-sessions.db.test.ts: the pack read function (0108),
 * against a real Postgres.
 *
 * `public.pack_instance_consuming_sessions(uuid)` returns, for ONE pack
 * instance, the id and starts_at of every linked appointment that is not
 * cancelled, ordered by starts_at then id, to a caller with a staff role in the
 * instance's tenant who may already see the instance's patient (the terms of
 * `patients_select`, as 0096 left it). Everyone else gets an empty set.
 *
 * THE FIXTURE, one tenant, two clinics (A and B):
 *
 *   patient P, created by nobody, with appointments at A and at B:
 *     pack instance PK1 (10 sessions, 3 consumed before the link existed):
 *       a1  A  therapistA         day 1   scheduled
 *       a2  B  therapistB         day 2   completed   } the same instant,
 *       a5  A  therapistNoClinic  day 2   confirmed   } ordered by id
 *       a3  A  therapistA         day 3   cancelled   (not consuming)
 *       a4  B  therapistB         day 4   no_show
 *     pack instance PK2:  a6  A  therapistA  day 5  scheduled
 *     not linked to any pack:  a7  B  therapistB  day 6  scheduled
 *   patient Q, created by receptionA, primary clinic B, seen only at B:
 *     pack instance QK:   q1  B  therapistB  day 7  scheduled
 *                         q2  B  therapistB  day 8  completed
 *     not linked to any pack:  q3  B  adminA (as practitioner)  day 9
 *
 *   and, written as the owner connection, two rows no application path
 *   writes, so the tenant terms are measured: an appointment of ANOTHER
 *   tenant linked to PK1 (x1), and an instance PKX of this tenant whose
 *   patient belongs to the other tenant, with one linked visit (x2).
 *
 *   who                          clinic rows   sees P  sees Q
 *   owner                        none          yes     yes
 *   adminAll                     none          yes     yes
 *   adminA (practitioner of q3)  A             yes     no
 *   receptionA (created Q)       A             yes     yes
 *   receptionB                   B             yes     yes
 *   therapistA (treats P)        A             yes     no
 *   therapistB (treats P and Q)  B             yes     yes
 *   therapistNoClinic (treats P) none          yes     no
 *   careTeam (P's care team)     A             yes     no
 *   therapistA2 (no tie)         A             no      no
 *
 * Every staff answer is asserted twice: against that table, and against the
 * caller's own read of `patients` under `patients_select` in the same
 * transaction, so the function's patient term is held to the policy it states.
 *
 * Every assertion runs as an ASSIGNED principal, `authenticated` with the
 * tenant, the role and the user id in the claims, as the application's
 * withTenantContext sets them (`asRole`). Seeding and cleanup use the owner
 * connection and nothing else.
 *
 * THE PORTAL'S `patient` ROLE, anon, service_role and PUBLIC are asserted in
 * the catalogue with has_function_privilege and never by a call: on the local
 * Supabase image a role calling a function it holds no EXECUTE on can end the
 * server process instead of raising 42501. A patient's JWT on `authenticated`
 * IS called, and gets nothing.
 *
 * GATING: needs a live privileged DATABASE_URL. Skipped without one, like every
 * suite in this directory. The migration is in packages/db/migrations, so on a
 * live database without the function this file THROWS rather than skipping.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packLinkedCountSql } from "../src/pack-balance";
import { type AppRole, asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

const FN = "public.pack_instance_consuming_sessions(uuid)";

/** The migration is promoted, so a live database without the function is not one to measure. */
async function assertApplied(): Promise<void> {
  if (!live) return;
  const probe = connect();
  try {
    const rows = await probe`select to_regprocedure(${FN}) is not null as present`;
    if (!rows[0]?.present) {
      throw new Error(
        `0108 IS IN packages/db/migrations BUT THIS DATABASE HAS NO ${FN}. ` +
          "Build the database from the migrations. Nothing here was measured.",
      );
    }
  } finally {
    await probe.end({ timeout: 5 });
  }
}

await assertApplied();

const d = live ? describe : describe.skip;

const F = {
  tenant: randomUUID(),
  otherTenant: randomUUID(),
  a: randomUUID(),
  b: randomUUID(),
  owner: randomUUID(),
  adminAll: randomUUID(),
  adminA: randomUUID(),
  receptionA: randomUUID(),
  receptionB: randomUUID(),
  therapistA: randomUUID(),
  therapistB: randomUUID(),
  therapistNoClinic: randomUUID(),
  careTeam: randomUUID(),
  therapistA2: randomUUID(),
  p: randomUUID(),
  q: randomUUID(),
  service: randomUUID(),
  pack: randomUUID(),
  pk1: randomUUID(),
  pk2: randomUUID(),
  qk: randomUUID(),
  a1: randomUUID(),
  a2: randomUUID(),
  a3: randomUUID(),
  a4: randomUUID(),
  a5: randomUUID(),
  a6: randomUUID(),
  a7: randomUUID(),
  q1: randomUUID(),
  q2: randomUUID(),
  q3: randomUUID(),
  /** The other tenant's rows. */
  uLocation: randomUUID(),
  uUser: randomUUID(),
  uPatient: randomUUID(),
  uService: randomUUID(),
  x1: randomUUID(),
  pkx: randomUUID(),
  x2: randomUUID(),
};

const day = (n: number) => `2027-05-0${n}T10:00:00.000Z`;
const dayEnd = (n: number) => `2027-05-0${n}T11:00:00.000Z`;

type Session = { appointment_id: string; starts_at: string };

/** What each instance must return to a caller who may see its patient, in order. */
function expected(ids: { id: string; at: string }[]): Session[] {
  return [...ids]
    .sort((x, y) => (x.at === y.at ? (x.id < y.id ? -1 : 1) : x.at < y.at ? -1 : 1))
    .map((r) => ({ appointment_id: r.id, starts_at: r.at }));
}

const PK1_ALL = expected([
  { id: F.a1, at: day(1) },
  { id: F.a2, at: day(2) },
  { id: F.a5, at: day(2) },
  { id: F.a4, at: day(4) },
]);
const PK2_ALL = expected([{ id: F.a6, at: day(5) }]);
const QK_ALL = expected([
  { id: F.q1, at: day(7) },
  { id: F.q2, at: day(8) },
]);

type Principal = { name: string; role: AppRole; user: string; seesP: boolean; seesQ: boolean };

const STAFF: Principal[] = [
  { name: "owner", role: "owner", user: F.owner, seesP: true, seesQ: true },
  { name: "admin with no clinic row", role: "admin", user: F.adminAll, seesP: true, seesQ: true },
  { name: "admin limited to clinic A", role: "admin", user: F.adminA, seesP: true, seesQ: false },
  { name: "reception at clinic A, who created Q", role: "reception", user: F.receptionA, seesP: true, seesQ: true },
  { name: "reception at clinic B", role: "reception", user: F.receptionB, seesP: true, seesQ: true },
  { name: "therapist at clinic A who treats P", role: "therapist", user: F.therapistA, seesP: true, seesQ: false },
  { name: "therapist at clinic B who treats P and Q", role: "therapist", user: F.therapistB, seesP: true, seesQ: true },
  { name: "therapist with no clinic row who treats P", role: "therapist", user: F.therapistNoClinic, seesP: true, seesQ: false },
  { name: "therapist on P's care team at clinic A", role: "therapist", user: F.careTeam, seesP: true, seesQ: false },
  { name: "therapist at clinic A with no tie to P or Q", role: "therapist", user: F.therapistA2, seesP: false, seesQ: false },
];

d("0108: the consuming sessions of one pack instance", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values (${F.tenant}, 'Pack Read Co', ${"pr-" + F.tenant.slice(0, 8)})`;
    await sql`insert into locations (id, tenant_id, name) values (${F.a}, ${F.tenant}, 'Clinica A (teste)'), (${F.b}, ${F.tenant}, 'Clinica B (teste)')`;

    const person = (id: string, name: string) =>
      sql`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
          values (${id}, ${F.tenant}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, true)`;
    await person(F.owner, "Dono Teste");
    await person(F.adminAll, "Admin Todas");
    await person(F.adminA, "Admin A");
    await person(F.receptionA, "Rececao A");
    await person(F.receptionB, "Rececao B");
    await person(F.therapistA, "Terapeuta A");
    await person(F.therapistB, "Terapeuta B");
    await person(F.therapistNoClinic, "Terapeuta Sem Clinica");
    await person(F.careTeam, "Terapeuta Equipa");
    await person(F.therapistA2, "Terapeuta A Dois");

    await sql`insert into staff_locations (tenant_id, user_id, location_id) values
      (${F.tenant}, ${F.adminA}, ${F.a}),
      (${F.tenant}, ${F.receptionA}, ${F.a}),
      (${F.tenant}, ${F.receptionB}, ${F.b}),
      (${F.tenant}, ${F.therapistA}, ${F.a}),
      (${F.tenant}, ${F.therapistB}, ${F.b}),
      (${F.tenant}, ${F.careTeam}, ${F.a}),
      (${F.tenant}, ${F.therapistA2}, ${F.a})`;

    await sql`insert into patients (id, tenant_id, full_name) values (${F.p}, ${F.tenant}, 'Paciente Pacote P')`;
    await sql`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
              values (${F.q}, ${F.tenant}, 'Paciente Pacote Q', ${F.b}, ${F.receptionA})`;
    await sql`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by)
              values (${F.tenant}, ${F.p}, ${F.careTeam}, ${F.owner})`;

    await sql`insert into services (id, tenant_id, name) values (${F.service}, ${F.tenant}, 'Osteopatia (teste)')`;
    await sql`insert into service_packs (id, tenant_id, base_service_id, name, session_count, price_cents)
              values (${F.pack}, ${F.tenant}, ${F.service}, 'Pacote 10 (teste)', 10, 50000)`;
    const instance = (id: string, patient: string, legacy: number) =>
      sql`insert into patient_pack_instances (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining, legacy_consumed)
          values (${id}, ${F.tenant}, ${patient}, ${F.pack}, 10, ${10 - legacy}, ${legacy})`;
    await instance(F.pk1, F.p, 3);
    await instance(F.pk2, F.p, 0);
    await instance(F.qk, F.q, 0);

    const appt = (
      id: string,
      patient: string,
      location: string,
      practitioner: string,
      n: number,
      status: string,
      pack: string | null,
    ) =>
      sql`insert into appointments
            (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
             starts_at, ends_at, status, pack_instance_id, created_by)
          values (${id}, ${F.tenant}, ${patient}, ${practitioner}, ${location}, ${F.service},
                  ${day(n)}, ${dayEnd(n)}, ${status}, ${pack}, ${F.owner})`;
    await appt(F.a1, F.p, F.a, F.therapistA, 1, "scheduled", F.pk1);
    await appt(F.a2, F.p, F.b, F.therapistB, 2, "completed", F.pk1);
    await appt(F.a5, F.p, F.a, F.therapistNoClinic, 2, "confirmed", F.pk1);
    await appt(F.a3, F.p, F.a, F.therapistA, 3, "cancelled", F.pk1);
    await appt(F.a4, F.p, F.b, F.therapistB, 4, "no_show", F.pk1);
    await appt(F.a6, F.p, F.a, F.therapistA, 5, "scheduled", F.pk2);
    await appt(F.a7, F.p, F.b, F.therapistB, 6, "scheduled", null);
    await appt(F.q1, F.q, F.b, F.therapistB, 7, "scheduled", F.qk);
    await appt(F.q2, F.q, F.b, F.therapistB, 8, "completed", F.qk);
    // The clinic-A admin as the practitioner of a visit of Q at B: they treat Q,
    // and still may not see Q, whose clinic is not theirs.
    await appt(F.q3, F.q, F.b, F.adminA, 9, "scheduled", null);

    // The other tenant, and the two cross-tenant rows.
    await sql`insert into tenants (id, name, slug) values (${F.otherTenant}, 'Pack Read Other', ${"pr-" + F.otherTenant.slice(0, 8)})`;
    await sql`insert into locations (id, tenant_id, name) values (${F.uLocation}, ${F.otherTenant}, 'Outra (teste)')`;
    await sql`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
              values (${F.uUser}, ${F.otherTenant}, ${"u-" + F.uUser.slice(0, 8) + "@t.test"}, 'Terapeuta Outra', true, true)`;
    await sql`insert into patients (id, tenant_id, full_name) values (${F.uPatient}, ${F.otherTenant}, 'Paciente Outra')`;
    await sql`insert into services (id, tenant_id, name) values (${F.uService}, ${F.otherTenant}, 'Osteopatia (outra)')`;
    await sql`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
                 starts_at, ends_at, status, pack_instance_id, created_by)
              values (${F.x1}, ${F.otherTenant}, ${F.uPatient}, ${F.uUser}, ${F.uLocation}, ${F.uService},
                      ${day(3)}, ${dayEnd(3)}, 'scheduled', ${F.pk1}, ${F.uUser})`;
    await sql`insert into patient_pack_instances (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining, legacy_consumed)
              values (${F.pkx}, ${F.tenant}, ${F.uPatient}, ${F.pack}, 10, 10, 0)`;
    await appt(F.x2, F.p, F.a, F.therapistA, 5, "completed", F.pkx);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from appointments where tenant_id in (${F.tenant}, ${F.otherTenant})`;
    await sql`delete from patient_pack_instances where tenant_id = ${F.tenant}`;
    await sql`delete from service_packs where tenant_id = ${F.tenant}`;
    await sql`delete from services where tenant_id = ${F.tenant}`;
    await sql`delete from patient_care_team where tenant_id = ${F.tenant}`;
    await sql`delete from patients where tenant_id in (${F.tenant}, ${F.otherTenant})`;
    await sql`delete from services where tenant_id = ${F.otherTenant}`;
    await sql`delete from staff_locations where tenant_id = ${F.tenant}`;
    await sql`delete from users where tenant_id in (${F.tenant}, ${F.otherTenant})`;
    await sql`delete from locations where tenant_id in (${F.tenant}, ${F.otherTenant})`;
    await sql`delete from tenants where id in (${F.tenant}, ${F.otherTenant})`;
    await sql.end();
  });

  /** The function's answer for one set of claims, as the rows it returned, in order. */
  async function sessions(claims: string | null, instance: string | null): Promise<Session[]> {
    return asRole(sql, "authenticated", claims, async (tx) => {
      const rows = await tx`select * from public.pack_instance_consuming_sessions(${instance}::uuid)`;
      return rows.map((r) => ({
        appointment_id: r.appointment_id as string,
        starts_at: (r.starts_at as Date).toISOString(),
      }));
    });
  }

  /** The caller's own read of one patient row, under patients_select. */
  async function seesPatient(claims: string, patient: string): Promise<boolean> {
    return asRole(sql, "authenticated", claims, async (tx) => {
      const rows = await tx`select id from patients where id = ${patient}`;
      return rows.length === 1;
    });
  }

  /* ---------------------------------------------- every staff principal */

  for (const who of STAFF) {
    const claims = claimsFor(F.tenant, who.role, who.user);

    it(`${who.name}: ${who.seesP ? "every consuming session of P's pack" : "nothing for P's pack"}`, async () => {
      expect(await sessions(claims, F.pk1)).toEqual(who.seesP ? PK1_ALL : []);
      expect(await sessions(claims, F.pk2)).toEqual(who.seesP ? PK2_ALL : []);
    });

    it(`${who.name}: ${who.seesQ ? "every consuming session of Q's pack" : "nothing for Q's pack"}`, async () => {
      expect(await sessions(claims, F.qk)).toEqual(who.seesQ ? QK_ALL : []);
    });

    it(`${who.name}: rows exactly when patients_select shows the patient`, async () => {
      // The fixture table above, held to the policy the function states.
      expect(await seesPatient(claims, F.p)).toBe(who.seesP);
      expect(await seesPatient(claims, F.q)).toBe(who.seesQ);
      expect((await sessions(claims, F.pk1)).length > 0).toBe(await seesPatient(claims, F.p));
      expect((await sessions(claims, F.qk)).length > 0).toBe(await seesPatient(claims, F.q));
    });
  }

  /* ------------------------------------------------ the premise, stated */

  it("PREMISE: the sessions span two clinics and three practitioners", async () => {
    const rows = await sql`select count(distinct location_id)::int as clinics, count(distinct practitioner_id)::int as practitioners
                             from appointments where pack_instance_id = ${F.pk1} and tenant_id = ${F.tenant} and status <> 'cancelled'`;
    expect(rows[0]).toEqual({ clinics: 2, practitioners: 3 });
  });

  it("PREMISE: the clinic-A admin and the clinic-A therapist read only some of P's pack visits themselves", async () => {
    // So the full answer above is the function's, not the caller's own read.
    for (const [role, user] of [
      ["admin", F.adminA],
      ["therapist", F.therapistA],
    ] as const) {
      const own = await asRole(sql, "authenticated", claimsFor(F.tenant, role, user), async (tx) =>
        tx`select id from appointments where pack_instance_id = ${F.pk1} and status <> 'cancelled'`,
      );
      expect(own.length).toBeGreaterThan(0);
      expect(own.length).toBeLessThan(PK1_ALL.length);
    }
  });

  /* ------------------------------------------- what is and is not a row */

  it("a cancelled visit, a visit of another instance and an unlinked visit are not rows", async () => {
    const ids = (await sessions(claimsFor(F.tenant, "owner", F.owner), F.pk1)).map((r) => r.appointment_id);
    expect(ids).not.toContain(F.a3);
    expect(ids).not.toContain(F.a6);
    expect(ids).not.toContain(F.a7);
  });

  it("the order is starts_at, then id, and two calls agree", async () => {
    const claims = claimsFor(F.tenant, "owner", F.owner);
    const first = await sessions(claims, F.pk1);
    const second = await sessions(claims, F.pk1);
    expect(first).toEqual(PK1_ALL);
    expect(second).toEqual(first);
    // The two visits at the same instant are ordered by id.
    const tied = first.filter((r) => r.starts_at === day(2)).map((r) => r.appointment_id);
    expect(tied).toEqual([F.a2, F.a5].sort());
  });

  it("the row count is the balance's linked term (packLinkedCountSql), read as the owner reads it", async () => {
    // The balance counts inside the caller's own transaction (runScoped), so
    // the owner's count of their tenant's visits is the one to agree with.
    const claims = claimsFor(F.tenant, "owner", F.owner);
    for (const instance of [F.pk1, F.pk2, F.qk]) {
      const n = await asRole(sql, "authenticated", claims, async (tx) => {
        const [row] = await tx.unsafe(`select ${packLinkedCountSql("$1::uuid")} as n`, [instance]);
        return row!.n as number;
      });
      expect(n).toBeGreaterThan(0);
      expect((await sessions(claims, instance)).length).toBe(n);
    }
  });

  it("a visit of another tenant linked to the instance is not a row", async () => {
    const ids = (await sessions(claimsFor(F.tenant, "owner", F.owner), F.pk1)).map((r) => r.appointment_id);
    expect(ids).not.toContain(F.x1);
    // PREMISE: the row is there, and linked.
    const [row] = await sql`select count(*)::int as n from appointments where id = ${F.x1} and pack_instance_id = ${F.pk1}`;
    expect(row!.n).toBe(1);
  });

  it("an instance whose patient belongs to another tenant has no rows, even for the owner", async () => {
    expect(await sessions(claimsFor(F.tenant, "owner", F.owner), F.pkx)).toEqual([]);
    expect(await sessions(claimsFor(F.otherTenant, "owner", F.uUser), F.pkx)).toEqual([]);
  });

  it("returns exactly two columns, appointment_id and starts_at", async () => {
    const [row] = await sql`select pg_get_function_result(to_regprocedure(${FN})) as result`;
    expect(row!.result).toBe("TABLE(appointment_id uuid, starts_at timestamp with time zone)");
    const claims = claimsFor(F.tenant, "owner", F.owner);
    const keys = await asRole(sql, "authenticated", claims, async (tx) => {
      const rows = await tx`select * from public.pack_instance_consuming_sessions(${F.pk1}::uuid)`;
      return Object.keys(rows[0] ?? {}).sort();
    });
    expect(keys).toEqual(["appointment_id", "starts_at"]);
  });

  /* ------------------------------------------------------- refusals */

  it("a patient's JWT on authenticated gets nothing, for their own pack too", async () => {
    expect(await sessions(patientClaims(F.tenant, F.p), F.pk1)).toEqual([]);
    expect(await sessions(patientClaims(F.tenant, F.q), F.qk)).toEqual([]);
  });

  it("the owner of another tenant gets nothing", async () => {
    expect(await sessions(claimsFor(F.otherTenant, "owner", F.owner), F.pk1)).toEqual([]);
  });

  it("no claims, a role that is not a staff role, an unknown id and a null id get nothing", async () => {
    expect(await sessions(null, F.pk1)).toEqual([]);
    // Q's creator under a role the matrix does not name: patients_select's
    // created_by term alone does not reach the rows; the staff role is required.
    const notStaff = JSON.stringify({ tenant_id: F.tenant, user_role: "patient", sub: F.receptionA });
    expect(await sessions(notStaff, F.qk)).toEqual([]);
    expect(await sessions(claimsFor(F.tenant, "owner", F.owner), randomUUID())).toEqual([]);
    expect(await sessions(claimsFor(F.tenant, "owner", F.owner), null)).toEqual([]);
  });

  /* ------------------------------------------------------- catalogue */

  it("EXECUTE: authenticated only; not anon, not patient, not service_role, not PUBLIC", async () => {
    const [row] = await sql`select
        has_function_privilege('authenticated', to_regprocedure(${FN}), 'EXECUTE') as staff,
        has_function_privilege('anon',          to_regprocedure(${FN}), 'EXECUTE') as anon,
        has_function_privilege('patient',       to_regprocedure(${FN}), 'EXECUTE') as patient,
        has_function_privilege('service_role',  to_regprocedure(${FN}), 'EXECUTE') as service,
        (select count(*)::int from pg_proc p cross join lateral aclexplode(p.proacl) a
          where p.oid = to_regprocedure(${FN}) and a.grantee = 0) as public_items,
        (select p.proacl is null from pg_proc p where p.oid = to_regprocedure(${FN})) as default_acl`;
    // authenticated true is the control: the falses are not a function nobody can call.
    expect(row).toEqual({
      staff: true,
      anon: false,
      patient: false,
      service: false,
      public_items: 0,
      default_acl: false,
    });
  });

  it("SECURITY DEFINER, STABLE, plpgsql, search_path pinned, owned by postgres", async () => {
    const [row] = await sql`select p.prosecdef, p.provolatile::text as volatility, l.lanname,
                                   coalesce(array_to_string(p.proconfig, ','), '') as config,
                                   pg_get_userbyid(p.proowner) as owner
                              from pg_proc p join pg_language l on l.oid = p.prolang
                             where p.oid = to_regprocedure(${FN})`;
    expect(row).toEqual({
      prosecdef: true,
      volatility: "s",
      lanname: "plpgsql",
      config: "search_path=public",
      owner: "postgres",
    });
  });

  it("patients_select is the expression the function's patient term states (0096's)", async () => {
    // The function restates this policy's USING. If the policy changes, this
    // fails, and the function is changed with it in the same migration.
    const [row] = await sql.begin(async (tx) => {
      await tx`set local search_path = public`;
      return tx`select p.polcmd::text || '/' || p.polpermissive::text || '/'
                       || array_to_string(array(select pg_get_userbyid(r) from unnest(p.polroles) r order by 1), ',')
                       || ' ' || md5(pg_get_expr(p.polqual, p.polrelid)) as shape
                  from pg_policy p
                 where p.polrelid = 'public.patients'::regclass and p.polname = 'patients_select'`;
    });
    expect(row!.shape).toBe("r/true/authenticated de612f10145303302884747fa10b6c66");
  });
});

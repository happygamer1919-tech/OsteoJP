/**
 * 0088 - a booking with a SHARED RESOURCE (NESA) as Terapeuta 2 is visible to
 * the therapists who share the machine's clinic, and visibility is ALL it grants.
 *
 * Ruling SCHED-29.3 (owner, 2026-09-13). Card
 * MIG-0088-nesa-second-participant-visible-to-cb-therapists.
 *
 * Every arm runs as `authenticated` with therapist, reception, owner or patient
 * claims, inside a transaction that is rolled back, against the policies as
 * applied to this database. Fixtures are committed by the superuser and removed
 * in afterAll.
 */
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

const d = live ? describe : describe.skip;

const POLICY = "appointments_shared_resource_second_participant_select";
/** 0091 (CARE-01), the fourth policy on `appointments`. See the closed-list arm. */
const CARE_TEAM_POLICY = "appointments_care_team_patient_history_select";

d("0088: NESA as Terapeuta 2 is visible to the clinic's therapists, read only", () => {
  let sql: Sql;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const role = randomUUID();
  const cb = randomUUID();
  const lv = randomUUID();
  const otherLoc = randomUUID();
  const patient = randomUUID();
  const otherPatient = randomUUID();
  /**
   * ADDED AT THE 0091 PROMOTION (CARE-01), AND IT IS A FIXTURE FIX, NOT A
   * BEHAVIOUR CHANGE. The LV row used to name the SAME `patient` as the CB row.
   * 0091 lets a therapist read every appointment of a patient they have
   * treated, so `lvOnly` - who is the practitioner on the LV row - began
   * reading the CB row through the CARE-TEAM policy, and the arm below stopped
   * measuring 0088 at all. Giving the LV row its own patient restores the
   * isolation that arm depends on. 0091's own behaviour is proven in
   * care-team-appointment-visibility.db.test.ts, which is where it belongs.
   */
  const lvPatient = randomUUID();

  const nesa = randomUUID(); // the machine, at CB
  const booker = randomUUID(); // CB therapist who booked with NESA as Terapeuta 2
  const colleague = randomUUID(); // another CB therapist
  const lvOnly = randomUUID(); // LV-only therapist
  const person = randomUUID(); // a therapist named as Terapeuta 2 (a person, not a resource)
  const reception = randomUUID();
  const owner = randomUUID();
  const otherTherapist = randomUUID(); // another tenant, CB-shaped

  const nesaSecondAtCb = randomUUID();
  const nesaSecondAtLv = randomUUID();
  const personSecondAtCb = randomUUID();
  const otherTenantRow = randomUUID();

  const START = "2027-04-14T10:00:00.000Z";
  const END = "2027-04-14T10:45:00.000Z";

  const count = async (tx: TransactionSql, id: string): Promise<number> => {
    const [r] = await tx`select count(*)::int as n from public.appointments where id = ${id}`;
    return (r as unknown as { n: number }).n;
  };
  const asTherapist = <T>(userId: string, fn: (tx: TransactionSql) => Promise<T>) =>
    asRole(sql, "authenticated", claimsFor(tenant, "therapist", userId), fn);

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values
      (${tenant}, '0088 Co', ${"t0088-" + tenant.slice(0, 8)}),
      (${otherTenant}, '0088 Other', ${"t0088o-" + otherTenant.slice(0, 8)})`;
    await sql`insert into roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'therapist', 'Therapist')`;
    await sql`insert into locations (id, tenant_id, name) values
      (${cb}, ${tenant}, 'CB 0088'), (${lv}, ${tenant}, 'LV 0088'), (${otherLoc}, ${otherTenant}, 'CB other')`;
    const user = (id: string, t: string, name: string, shared = false) =>
      sql`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
          values (${id}, ${t}, ${"u-" + id.slice(0, 8) + "@t0088.test"}, ${name}, true, ${!shared}, ${shared})`;
    await user(nesa, tenant, "NESA", true);
    await user(booker, tenant, "Booker");
    await user(colleague, tenant, "Colleague");
    await user(lvOnly, tenant, "LV Only");
    await user(person, tenant, "Person Two");
    await user(reception, tenant, "Reception");
    await user(owner, tenant, "Owner");
    await user(otherTherapist, otherTenant, "Other tenant therapist");
    const link = (u: string, t: string, l: string) =>
      sql`insert into staff_locations (tenant_id, user_id, location_id) values (${t}, ${u}, ${l})`;
    for (const u of [nesa, booker, colleague, person, reception]) await link(u, tenant, cb);
    await link(lvOnly, tenant, lv);
    await link(otherTherapist, otherTenant, otherLoc);
    await sql`insert into patients (id, tenant_id, full_name) values
      (${patient}, ${tenant}, 'Paciente 0088'), (${lvPatient}, ${tenant}, 'Paciente 0088 LV'),
      (${otherPatient}, ${otherTenant}, 'Paciente outro')`;
    const appt = (id: string, t: string, p: string, prac: string, prac2: string | null, loc: string) =>
      sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id,
                                    starts_at, ends_at, status, created_by)
          values (${id}, ${t}, ${p}, ${prac}, ${prac2}, ${loc}, ${START}::timestamptz, ${END}::timestamptz,
                  'scheduled', ${prac})`;
    await appt(nesaSecondAtCb, tenant, patient, booker, nesa, cb);
    // A row recorded at LV naming NESA: the location test must keep it from CB therapists.
    // Its patient is `lvPatient`, not `patient`, so this fixture exercises 0088
    // alone - see the note on lvPatient above.
    await appt(nesaSecondAtLv, tenant, lvPatient, lvOnly, nesa, lv);
    await appt(personSecondAtCb, tenant, patient, booker, person, cb);
    await appt(otherTenantRow, otherTenant, otherPatient, otherTherapist, null, otherLoc);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from appointments where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from patients where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from staff_locations where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from users where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from roles where tenant_id = ${tenant}`;
    await sql`delete from locations where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from tenants where id in (${tenant}, ${otherTenant})`;
    await sql.end();
  });

  /**
   * THE CLOSED LIST GREW BY ONE AT 0091 (CARE-01), BY AN OWNER RULING.
   *
   * `appointments_care_team_patient_history_select` is the care-team read
   * policy. It is listed here BY NAME rather than the assertion being relaxed
   * to a count or a subset, because the whole value of this arm is that a
   * fourth policy on `appointments` cannot appear without somebody writing its
   * name down next to a ruling. 0091 has one: Q-CARE-1 (c), 2026-09-16.
   *
   * ITS SHAPE IS ASSERTED TOO, for the reason 0088's own is: it must be FOR
   * SELECT. `appointments_rls` is FOR ALL, so a care-team policy written FOR
   * ALL would hand every therapist UPDATE and DELETE on a colleague's booking.
   * That is the grant nobody ruled, and this is where it would show.
   */
  it("the policy exists as PERMISSIVE, FOR SELECT, TO authenticated, and nothing else on appointments changed role", async () => {
    const rows = await sql`select policyname, permissive, cmd, roles::text as roles
      from pg_policies where schemaname = 'public' and tablename = 'appointments' order by policyname`;
    const byName = Object.fromEntries(rows.map((r) => [r.policyname, r]));
    expect(byName[POLICY]).toMatchObject({ permissive: "PERMISSIVE", cmd: "SELECT", roles: "{authenticated}" });
    expect(byName.appointments_rls).toMatchObject({ cmd: "ALL", roles: "{authenticated}" });
    expect(byName[CARE_TEAM_POLICY]).toMatchObject({
      permissive: "PERMISSIVE",
      cmd: "SELECT",
      roles: "{authenticated}",
    });
    expect(Object.keys(byName).sort()).toEqual(
      ["appointments_patient_selfscope", "appointments_rls", POLICY, CARE_TEAM_POLICY].sort(),
    );
  });

  it("a CB colleague READS the booking with NESA as Terapeuta 2 at CB", async () => {
    expect(await asTherapist(colleague, (tx) => count(tx, nesaSecondAtCb))).toBe(1);
  });

  it("the colleague can neither change nor remove it: the grant is visibility only", async () => {
    const updated = await asTherapist(colleague, async (tx) => {
      const r = await tx`update public.appointments set room = 'changed' where id = ${nesaSecondAtCb}`;
      return r.count;
    });
    expect(updated).toBe(0);
    const deleted = await asTherapist(colleague, async (tx) => {
      const r = await tx`delete from public.appointments where id = ${nesaSecondAtCb}`;
      return r.count;
    });
    expect(deleted).toBe(0);
    const [still] = await sql`select room from appointments where id = ${nesaSecondAtCb}`;
    expect(still?.room).toBeNull();
  });

  it("an LV-only therapist reads nothing through it", async () => {
    expect(await asTherapist(lvOnly, (tx) => count(tx, nesaSecondAtCb))).toBe(0);
  });

  /**
   * THE 0091 CROSS-CHECK, so the isolation above is a measured fact rather than
   * a fixture detail nobody re-reads. `lvOnly` reads nothing of the CB row
   * because they have never treated its patient - not because 0091 is absent.
   * `booker` HAS treated that patient, and reads their LV-recorded history.
   */
  it("0091 is present and keys on the PATIENT: the CB booker reads that patient's history, the LV-only therapist does not", async () => {
    expect(await asTherapist(booker, (tx) => count(tx, nesaSecondAtCb))).toBe(1);
    expect(await asTherapist(lvOnly, (tx) => count(tx, nesaSecondAtLv))).toBe(1);
    expect(await asTherapist(lvOnly, (tx) => count(tx, personSecondAtCb))).toBe(0);
  });

  it("the location test holds: a CB therapist does not read a NESA-as-Terapeuta-2 row recorded at LV", async () => {
    expect(await asTherapist(colleague, (tx) => count(tx, nesaSecondAtLv))).toBe(0);
  });

  it("a PERSON as Terapeuta 2 widens nothing: the colleague cannot read that row", async () => {
    expect(await asTherapist(colleague, (tx) => count(tx, personSecondAtCb))).toBe(0);
  });

  it("another tenant's therapist reads nothing", async () => {
    const n = await asRole(sql, "authenticated", claimsFor(otherTenant, "therapist", otherTherapist), (tx) =>
      count(tx, nesaSecondAtCb),
    );
    expect(n).toBe(0);
  });

  it("with the machine NOT flagged as a shared resource, the colleague reads nothing (the production state before the flag)", async () => {
    const n = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", colleague), async (tx) => {
      // Inside the rolled-back transaction, as the superuser, before the role switch takes effect again.
      await tx.unsafe("reset role");
      await tx`update public.users set is_shared_resource = false where id = ${nesa}`;
      await tx.unsafe("set local role authenticated");
      return count(tx, nesaSecondAtCb);
    });
    expect(n).toBe(0);
    const [flag] = await sql`select is_shared_resource from users where id = ${nesa}`;
    expect(flag?.is_shared_resource).toBe(true);
  });

  it("the patient role gains nothing", async () => {
    const n = await asRole(sql, "patient", patientClaims(tenant, patient), (tx) => count(tx, nesaSecondAtCb));
    // appointments_patient_selfscope admits the patient's OWN appointment; 0088 adds nothing for another.
    const other = await asRole(sql, "patient", patientClaims(tenant, randomUUID()), (tx) => count(tx, nesaSecondAtCb));
    expect(n).toBeLessThanOrEqual(1);
    expect(other).toBe(0);
  });

  it("NEGATIVE CONTROL: without the policy the same colleague read is 0, so the read above is the policy's", async () => {
    const n = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", colleague), async (tx) => {
      await tx.unsafe("reset role");
      await tx.unsafe(`drop policy ${POLICY} on public.appointments`);
      await tx.unsafe("set local role authenticated");
      return count(tx, nesaSecondAtCb);
    });
    expect(n).toBe(0);
    const [p] = await sql`select count(*)::int as n from pg_policies where policyname = ${POLICY}`;
    expect(p?.n).toBe(1);
  });

  it("owner and CB reception read it exactly as before (appointments_rls already admits them)", async () => {
    const o = await asRole(sql, "authenticated", claimsFor(tenant, "owner", owner), (tx) => count(tx, nesaSecondAtCb));
    const r = await asRole(sql, "authenticated", claimsFor(tenant, "reception", reception), (tx) =>
      count(tx, nesaSecondAtCb),
    );
    expect(o).toBe(1);
    expect(r).toBe(1);
  });
});

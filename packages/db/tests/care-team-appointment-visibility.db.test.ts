/**
 * CARE-01 — a therapist sees the WHOLE appointment history of a patient they
 * treat, including the appointments that patient has with colleagues.
 *
 * ==========================================================================
 * THE CLINIC'S COMPLAINT, AS A TEST
 * ==========================================================================
 * Rodica, LV: a patient is often treated by several therapists over time, and
 * each of them needs that patient's full past history. Today a therapist cannot
 * even see that the patient is booked with somebody else, because
 * `appointments_rls` admits a row only when the viewer is its `practitioner_id`,
 * its `practitioner_2_id` or its `created_by`. The PATIENT columns never enter
 * the predicate, so the row belongs to the therapist, not to the patient.
 *
 * Ruling Q-CARE-1 = (c): T may read every appointment of P when T is assigned
 * to P by reception, OR T has any appointment with P, past or future.
 *
 * ==========================================================================
 * WHY THE ASSERTIONS RUN THROUGH `asRole`, NEVER THE SEEDING CONNECTION
 * ==========================================================================
 * RLS on these tables is ENABLE, not FORCE, so the owner connection bypasses it
 * by ownership. An assertion made there would pass whatever the policies say.
 * Every claim below is made inside `asRole("authenticated", …)` with a real
 * therapist's claims, which is the same GUC the app sets.
 *
 * ==========================================================================
 * THE TRAP THIS FIXTURE AVOIDS ON PURPOSE
 * ==========================================================================
 * `appointments_rls` also admits any row whose `created_by` is the viewer. If
 * the colleague's appointment were seeded as created by T, it would be visible
 * today and this file would go green without the ruling being implemented at
 * all. Every appointment here is created by RECEPTION.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { asRole, claimsFor, connect, live } from "./rls-harness";

/**
 * THE MIGRATION IS NUMBERED NOW, AND THESE TESTS STILL ASK THE DATABASE RATHER
 * THAN ASSUMING.
 *
 * It was promoted on 2026-09-21, bytes unchanged, from
 * `migrations-pending/NEXT-AFTER-0089_care_team.sql` to
 * `packages/db/migrations/0091_care_team.sql` (journal idx 88, tag
 * `0091_care_team`), so CI's seeded database now BUILDS with the table and the
 * policy and every arm below runs. The `PERMITTED_SKIPS` entry that covered this
 * file in `.github/scripts/assert-rls-executed.mjs` was deleted in the same
 * change, at the expiry it carried. A skip here is now a RED, as it should be.
 *
 * WHY THE SCHEMA GATE STAYS ANYWAY. A lane database, a developer's local stack
 * or an older throwaway can sit below 0091, and a suite that asserted the
 * widened behaviour there would be red for a reason that has nothing to do with
 * the code under review. So the gate is the SCHEMA, not an env flag: where the
 * migration is applied these run and must pass; below it they skip and say
 * nothing, which reports "not measured" rather than "fine". CI is above it, and
 * the RLS-executed guard is what proves CI actually ran them.
 */
async function careTeamApplied(): Promise<boolean> {
  if (!live) return false;
  const probe = connect();
  try {
    const rows = await probe`select to_regclass('public.patient_care_team') is not null as present`;
    return Boolean(rows[0]?.present);
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const applied = await careTeamApplied();
const d = applied ? describe : describe.skip;

const H = 60 * 60 * 1000;

const F = {
  tenant: randomUUID(),
  location: randomUUID(),
  /** The therapist under test. */
  t: randomUUID(),
  /** A colleague who also treats the patient. */
  t2: randomUUID(),
  /** A therapist with no connection to the patient at all. */
  stranger: randomUUID(),
  /** Reception creates every booking, so `created_by` never rescues a read. */
  reception: randomUUID(),
  patient: randomUUID(),
  /** Another patient, to prove the widening is per-patient and not a blanket. */
  otherPatient: randomUUID(),
  /** P's PAST appointment with T. */
  apptWithT: randomUUID(),
  /** P's appointment with the colleague. This is the one that is invisible. */
  apptWithT2: randomUUID(),
  /** The stranger's own booking with the OTHER patient. */
  apptStranger: randomUUID(),
};

d("CARE-01: the appointment history of a patient a therapist treats", () => {
  let p: Sql;

  beforeAll(async () => {
    p = connect();
    const past = new Date(Date.now() - 30 * 24 * H);
    const future = new Date(Date.now() + 7 * 24 * H);

    await p`insert into tenants (id, name, slug)
            values (${F.tenant}, 'Care Co', ${`care-${F.tenant.slice(0, 8)}`})`;
    await p`insert into users (id, tenant_id, email, full_name) values
            (${F.t},         ${F.tenant}, ${`t-${F.t.slice(0, 8)}@x.pt`},   'Therapist T'),
            (${F.t2},        ${F.tenant}, ${`t2-${F.t2.slice(0, 8)}@x.pt`}, 'Therapist T2'),
            (${F.stranger},  ${F.tenant}, ${`st-${F.stranger.slice(0, 8)}@x.pt`}, 'Stranger'),
            (${F.reception}, ${F.tenant}, ${`r-${F.reception.slice(0, 8)}@x.pt`}, 'Reception')`;
    await p`insert into locations (id, tenant_id, name)
            values (${F.location}, ${F.tenant}, 'Linda-a-Velha')`;
    await p`insert into patients (id, tenant_id, full_name) values
            (${F.patient},      ${F.tenant}, 'Paciente P'),
            (${F.otherPatient}, ${F.tenant}, 'Paciente Outro')`;

    // P treated by T, in the PAST. The ruling's second arm is "any appointment
    // with P, past or future", so a finished visit must count.
    await p`insert into appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
            values (${F.apptWithT}, ${F.tenant}, ${F.patient}, ${F.t}, ${F.location},
                    ${past.toISOString()}, ${new Date(past.getTime() + H).toISOString()},
                    'completed', ${F.reception})`;

    // THE ROW THE CLINIC CANNOT SEE: same patient, a colleague, in the future.
    await p`insert into appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
            values (${F.apptWithT2}, ${F.tenant}, ${F.patient}, ${F.t2}, ${F.location},
                    ${future.toISOString()}, ${new Date(future.getTime() + H).toISOString()},
                    'scheduled', ${F.reception})`;

    // A booking that must stay invisible to T under every arm of the ruling.
    await p`insert into appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
            values (${F.apptStranger}, ${F.tenant}, ${F.otherPatient}, ${F.stranger}, ${F.location},
                    ${future.toISOString()}, ${new Date(future.getTime() + H).toISOString()},
                    'scheduled', ${F.reception})`;
  });

  afterAll(async () => {
    await p`delete from appointments where tenant_id = ${F.tenant}`;
    await p`delete from patients where tenant_id = ${F.tenant}`;
    await p`delete from locations where tenant_id = ${F.tenant}`;
    await p`delete from users where tenant_id = ${F.tenant}`;
    await p`delete from tenants where id = ${F.tenant}`;
    await p.end({ timeout: 5 });
  });

  /** Every id of P's appointments that `who` can actually read. */
  const patientHistorySeenBy = (who: string): Promise<string[]> =>
    asRole(p, "authenticated", claimsFor(F.tenant, "therapist", who), async (tx) => {
      const rows = await tx`select id::text as id from appointments
                             where patient_id = ${F.patient} order by starts_at`;
      return rows.map((r) => r.id as string);
    });

  /* ================================================================== */
  /* THE CONTROL FIRST: the principal and the query work at all.         */
  /* ================================================================== */

  it("CONTROL: T can read their own appointment with P", async () => {
    // If this failed, every assertion below would be measuring a broken
    // principal rather than a policy.
    expect(await patientHistorySeenBy(F.t)).toContain(F.apptWithT);
  });

  /* ================================================================== */
  /* N1: THE DEFECT. RED until the care-team policy ships.               */
  /* ================================================================== */

  it("T sees the COLLEAGUE's appointment with the same patient", async () => {
    // Ruling Q-CARE-1 (c), second arm: T has an appointment with P, so P's
    // whole appointment history is visible to T - including this row, whose
    // practitioner is somebody else.
    const seen = await patientHistorySeenBy(F.t);
    expect(seen).toContain(F.apptWithT2);
  });

  it("T sees the patient's FULL history, both rows, in one read", async () => {
    const seen = await patientHistorySeenBy(F.t);
    expect(seen.sort()).toEqual([F.apptWithT, F.apptWithT2].sort());
  });

  /* ================================================================== */
  /* THE LIMITS. These must hold BEFORE and AFTER the change.            */
  /* ================================================================== */

  it("a therapist with NO link to the patient still sees nothing of theirs", async () => {
    expect(await patientHistorySeenBy(F.stranger)).toEqual([]);
  });

  it("the widening is per PATIENT: T still cannot see the stranger's booking", async () => {
    const seen = await asRole(
      p,
      "authenticated",
      claimsFor(F.tenant, "therapist", F.t),
      async (tx) => {
        const rows = await tx`select id::text as id from appointments
                               where id = ${F.apptStranger}`;
        return rows.map((r) => r.id as string);
      },
    );
    expect(seen).toEqual([]);
  });

  it("THE AGENDA IS UNCHANGED: filtered by practitioner, T sees only T's own", async () => {
    // The agenda asks for one practitioner's own column, and that WHERE clause
    // is what makes the day view a day view. Widening SELECT must not quietly
    // put a colleague's booking on T's agenda.
    const seen = await asRole(
      p,
      "authenticated",
      claimsFor(F.tenant, "therapist", F.t),
      async (tx) => {
        const rows = await tx`select id::text as id from appointments
                               where practitioner_id = ${F.t}`;
        return rows.map((r) => r.id as string);
      },
    );
    expect(seen).toEqual([F.apptWithT]);
  });

  /* ================================================================== */
  /* THE FIRST ARM OF THE RULING: RECEPTION ASSIGNS                      */
  /* ================================================================== */

  /** Reception's assignment, written privileged so the read under test is the */
  /*  thing being measured rather than the write. */
  const assign = (therapist: string) =>
    p`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by)
      values (${F.tenant}, ${F.patient}, ${therapist}, ${F.reception})`;
  const removeAssignment = (therapist: string) =>
    p`update patient_care_team set removed_at = now()
       where tenant_id = ${F.tenant} and patient_id = ${F.patient}
         and user_id = ${therapist} and removed_at is null`;
  const dropAssignments = () =>
    p`delete from patient_care_team where tenant_id = ${F.tenant}`;

  it("ASSIGNMENT ALONE opens the history, with no appointment of their own", async () => {
    // The stranger has never treated this patient. This is the arm reception
    // presses for a therapist about to take the patient over.
    expect(await patientHistorySeenBy(F.stranger)).toEqual([]);
    await assign(F.stranger);
    try {
      const seen = await patientHistorySeenBy(F.stranger);
      expect(seen.sort()).toEqual([F.apptWithT, F.apptWithT2].sort());
    } finally {
      await dropAssignments();
    }
  });

  it("REMOVAL REVOKES IT, for a therapist with no appointment of their own", async () => {
    await assign(F.stranger);
    try {
      expect(await patientHistorySeenBy(F.stranger)).toHaveLength(2);
      await removeAssignment(F.stranger);
      // The soft remove is the revocation: the helper filters removed_at.
      expect(await patientHistorySeenBy(F.stranger)).toEqual([]);
    } finally {
      await dropAssignments();
    }
  });

  it("REMOVAL DOES NOT REVOKE the therapist who actually treats the patient", async () => {
    // T keeps the history through the second arm, which removal cannot touch.
    // Without this, "removal revokes" could be read as a switch that overrides
    // treatment, which is not what was ruled.
    await assign(F.t);
    try {
      await removeAssignment(F.t);
      expect((await patientHistorySeenBy(F.t)).sort()).toEqual(
        [F.apptWithT, F.apptWithT2].sort(),
      );
    } finally {
      await dropAssignments();
    }
  });

  it("an assignment to ANOTHER patient opens nothing of this one", async () => {
    await p`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by)
            values (${F.tenant}, ${F.otherPatient}, ${F.stranger}, ${F.reception})`;
    try {
      expect(await patientHistorySeenBy(F.stranger)).toEqual([]);
    } finally {
      await dropAssignments();
    }
  });
});

/* ==================================================================== */
/* THE NEW TABLE'S OWN ISOLATION                                        */
/* ==================================================================== */
/* CLAUDE.md: every migration adding a domain table ships its RLS        */
/* isolation test in the same PR. Reception and owner manage the team;   */
/* a therapist has no policy on this table at all and must read nothing  */
/* through it, even about themselves - their access arrives through the  */
/* SECURITY DEFINER helper, which is a different thing from a view of    */
/* who else is on the team.                                             */
d("CARE-01: patient_care_team is tenant-isolated and reception-managed", () => {
  let p: Sql;
  const X = {
    tenant: randomUUID(),
    otherTenant: randomUUID(),
    reception: randomUUID(),
    therapist: randomUUID(),
    patient: randomUUID(),
    intruder: randomUUID(),
  };

  beforeAll(async () => {
    p = connect();
    await p`insert into tenants (id, name, slug) values
            (${X.tenant},      'Care X', ${`carex-${X.tenant.slice(0, 8)}`}),
            (${X.otherTenant}, 'Care Y', ${`carey-${X.otherTenant.slice(0, 8)}`})`;
    await p`insert into users (id, tenant_id, email, full_name) values
            (${X.reception}, ${X.tenant},      ${`rx-${X.reception.slice(0, 8)}@x.pt`}, 'Reception X'),
            (${X.therapist}, ${X.tenant},      ${`tx-${X.therapist.slice(0, 8)}@x.pt`}, 'Therapist X'),
            (${X.intruder},  ${X.otherTenant}, ${`iy-${X.intruder.slice(0, 8)}@x.pt`},  'Reception Y')`;
    await p`insert into patients (id, tenant_id, full_name)
            values (${X.patient}, ${X.tenant}, 'Paciente X')`;
    await p`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by)
            values (${X.tenant}, ${X.patient}, ${X.therapist}, ${X.reception})`;
  });

  afterAll(async () => {
    await p`delete from patient_care_team where tenant_id = ${X.tenant}`;
    await p`delete from patients where tenant_id = ${X.tenant}`;
    await p`delete from users where tenant_id in (${X.tenant}, ${X.otherTenant})`;
    await p`delete from tenants where id in (${X.tenant}, ${X.otherTenant})`;
    await p.end({ timeout: 5 });
  });

  const rowsSeenBy = (role: "owner" | "reception" | "therapist", who: string, tenant: string) =>
    asRole(p, "authenticated", claimsFor(tenant, role, who), async (tx) => {
      const rows = await tx`select id::text as id from patient_care_team`;
      return rows.length;
    });

  it("RECEPTION sees the assignment", async () => {
    expect(await rowsSeenBy("reception", X.reception, X.tenant)).toBe(1);
  });

  it("A THERAPIST sees NOTHING in this table, including their own row", async () => {
    expect(await rowsSeenBy("therapist", X.therapist, X.tenant)).toBe(0);
  });

  it("ANOTHER TENANT's reception sees nothing", async () => {
    expect(await rowsSeenBy("reception", X.intruder, X.otherTenant)).toBe(0);
  });

  it("a THERAPIST cannot assign themselves", async () => {
    await expect(
      asRole(p, "authenticated", claimsFor(X.tenant, "therapist", X.therapist), (tx) =>
        tx`insert into patient_care_team (tenant_id, patient_id, user_id)
           values (${X.tenant}, ${X.patient}, ${X.therapist})`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("RECEPTION cannot assign into another tenant", async () => {
    await expect(
      asRole(p, "authenticated", claimsFor(X.tenant, "reception", X.reception), (tx) =>
        tx`insert into patient_care_team (tenant_id, patient_id, user_id)
           values (${X.otherTenant}, ${X.patient}, ${X.therapist})`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

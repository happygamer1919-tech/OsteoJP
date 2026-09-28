/**
 * care-team-reads.db.test.ts - CARE-02a (0098) against a real database: the care
 * team READS the ficha and the registos, and nothing it WRITES widens.
 *
 * ==========================================================================
 * THE OWNER'S CHECK, THE CLINIC LIMIT, AND THE FOUR THERAPISTS
 * ==========================================================================
 * "viewer_care_team_patient_ids() joined into the patients and clinical_records
 * therapist arms; lib/patients/scope.ts gets a care-team arm; the care_team
 * insert policy admits a therapist writing their own booking's row and the
 * select policy admits therapists reading their own list; attachments,
 * clinical_episodes and appointment_notes stay as they are."
 *
 * AND THE OWNER'S RULING OF 2026-09-27 on the open question: "limit to their
 * clinic only". A care-team therapist reads the ficha, the registos and the
 * team only of a patient linked to one of THEIR OWN clinics. 0098 v2 puts that
 * rule in one clinic-limited helper (care-team-reads-gate.ts names it) and the
 * app's read scope calls the same helper.
 *
 *   T1  on P's care team, NO appointment with P (assigned-only), at P's clinic
 *   T2  treats P (their appointment, their registo), NOT on the team
 *   T3  neither (not assigned)
 *   T4  on P's care team but installed ONLY at the other clinic, where P has
 *       no link: the clinic limit's own arm. T4 reads nothing of P.
 *
 * Reception and the owner are the POSITIVE CONTROLS: every arm that expects a
 * therapist to read nothing is paired with a principal that reads the same row,
 * so a zero here is a refusal and never an empty fixture. T4's zero is paired
 * with T4 READING Q, a patient linked to T4's own clinic (by 0045's fallback:
 * no located appointment, primary clinic LV2), so T4 is refused P for the
 * clinic and not for being T4; and T1, on Q's team at the wrong clinic, is
 * refused Q the same way.
 *
 * THE BASIS'S TWO EDGES have patients of their own (Y2 and X2, B9), because
 * the rehearsal's mutations H04, H07 and H09 changed exactly these and no
 * DB-gated arm could tell them apart: the SLOT RULE (0045's basis reads the
 * FIRST patient slot only) and the FALLBACK GATE (the primary clinic counts
 * only when the patient has no located appointment of their own). And one
 * admin arm (B3) holds the insert policy's therapist ROLE GUARD, which
 * mutation CI07 dropped unseen by every suite.
 *
 * ==========================================================================
 * WITHOUT 0098 THE "0098:" ARMS ASSERT THE PRE-0098 PROFILE, AND SAY SO
 * ==========================================================================
 * 0098 is held in migrations-pending, and CI's DB-gated job builds its
 * database from supabase/migrations, so on the held PR these arms run against
 * a database without it. They neither skip (the skip-guard reddens any
 * not-run test) nor assert 0098 blindly (red on every run until promotion).
 * Each reads `care0098State` (care-team-0098-state.ts) and asserts WHICHEVER
 * profile the database owes: 0098's when it is applied, main's when it is not,
 * which is a real assertion of today's behaviour. The first test reports which
 * one ran; a HALF-applied database, or an unapplied one after 0098 has been
 * promoted into packages/db/migrations, THROWS and fails every arm. So from
 * the promotion commit on this suite is strict without an edit, and on the
 * rehearsal database with 0098 applied it proves 0098 itself.
 *
 * ==========================================================================
 * THE SEAMS
 * ==========================================================================
 * `requireRequestContext` (getPatient and searchPatients call it themselves)
 * and the Storage signer (Storage is not in the CI stack; signing is not under
 * test). Everything else is real: `runScoped` sets `role authenticated` and the
 * JWT claims, so every policy runs as on production, and the app's schema
 * probe (care-team-reads-gate.ts) asks the real catalogue.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: "owner" | "reception" | "therapist" | "admin"; userId: string } | null,
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal");
      return acting.ctx;
    },
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({ data: { path, token: "tok" }, error: null }),
      }),
    },
  }),
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

type Role = "owner" | "reception" | "therapist" | "admin";

/** True when the error chain carries Postgres's RLS refusal. */
function isRlsRefusal(e: unknown): boolean {
  for (let cur = e as { message?: string; cause?: unknown } | undefined; cur; cur = cur.cause as typeof cur) {
    if (/row-level security/.test(String(cur.message ?? ""))) return true;
  }
  return false;
}

d("CARE-02a: the care team reads the ficha and the registos (0098)", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let runScoped: typeof import("@/lib/auth/context").runScoped;
  let queries: typeof import("./queries");
  let listQueries: typeof import("./list-queries");
  let records: typeof import("@/lib/clinical/records");
  let documents: typeof import("./documents");
  let careTeam: typeof import("@/lib/admin/care-team");
  let episodes: typeof import("@/lib/clinical/episodes");
  let storage: typeof import("@/lib/clinical/storage");
  /** Which 0098 this database has; every "0098:" arm asserts what it owes. */
  let state: import("./care-team-0098-state").Care0098State;
  /** The answer the database owes: `applied` with 0098, `before` without it. */
  const owed = <T,>(applied: T, before: T): T => (state.applied ? applied : before);

  const tenant = randomUUID();
  const loc = randomUUID();
  const owner = randomUUID();
  const reception = randomUUID();
  const admin = randomUUID();
  const t1 = randomUUID();
  const t2 = randomUUID();
  const t3 = randomUUID();
  /** Installed ONLY at the other clinic (LV2), and on P's team: the clinic limit's arm. */
  const t4 = randomUUID();
  /** The other clinic. P has no link to it; Q is linked to it and to nothing else. */
  const loc2 = randomUUID();

  /** The patient under test. Created by reception, so `created_by` widens nobody. */
  const patient = randomUUID();
  /** T2's registo of that patient. A DRAFT, so an UPDATE that reached it would land. */
  const registo = randomUUID();
  const t2Appointment = randomUUID();
  /** A patient-level document (Documentos tab), for the documents reader. */
  const documentId = randomUUID();
  /** T1's live care-team row, written by reception. */
  const t1Row = randomUUID();
  /** T4's live row on P's team, written by reception. P has no link to T4's clinic. */
  const t4Row = randomUUID();
  /**
   * Q: linked to LV2 ONLY, by 0045's fallback (no located appointment; primary
   * clinic LV2). T4 and T1 are both on Q's team, so Q is the positive control
   * for T4 and the clinic limit's arm for T1.
   */
  const patientQ = randomUUID();
  const qT4Row = randomUUID();
  const qT1Row = randomUUID();
  /**
   * THE BASIS'S EDGES. H is the FIRST participant of a shared booking at LV,
   * with T2 (who is on no team here). Y2 is that booking's SECOND participant
   * and has no appointment of their own; primary clinic LV2. On 0045's
   * first-slot basis Y2 has no located appointment, so the fallback decides:
   * Y2 is linked to LV2 (T4) and NOT to LV (T1). X2 has primary clinic LV and
   * one appointment of their own at LV2 (with T4): X2 HAS a located
   * appointment, so the fallback is off and X2 is linked to LV2 only, not to
   * LV. T1 and T4 are on Y2's team; T1 is on X2's. Neither T1 nor T4 treats Y2,
   * and T1 does not treat X2.
   */
  const patientH = randomUUID();
  const patientY2 = randomUUID();
  const patientX2 = randomUUID();
  const sharedAppointment = randomUUID();
  const x2Appointment = randomUUID();

  const ctx = (userId: string, role: Role) => ({ tenantId: tenant, role, userId });
  const as = (userId: string, role: Role) => {
    const c = ctx(userId, role);
    acting.ctx = c;
    return c;
  };

  type Row = Record<string, unknown>;
  const rowsOf = (r: unknown): Row[] =>
    (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];

  /** One statement under a principal's real claims. */
  async function under(userId: string, role: Role, q: Parameters<typeof db.execute>[0]): Promise<Row[]> {
    return runScoped(ctx(userId, role), async (tx) => rowsOf(await tx.execute(q)));
  }

  async function count(userId: string, role: Role, q: Parameters<typeof db.execute>[0]): Promise<number> {
    const [r] = await under(userId, role, q);
    return Number(r!.n);
  }

  /**
   * Whether RLS admits one write, WITHOUT keeping it: the statement runs under
   * the principal's claims and the transaction is then rolled back by a thrown
   * sentinel, so no arm moves the fixture for the arms after it.
   */
  async function outcome(userId: string, role: Role, q: Parameters<typeof db.execute>[0]) {
    const rollback = new Error("rollback");
    try {
      await runScoped(ctx(userId, role), async (tx) => {
        await tx.execute(q);
        throw rollback;
      });
    } catch (e) {
      if (e === rollback) return "admitted" as const;
      if (isRlsRefusal(e)) return "refused" as const;
      throw e;
    }
    throw new Error("unreachable: the sentinel always throws");
  }

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ runScoped } = await import("@/lib/auth/context"));
    queries = await import("./queries");
    listQueries = await import("./list-queries");
    records = await import("@/lib/clinical/records");
    documents = await import("./documents");
    careTeam = await import("@/lib/admin/care-team");
    episodes = await import("@/lib/clinical/episodes");
    storage = await import("@/lib/clinical/storage");

    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenant}::uuid, 'Care02a Reads', ${"care02a-" + tenant.slice(0, 8)})`);
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${loc}::uuid, ${tenant}::uuid, 'LV')`);
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${loc2}::uuid, ${tenant}::uuid, 'LV2')`);
    for (const [id, label, at] of [
      [owner, "Dono", loc], [reception, "Rececao", loc], [admin, "Admin", loc],
      [t1, "Terapeuta Um", loc], [t2, "Terapeuta Dois", loc], [t3, "Terapeuta Tres", loc],
      [t4, "Terapeuta Quatro", loc2],
    ] as const) {
      await db.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}::uuid, ${tenant}::uuid, ${`c02a-${id.slice(0, 8)}@example.test`}, ${label}, true, true)`);
      await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
        values (${tenant}::uuid, ${id}::uuid, ${at}::uuid)`);
    }
    await db.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
      values (${patient}::uuid, ${tenant}::uuid, 'Paciente Care02a', ${loc}::uuid, ${reception}::uuid)`);
    await db.execute(raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                                   starts_at, ends_at, status)
      values (${t2Appointment}::uuid, ${tenant}::uuid, ${patient}::uuid, ${t2}::uuid, ${loc}::uuid,
              '2026-09-02T10:00:00Z'::timestamptz, '2026-09-02T10:45:00Z'::timestamptz,
              'completed'::appointment_status)`);
    await db.execute(raw`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status)
      values (${registo}::uuid, ${tenant}::uuid, ${patient}::uuid, ${t2}::uuid, 'draft')`);
    await db.execute(raw`insert into attachments (id, tenant_id, patient_id, storage_path, file_name)
      values (${documentId}::uuid, ${tenant}::uuid, ${patient}::uuid,
              ${`${tenant}/patient-documents/${patient}/${randomUUID()}__exame.pdf`}, 'exame.pdf')`);
    await db.execute(raw`insert into patient_care_team (id, tenant_id, patient_id, user_id, assigned_by)
      values (${t1Row}::uuid, ${tenant}::uuid, ${patient}::uuid, ${t1}::uuid, ${reception}::uuid)`);
    await db.execute(raw`insert into patient_care_team (id, tenant_id, patient_id, user_id, assigned_by)
      values (${t4Row}::uuid, ${tenant}::uuid, ${patient}::uuid, ${t4}::uuid, ${reception}::uuid)`);
    await db.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
      values (${patientQ}::uuid, ${tenant}::uuid, 'Paciente Care02a Q', ${loc2}::uuid, ${reception}::uuid)`);
    await db.execute(raw`insert into patient_care_team (id, tenant_id, patient_id, user_id, assigned_by)
      values (${qT4Row}::uuid, ${tenant}::uuid, ${patientQ}::uuid, ${t4}::uuid, ${reception}::uuid),
             (${qT1Row}::uuid, ${tenant}::uuid, ${patientQ}::uuid, ${t1}::uuid, ${reception}::uuid)`);
    await db.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
      values (${patientH}::uuid, ${tenant}::uuid, 'Paciente Care02a H', ${loc}::uuid, ${reception}::uuid),
             (${patientY2}::uuid, ${tenant}::uuid, 'Paciente Care02a Y2', ${loc2}::uuid, ${reception}::uuid),
             (${patientX2}::uuid, ${tenant}::uuid, 'Paciente Care02a X2', ${loc}::uuid, ${reception}::uuid)`);
    await db.execute(raw`insert into appointments (id, tenant_id, patient_id, patient_2_id, practitioner_id, location_id,
                                                   starts_at, ends_at, status)
      values (${sharedAppointment}::uuid, ${tenant}::uuid, ${patientH}::uuid, ${patientY2}::uuid, ${t2}::uuid, ${loc}::uuid,
              '2026-09-04T10:00:00Z'::timestamptz, '2026-09-04T10:45:00Z'::timestamptz, 'completed'::appointment_status),
             (${x2Appointment}::uuid, ${tenant}::uuid, ${patientX2}::uuid, null, ${t4}::uuid, ${loc2}::uuid,
              '2026-09-04T11:00:00Z'::timestamptz, '2026-09-04T11:45:00Z'::timestamptz, 'completed'::appointment_status)`);
    await db.execute(raw`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by)
      values (${tenant}::uuid, ${patientY2}::uuid, ${t1}::uuid, ${reception}::uuid),
             (${tenant}::uuid, ${patientY2}::uuid, ${t4}::uuid, ${reception}::uuid),
             (${tenant}::uuid, ${patientX2}::uuid, ${t1}::uuid, ${reception}::uuid)`);

    state = await (await import("./care-team-0098-state")).care0098State(db);
    console.warn(`[care-team-reads.db.test] ${state.detail}`);
  });

  afterAll(async () => {
    if (!db) return;
    acting.ctx = null;
    await db.execute(raw`delete from audit_log where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patient_care_team where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from attachments where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from clinical_records where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from clinical_episodes where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from appointments where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from staff_locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  // ------------------------------------------------------------ the fixture
  it("REPORTS WHICH 0098 THIS DATABASE HAS, read from the catalogue; never half, never unapplied once promoted", async ({ annotate }) => {
    // care0098State THROWS in beforeAll for a half-applied database, or for one
    // without 0098 once it is promoted, so reaching here means one of the two
    // whole profiles. The line names which, in the log and on the test.
    await annotate(state.detail, state.applied ? "notice" : "warning");
    expect(state.applied || !state.promoted).toBe(true);
  });

  it("THE FIXTURE IS WHAT THE ARMS CLAIM: T2's appointment at LV and registo, T1 and T4 live on P's team, Q linked to LV2 only; Y2 at LV only in the second slot, X2's own appointment at LV2", async () => {
    const [e] = rowsOf(await db.execute(raw`select
        (select count(*) from appointments where patient_id = ${patientY2}::uuid)::int as y2_first,
        (select array_agg(location_id::text) from appointments where patient_2_id = ${patientY2}::uuid) as y2_second_at,
        (select primary_location_id::text from patients where id = ${patientY2}::uuid) as y2_primary,
        (select array_agg(user_id::text order by user_id) from patient_care_team
           where patient_id = ${patientY2}::uuid and removed_at is null) as y2_team,
        (select array_agg(location_id::text) from appointments
           where patient_id = ${patientX2}::uuid or patient_2_id = ${patientX2}::uuid) as x2_at,
        (select primary_location_id::text from patients where id = ${patientX2}::uuid) as x2_primary,
        (select array_agg(user_id::text order by user_id) from patient_care_team
           where patient_id = ${patientX2}::uuid and removed_at is null) as x2_team,
        (select count(*) from appointments
           where (patient_id in (${patientY2}::uuid, ${patientX2}::uuid) or patient_2_id in (${patientY2}::uuid, ${patientX2}::uuid))
             and (practitioner_id = ${t1}::uuid or practitioner_2_id = ${t1}::uuid))::int as t1_treats_edges,
        (select count(*) from appointments
           where (patient_id = ${patientY2}::uuid or patient_2_id = ${patientY2}::uuid)
             and (practitioner_id = ${t4}::uuid or practitioner_2_id = ${t4}::uuid))::int as t4_treats_y2`));
    expect(e).toEqual({
      y2_first: 0, y2_second_at: [loc], y2_primary: loc2, y2_team: [t1, t4].sort(),
      x2_at: [loc2], x2_primary: loc, x2_team: [t1],
      t1_treats_edges: 0, t4_treats_y2: 0,
    });

    const [f] = rowsOf(await db.execute(raw`select
        (select count(*) from appointments where patient_id = ${patient}::uuid and practitioner_id = ${t2}::uuid
           and location_id = ${loc}::uuid)::int as t2_appts,
        (select count(*) from appointments where patient_id = ${patient}::uuid
           and (practitioner_id in (${t1}::uuid, ${t3}::uuid, ${t4}::uuid)
             or practitioner_2_id in (${t1}::uuid, ${t3}::uuid, ${t4}::uuid)))::int as t1_t3_t4_appts,
        (select count(*) from appointments where patient_id = ${patient}::uuid and location_id = ${loc2}::uuid)::int as p_at_lv2,
        (select primary_location_id::text from patients where id = ${patient}::uuid) as p_primary,
        (select count(*) from clinical_records where patient_id = ${patient}::uuid)::int as registos,
        (select array_agg(user_id::text order by user_id) from patient_care_team
           where patient_id = ${patient}::uuid and removed_at is null) as team,
        (select array_agg(location_id::text) from staff_locations where user_id = ${t4}::uuid) as t4_at,
        (select count(*) from appointments where patient_id = ${patientQ}::uuid or patient_2_id = ${patientQ}::uuid)::int as q_appts,
        (select primary_location_id::text from patients where id = ${patientQ}::uuid) as q_primary,
        (select array_agg(user_id::text order by user_id) from patient_care_team
           where patient_id = ${patientQ}::uuid and removed_at is null) as q_team`));
    expect(f).toEqual({
      t2_appts: 1, t1_t3_t4_appts: 0, p_at_lv2: 0, p_primary: loc, registos: 1,
      team: [t1, t4].sort(), t4_at: [loc2],
      q_appts: 0, q_primary: loc2, q_team: [t1, t4].sort(),
    });
  });

  // ------------------------------------------------ B1: patients_select
  describe("B1 the ficha: patients_select's therapist arm gains the care team", () => {
    it("0098: T1 (assigned-only, at P's clinic) reads the patient row under RLS alone (without 0098: 0)", async () => {
      expect(await count(t1, "therapist", raw`select count(*)::int as n from patients where id = ${patient}::uuid`)).toBe(owed(1, 0));
    });

    it("T2 (treats) reads it; T3 (not assigned) reads 0 while reception reads 1 (the control)", async () => {
      const q = raw`select count(*)::int as n from patients where id = ${patient}::uuid`;
      expect(await count(t2, "therapist", q)).toBe(1);
      expect(await count(reception, "reception", q)).toBe(1);
      expect(await count(t3, "therapist", q)).toBe(0);
    });
  });

  // ------------------------------------------------ B2: clinical_records
  describe("B2 the registos: SELECT widens, INSERT, UPDATE and DELETE do not", () => {
    it("0098: T1 reads T2's registo under RLS alone (without 0098: 0)", async () => {
      expect(await count(t1, "therapist", raw`select count(*)::int as n from clinical_records where id = ${registo}::uuid`)).toBe(owed(1, 0));
    });

    it("T3 reads 0 of it while the owner reads 1 (the control)", async () => {
      const q = raw`select count(*)::int as n from clinical_records where id = ${registo}::uuid`;
      expect(await count(owner, "owner", q)).toBe(1);
      expect(await count(t3, "therapist", q)).toBe(0);
    });

    it("T1's UPDATE of T2's draft registo touches 0 rows, and T2's own UPDATE touches 1 (the control)", async () => {
      // Each inside runScoped's own transaction, and T2's arm is rolled back by
      // throwing, so the registo is untouched for the arms after it.
      const t1Updated = await under(t1, "therapist",
        raw`update clinical_records set data = '{"x":1}'::jsonb where id = ${registo}::uuid returning id`);
      expect(t1Updated).toHaveLength(0);

      const rollback = new Error("rollback");
      let t2Updated = -1;
      await expect(
        runScoped(ctx(t2, "therapist"), async (tx) => {
          t2Updated = rowsOf(await tx.execute(
            raw`update clinical_records set data = '{"x":1}'::jsonb where id = ${registo}::uuid returning id`)).length;
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(t2Updated).toBe(1);
    });

    it("T1's DELETE of T2's registo touches 0 rows", async () => {
      const deleted = await under(t1, "therapist",
        raw`delete from clinical_records where id = ${registo}::uuid returning id`);
      expect(deleted).toHaveLength(0);
      const [still] = rowsOf(await db.execute(raw`select count(*)::int as n from clinical_records where id = ${registo}::uuid`));
      expect(still!.n).toBe(1);
    });

    /**
     * THE INSERT ARM IS PROVEN THROUGH THE HELPER, NOT THROUGH THE AUTHOR ARM.
     * clinical_records_insert (0045) admits a therapist on EITHER
     * `practitioner_id = auth.uid()` OR clinical_therapist_sees_patient(). The
     * author arm admits ANY therapist filing a registo in their own name, for
     * any patient of the tenant, and has since 0045: measured here, T3 (not
     * assigned) is admitted exactly as T1 is, so it says nothing about 0098.
     * The helper arm is the one a care-team disjunct would have widened, and it
     * is reached by filing under ANOTHER practitioner's name: T2 (who treats)
     * is admitted that way, T1 and T3 are not.
     */
    it("INSERT: the care team adds nothing. Filing under another therapist's name: T2 admitted, T1 and T3 refused", async () => {
      const fileAs = (author: string) =>
        raw`insert into clinical_records (tenant_id, patient_id, practitioner_id, status)
            values (${tenant}::uuid, ${patient}::uuid, ${author}::uuid, 'draft')`;
      expect(await outcome(t2, "therapist", fileAs(t3))).toBe("admitted");
      expect(await outcome(t1, "therapist", fileAs(t2))).toBe("refused");
      expect(await outcome(t3, "therapist", fileAs(t2))).toBe("refused");
    });

    it("INSERT in one's own name is the same answer for T1 and T3 (0045's author arm, not 0098)", async () => {
      const own = (author: string) =>
        raw`insert into clinical_records (tenant_id, patient_id, practitioner_id, status)
            values (${tenant}::uuid, ${patient}::uuid, ${author}::uuid, 'draft')`;
      expect(await outcome(t1, "therapist", own(t1))).toBe(await outcome(t3, "therapist", own(t3)));
    });
  });

  // ------------------------------------------------ B3: care-team insert
  describe("B3 patient_care_team_insert: a therapist writes their own booking's row, and only that", () => {
    const tryInsert = (userId: string, role: Role, rowUser: string, assignedBy: string) =>
      outcome(userId, role, raw`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by)
        values (${tenant}::uuid, ${patient}::uuid, ${rowUser}::uuid, ${assignedBy}::uuid)`);

    it("0098: T2 (treats the patient) may insert their OWN row, assigned by themselves (without 0098: refused)", async () => {
      expect(await tryInsert(t2, "therapist", t2, t2)).toBe(owed("admitted", "refused"));
    });

    it("T2 may NOT insert a row for another user (T3)", async () => {
      expect(await tryInsert(t2, "therapist", t3, t2)).toBe("refused");
    });

    it("T2 may NOT write their own row claiming somebody else assigned it", async () => {
      expect(await tryInsert(t2, "therapist", t2, reception)).toBe("refused");
    });

    it("T3 may NOT insert their own row for a patient they do not treat", async () => {
      expect(await tryInsert(t3, "therapist", t3, t3)).toBe("refused");
    });

    it("reception and the owner keep what they had (any row); admin stays excluded", async () => {
      expect(await tryInsert(reception, "reception", t3, reception)).toBe("admitted");
      expect(await tryInsert(owner, "owner", t3, owner)).toBe("admitted");
      expect(await tryInsert(admin, "admin", t3, admin)).toBe("refused");
    });

    /**
     * THE THERAPIST ARM'S ROLE GUARD. The admin is given a booking with the
     * patient for this arm alone (removed after it), which puts the patient in
     * the admin's viewer_treated_patient_ids(): the therapist arm's last
     * conjunct. The row is the admin's own and names the admin as assigner, so
     * the role guard is the ONLY thing left to refuse it, and the premise is
     * asserted first, or the refusal would say nothing. Rehearsal mutation CI07
     * dropped that guard; before this arm no DB-gated suite saw it, and a
     * bookable admin wrote their own row. Refused with 0098 by the guard, and
     * without 0098 by 0091's owner-and-reception-only policy.
     */
    it("an ADMIN who treats the patient may NOT insert their own row, even assigned by themselves: only a THERAPIST's own booking row is admitted", async () => {
      const adminAppointment = randomUUID();
      await db.execute(raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                                     starts_at, ends_at, status)
        values (${adminAppointment}::uuid, ${tenant}::uuid, ${patient}::uuid, ${admin}::uuid, ${loc}::uuid,
                '2026-09-03T10:00:00Z'::timestamptz, '2026-09-03T10:45:00Z'::timestamptz, 'completed'::appointment_status)`);
      try {
        const [premise] = await under(admin, "admin",
          raw`select ${patient}::uuid = any (public.viewer_treated_patient_ids()) as treats`);
        expect(premise!.treats).toBe(true);
        expect(await tryInsert(admin, "admin", admin, admin)).toBe("refused");
      } finally {
        await db.execute(raw`delete from appointments where id = ${adminAppointment}::uuid`);
      }
    });
  });

  // ------------------------------------------------ B4: care-team select
  describe("B4 patient_care_team_select: a therapist reads the teams they are on", () => {
    const teamOf = raw`select count(*)::int as n from patient_care_team where patient_id = ${patient}::uuid`;

    it("0098: T1 (on the team, at P's clinic) reads the team's rows, including a colleague's (without 0098: none)", async () => {
      // A second live member, so "sees who else is on it" is a colleague's row
      // and not only T1's own. Written by reception, removed at the end.
      const t3Row = randomUUID();
      await db.execute(raw`insert into patient_care_team (id, tenant_id, patient_id, user_id, assigned_by)
        values (${t3Row}::uuid, ${tenant}::uuid, ${patient}::uuid, ${t3}::uuid, ${reception}::uuid)`);
      try {
        const seen = await under(t1, "therapist",
          raw`select user_id::text as user_id from patient_care_team where patient_id = ${patient}::uuid order by user_id`);
        expect(seen.map((r) => r.user_id)).toEqual(owed([t1, t3, t4].sort(), []));
      } finally {
        await db.execute(raw`delete from patient_care_team where id = ${t3Row}::uuid`);
      }
    });

    it("T2 (treats, not on the team) and T3 (not assigned) read 0 rows while reception reads the whole team", async () => {
      expect(await count(reception, "reception", teamOf)).toBe(2);
      expect(await count(t2, "therapist", teamOf)).toBe(0);
      expect(await count(t3, "therapist", teamOf)).toBe(0);
    });

    it("admin still reads 0 rows, as 0091 ruled", async () => {
      expect(await count(admin, "admin", teamOf)).toBe(0);
    });
  });

  // ------------------------------------------------ B6: the app's two scopes
  describe("B6 the app: readers take the care-team scope, writers keep the narrow one", () => {
    it("0098: getPatient for a READ admits T1 (without 0098: null); the default (a write's) never does", async () => {
      as(t1, "therapist");
      expect((await queries.getPatient(patient, { includeDeleted: true, access: "read" }))?.id ?? null).toBe(owed(patient, null));
      expect(await queries.getPatient(patient, { includeDeleted: true })).toBeNull();
    });

    it("getPatient: T2 is admitted either way, T3 neither way", async () => {
      as(t2, "therapist");
      expect((await queries.getPatient(patient, { access: "read" }))?.id).toBe(patient);
      expect((await queries.getPatient(patient))?.id).toBe(patient);
      as(t3, "therapist");
      expect(await queries.getPatient(patient, { access: "read" })).toBeNull();
      expect(await queries.getPatient(patient)).toBeNull();
    });

    it("0098: the /patients list shows T1 the patient (without 0098: not); T3 never sees it", async () => {
      const filters = { q: "", locationId: null, upcomingOnly: false, sort: "name" as const, dir: "asc" as const, page: 1 };
      const idsFor = async (userId: string) =>
        (await listQueries.listPatientsPage(filters, ctx(userId, "therapist"))).rows.map((r) => r.id);
      expect((await idsFor(t1)).includes(patient)).toBe(owed(true, false));
      expect(await idsFor(t3)).not.toContain(patient);
    });

    it("the booking and new-registo PICKER (searchPatients) stays narrow: T1 does not find the patient, T2 does", async () => {
      as(t1, "therapist");
      expect((await queries.searchPatients("Care02a")).map((p) => p.id)).not.toContain(patient);
      as(t2, "therapist");
      expect((await queries.searchPatients("Care02a")).map((p) => p.id)).toContain(patient);
    });

    it("0098: the registos list and detail read for T1 (without 0098: neither); T3 reads neither", async () => {
      expect((await records.listRecords(ctx(t1, "therapist"), { patientId: patient })).map((r) => r.id)).toEqual(owed([registo], []));
      expect((await records.getRecordDetail(ctx(t1, "therapist"), registo))?.id ?? null).toBe(owed(registo, null));
      expect(await records.listRecords(ctx(t3, "therapist"), { patientId: patient })).toEqual([]);
      expect(await records.getRecordDetail(ctx(t3, "therapist"), registo)).toBeNull();
    });

    it("the new-registo patient list (clinical listPatients) stays narrow: T1 is not offered the patient", async () => {
      expect((await records.listPatients(ctx(t1, "therapist"))).map((p) => p.id)).not.toContain(patient);
      expect((await records.listPatients(ctx(t2, "therapist"))).map((p) => p.id)).toContain(patient);
    });

    it("0098: the Documentos list reads for T1 (attachments RLS is tenant-only, so this is the app scope alone; without 0098 the app scope is the narrow one and T1 reads nothing); T3 reads nothing", async () => {
      expect((await documents.listPatientDocuments(ctx(t1, "therapist"), patient)).map((r) => r.id)).toEqual(owed([documentId], []));
      expect(await documents.listPatientDocuments(ctx(t3, "therapist"), patient)).toEqual([]);
    });

    it("a document UPLOAD stays narrow although 0098 widens patients_select: T1 is refused, T2 is not", async () => {
      const file = { mimeType: "application/pdf", sizeBytes: 1000 };
      await expect(
        documents.createPatientDocumentUploadUrl(ctx(t1, "therapist"), patient, "x.pdf", file),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        documents.createPatientDocumentUploadUrl(ctx(t2, "therapist"), patient, "x.pdf", file),
      ).resolves.toMatchObject({ token: "tok" });
    });
  });

  // ------------------------------------------------ B6: the registo writers
  /**
   * NO WRITE WIDENS, THROUGH THE APP. Each writer below gated on nothing but
   * "the source registo (or the patient) is SELECT-visible", and then wrote
   * somewhere whose own policy admits any therapist: a new version
   * (clinical_records_insert's author arm), an annulment (record_annulments is
   * tenant-only), an attachment on a draft or an episode (tenant-only). 0098
   * widens the SELECT, so without therapistRegistoWriteScope and the narrow
   * patient check each of these would now succeed for T1. They pass on a
   * database with or without 0098; what they catch is the app losing the gate.
   */
  describe("B6 the registo writers stay at their pre-0098 reach: T1 reads the registo and writes nothing", () => {
    it("canWriteRecord: T1 false, T2 and the owner true (the registo page's write controls follow it)", async () => {
      expect(await records.canWriteRecord(ctx(t1, "therapist"), registo)).toBe(false);
      expect(await records.canWriteRecord(ctx(t2, "therapist"), registo)).toBe(true);
      expect(await records.canWriteRecord(ctx(owner, "owner"), registo)).toBe(true);
    });

    it("a NEW VERSION of T2's registo is refused to T1", async () => {
      await expect(records.createAddendum(ctx(t1, "therapist"), registo)).rejects.toMatchObject({ code: "not_found" });
    });

    it("ANULAR is refused to T1 before the status is even read", async () => {
      await expect(records.annulRecord(ctx(t1, "therapist"), registo, null)).rejects.toMatchObject({ code: "not_found" });
    });

    it("SAVING T2's draft is refused to T1, instead of a 0-row UPDATE and an audit row", async () => {
      await expect(records.updateRecordData(ctx(t1, "therapist"), registo, {})).rejects.toMatchObject({ code: "not_found" });
    });

    it("an ATTACHMENT on T2's draft: refused to T1, minted for T2 (the control)", async () => {
      const file = { mimeType: "application/pdf", sizeBytes: 1000 };
      await expect(
        storage.createAttachmentUploadUrl(ctx(t1, "therapist"), registo, "x.pdf", file),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        storage.createAttachmentUploadUrl(ctx(t2, "therapist"), registo, "x.pdf", file),
      ).resolves.toMatchObject({ token: "tok" });
    });

    it("a NEW EPISODE for the patient: refused to T1, opened for T2 (the control)", async () => {
      await expect(
        episodes.createEpisode(ctx(t1, "therapist"), { patientId: patient, title: "Episodio T1" }),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        episodes.createEpisode(ctx(t2, "therapist"), { patientId: patient, title: "Episodio T2" }),
      ).resolves.toMatchObject({ id: expect.any(String) });
    });

    it("none of T1's refused attempts left a row: no version, no annulment, no episode, no audit", async () => {
      const [r] = rowsOf(await db.execute(raw`select
          (select count(*) from clinical_records where tenant_id = ${tenant}::uuid and practitioner_id = ${t1}::uuid)::int as versions,
          (select count(*) from record_annulments where tenant_id = ${tenant}::uuid)::int as annulments,
          (select count(*) from clinical_episodes where tenant_id = ${tenant}::uuid and primary_practitioner_id = ${t1}::uuid)::int as episodes,
          (select count(*) from audit_log where tenant_id = ${tenant}::uuid and actor_user_id = ${t1}::uuid)::int as audits`));
      expect(r).toEqual({ versions: 0, annulments: 0, episodes: 0, audits: 0 });
    });
  });

  // ------------------------------------------------ B8: the read-only card's list
  describe("B8 the ficha's read-only card: shown to a therapist only when the list names them", () => {
    it("0098: T1 reads the whole live team, and it names T1 (without 0098: null, no card)", async () => {
      const team = await careTeam.listCareTeamForTherapist(ctx(t1, "therapist"), patient);
      expect(team?.map((m) => m.userId).sort() ?? null).toEqual(owed([t1, t4].sort(), null));
      if (state.applied) expect(team?.every((m) => m.source === "manual")).toBe(true);
    });

    it("T2 (treats, not on the team) and T3 get null, so no card says nobody is assigned", async () => {
      expect(await careTeam.listCareTeamForTherapist(ctx(t2, "therapist"), patient)).toBeNull();
      expect(await careTeam.listCareTeamForTherapist(ctx(t3, "therapist"), patient)).toBeNull();
    });

    it("reception reads the same list through the managing path (the control)", async () => {
      expect((await careTeam.listCareTeam(ctx(reception, "reception"), patient)).map((m) => m.userId).sort()).toEqual([t1, t4].sort());
    });
  });

  // ------------------------------------------------ B9: the clinic limit
  /**
   * THE OWNER'S RULING OF 2026-09-27, "limit to their clinic only". T4 is on P's
   * live care team but installed only at LV2, and P has no link to LV2 (its one
   * appointment and its primary clinic are LV). So T4 reads NOTHING of P: not
   * the ficha, not the registos, not the colleagues on the team, not the
   * Documentos, and no card. Every zero is paired with a principal reading the
   * same row, and T4 is paired with Q, which T4 DOES read at their own clinic.
   *
   * On a database without 0098 the zeros are the same (T4 never read P), but
   * they prove nothing about the limit; the Q arms are what flip, and the
   * report test says which database this was.
   */
  describe("B9 the clinic limit: a care-team therapist reads nothing of a team patient with no link to their clinics", () => {
    const qRow = raw`select count(*)::int as n from patients where id = ${patientQ}::uuid`;

    it("RLS: T4 reads 0 of P and 0 of its registo, while T1 (same team, P's clinic) and the owner read them", async () => {
      const pRow = raw`select count(*)::int as n from patients where id = ${patient}::uuid`;
      const rRow = raw`select count(*)::int as n from clinical_records where patient_id = ${patient}::uuid`;
      expect(await count(owner, "owner", pRow)).toBe(1);
      expect(await count(owner, "owner", rRow)).toBe(1);
      expect(await count(t1, "therapist", pRow)).toBe(owed(1, 0));
      expect(await count(t1, "therapist", rRow)).toBe(owed(1, 0));
      expect(await count(t4, "therapist", pRow)).toBe(0);
      expect(await count(t4, "therapist", rRow)).toBe(0);
    });

    it("0098: the POSITIVE CONTROL for T4: T4 reads Q, a team patient linked to T4's own clinic (0045's fallback) (without 0098: 0)", async () => {
      expect(await count(reception, "reception", qRow)).toBe(1);
      expect(await count(t4, "therapist", qRow)).toBe(owed(1, 0));
    });

    it("the limit cuts both ways: T1, on Q's team but installed only at LV, reads 0 of Q", async () => {
      expect(await count(t1, "therapist", qRow)).toBe(0);
    });

    // THE BASIS'S EDGES (Y2 and X2, see the fixture). Each zero is paired with
    // reception at LV reading the same patient, and with the same therapist
    // reading a team patient that IS linked to their clinic (P for T1), so the
    // zero is the basis refusing and not an empty fixture or a dead helper.
    const readsOf = (id: string) => raw`select count(*)::int as n from patients where id = ${id}::uuid`;

    it("THE SLOT RULE: T1 (at LV, on Y2's team) reads 0 of Y2, who is at LV only as the SECOND participant of a booking; reception at LV reads Y2 (the control)", async () => {
      expect(await count(reception, "reception", readsOf(patientY2))).toBe(1);
      expect(await count(t1, "therapist", readsOf(patient))).toBe(owed(1, 0));
      expect(await count(t1, "therapist", readsOf(patientY2))).toBe(0);
    });

    it("0098: THE FALLBACK GATE READS THE FIRST SLOT ONLY: T4 (at LV2, on Y2's team) reads Y2 through Y2's primary clinic, although Y2 is the second participant of a located booking (without 0098: 0)", async () => {
      expect(await count(t4, "therapist", readsOf(patientY2))).toBe(owed(1, 0));
    });

    it("THE FALLBACK GATE: T1 (at LV, on X2's team) reads 0 of X2, whose primary clinic is LV but whose own appointment is at LV2; reception at LV reads X2 (the control)", async () => {
      expect(await count(reception, "reception", readsOf(patientX2))).toBe(1);
      expect(await count(t1, "therapist", readsOf(patient))).toBe(owed(1, 0));
      expect(await count(t1, "therapist", readsOf(patientX2))).toBe(0);
    });

    it("RLS: of P's team T4 reads no colleague's row (at most their own, the writer's own-row term), while T1 reads T4's", async () => {
      const others = (userId: string) =>
        count(userId, "therapist", raw`select count(*)::int as n from patient_care_team
          where patient_id = ${patient}::uuid and user_id <> ${userId}::uuid`);
      expect(await others(t4)).toBe(0);
      expect(await others(t1)).toBe(owed(1, 0));
    });

    it("the app: getPatient (read), the /patients list, the registos and the Documentos show T4 nothing of P", async () => {
      as(t4, "therapist");
      expect(await queries.getPatient(patient, { includeDeleted: true, access: "read" })).toBeNull();
      const filters = { q: "", locationId: null, upcomingOnly: false, sort: "name" as const, dir: "asc" as const, page: 1 };
      expect((await listQueries.listPatientsPage(filters, ctx(t4, "therapist"))).rows.map((r) => r.id)).not.toContain(patient);
      expect(await records.listRecords(ctx(t4, "therapist"), { patientId: patient })).toEqual([]);
      expect(await records.getRecordDetail(ctx(t4, "therapist"), registo)).toBeNull();
      // attachments RLS is tenant-only: THIS is the arm where the app scope is
      // the whole clinic limit. 0091's unlimited helper here would list it.
      expect(await documents.listPatientDocuments(ctx(t4, "therapist"), patient)).toEqual([]);
      // The control: the same reader lists it for T2, who treats P.
      expect((await documents.listPatientDocuments(ctx(t2, "therapist"), patient)).map((r) => r.id)).toEqual([documentId]);
    });

    it("0098: the app's positive control: T4 opens Q's ficha and finds Q in the /patients list (without 0098: neither)", async () => {
      as(t4, "therapist");
      expect((await queries.getPatient(patientQ, { access: "read" }))?.id ?? null).toBe(owed(patientQ, null));
      const filters = { q: "", locationId: null, upcomingOnly: false, sort: "name" as const, dir: "asc" as const, page: 1 };
      expect((await listQueries.listPatientsPage(filters, ctx(t4, "therapist"))).rows.map((r) => r.id).includes(patientQ)).toBe(
        owed(true, false),
      );
    });

    it("the card: T4 gets null for P, and T1 gets null for Q although T1 can read its own row of Q's team", async () => {
      expect(await careTeam.listCareTeamForTherapist(ctx(t4, "therapist"), patient)).toBeNull();
      // Without the whole-team check this is a list that names T1 and nobody
      // else: a confident wrong statement about a team of two.
      expect(await careTeam.listCareTeamForTherapist(ctx(t1, "therapist"), patientQ)).toBeNull();
    });

    it("0098: the card's control: T4 reads Q's whole team, T1 included (without 0098: null)", async () => {
      const team = await careTeam.listCareTeamForTherapist(ctx(t4, "therapist"), patientQ);
      expect(team?.map((m) => m.userId).sort() ?? null).toEqual(owed([t1, t4].sort(), null));
    });
  });
});

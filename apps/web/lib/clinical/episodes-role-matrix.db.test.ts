/**
 * episodes-role-matrix.db.test.ts: 0104 (held), THE APPLICATION'S EPISODE
 * READERS AND WRITERS AGAINST REAL ROWS, UNDER THE POLICIES OF clinical_episodes.
 *
 * packages/db/tests/clinical-episodes-role-matrix.db.test.ts holds the table's
 * own matrix, statement by statement. This suite runs the application's entry
 * points as real principals (`runScoped` sets `role authenticated` and the JWT
 * claims, so every policy runs as on production) and asserts what each screen
 * and each action rests on:
 *
 *   REUSE   a therapist who treats a patient reads a COLLEAGUE'S open episode
 *           of that patient, so `findOpenEpisodeOfSpecialty` reuses it,
 *           "+ Episódio" names it, and the tab lists it;
 *   TITLES  every registo each role reads on the Registos tab comes back with
 *           its episode's title when it has an episode: the owner, an admin of
 *           the patient's clinic, a therapist who treats the patient and a
 *           therapist on the care team at their own clinic;
 *   PAGES   the registo page and the episode page read the same;
 *   REFUSE  the hard delete of a patient whose only reference is an episode,
 *           and the removal of a member of staff whose only activity is an
 *           episode in their name, delete nothing and answer the named refusal
 *           (`has_references`, `has_activity`), asked by an admin with no
 *           clinic assignment.
 *
 * IT ASKS THE SCHEMA WHICH SIDE IT IS ON (episodes-0104-state.ts) and names it
 * in its titles. Every arm here holds on a database with 0104 and on one
 * without it, so none is skipped; where an arm asserts something only 0104
 * makes true, its title and the line say so. A half-applied database, or an
 * unapplied one after 0104 has been promoted, THROWS and fails every arm.
 *
 * WHAT IS STUBBED, AND NONE OF IT IS UNDER TEST: `requireRequestContext`
 * (a vitest worker has no Supabase session) and `next/cache` (it needs a
 * request scope). Everything else is real.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED: a tenant of its own, removed afterwards.
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

type Role = "owner" | "reception" | "therapist" | "admin";

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

import type { RequestContext } from "@osteojp/auth";
import { episodes0104State, type Episodes0104State } from "./episodes-0104-state";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const state: Episodes0104State = live
  ? await episodes0104State((await import("@osteojp/db")).getDbAdmin())
  : { applied: false, promoted: false, side: "no database" };
const SIDE = state.side;

d(`0104: the application's episode readers and writers [${SIDE}]`, () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let runScoped: typeof import("@/lib/auth/context").runScoped;
  let episodes: typeof import("./episodes");
  let records: typeof import("./records");
  let ficha: typeof import("./ficha-groups");
  let patientActions: typeof import("@/lib/patients/actions");
  let staff: typeof import("@/lib/admin/staff");
  let password: string;

  const tenant = randomUUID();
  const clinicA = randomUUID();
  const roleOwner = randomUUID();
  const roleAdmin = randomUUID();
  const roleTherapist = randomUUID();
  const owner = randomUUID();
  const adminA = randomUUID(); // installed at clinic A, where P is seen
  const adminNone = randomUUID(); // an admin with no clinic assignment
  const t1 = randomUUID(); // treats P
  const t2 = randomUUID(); // the colleague: treats P, and the two episodes of P name them
  const tCare = randomUUID(); // on P's care team at clinic A, no appointment with P
  const tLeft = randomUUID(); // a member of staff whose only activity is the episode of Z
  const p = randomUUID();
  const z = randomUUID(); // no appointment, no clinic: its only reference is one episode
  const epOpen = randomUUID(); // P's open app episode, opened by t2
  const epOld = randomUUID(); // P's closed episode
  const epZ = randomUUID(); // Z's, in tLeft's name, holding no registo
  const rOpen = randomUUID();
  const rOld = randomUUID();
  const rFree = randomUUID(); // no episode

  const OPEN_TITLE = "Osteopatia (01/09/2026)";

  const ctx = (userId: string, role: Role): RequestContext => ({ tenantId: tenant, role, userId });
  async function as<T>(userId: string, role: Role, fn: () => Promise<T>): Promise<T> {
    acting.ctx = { tenantId: tenant, role, userId };
    try {
      return await fn();
    } finally {
      acting.ctx = null;
    }
  }
  /** Every read-back below is on the admin connection, so no policy hides a row from it. */
  const countOf = async (query: ReturnType<typeof raw>): Promise<number> => {
    const rows = (await db.execute(query)) as unknown as { n: number }[];
    return Number(rows[0]!.n);
  };

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ runScoped } = await import("@/lib/auth/context"));
    episodes = await import("./episodes");
    records = await import("./records");
    ficha = await import("./ficha-groups");
    patientActions = await import("@/lib/patients/actions");
    staff = await import("@/lib/admin/staff");
    // The house default: a tenant with no stored hash is checked against it.
    password = (await import("@/lib/admin/appointment-delete-password")).DEFAULT_DELETE_PASSWORD;

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'e104 app', ${`e104a-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(
      raw`insert into roles (id, tenant_id, slug, name) values
            (${roleOwner}::uuid, ${tenant}::uuid, 'owner', 'Owner'),
            (${roleAdmin}::uuid, ${tenant}::uuid, 'admin', 'Admin'),
            (${roleTherapist}::uuid, ${tenant}::uuid, 'therapist', 'Therapist')`,
    );
    for (const [id, role, label] of [
      [owner, roleOwner, "owner"],
      [adminA, roleAdmin, "admin-a"],
      [adminNone, roleAdmin, "admin-none"],
      [t1, roleTherapist, "t1"],
      [t2, roleTherapist, "t2"],
      [tCare, roleTherapist, "t-care"],
      [tLeft, roleTherapist, "t-left"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, role_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${role}::uuid, ${`${label}-${id.slice(0, 8)}@e104.invalid`}, ${label})`,
      );
    }
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${clinicA}::uuid, ${tenant}::uuid, 'Clinica A E104')`,
    );
    for (const id of [adminA, t1, t2, tCare]) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${id}::uuid, ${clinicA}::uuid)`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by) values
            (${p}::uuid, ${tenant}::uuid, 'Paciente P Inventado', ${clinicA}::uuid, ${owner}::uuid),
            (${z}::uuid, ${tenant}::uuid, 'Paciente Z Inventado', null, ${owner}::uuid)`,
    );
    for (const therapist of [t1, t2]) {
      await db.execute(
        raw`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
            values (${tenant}::uuid, ${p}::uuid, ${therapist}::uuid, ${clinicA}::uuid,
                    '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z')`,
      );
    }
    await db.execute(
      raw`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by)
          values (${tenant}::uuid, ${p}::uuid, ${tCare}::uuid, ${owner}::uuid)`,
    );
    await db.execute(
      raw`insert into clinical_episodes (id, tenant_id, patient_id, primary_practitioner_id, title, status) values
            (${epOpen}::uuid, ${tenant}::uuid, ${p}::uuid, ${t2}::uuid, ${OPEN_TITLE}, 'open'),
            (${epOld}::uuid,  ${tenant}::uuid, ${p}::uuid, ${t2}::uuid, 'Fisioterapia', 'closed'),
            (${epZ}::uuid,    ${tenant}::uuid, ${z}::uuid, ${tLeft}::uuid, 'Osteopatia (02/09/2026)', 'open')`,
    );
    await db.execute(
      raw`insert into clinical_records (id, tenant_id, patient_id, episode_id, practitioner_id, source, status, created_at, data) values
            (${rOld}::uuid,  ${tenant}::uuid, ${p}::uuid, ${epOld}::uuid,  ${t2}::uuid, 'manual', 'draft', '2025-01-20T09:00:00Z', '{}'::jsonb),
            (${rOpen}::uuid, ${tenant}::uuid, ${p}::uuid, ${epOpen}::uuid, ${t2}::uuid, 'manual', 'draft', '2026-09-01T09:00:00Z', '{}'::jsonb),
            (${rFree}::uuid, ${tenant}::uuid, ${p}::uuid, null,            ${t1}::uuid, 'manual', 'draft', '2026-09-02T09:00:00Z', '{}'::jsonb)`,
    );
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. FK order. */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from clinical_records where tenant_id = ${tenant}::uuid`,
      raw`delete from clinical_episodes where tenant_id = ${tenant}::uuid`,
      raw`delete from patient_care_team where tenant_id = ${tenant}::uuid`,
      raw`delete from appointments where tenant_id = ${tenant}::uuid`,
      raw`delete from patient_locations where tenant_id = ${tenant}::uuid`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from staff_locations where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
      raw`delete from roles where tenant_id = ${tenant}::uuid`,
      raw`delete from tenants where id = ${tenant}::uuid`,
    ];
    let first: unknown = null;
    for (const statement of statements) {
      try {
        await db.execute(statement);
      } catch (err) {
        first ??= err;
      }
    }
    if (first) throw first;
  });

  it(`reports the side it ran on: ${SIDE}`, () => {
    console.info(`[episodes-role-matrix] ${SIDE}${state.promoted ? " (promoted)" : ""}`);
    expect(typeof state.applied).toBe("boolean");
  });

  /* ---- REUSE: the read set contains the write set ----------------------- */
  it(`${SIDE}: a therapist who treats the patient reads a colleague's open episode, and findOpenEpisodeOfSpecialty reuses it`, async () => {
    const me = ctx(t1, "therapist");
    const found = await runScoped(me, (tx) => episodes.findOpenEpisodeOfSpecialty(tx, me, p, "Osteopatia"));
    expect(found).toBe(epOpen);
    // Its own practitioner is the colleague: the read is by patient, not by practitioner.
    expect(
      await countOf(raw`select count(*)::int as n from clinical_episodes where id = ${epOpen}::uuid and primary_practitioner_id = ${t2}::uuid`),
    ).toBe(1);
  });

  it(`${SIDE}: "+ Episódio" for that therapist names the colleague's open episode and opens no second one`, async () => {
    const before = await countOf(raw`select count(*)::int as n from clinical_episodes where patient_id = ${p}::uuid`);
    const result = await episodes.createEpisode(ctx(t1, "therapist"), { patientId: p, specialty: "Osteopatia" });
    expect(result).toEqual({ kind: "open_exists", episodeId: epOpen });
    expect(await countOf(raw`select count(*)::int as n from clinical_episodes where patient_id = ${p}::uuid`)).toBe(before);
  });

  it(`${SIDE}: the Registos tab lists that open episode for the therapist who may write there`, async () => {
    const open = await episodes.listOpenAppEpisodes(ctx(t1, "therapist"), p);
    expect(open.map((e) => e.id)).toEqual([epOpen]);
  });

  /* ---- TITLES: every registo read comes with its episode ---------------- */
  for (const [label, user, role] of [
    ["the owner", owner, "owner"],
    ["an admin of the patient's clinic", adminA, "admin"],
    ["a therapist who treats the patient", t1, "therapist"],
    ["a therapist on the care team at their own clinic", tCare, "therapist"],
  ] as const) {
    it(`${SIDE}: ${label} reads every registo on the Registos tab with its episode's title`, async () => {
      const rows = await ficha.listFichaRecords(ctx(user, role), { patientId: p });
      // Not vacuous: all three registos are read, two of them in an episode.
      expect(rows.map((r) => r.id)).toEqual([rOld, rOpen, rFree]);
      const titles = Object.fromEntries(rows.map((r) => [r.id, r.episodeTitle]));
      expect(titles).toEqual({ [rOld]: "Fisioterapia", [rOpen]: OPEN_TITLE, [rFree]: null });
    });
  }

  /* ---- PAGES ------------------------------------------------------------- */
  it(`${SIDE}: the registo page shows an admin of the patient's clinic the episode's title`, async () => {
    const detail = await records.getRecordDetail(ctx(adminA, "admin"), rOpen);
    expect(detail?.episodeTitle).toBe(OPEN_TITLE);
  });

  it(`${SIDE}: the episode page opens for the owner and for an admin of the patient's clinic${state.applied ? ", and is not found for an admin with no clinic" : ""}`, async () => {
    expect((await episodes.getEpisodeDetail(ctx(owner, "owner"), epOpen))?.id).toBe(epOpen);
    expect((await episodes.getEpisodeDetail(ctx(adminA, "admin"), epOpen))?.id).toBe(epOpen);
    // 0104's own answer; the two reads above are its positive controls.
    if (state.applied) expect(await episodes.getEpisodeDetail(ctx(adminNone, "admin"), epOpen)).toBeNull();
  });

  it(`${SIDE}: the new-registo picker offers a therapist the open episode of a patient they treat, and none of a patient they do not`, async () => {
    const offered = (await records.listEpisodesForPicker(ctx(t1, "therapist"))).map((e) => e.id);
    expect(offered).toContain(epOpen);
    expect(offered).not.toContain(epZ);
    // Not vacuous: Z's open episode exists, and the owner is offered it.
    expect((await records.listEpisodesForPicker(ctx(owner, "owner"))).map((e) => e.id)).toContain(epZ);
  });

  /* ---- REFUSE: the two deletes name the reference ------------------------ */
  it(`${SIDE}: the hard delete of a patient whose only reference is an episode is refused as has_references, asked by an admin with no clinic, and deletes nothing`, async () => {
    // Not vacuous: the patient has exactly one episode and no registo.
    expect(await countOf(raw`select count(*)::int as n from clinical_episodes where patient_id = ${z}::uuid`)).toBe(1);
    expect(await countOf(raw`select count(*)::int as n from clinical_records where patient_id = ${z}::uuid`)).toBe(0);

    const result = await as(adminNone, "admin", () => patientActions.hardDeletePatient(z, password));
    expect(result).toEqual({ ok: false, error: "has_references" });

    expect(await countOf(raw`select count(*)::int as n from patients where id = ${z}::uuid`)).toBe(1);
    expect(await countOf(raw`select count(*)::int as n from clinical_episodes where id = ${epZ}::uuid`)).toBe(1);
    expect(
      await countOf(
        raw`select count(*)::int as n from audit_log
             where tenant_id = ${tenant}::uuid and action = 'patient.hard_delete' and entity_id = ${z}::uuid`,
      ),
    ).toBe(0);
  });

  it(`${SIDE}: the removal of a member of staff whose only activity is an episode in their name is refused as has_activity, asked by an admin with no clinic, and deletes nothing`, async () => {
    // Not vacuous: one episode names them, and nothing else does.
    expect(
      await countOf(raw`select count(*)::int as n from clinical_episodes where primary_practitioner_id = ${tLeft}::uuid`),
    ).toBe(1);
    expect(
      await countOf(
        raw`select (select count(*) from appointments where practitioner_id = ${tLeft}::uuid or created_by = ${tLeft}::uuid)::int
                 + (select count(*) from clinical_records where practitioner_id = ${tLeft}::uuid or signed_by = ${tLeft}::uuid)::int
                 + (select count(*) from audit_log where actor_user_id = ${tLeft}::uuid)::int as n`,
      ),
    ).toBe(0);

    await expect(staff.deleteStaffMember(ctx(adminNone, "admin"), tLeft, password)).rejects.toMatchObject({
      code: "has_activity",
    });

    expect(await countOf(raw`select count(*)::int as n from users where id = ${tLeft}::uuid`)).toBe(1);
    expect(await countOf(raw`select count(*)::int as n from clinical_episodes where id = ${epZ}::uuid`)).toBe(1);
    expect(
      await countOf(
        raw`select count(*)::int as n from audit_log
             where tenant_id = ${tenant}::uuid and action = 'staff.delete' and entity_id = ${tLeft}::uuid`,
      ),
    ).toBe(0);
  });
});

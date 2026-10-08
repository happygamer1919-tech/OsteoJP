/**
 * clinical-episodes-role-matrix.db.test.ts: 0104 (held), the clinical_episodes
 * policies follow the roles, one policy per command. An episode is read on the
 * basis the patient's registos are read on (and by a receptionist of the
 * patient's clinic); a therapist opens one in their own name for a patient they
 * treat or created, and changes one of such a patient; no staff session deletes
 * one.
 *
 * The migration is packages/db/migrations-pending/NEXT-AFTER-0103_clinical_
 * episodes_role_matrix.sql until it is promoted. So this file ASKS THE SCHEMA
 * WHICH SIDE IT IS ON (clinical-episodes-0104-state.ts) and names it in each
 * title. The arms 0104 adds run only on a database that has it, and are skipped
 * on one that does not; the arms that hold on either side run on both. It never
 * skips as a whole on a live database, it THROWS on a database that holds half
 * of 0104, and from the promotion commit on it THROWS on one that lacks it.
 *
 * THE MATRIX. Ten cases, one per kind of staff session, each against one
 * episode, each for the four commands: forty cells, one test each.
 *
 *   case                                         SELECT INSERT UPDATE DELETE
 *   the owner                                      yes    yes    yes    no
 *   an admin, the patient at their clinic          yes    no     no     no
 *   an admin, the patient at another clinic        no     no     no     no
 *   a therapist who treats the patient             yes    yes    yes    no
 *   a therapist of the clinic, no tie to them      no     no     no     no
 *   a therapist, the patient at another clinic     no     no     no     no
 *   a therapist on the care team, own clinic       yes    no     no     no
 *   a receptionist, the patient at their clinic    yes    no     no     no
 *   a receptionist, the patient at another clinic  no     no     no     no
 *   a receptionist with no clinic                  no     no     no     no
 *
 * A "yes" holds on both sides and its cell runs on both. A "no" is 0104's and
 * its cell runs where 0104 is applied. How a "no" answers: a SELECT and an
 * UPDATE touch no row; an INSERT is refused by the policy; a DELETE is refused
 * for want of the privilege. The INSERT cells carry NO RETURNING, so the INSERT
 * policy alone decides them (a RETURNING also puts the new row to the SELECT
 * policy; that has its own arm).
 *
 * Every assertion runs through asRole inside a transaction that always rolls
 * back (rls-harness.ts). The owner connection seeds and cleans only.
 */
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { episodes0104State } from "./clinical-episodes-0104-state";
import { type AppRole, asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

const state = await episodes0104State();
const SIDE = state.side;
/** The arms 0104 adds: run where 0104 is applied, skipped where it is not. */
const it104 = it.skipIf(!state.applied);

const M = {
  tenant: randomUUID(),
  other: randomUUID(),
  locA: randomUUID(),
  locB: randomUUID(),
  owner: randomUUID(),
  adminA: randomUUID(), // an admin installed at clinic A
  recA: randomUUID(), // a receptionist installed at clinic A; registered P
  recNone: randomUUID(), // a receptionist with no clinic assignment
  t1: randomUUID(), // treats P (an appointment at clinic A)
  t2: randomUUID(), // of clinic A; no appointment with P, did not create P; epP2 names them
  t3: randomUUID(), // treats Q and S, at clinic B
  tCare: randomUUID(), // of clinic A; on P's care team; no appointment with P
  tMaker: randomUUID(), // created R; no appointment with anyone
  p: randomUUID(), // at clinic A
  q: randomUUID(), // at clinic B
  r: randomUUID(), // created by tMaker, no appointment, no clinic
  s: randomUUID(), // at clinic B; the merge's source
  x: randomUUID(), // another tenant's patient
  epP: randomUUID(), // P's, in t1's name
  epP2: randomUUID(), // P's, in t2's name: a colleague's episode of a patient t1 treats
  epQ: randomUUID(), // Q's, in t3's name
  epR: randomUUID(), // R's, in tMaker's name
  epS: randomUUID(), // S's, in t3's name
  epX: randomUUID(), // another tenant's
};

const T0 = "2026-03-02T09:00:00Z";
const T1 = "2026-03-02T10:00:00Z";

async function seed(p: Sql): Promise<void> {
  await p`insert into tenants (id, name, slug) values
    (${M.tenant}, 'E104', ${`e104-${M.tenant}`}),
    (${M.other}, 'E104 other', ${`e104o-${M.other}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${M.owner},   ${M.tenant}, ${`ow-${M.owner}@x.pt`},   'Owner'),
    (${M.adminA},  ${M.tenant}, ${`ad-${M.adminA}@x.pt`},  'Admin A'),
    (${M.recA},    ${M.tenant}, ${`ra-${M.recA}@x.pt`},    'Reception A'),
    (${M.recNone}, ${M.tenant}, ${`rn-${M.recNone}@x.pt`}, 'Reception sem clinica'),
    (${M.t1},      ${M.tenant}, ${`t1-${M.t1}@x.pt`},      'Terapeuta 1'),
    (${M.t2},      ${M.tenant}, ${`t2-${M.t2}@x.pt`},      'Terapeuta 2'),
    (${M.t3},      ${M.tenant}, ${`t3-${M.t3}@x.pt`},      'Terapeuta 3'),
    (${M.tCare},   ${M.tenant}, ${`tc-${M.tCare}@x.pt`},   'Terapeuta equipa'),
    (${M.tMaker},  ${M.tenant}, ${`tm-${M.tMaker}@x.pt`},  'Terapeuta registou')`;
  await p`insert into locations (id, tenant_id, name) values
    (${M.locA}, ${M.tenant}, 'E104 A'), (${M.locB}, ${M.tenant}, 'E104 B')`;
  await p`insert into staff_locations (tenant_id, user_id, location_id) values
    (${M.tenant}, ${M.adminA}, ${M.locA}),
    (${M.tenant}, ${M.recA},   ${M.locA}),
    (${M.tenant}, ${M.t1},     ${M.locA}),
    (${M.tenant}, ${M.t2},     ${M.locA}),
    (${M.tenant}, ${M.tCare},  ${M.locA}),
    (${M.tenant}, ${M.t3},     ${M.locB})`;
  await p`insert into patients (id, tenant_id, full_name, created_by) values
    (${M.p}, ${M.tenant}, 'Utente P', ${M.recA}),
    (${M.q}, ${M.tenant}, 'Utente Q', ${M.recA}),
    (${M.r}, ${M.tenant}, 'Utente R', ${M.tMaker}),
    (${M.s}, ${M.tenant}, 'Utente S', ${M.recA})`;
  await p`insert into patients (id, tenant_id, full_name) values (${M.x}, ${M.other}, 'Utente X')`;
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at) values
    (${M.tenant}, ${M.p}, ${M.t1}, ${M.locA}, ${T0}, ${T1}),
    (${M.tenant}, ${M.q}, ${M.t3}, ${M.locB}, ${T0}, ${T1}),
    (${M.tenant}, ${M.s}, ${M.t3}, ${M.locB}, ${T0}, ${T1})`;
  await p`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by) values
    (${M.tenant}, ${M.p}, ${M.tCare}, ${M.recA})`;
  await p`insert into clinical_episodes (id, tenant_id, patient_id, primary_practitioner_id, title) values
    (${M.epP},  ${M.tenant}, ${M.p}, ${M.t1},     'Osteopatia'),
    (${M.epP2}, ${M.tenant}, ${M.p}, ${M.t2},     'Fisioterapia'),
    (${M.epQ},  ${M.tenant}, ${M.q}, ${M.t3},     'Osteopatia'),
    (${M.epR},  ${M.tenant}, ${M.r}, ${M.tMaker}, 'Osteopatia'),
    (${M.epS},  ${M.tenant}, ${M.s}, ${M.t3},     'Osteopatia')`;
  await p`insert into clinical_episodes (id, tenant_id, patient_id, title) values
    (${M.epX}, ${M.other}, ${M.x}, 'Osteopatia')`;
}

let sql: Sql;

const asUser = <R>(role: AppRole, user: string, fn: (tx: TransactionSql) => Promise<R>, tenant = M.tenant) =>
  asRole(sql, "authenticated", claimsFor(tenant, role, user), fn);

/** Rows the caller reads of one episode. */
const reads = async (tx: TransactionSql, episode: string): Promise<number> =>
  (await tx<{ id: string }[]>`select id from clinical_episodes where id = ${episode}`).length;
/** Rows an UPDATE of one episode touches as the caller (a no-op SET, so only the policy decides). */
const updates = async (tx: TransactionSql, episode: string): Promise<number> =>
  (await tx`update clinical_episodes set title = title where id = ${episode}`).count;
/** Rows an INSERT opens as the caller. NO RETURNING: the INSERT policy alone decides. */
const opens = async (tx: TransactionSql, patient: string, practitioner: string | null): Promise<number> =>
  (
    await tx`insert into clinical_episodes (tenant_id, patient_id, primary_practitioner_id, title)
             values (${M.tenant}, ${patient}, ${practitioner}, 'Osteopatia')`
  ).count;
const deletes = (tx: TransactionSql, episode: string) =>
  tx`delete from clinical_episodes where id = ${episode}`;

type Case = {
  name: string;
  role: AppRole;
  user: string;
  episode: string;
  patient: string;
  /** What 0104 answers. DELETE is "no" for every staff session. */
  select: boolean;
  insert: boolean;
  update: boolean;
};

const CASES: Case[] = [
  { name: "the owner", role: "owner", user: M.owner, episode: M.epQ, patient: M.q, select: true, insert: true, update: true },
  { name: "an admin, the patient at their clinic", role: "admin", user: M.adminA, episode: M.epP, patient: M.p, select: true, insert: false, update: false },
  { name: "an admin, the patient at another clinic", role: "admin", user: M.adminA, episode: M.epQ, patient: M.q, select: false, insert: false, update: false },
  { name: "a therapist who treats the patient", role: "therapist", user: M.t1, episode: M.epP, patient: M.p, select: true, insert: true, update: true },
  { name: "a therapist of the clinic with no tie to the patient", role: "therapist", user: M.t2, episode: M.epP, patient: M.p, select: false, insert: false, update: false },
  { name: "a therapist, the patient at another clinic", role: "therapist", user: M.t1, episode: M.epQ, patient: M.q, select: false, insert: false, update: false },
  { name: "a therapist on the care team at their own clinic", role: "therapist", user: M.tCare, episode: M.epP, patient: M.p, select: true, insert: false, update: false },
  { name: "a receptionist, the patient at their clinic", role: "reception", user: M.recA, episode: M.epP, patient: M.p, select: true, insert: false, update: false },
  { name: "a receptionist, the patient at another clinic", role: "reception", user: M.recA, episode: M.epQ, patient: M.q, select: false, insert: false, update: false },
  { name: "a receptionist with no clinic", role: "reception", user: M.recNone, episode: M.epP, patient: M.p, select: false, insert: false, update: false },
];

const STAFF: [AppRole, string][] = [
  ["owner", M.owner],
  ["admin", M.adminA],
  ["reception", M.recA],
  ["reception", M.recNone],
  ["therapist", M.t1],
  ["therapist", M.t2],
  ["therapist", M.t3],
  ["therapist", M.tCare],
  ["therapist", M.tMaker],
];
const EPISODES = [M.epP, M.epP2, M.epQ, M.epR, M.epS];

describe.skipIf(!live)(`0104: the clinical_episodes policies follow the roles [${SIDE}]`, () => {
  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${M.tenant}, ${M.other})`;
    await sql.end();
  });

  it("PREMISE: the fixture is what the cases say it is", async () => {
    const [f] = await sql<
      { t1p: number; t2p: number; care: number; p_at_a: number; q_at_b: number; r_appts: number; r_maker: string; rec_none: number; episodes: number }[]
    >`
      select (select count(*)::int from appointments where patient_id = ${M.p} and practitioner_id = ${M.t1}) as t1p,
             (select count(*)::int from appointments where patient_id = ${M.p} and practitioner_id = ${M.t2}) as t2p,
             (select count(*)::int from patient_care_team where patient_id = ${M.p} and user_id = ${M.tCare} and removed_at is null) as care,
             (select count(*)::int from appointments where patient_id = ${M.p} and location_id = ${M.locA}) as p_at_a,
             (select count(*)::int from appointments where patient_id = ${M.q} and location_id = ${M.locB}) as q_at_b,
             (select count(*)::int from appointments where patient_id = ${M.r}) as r_appts,
             (select created_by::text from patients where id = ${M.r}) as r_maker,
             (select count(*)::int from staff_locations where user_id = ${M.recNone}) as rec_none,
             (select count(*)::int from clinical_episodes where tenant_id = ${M.tenant}) as episodes`;
    expect(f).toEqual({ t1p: 1, t2p: 0, care: 1, p_at_a: 1, q_at_b: 1, r_appts: 0, r_maker: M.tMaker, rec_none: 0, episodes: 5 });
  });

  /* ---- the matrix: ten cases by four commands -------------------------- */
  for (const c of CASES) {
    const run = <R>(fn: (tx: TransactionSql) => Promise<R>) => asUser(c.role, c.user, fn);

    if (c.select) {
      it(`${c.name}: SELECT reads the episode (both sides)`, async () => {
        expect(await run((tx) => reads(tx, c.episode))).toBe(1);
      });
    } else {
      it104(`${SIDE}: ${c.name}: SELECT reads no episode`, async () => {
        expect(await run((tx) => reads(tx, c.episode))).toBe(0);
      });
    }

    if (c.insert) {
      it(`${c.name}: INSERT opens an episode for the patient in their own name (both sides)`, async () => {
        expect(await run((tx) => opens(tx, c.patient, c.user))).toBe(1);
      });
    } else {
      it104(`${SIDE}: ${c.name}: INSERT opens nothing, even in their own name`, async () => {
        await expect(run((tx) => opens(tx, c.patient, c.user))).rejects.toThrow(/row-level security/i);
      });
    }

    if (c.update) {
      it(`${c.name}: UPDATE changes the episode (both sides)`, async () => {
        expect(await run((tx) => updates(tx, c.episode))).toBe(1);
      });
    } else {
      it104(`${SIDE}: ${c.name}: UPDATE changes no episode`, async () => {
        expect(await run((tx) => updates(tx, c.episode))).toBe(0);
      });
    }

    it104(`${SIDE}: ${c.name}: DELETE is refused, the privilege is not held`, async () => {
      await expect(run((tx) => deletes(tx, c.episode))).rejects.toThrow(/permission denied/i);
    });
  }

  /* ---- a therapist's own writes ----------------------------------------- */
  it("a therapist's INSERT ... RETURNING for a patient they treat returns the row (both sides)", async () => {
    const out = await asUser("therapist", M.t1, (tx) =>
      tx<{ id: string; primary_practitioner_id: string }[]>`
        insert into clinical_episodes (tenant_id, patient_id, primary_practitioner_id, title)
        values (${M.tenant}, ${M.p}, ${M.t1}, 'Osteopatia')
        returning id, primary_practitioner_id::text as primary_practitioner_id`,
    );
    expect(out.map((r) => r.primary_practitioner_id)).toEqual([M.t1]);
  });

  it("a therapist who created the patient, with no appointment, reads, opens and changes an episode (both sides)", async () => {
    const out = await asUser("therapist", M.tMaker, async (tx) => ({
      read: await reads(tx, M.epR),
      opened: await opens(tx, M.r, M.tMaker),
      changed: await updates(tx, M.epR),
    }));
    expect(out).toEqual({ read: 1, opened: 1, changed: 1 });
  });

  it104(`${SIDE}: a therapist opens nothing in a colleague's name, or in no name, even for a patient they treat`, async () => {
    await expect(asUser("therapist", M.t1, (tx) => opens(tx, M.p, M.t2))).rejects.toThrow(/row-level security/i);
    await expect(asUser("therapist", M.t1, (tx) => opens(tx, M.p, null))).rejects.toThrow(/row-level security/i);
  });

  it("a therapist who treats the patient reads and changes a colleague's episode of that patient (both sides)", async () => {
    const out = await asUser("therapist", M.t1, async (tx) => ({ read: await reads(tx, M.epP2), changed: await updates(tx, M.epP2) }));
    expect(out).toEqual({ read: 1, changed: 1 });
  });

  it104(`${SIDE}: the practitioner an episode names, who neither treats nor created the patient, reads and changes nothing of it`, async () => {
    const out = await asUser("therapist", M.t2, async (tx) => ({ read: await reads(tx, M.epP2), changed: await updates(tx, M.epP2) }));
    expect(out).toEqual({ read: 0, changed: 0 });
  });

  it104(`${SIDE}: a therapist's UPDATE cannot hand an episode to a patient they neither treat nor created (WITH CHECK)`, async () => {
    await expect(
      asUser("therapist", M.t1, (tx) => tx`update clinical_episodes set patient_id = ${M.q} where id = ${M.epP}`),
    ).rejects.toThrow(/row-level security/i);
  });

  it104(`${SIDE}: every episode a staff session changes is one it reads (the read set contains the write set)`, async () => {
    let writes = 0;
    for (const [role, user] of STAFF) {
      for (const episode of EPISODES) {
        const out = await asUser(role, user, async (tx) => ({ read: await reads(tx, episode), changed: await updates(tx, episode) }));
        if (out.changed === 1) {
          writes += 1;
          expect(out.read, `${role} changes an episode it does not read`).toBe(1);
        }
      }
    }
    // Not vacuous: the owner changes all five, and t1, t3 and tMaker their own patients'.
    expect(writes).toBe(10);
  });

  /* ---- the owner arm, as the importer uses it ---------------------------- */
  it("under owner claims, an INSERT in another practitioner's name returns its id and an UPDATE by id and tenant changes it: the importer's statements (both sides)", async () => {
    const out = await asUser("owner", M.owner, async (tx) => {
      const inserted = await tx<{ id: string }[]>`
        insert into clinical_episodes (tenant_id, patient_id, primary_practitioner_id, title, status, opened_at, closed_at)
        values (${M.tenant}, ${M.q}, ${M.t3}, 'Fisioterapia', 'closed', ${T0}, ${T1}) returning id`;
      const updated = await tx`
        update clinical_episodes set title = 'Osteopatia', primary_practitioner_id = ${M.t1}
         where tenant_id = ${M.tenant} and id = ${inserted[0]!.id}`;
      return { inserted: inserted.length, updated: updated.count };
    });
    expect(out).toEqual({ inserted: 1, updated: 1 });
  });

  /* ---- merge_patients runs as its owner ---------------------------------- */
  it(`${SIDE}: merge_patients, called by an admin of another clinic, moves the source patient's episode and counts it`, async () => {
    const out = await asUser("admin", M.adminA, async (tx) => {
      const readBefore = await reads(tx, M.epS);
      const [row] = await tx<{ moved: { clinical_episodes: number } }[]>`
        select (public.merge_patients(${M.s}::uuid, ${M.p}::uuid, ${M.adminA}::uuid) -> 'moved') as moved`;
      const readAfter = await reads(tx, M.epS);
      // Read back as the connection's own role, past the policies; the transaction still rolls back.
      await tx.unsafe("reset role");
      const [ep] = await tx<{ patient_id: string }[]>`
        select patient_id::text as patient_id from clinical_episodes where id = ${M.epS}`;
      return { readBefore, moved: row!.moved.clinical_episodes, readAfter, patient: ep!.patient_id };
    });
    expect(out.moved).toBe(1);
    expect(out.patient).toBe(M.p);
    // P is at the admin's clinic, so once the episode is P's the admin reads it.
    expect(out.readAfter).toBe(1);
    // S is at another clinic: where 0104 is applied the admin did not read the episode it moved.
    if (state.applied) expect(out.readBefore).toBe(0);
  });

  /* ---- the catalogue ------------------------------------------------------ */
  it104(`${SIDE}: the table carries four policies (SELECT, INSERT and UPDATE for authenticated, SELECT for patient), none for DELETE and none FOR ALL`, async () => {
    const rows = await sql<{ polname: string; cmd: string; permissive: boolean; to_roles: string }[]>`
      select p.polname::text as polname, p.polcmd::text as cmd, p.polpermissive as permissive,
             array_to_string(array(select pg_get_userbyid(r) from unnest(p.polroles) r order by 1), ',') as to_roles
        from pg_policy p where p.polrelid = 'public.clinical_episodes'::regclass order by p.polname`;
    expect(rows.map((r) => `${r.polname}:${r.cmd}:${r.permissive}:${r.to_roles}`)).toEqual([
      "clinical_episodes_insert:a:true:authenticated",
      "clinical_episodes_patient_selfscope:r:true:patient",
      "clinical_episodes_select:r:true:authenticated",
      "clinical_episodes_update:w:true:authenticated",
    ]);
  });

  it104(`${SIDE}: authenticated holds SELECT, INSERT and UPDATE on the table and no DELETE (read from the catalogue)`, async () => {
    const [g] = await sql<{ s: boolean; i: boolean; u: boolean; d: boolean }[]>`
      select has_table_privilege('authenticated', 'public.clinical_episodes', 'SELECT') as s,
             has_table_privilege('authenticated', 'public.clinical_episodes', 'INSERT') as i,
             has_table_privilege('authenticated', 'public.clinical_episodes', 'UPDATE') as u,
             has_table_privilege('authenticated', 'public.clinical_episodes', 'DELETE') as d`;
    expect(g).toEqual({ s: true, i: true, u: true, d: false });
  });

  /* ---- what 0104 must not move -------------------------------------------- */
  it("the patient role reads its own episodes and no other patient's, and writes none (both sides)", async () => {
    const own = await asRole(sql, "patient", patientClaims(M.tenant, M.p), (tx) =>
      tx<{ id: string }[]>`select id::text as id from clinical_episodes order by id`,
    );
    expect(own.map((r) => r.id).sort()).toEqual([M.epP, M.epP2].sort());
    await expect(
      asRole(sql, "patient", patientClaims(M.tenant, M.p), (tx) =>
        tx`insert into clinical_episodes (tenant_id, patient_id, title) values (${M.tenant}, ${M.p}, 'Osteopatia')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(sql, "patient", patientClaims(M.tenant, M.p), (tx) => tx`update clinical_episodes set title = title where id = ${M.epP}`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(sql, "patient", patientClaims(M.tenant, M.p), (tx) => deletes(tx, M.epP)),
    ).rejects.toThrow(/permission denied/i);
  });

  it("no staff session reaches another tenant's episode, the owner included (both sides)", async () => {
    for (const [role, user] of STAFF) {
      const out = await asUser(role, user, async (tx) => ({ read: await reads(tx, M.epX), changed: await updates(tx, M.epX) }));
      expect(out, role).toEqual({ read: 0, changed: 0 });
    }
    await expect(
      asUser("owner", M.owner, (tx) =>
        tx`insert into clinical_episodes (tenant_id, patient_id, title) values (${M.other}, ${M.x}, 'Osteopatia')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it104(`${SIDE}: a session with no claims, or with a role that is none of the four, reads no episode`, async () => {
    const none = await asRole(sql, "authenticated", null, (tx) => tx<{ id: string }[]>`select id from clinical_episodes`);
    expect(none.length).toBe(0);
    const unknown = await asRole(sql, "authenticated", claimsFor(M.tenant, "visitante" as never, M.t1), (tx) =>
      tx<{ id: string }[]>`select id from clinical_episodes`,
    );
    expect(unknown.length).toBe(0);
  });
});

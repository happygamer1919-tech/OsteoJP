/**
 * clinical-records-episode-key.db.test.ts: REG-03, a registo and the episode it
 * is filed in name ONE patient, as the database answers for it.
 *
 * The application asks that before it files a registo
 * (`assertEpisodeIsThePatients`, apps/web/lib/clinical/records.ts), and the
 * patient merge moves an episode and its registos to the survivor together
 * (`public.merge_patients`). The registo writers also name the database's own
 * refusal of the rule: a foreign-key violation naming
 * `clinical_records_episode_patient_tenant_fk` (apps/web/lib/clinical/
 * episode-key-refusal.ts). So this file ASKS THE SCHEMA WHICH SIDE IT IS ON,
 * in the pattern of clinical-records-write-matrix.db.test.ts, and names it in
 * the suite's title and in every title that depends on it:
 *
 *   - the arms that hold on either side run on both, with the same assertions:
 *     a merge of a patient whose episode holds a draft, a locked and a signed
 *     registo moves all of them and the episode, and returns the counts; a
 *     registo is filed in its own patient's episode, and with no episode; the
 *     database refuses a registo whose episode does not exist;
 *   - where the database carries the key, those arms ALSO read its refusal, by
 *     SQLSTATE and by name: a registo in another patient's episode is refused,
 *     and an episode holding registos does not change patient alone.
 *
 * NO ARM IS SKIPPED on a live database (the skip-guard, .github/scripts/
 * assert-rls-executed.mjs, reddens any test that did not run), and:
 *   1. NEVER HALF. A constraint of that name that is not a validated foreign
 *      key from clinical_records to clinical_episodes THROWS, and nothing here
 *      is measured.
 *   2. THE PROMOTION FLIPS IT. Once a .sql file in packages/db/migrations names
 *      the key, a database WITHOUT it THROWS: from the promotion commit on, the
 *      key's arms cannot be passed over.
 *
 * EVERY ARM IS ONE TRANSACTION THAT ALWAYS ROLLS BACK, fixture included: each
 * builds its own tenant, people, episodes and registos, so no row of this file
 * is ever committed (a locked or signed registo could not be removed again) and
 * no row of another suite is read. The fixture is written by the connection's
 * own role; the statements under test run as `authenticated` with the claims of
 * the principal the application would use (the statement on the episode alone
 * runs as the connection's role).
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AppRole, Rollback, claimsFor, connect, live } from "./rls-harness";

/** The key the registo writers name (apps/web/lib/clinical/episode-key-refusal.ts). */
const KEY = "clinical_records_episode_patient_tenant_fk";
/** The foreign key from a registo to its episode's id, which every database carries. */
const EPISODE_ID_KEY = "clinical_records_episode_id_clinical_episodes_id_fk";

/** The promoted migration files that name the key, if any. */
function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(KEY));
}

/** Whether this database carries the key. Throws on anything but a whole side. */
async function carriesTheKey(): Promise<boolean> {
  if (!live) return false;
  const probe = connect();
  try {
    const rows = await probe<{ contype: string; validated: boolean; referenced: string }[]>`
      select c.contype::text as contype, c.convalidated as validated, c.confrelid::regclass::text as referenced
        from pg_constraint c
       where c.conrelid = 'public.clinical_records'::regclass
         and c.conname = ${KEY}`;
    if (rows.length > 1) {
      throw new Error(`EPISODE KEY STATE UNREADABLE: ${rows.length} constraints named ${KEY}. Nothing here was measured.`);
    }
    const found = rows[0];
    const whole =
      found !== undefined &&
      found.contype === "f" &&
      found.validated === true &&
      /^(public\.)?clinical_episodes$/.test(found.referenced);
    if (found !== undefined && !whole) {
      throw new Error(
        `THE EPISODE KEY IS HALF THERE: ${KEY} exists and is not a validated foreign key to clinical_episodes ` +
          `(type ${found.contype}, validated ${found.validated}, references ${found.referenced}). Nothing here was measured.`,
      );
    }
    const promoted = promotedFiles();
    if (promoted.length > 0 && !whole) {
      throw new Error(
        `THE EPISODE KEY IS PROMOTED (${promoted.join(", ")} names ${KEY}) BUT THIS DATABASE DOES NOT CARRY IT. ` +
          "From the promotion on, that is no longer an acceptable answer. Nothing here was measured.",
      );
    }
    return whole;
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const keyed = await carriesTheKey();
const SIDE = keyed ? `THE DATABASE CARRIES ${KEY}` : `the database does not carry ${KEY}`;

type Fixture = {
  tenant: string;
  owner: string;
  therapist: string;
  a: string; // patient A: the merge's source
  b: string; // patient B: the merge's target
  epA: string; // A's episode
  epB: string; // B's episode
  draft: string; // A's registos in epA, one per status
  locked: string;
  signed: string;
  loose: string; // A's registo with no episode
  ofB: string; // B's own registo in epB: nothing may move it
};

let sql: Sql;

/** One transaction on the connection's own role, ALWAYS rolled back. Returns fn's value. */
async function scenario<T>(fn: (tx: TransactionSql, f: Fixture) => Promise<T>): Promise<T> {
  try {
    await sql.begin(async (tx) => {
      const f = await seed(tx);
      throw new Rollback(await fn(tx, f));
    });
    throw new Error("unreachable: transaction committed without rollback");
  } catch (err) {
    if (err instanceof Rollback) return err.value as T;
    throw err;
  }
}

/** The fixture, written inside the scenario's own transaction. Invented names only. */
async function seed(tx: TransactionSql): Promise<Fixture> {
  const f: Fixture = {
    tenant: randomUUID(),
    owner: randomUUID(),
    therapist: randomUUID(),
    a: randomUUID(),
    b: randomUUID(),
    epA: randomUUID(),
    epB: randomUUID(),
    draft: randomUUID(),
    locked: randomUUID(),
    signed: randomUUID(),
    loose: randomUUID(),
    ofB: randomUUID(),
  };
  await tx`insert into tenants (id, name, slug) values (${f.tenant}, 'REG03', ${`reg03-${f.tenant}`})`;
  await tx`insert into users (id, tenant_id, email, full_name) values
    (${f.owner},     ${f.tenant}, ${`ow-${f.owner}@x.pt`},     'Owner'),
    (${f.therapist}, ${f.tenant}, ${`th-${f.therapist}@x.pt`}, 'Terapeuta')`;
  // Both patients were registered by the therapist, so the therapist files for either.
  await tx`insert into patients (id, tenant_id, full_name, created_by) values
    (${f.a}, ${f.tenant}, 'Utente A', ${f.therapist}),
    (${f.b}, ${f.tenant}, 'Utente B', ${f.therapist})`;
  await tx`insert into clinical_episodes (id, tenant_id, patient_id, title) values
    (${f.epA}, ${f.tenant}, ${f.a}, 'Episódio (01/09/2026)'),
    (${f.epB}, ${f.tenant}, ${f.b}, 'Episódio (02/09/2026)')`;
  await tx`insert into clinical_records (id, tenant_id, patient_id, episode_id, practitioner_id, status) values
    (${f.draft},  ${f.tenant}, ${f.a}, ${f.epA}, ${f.therapist}, 'draft'),
    (${f.locked}, ${f.tenant}, ${f.a}, ${f.epA}, ${f.therapist}, 'locked'),
    (${f.loose},  ${f.tenant}, ${f.a}, null,     ${f.therapist}, 'draft'),
    (${f.ofB},    ${f.tenant}, ${f.b}, ${f.epB}, ${f.therapist}, 'draft')`;
  await tx`insert into clinical_records (id, tenant_id, patient_id, episode_id, practitioner_id, status, signed_by, signed_at) values
    (${f.signed}, ${f.tenant}, ${f.a}, ${f.epA}, ${f.therapist}, 'signed', ${f.therapist}, now())`;
  return f;
}

/** From here the transaction runs as `authenticated` with this principal's claims. */
async function actAs(tx: TransactionSql, f: Fixture, role: AppRole, user: string): Promise<void> {
  await tx.unsafe("set local role authenticated");
  await tx`select set_config('request.jwt.claims', ${claimsFor(f.tenant, role, user)}, true)`;
}
/** Back to the connection's own role, to read every row whatever the policies say. */
const asSeeder = (tx: TransactionSql) => tx.unsafe("reset role");

/**
 * The SQLSTATE and constraint a statement was refused with, or "taken". Run in
 * a savepoint, so a refusal leaves the scenario's transaction usable.
 */
async function refusalOf(tx: TransactionSql, statement: (sp: TransactionSql) => Promise<unknown>): Promise<string> {
  try {
    await tx.savepoint((sp) => statement(sp));
  } catch (err) {
    const e = err as { code?: string; constraint_name?: string };
    if (typeof e.code !== "string") throw err;
    return `${e.code} ${e.constraint_name ?? ""}`.trim();
  }
  return "taken";
}

/** A registo of `patient` in `episode`, filed by the therapist in their own name. No RETURNING: the INSERT alone decides. */
const file = (tx: TransactionSql, f: Fixture, patient: string, episode: string | null) =>
  tx`insert into clinical_records (tenant_id, patient_id, episode_id, practitioner_id, status)
     values (${f.tenant}, ${patient}, ${episode}, ${f.therapist}, 'draft')`;

/** Registos of the tenant filed in an episode, and how many of them name another patient than their episode does. */
const agreement = async (tx: TransactionSql, f: Fixture) =>
  (
    await tx<{ with_episode: number; other_patient: number }[]>`
      select count(*)::int as with_episode,
             (count(*) filter (where e.patient_id is distinct from r.patient_id))::int as other_patient
        from clinical_records r
        join clinical_episodes e on e.id = r.episode_id
       where r.tenant_id = ${f.tenant}`
  )[0]!;

describe.skipIf(!live)(`REG-03: a registo and its episode name one patient [${SIDE}]`, () => {
  beforeAll(() => {
    sql = connect();
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  it(`NAMES THE SIDE IT RAN ON: ${SIDE}`, () => {
    // AN ANNOTATION, with no assertion of its own. carriesTheKey() THROWS for a
    // half-made key, or for a database without it once a promoted migration
    // names it, so reaching here is one whole side. The title and the line
    // below name which.
    console.warn(`[clinical-records-episode-key.db.test] ${SIDE}`);
  });

  it("PREMISE: A's episode holds a draft, a locked and a signed registo of A; every registo names its episode's patient", async () => {
    const out = await scenario(async (tx, f) => ({
      inEpA: await tx<{ status: string; patient: string }[]>`
        select status::text as status, patient_id::text as patient from clinical_records where episode_id = ${f.epA} order by status::text`,
      agreement: await agreement(tx, f),
      a: f.a,
    }));
    expect(out.inEpA).toEqual([
      { status: "draft", patient: out.a },
      { status: "locked", patient: out.a },
      { status: "signed", patient: out.a },
    ]);
    // CONTROL for every zero below: four registos are filed in an episode (three of A, one of B).
    expect(out.agreement).toEqual({ with_episode: 4, other_patient: 0 });
  });

  it(
    keyed
      ? `${SIDE}: an episode holding registos does not change patient alone (23503, the key); the merge moves it with its draft, locked and signed registos and returns the counts`
      : "the merge moves an episode with its draft, locked and signed registos to the survivor, and returns the counts",
    async () => {
      const out = await scenario(async (tx, f) => {
        // Where the database carries the key: the episode alone, to the other
        // patient, while A's three registos are filed in it.
        const alone = keyed
          ? await refusalOf(tx, (sp) => sp`update clinical_episodes set patient_id = ${f.b} where id = ${f.epA}`)
          : null;
        const epAfterAlone = (await tx<{ p: string }[]>`select patient_id::text as p from clinical_episodes where id = ${f.epA}`)[0]!.p;

        await actAs(tx, f, "owner", f.owner);
        const [answer] = await tx<{ moved: Record<string, unknown> }[]>`
          select public.merge_patients(${f.a}::uuid, ${f.b}::uuid, ${f.owner}::uuid) as moved`;
        const moved = answer!.moved;
        await asSeeder(tx);

        const registos = await tx<{ id: string; patient: string; episode: string | null; status: string }[]>`
          select id::text as id, patient_id::text as patient, episode_id::text as episode, status::text as status
            from clinical_records where tenant_id = ${f.tenant}`;
        const episodes = await tx<{ id: string; patient: string }[]>`
          select id::text as id, patient_id::text as patient from clinical_episodes where tenant_id = ${f.tenant}`;
        const audit = await tx<{ action: string; entity: string; moved: Record<string, unknown> }[]>`
          select action, entity_id::text as entity, metadata->'moved' as moved from audit_log where tenant_id = ${f.tenant}`;
        const [source] = await tx<{ merged_into: string; deleted: boolean }[]>`
          select merged_into_id::text as merged_into, deleted_at is not null as deleted from patients where id = ${f.a}`;
        return { f, alone, epAfterAlone, moved, registos, episodes, audit, source, agreement: await agreement(tx, f) };
      });
      const { f } = out;
      if (keyed) expect(out.alone).toBe(`23503 ${KEY}`);
      // The episode had not moved before the merge.
      expect(out.epAfterAlone).toBe(f.a);

      // THE COUNTS, the same on either side: one episode, four registos (three in it, one with none).
      const counts = { appointments: 0, clinical_episodes: 1, clinical_records: 4, attachments: 0, invoices: 0, patient_locations: 0 };
      expect(out.moved).toEqual({ source_patient_id: f.a, target_patient_id: f.b, moved: counts });
      expect(out.audit).toEqual([{ action: "patient.merge", entity: f.a, moved: counts }]);
      expect(out.source).toEqual({ merged_into: f.b, deleted: true });

      // ALL MOVED, and nothing else changed: every registo names B, in the episode and the status it had.
      const byId = Object.fromEntries(out.registos.map((r) => [r.id, r]));
      expect(byId[f.draft]).toEqual({ id: f.draft, patient: f.b, episode: f.epA, status: "draft" });
      expect(byId[f.locked]).toEqual({ id: f.locked, patient: f.b, episode: f.epA, status: "locked" });
      expect(byId[f.signed]).toEqual({ id: f.signed, patient: f.b, episode: f.epA, status: "signed" });
      expect(byId[f.loose]).toEqual({ id: f.loose, patient: f.b, episode: null, status: "draft" });
      expect(byId[f.ofB]).toEqual({ id: f.ofB, patient: f.b, episode: f.epB, status: "draft" });
      expect(out.registos).toHaveLength(5);
      expect(Object.fromEntries(out.episodes.map((e) => [e.id, e.patient]))).toEqual({ [f.epA]: f.b, [f.epB]: f.b });
      // And every registo still names its episode's patient (control: four are filed in one).
      expect(out.agreement).toEqual({ with_episode: 4, other_patient: 0 });
    },
  );

  it("a registo is filed in its own patient's episode, and one with no episode is filed too (both sides)", async () => {
    const out = await scenario(async (tx, f) => {
      await actAs(tx, f, "therapist", f.therapist);
      const own = await refusalOf(tx, (sp) => file(sp, f, f.a, f.epA));
      const none = await refusalOf(tx, (sp) => file(sp, f, f.a, null));
      await asSeeder(tx);
      const [n] = await tx<{ in_ep_a: number; loose: number }[]>`
        select (count(*) filter (where episode_id = ${f.epA}))::int as in_ep_a,
               (count(*) filter (where episode_id is null))::int as loose
          from clinical_records where patient_id = ${f.a}`;
      return { own, none, n: n!, agreement: await agreement(tx, f) };
    });
    expect(out.own).toBe("taken");
    expect(out.none).toBe("taken");
    // The fixture's three and one, and one more of each.
    expect(out.n).toEqual({ in_ep_a: 4, loose: 2 });
    expect(out.agreement).toEqual({ with_episode: 5, other_patient: 0 });
  });

  it(
    keyed
      ? `${SIDE}: the database refuses a registo in another patient's episode (23503, the key), and one whose episode does not exist`
      : "the database refuses a registo whose episode does not exist (23503, naming the registo's episode key)",
    async () => {
      const out = await scenario(async (tx, f) => {
        await actAs(tx, f, "therapist", f.therapist);
        const nowhere = await refusalOf(tx, (sp) => file(sp, f, f.a, randomUUID()));
        // Where the database carries the key: patient A's registo, in patient
        // B's episode. The therapist files for A and the episode exists, so the
        // episode's patient is the only thing the statement can be refused for.
        const others = keyed ? await refusalOf(tx, (sp) => file(sp, f, f.a, f.epB)) : null;
        // CONTROL, in the same transaction and as the same principal: the same
        // statement with A's own episode is taken.
        const own = await refusalOf(tx, (sp) => file(sp, f, f.a, f.epA));
        await asSeeder(tx);
        const [n] = await tx<{ n: number }[]>`select count(*)::int as n from clinical_records where tenant_id = ${f.tenant}`;
        return { nowhere, others, own, n: n!.n, agreement: await agreement(tx, f) };
      });
      // An episode that does not exist breaks both keys where there are two;
      // which one the database names first is its own business.
      if (keyed) expect([`23503 ${KEY}`, `23503 ${EPISODE_ID_KEY}`]).toContain(out.nowhere);
      else expect(out.nowhere).toBe(`23503 ${EPISODE_ID_KEY}`);
      if (keyed) expect(out.others).toBe(`23503 ${KEY}`);
      expect(out.own).toBe("taken");
      // The fixture's five and the control's one: no refused statement left a row.
      expect(out.n).toBe(6);
      expect(out.agreement).toEqual({ with_episode: 5, other_patient: 0 });
    },
  );
});

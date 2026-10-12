/**
 * records.episode-guard.db.test.ts: EPI-01b (S-1002-D P2.2), Q9'S APP HALF AND
 * Q7'S NEW EPISODE, AGAINST REAL ROWS AND REAL RLS.
 *
 * Nothing in the database ties `clinical_records.episode_id` to the record's
 * patient: the foreign key only asks that the episode exists, and a foreign key
 * check ignores row level security, so it would even take another tenant's
 * episode. `createDraftRecord` (the one record-creation path, behind
 * /clinical/new and "+ Avaliação") therefore asks, in its own transaction, that
 * the episode is the same patient's in the same tenant (`assertEpisodeIsThePatients`).
 * This suite runs the real entry point, as the real principals, and reads back
 * what was and was not written.
 *
 * THE ARMS, each refusal with a control read proving the subject is really there:
 *   - ANOTHER PATIENT'S episode (same tenant, a patient the therapist also
 *     treats, so only the episode can be the reason): refused, nothing written;
 *     the owner is refused the same;
 *   - ANOTHER TENANT'S episode: refused, nothing written (and see REG-03
 *     below for what the admin connection is answered);
 *   - CONTROL: the right episode files the registo in it, with its audit row;
 *   - "+ Avaliação" on an imported group (Q7), the patient having no open
 *     episode of the specialty: a NEW open episode titled with the specialty and
 *     the Lisbon date, the registo in it, the imported episode untouched; a word
 *     off the list files nothing; a refused registo leaves no episode behind;
 *   - "Nova versão" of a registo in another patient's episode is refused (see
 *     REG-03 below for which refusal); of one in its own episode, filed there;
 *   - admin and reception are refused before anything is read.
 *
 * Added after R4 round 1 on #1526:
 *   - a NEW registo in the patient's own CLOSED imported episode is refused
 *     (`episode_closed`), the /clinical/new picker no longer offers a closed
 *     episode, and "Nova versão" of a registo in a closed episode still files
 *     there (EPI-01a);
 *   - Q7's one transaction, proved where it can fail: the episode insert
 *     SUCCEEDS and the registo insert after it fails (a template that does not
 *     exist), and no episode is left;
 *   - the owner with ANOTHER TENANT'S patient id is refused (not_found) by
 *     createDraftRecord and by its new-episode path (createEpisode, the
 *     therapist's alone since piece 2, refuses the owner by role), with a
 *     control proving the foreign key alone would take it and a passing control
 *     for the owner's own patient.
 *
 * Added for strategy ruling R31 (Q7): "+ Avaliação" on an imported group
 * "reuses the patient's open app episode of that specialty and creates one only
 * when none exists". On a patient of its own (C), so no earlier arm's rows are
 * in play:
 *   - CREATE when none: with a closed episode of the specialty, an open episode
 *     of the OTHER specialty, an open episode naming no specialty, an OPEN
 *     episode the import ledger names, and ANOTHER PATIENT'S open episode of the
 *     specialty all really there, none of them is reused and one is opened;
 *   - REUSE: the next call, and the owner's, file in that one; no episode is
 *     opened, and the only audit row is the registo's;
 *   - MORE THAN ONE: the most recently opened;
 *   - a registo refused after the episode was chosen leaves nothing behind;
 *   - AT ONCE: several requests for a patient with none open ONE episode, and
 *     all file in it;
 *   - THE LOCK, by itself and with no timing luck: while another transaction
 *     holds the patient-and-specialty lock the write WAITS, and when that
 *     transaction commits an open episode the write reuses it. A lock on another
 *     patient or specialty does not make it wait.
 *
 * Added after R4 on the R31 commit:
 *   - MINOR 1: a patient id posted in UPPERCASE is the same patient. It reuses
 *     the patient's open episode (no second one is opened) and waits on the SAME
 *     lock as a lowercase request, proved by holding the lowercase key;
 *   - MINOR 2: the rollback on the CREATE path. On a patient with no episode at
 *     all the write must open one; the registo insert after it fails; no episode
 *     row and no audit row is left. (The arm "refused AFTER the episode was
 *     chosen" runs on a patient who already has the episode, so it is the REUSE
 *     path and never reaches the episode insert.)
 *
 * Added for REG-03 (the registo writers name the database's refusal of the
 * same rule). Where the database carries the foreign key
 * `clinical_records_episode_patient_tenant_fk` it refuses, by name, a registo
 * whose episode is not its patient's in its tenant, and the writers answer that
 * as `episode_mismatch` (records.ts, `namingEpisodeKeyRefusal`). Two arms send
 * such a row from the admin connection, so they ASK THE SCHEMA WHICH SIDE THEY
 * ARE ON (episode-key-state.ts) and assert the refusal that side owes. None is
 * skipped, and the first test names the side:
 *   - "Nova versão" of a registo in another patient's episode. Where the key
 *     is carried, the database refuses that source registo when the fixture
 *     sends it (23503, naming the key), so there is none to version; where it
 *     is not, the application refuses the version (`episode_mismatch`);
 *   - another tenant's episode: the application refuses on both sides. The
 *     same row is also sent from the admin connection, in a transaction that
 *     always rolls back, and the foreign key that answers for it is compared
 *     with the side the catalogue reading named: an assertion on either side;
 *   - THE DRIVER'S SHAPE, on both sides: a registo INSERT refused by ANOTHER
 *     foreign key of the table (a form template that does not exist) reaches
 *     the caller wrapped, the SQLSTATE and the constraint name on the cause and
 *     neither on the outer error. `refusingForeignKey` reads both there, and
 *     the writer leaves that refusal unmapped.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 * Invented names only.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RequestContext } from "@osteojp/auth";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("EPI-01b: the same-patient episode guard under real RLS", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let records: typeof import("./records");
  let episodes_: typeof import("./episodes");
  let refusal: typeof import("./episode-key-refusal");
  /** REG-03: whether this database carries the episode key; the arms that send a row it refuses read it. */
  let key: import("./episode-key-state").EpisodeKeyState;
  /** REG-03: the foreign key that refused the crossSource fixture row, when one did. */
  let crossSourceRefusedBy: string | null = null;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const owner = randomUUID();
  const admin = randomUUID();
  const therapist = randomUUID(); // registered patients A and B, so treats both
  const therapistUnrelated = randomUUID(); // no relation to either patient
  const otherTenantUser = randomUUID();
  const patientA = randomUUID();
  const patientB = randomUUID();
  const patientForeign = randomUUID(); // the other tenant's
  const template = randomUUID();
  const epA = randomUUID(); // patient A's app episode
  const epB = randomUUID(); // patient B's app episode
  const epImported = randomUUID(); // patient A's imported Osteopatia episode
  const epForeign = randomUUID(); // the other tenant's patient's episode
  const crossSource = randomUUID(); // a registo of A naming B's episode
  const ownSource = randomUUID(); // a registo of A in A's own episode
  const epClosedOwn = randomUUID(); // a closed app episode of A
  const closedSource = randomUUID(); // a registo of A in that closed episode
  // R31: patients of their own, registered by the therapist (so the therapist treats them).
  const patientC = randomUUID(); // the reuse arms
  const patientD = randomUUID(); // "another patient", holding an open Osteopatia episode
  const patientE = randomUUID(); // the at-once arm: no episode at all
  const patientF = randomUUID(); // the lock arm: no episode at all
  const patientG = randomUUID(); // the rollback arm: no episode at all, so "+ Avaliação" must OPEN one
  const epCClosed = randomUUID(); // C: a CLOSED app episode of the specialty
  const epCOther = randomUUID(); // C: an open app episode of the OTHER specialty
  const epCPlain = randomUUID(); // C: an open app episode naming no specialty
  const epCImportedOpen = randomUUID(); // C: an OPEN episode the import ledger names
  const epDOpen = randomUUID(); // D: an open app episode of the specialty

  const ctx = (userId: string, role: RequestContext["role"]): RequestContext => ({ tenantId: tenant, role, userId });

  async function rows<T>(q: ReturnType<typeof raw>): Promise<T[]> {
    return (await db.execute(q)) as unknown as T[];
  }
  async function codeOf(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      return typeof code === "string" ? code : (e as Error).name;
    }
    return "resolved";
  }
  const countRecords = async () =>
    (await rows<{ n: number }>(raw`select count(*)::int as n from clinical_records where tenant_id = ${tenant}::uuid`))[0]!.n;
  const countEpisodes = async (patient: string) =>
    (await rows<{ n: number }>(raw`select count(*)::int as n from clinical_episodes where patient_id = ${patient}::uuid`))[0]!.n;
  const countEpisodesAll = async () =>
    (await rows<{ n: number }>(
      raw`select count(*)::int as n from clinical_episodes where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    ))[0]!.n;
  const countRecordsAll = async () =>
    (await rows<{ n: number }>(
      raw`select count(*)::int as n from clinical_records where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    ))[0]!.n;
  const quiet = async <T>(p: Promise<T>): Promise<T> => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      return await p;
    } finally {
      warn.mockRestore();
    }
  };
  const countAudit = async () =>
    (await rows<{ n: number }>(raw`select count(*)::int as n from audit_log where tenant_id = ${tenant}::uuid`))[0]!.n;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    records = await import("./records");
    episodes_ = await import("./episodes");
    refusal = await import("./episode-key-refusal");
    key = await (await import("./episode-key-state")).episodeKeyState(db);
    console.warn(`[records.episode-guard.db.test] ${key.detail}`);

    for (const [id, slug] of [
      [tenant, "epi01b"],
      [otherTenant, "epi01b-other"],
    ] as const) {
      await db.execute(raw`insert into tenants (id, name, slug) values (${id}::uuid, ${slug}, ${`${slug}-${id.slice(0, 8)}`})`);
    }
    for (const [id, t, label] of [
      [owner, tenant, "owner"],
      [admin, tenant, "admin"],
      [therapist, tenant, "therapist"],
      [therapistUnrelated, tenant, "unrelated"],
      [otherTenantUser, otherTenant, "other"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${t}::uuid, ${`${label}-${id.slice(0, 8)}@example.test`}, ${`Zzz ${label} Teste`})`,
      );
    }
    for (const [id, t, name, by] of [
      [patientA, tenant, "Zzz Guarda Episodio Teste A", therapist],
      [patientB, tenant, "Zzz Guarda Episodio Teste B", therapist],
      [patientForeign, otherTenant, "Zzz Guarda Episodio Teste Outro", otherTenantUser],
      [patientC, tenant, "Zzz Guarda Episodio Teste C", therapist],
      [patientD, tenant, "Zzz Guarda Episodio Teste D", therapist],
      [patientE, tenant, "Zzz Guarda Episodio Teste E", therapist],
      [patientF, tenant, "Zzz Guarda Episodio Teste F", therapist],
      [patientG, tenant, "Zzz Guarda Episodio Teste G", therapist],
    ] as const) {
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, created_by) values (${id}::uuid, ${t}::uuid, ${name}, ${by}::uuid)`,
      );
    }
    await db.execute(
      raw`insert into form_templates (id, tenant_id, key, title, schema)
          values (${template}::uuid, ${tenant}::uuid, 'epi01b-guard', '{"pt":"Ficha Teste","en":"Test record"}'::jsonb, '{}'::jsonb)`,
    );
    for (const [id, t, patient, title, status] of [
      [epA, tenant, patientA, "Episódio (01/09/2026)", "open"],
      [epB, tenant, patientB, "Episódio (02/09/2026)", "open"],
      [epImported, tenant, patientA, "Osteopatia", "closed"],
      [epForeign, otherTenant, patientForeign, "Episódio (03/09/2026)", "open"],
      [epClosedOwn, tenant, patientA, "Episódio (01/08/2026)", "closed"],
      // R31: everything on C and D that must NOT be reused for C's Osteopatia.
      [epCClosed, tenant, patientC, "Osteopatia (01/08/2026)", "closed"],
      [epCOther, tenant, patientC, "Fisioterapia (05/09/2026)", "open"],
      [epCPlain, tenant, patientC, "Episódio (05/09/2026)", "open"],
      [epCImportedOpen, tenant, patientC, "Osteopatia", "open"],
      [epDOpen, tenant, patientD, "Osteopatia (06/09/2026)", "open"],
    ] as const) {
      await db.execute(
        raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status)
            values (${id}::uuid, ${t}::uuid, ${patient}::uuid, ${title}, ${status}::episode_status)`,
      );
    }
    // R31: the import ledger names epCImportedOpen, in the importer's shape. The
    // importer closes every episode it writes; this one is OPEN on purpose, so
    // only the ledger can be the reason it is not reused.
    await db.execute(
      raw`insert into migration_staging_rows (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
          values (${tenant}::uuid, ${randomUUID()}::uuid, 'fisiozero', 'clinical_episode'::migration_entity_type,
                  ${`epi01b-r31-${epCImportedOpen.slice(0, 8)}`}, '{}'::jsonb, 'imported'::migration_staging_status, ${epCImportedOpen}::uuid)`,
    );
    // The source registos for "Nova versão", drafts so the cleanup can remove
    // them (createAddendum does not ask the source's status).
    const sourceRegisto = (id: string, ep: string) =>
      db.execute(
        raw`insert into clinical_records (id, tenant_id, patient_id, episode_id, form_template_id, practitioner_id, source, status, data)
            values (${id}::uuid, ${tenant}::uuid, ${patientA}::uuid, ${ep}::uuid, ${template}::uuid, ${therapist}::uuid,
                    'manual'::record_source, 'draft', '{}'::jsonb)`,
      );
    await sourceRegisto(ownSource, epA);
    await sourceRegisto(closedSource, epClosedOwn);
    // crossSource is the shape Q9 forbids: patient A's registo in patient B's
    // episode, sent by the admin connection (the application files none).
    // REG-03: a foreign key that refuses it is kept by name for the "Nova
    // versão" arm, which reads the refusal its side owes; anything else that
    // goes wrong here fails the suite.
    try {
      await sourceRegisto(crossSource, epB);
    } catch (e) {
      crossSourceRefusedBy = refusal.refusingForeignKey(e);
      if (crossSourceRefusedBy === null) throw e;
    }
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. FK order; only drafts were written. */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from audit_log where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from clinical_records where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from migration_staging_rows where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from clinical_episodes where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from form_templates where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from patients where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from users where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from tenants where id in (${tenant}::uuid, ${otherTenant}::uuid)`,
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

  it("REG-03: NAMES WHICH SIDE THIS DATABASE IS ON for the episode key, read from the catalogue; never half, never without it once promoted", async ({ annotate }) => {
    // AN ANNOTATION, with no assertion of its own. episodeKeyState THROWS in
    // beforeAll for a half-made key, or for a database without it once a
    // promoted migration names it, so reaching here means one of the two whole
    // sides. The line names which, in the log and on the test. The reading is
    // compared with the database's own answer in the another-tenant arm below.
    await annotate(key.detail, key.carried ? "notice" : "warning");
  });

  it("ANOTHER PATIENT'S episode: refused, and nothing is written", async () => {
    // Control: the therapist may file for patient B, and B's episode is really there.
    expect(await records.mayFileRegistoFor(ctx(therapist, "therapist"), patientB)).toBe(true);
    expect((await rows(raw`select 1 from clinical_episodes where id = ${epB}::uuid and patient_id = ${patientB}::uuid`)).length).toBe(1);
    const [before, audits] = [await countRecords(), await countAudit()];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        await codeOf(
          records.createDraftRecord(ctx(therapist, "therapist"), { patientId: patientA, formTemplateId: template, episodeId: epB }),
        ),
      ).toBe("episode_mismatch");
    } finally {
      warn.mockRestore();
    }
    expect(await countRecords()).toBe(before);
    expect(await countAudit()).toBe(audits);
  });

  it("the owner (whose policy arm admits any patient) is refused the same", async () => {
    const before = await countRecords();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        await codeOf(records.createDraftRecord(ctx(owner, "owner"), { patientId: patientA, formTemplateId: template, episodeId: epB })),
      ).toBe("episode_mismatch");
    } finally {
      warn.mockRestore();
    }
    expect(await countRecords()).toBe(before);
  });

  it("ANOTHER TENANT'S episode: refused, and nothing is written", async () => {
    // Control 1: the episode exists, in the other tenant.
    expect(
      (await rows(raw`select 1 from clinical_episodes where id = ${epForeign}::uuid and tenant_id = ${otherTenant}::uuid`)).length,
    ).toBe(1);
    const before = await countRecords();
    // Control 2 (REG-03), on both sides: the catalogue reading is compared with
    // the database's own answer. The same row is sent from the admin
    // connection, in a transaction that always rolls back, so the arm leaves
    // nothing. What answers for it is read by name and must be what the side
    // `key` named owes. Any other error fails the arm.
    const NO_KEY = "no foreign key";
    const answeredBy: string = await db
      .transaction(async (tx) => {
        await tx.execute(
          raw`insert into clinical_records (tenant_id, patient_id, episode_id, form_template_id, source, status, data)
              values (${tenant}::uuid, ${patientA}::uuid, ${epForeign}::uuid, ${template}::uuid, 'manual'::record_source, 'draft', '{}'::jsonb)`,
        );
        throw new Error("rollback");
      })
      .then(
        () => "committed",
        (e: Error) => {
          if (e.message === "rollback") return NO_KEY;
          const name = refusal.refusingForeignKey(e);
          if (name === null) throw e;
          return name;
        },
      );
    expect(answeredBy).toBe(key.carried ? refusal.EPISODE_PATIENT_TENANT_KEY : NO_KEY);
    expect(await countRecords()).toBe(before);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        await codeOf(
          records.createDraftRecord(ctx(therapist, "therapist"), { patientId: patientA, formTemplateId: template, episodeId: epForeign }),
        ),
      ).toBe("episode_mismatch");
    } finally {
      warn.mockRestore();
    }
    expect(await countRecords()).toBe(before);
  });

  it("CONTROL: the same patient's episode files the registo in it, in the therapist's name, audited", async () => {
    const { id, episodeId } = await records.createDraftRecord(ctx(therapist, "therapist"), {
      patientId: patientA,
      formTemplateId: template,
      episodeId: epA,
    });
    expect(episodeId).toBe(epA);
    const [row] = await rows<{ episode_id: string; patient_id: string; practitioner_id: string; status: string }>(
      raw`select episode_id::text, patient_id::text, practitioner_id::text, status::text from clinical_records where id = ${id}::uuid`,
    );
    expect(row).toEqual({ episode_id: epA, patient_id: patientA, practitioner_id: therapist, status: "draft" });
    const audit = await rows<{ action: string; episode: string }>(
      raw`select action, metadata->>'episodeId' as episode from audit_log where entity_id = ${id}::uuid`,
    );
    expect(audit).toEqual([{ action: "clinical_record.create", episode: epA }]);
  });

  it("Q7: '+ Avaliação' on an imported group, the patient having NO open episode of the specialty, opens a NEW one and files the registo there", async () => {
    // Control (R31): patient A really has no open episode naming Osteopatia yet.
    expect(
      await rows(raw`select 1 from clinical_episodes where patient_id = ${patientA}::uuid and status = 'open' and title like 'Osteopatia%'`),
    ).toHaveLength(0);
    const episodesBefore = await countEpisodes(patientA);
    const { id, episodeId } = await records.createDraftRecord(ctx(therapist, "therapist"), {
      patientId: patientA,
      formTemplateId: template,
      newEpisodeSpecialty: "Osteopatia",
    });
    expect(episodeId).not.toBeNull();
    expect(episodeId).not.toBe(epImported);
    expect(await countEpisodes(patientA)).toBe(episodesBefore + 1);
    const [ep] = await rows<{ title: string; status: string; patient_id: string; tenant_id: string; primary_practitioner_id: string }>(
      raw`select title, status::text, patient_id::text, tenant_id::text, primary_practitioner_id::text
          from clinical_episodes where id = ${episodeId}::uuid`,
    );
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date()).split("-").reverse().join("/");
    expect(ep).toEqual({
      title: `Osteopatia (${today})`,
      status: "open",
      patient_id: patientA,
      tenant_id: tenant,
      primary_practitioner_id: therapist,
    });
    const [rec] = await rows<{ episode_id: string }>(raw`select episode_id::text from clinical_records where id = ${id}::uuid`);
    expect(rec!.episode_id).toBe(episodeId);
    // The imported episode is untouched: still closed, still holding no new registo.
    const [imp] = await rows<{ status: string; n: number }>(
      raw`select e.status::text, (select count(*)::int from clinical_records r where r.episode_id = e.id) as n
          from clinical_episodes e where e.id = ${epImported}::uuid`,
    );
    expect(imp).toEqual({ status: "closed", n: 0 });
    const actions = await rows<{ action: string }>(
      raw`select action from audit_log where entity_id in (${id}::uuid, ${episodeId}::uuid) order by action`,
    );
    expect(actions.map((a) => a.action)).toEqual(["clinical_episode.create", "clinical_record.create"]);
  });

  it("Q7: a word off the list files nothing and opens no episode", async () => {
    const [recordsBefore, episodesBefore] = [await countRecords(), await countEpisodes(patientA)];
    expect(
      await codeOf(
        records.createDraftRecord(ctx(therapist, "therapist"), {
          patientId: patientA,
          formTemplateId: template,
          newEpisodeSpecialty: "Lombalgia aguda",
        }),
      ),
    ).toBe("invalid");
    expect(await countRecords()).toBe(recordsBefore);
    expect(await countEpisodes(patientA)).toBe(episodesBefore);
  });

  it("Q7: a registo refused for the patient leaves NO episode behind (one transaction)", async () => {
    const episodesBefore = await countEpisodes(patientA);
    expect(
      await codeOf(
        records.createDraftRecord(ctx(therapistUnrelated, "therapist"), {
          patientId: patientA,
          formTemplateId: template,
          newEpisodeSpecialty: "Fisioterapia",
        }),
      ),
    ).toBe("not_found");
    expect(await countEpisodes(patientA)).toBe(episodesBefore);
  });

  it("'Nova versão' of a registo in another patient's episode is refused; of one in its own, filed there", async () => {
    const before = await countRecords();
    if (key.carried) {
      // REG-03: the database refused that source registo itself, by the episode
      // key, when the fixture sent it. There is none to version.
      expect(crossSourceRefusedBy).toBe(refusal.EPISODE_PATIENT_TENANT_KEY);
      expect(await rows(raw`select 1 from clinical_records where id = ${crossSource}::uuid`)).toHaveLength(0);
      expect(await codeOf(records.createAddendum(ctx(therapist, "therapist"), crossSource))).toBe("not_found");
    } else {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(await codeOf(records.createAddendum(ctx(therapist, "therapist"), crossSource))).toBe("episode_mismatch");
      } finally {
        warn.mockRestore();
      }
    }
    expect(await countRecords()).toBe(before);

    const { id } = await records.createAddendum(ctx(therapist, "therapist"), ownSource);
    const [row] = await rows<{ episode_id: string; supersedes_id: string }>(
      raw`select episode_id::text, supersedes_id::text from clinical_records where id = ${id}::uuid`,
    );
    expect(row).toEqual({ episode_id: epA, supersedes_id: ownSource });
  });

  it("admin and reception are refused before anything is read or written", async () => {
    const before = await countRecords();
    for (const [user, role] of [
      [admin, "admin"],
      [admin, "reception"],
    ] as const) {
      expect(
        await codeOf(records.createDraftRecord(ctx(user, role), { patientId: patientA, formTemplateId: template, episodeId: epA })),
      ).toBe("ForbiddenError");
    }
    expect(await countRecords()).toBe(before);
  });
  // ------------------------------------------------------------------ R4 round 1

  it("MAJOR 1: a NEW registo in the patient's own CLOSED imported episode is refused (episode_closed), nothing written", async () => {
    // Control: the episode is really the patient's, and really closed.
    expect(
      await rows(raw`select 1 from clinical_episodes where id = ${epImported}::uuid and patient_id = ${patientA}::uuid and status = 'closed'`),
    ).toHaveLength(1);
    const [before, audits] = [await countRecords(), await countAudit()];
    for (const who of [ctx(therapist, "therapist"), ctx(owner, "owner")]) {
      expect(
        await codeOf(
          quiet(records.createDraftRecord(who, { patientId: patientA, formTemplateId: template, episodeId: epImported })),
        ),
      ).toBe("episode_closed");
    }
    expect(await countRecords()).toBe(before);
    expect(await countAudit()).toBe(audits);
  });

  it("MAJOR 1: the /clinical/new picker offers open episodes only", async () => {
    const offered = (await records.listEpisodesForPicker(ctx(therapist, "therapist"))).map((e) => e.id);
    expect(offered).toEqual(expect.arrayContaining([epA, epB]));
    expect(offered).not.toContain(epImported);
    expect(offered).not.toContain(epClosedOwn);
  });

  it("MAJOR 1 control: 'Nova versão' of a registo in a CLOSED episode still files in that episode (EPI-01a)", async () => {
    const { id } = await records.createAddendum(ctx(therapist, "therapist"), closedSource);
    const [row] = await rows<{ episode_id: string }>(raw`select episode_id::text from clinical_records where id = ${id}::uuid`);
    expect(row!.episode_id).toBe(epClosedOwn);
  });

  it("MAJOR 2: Q7 is one transaction: the episode insert succeeds, the registo insert fails, and no episode is left", async () => {
    const missingTemplate = randomUUID(); // no such form_templates row: the registo INSERT fails on its foreign key
    expect(await rows(raw`select 1 from form_templates where id = ${missingTemplate}::uuid`)).toHaveLength(0);
    const [episodesBefore, recordsBefore] = [await countEpisodes(patientA), await countRecords()];
    const outcome = await codeOf(
      records.createDraftRecord(ctx(therapist, "therapist"), {
        patientId: patientA,
        formTemplateId: missingTemplate,
        newEpisodeSpecialty: "Fisioterapia",
      }),
    );
    expect(outcome).not.toBe("resolved");
    expect(await countEpisodes(patientA)).toBe(episodesBefore);
    expect(await countRecords()).toBe(recordsBefore);
  });

  it("MINOR 3: the owner with ANOTHER TENANT'S patient is refused (not_found) on every write path; nothing written", async () => {
    // Control: the foreign key alone takes an episode for a patient of another
    // tenant (rolled back), which is the gap.
    let fkTookIt = false;
    await db
      .transaction(async (tx) => {
        await tx.execute(
          raw`insert into clinical_episodes (tenant_id, patient_id, title) values (${tenant}::uuid, ${patientForeign}::uuid, 'Osteopatia')`,
        );
        fkTookIt = true;
        throw new Error("rollback");
      })
      .catch((e: Error) => {
        if (e.message !== "rollback") throw e;
      });
    expect(fkTookIt).toBe(true);

    const [episodes, recs] = [await countEpisodesAll(), await countRecordsAll()];
    const asOwner = ctx(owner, "owner");
    expect(
      await codeOf(records.createDraftRecord(asOwner, { patientId: patientForeign, formTemplateId: template })),
    ).toBe("not_found");
    expect(
      await codeOf(
        records.createDraftRecord(asOwner, { patientId: patientForeign, formTemplateId: template, newEpisodeSpecialty: "Osteopatia" }),
      ),
    ).toBe("not_found");
    // "+ Episódio" (createEpisode) is the therapist's alone since EPI-01b piece 2:
    // the owner is refused by role, and the therapist by the patient read. Its
    // own arms are in episodes.create.db.test.ts.
    expect(await codeOf(episodes_.createEpisode(asOwner, { patientId: patientForeign, specialty: "Osteopatia" }))).toBe(
      "ForbiddenError",
    );
    expect(
      await codeOf(episodes_.createEpisode(ctx(therapist, "therapist"), { patientId: patientForeign, specialty: "Osteopatia" })),
    ).toBe("not_found");
    expect(await countEpisodesAll()).toBe(episodes);
    expect(await countRecordsAll()).toBe(recs);
  });

  it("MINOR 3 control: the owner files for the tenant's own patient, and the therapist opens an episode for it", async () => {
    const asOwner = ctx(owner, "owner");
    const { id } = await records.createDraftRecord(asOwner, { patientId: patientB, formTemplateId: template });
    const [row] = await rows<{ patient_id: string; practitioner_id: string }>(
      raw`select patient_id::text, practitioner_id::text from clinical_records where id = ${id}::uuid`,
    );
    expect(row).toEqual({ patient_id: patientB, practitioner_id: owner });
    const opened = await episodes_.createEpisode(ctx(therapist, "therapist"), { patientId: patientB, specialty: "Osteopatia" });
    if (opened.kind !== "created") throw new Error(`expected a new episode, got ${opened.kind}`);
    const [e] = await rows<{ patient_id: string; status: string }>(
      raw`select patient_id::text, status::text from clinical_episodes where id = ${opened.id}::uuid`,
    );
    expect(e).toEqual({ patient_id: patientB, status: "open" });
  });
  // ------------------------------------------------------------------ R31 (Q7)
  // "+ Avaliação" on an imported group "reuses the patient's open app episode of
  // that specialty and creates one only when none exists". Patient C; the arms
  // run in order and each builds on the one before it.

  /** C's open episodes whose title names Osteopatia and the ledger does not name. */
  const openAppOsteopatiaOf = async (patient: string) =>
    (
      await rows<{ id: string }>(
        raw`select e.id::text as id
              from clinical_episodes e
             where e.patient_id = ${patient}::uuid
               and e.status = 'open'
               and e.title ~ '^Osteopatia( [(][0-9]{2}/[0-9]{2}/[0-9]{4}[)])?$'
               and not exists (select 1 from migration_staging_rows l
                                where l.entity_type = 'clinical_episode' and l.imported_entity_id = e.id)
             order by e.opened_at desc, e.id`,
      )
    ).map((r) => r.id);
  const episodeOf = async (record: string) =>
    (await rows<{ episode_id: string }>(raw`select episode_id::text from clinical_records where id = ${record}::uuid`))[0]!.episode_id;
  const osteopatiaFor = (who: RequestContext, patient: string) =>
    records.createDraftRecord(who, { patientId: patient, formTemplateId: template, newEpisodeSpecialty: "Osteopatia" });

  let reused = ""; // the episode the CREATE arm opens for C, which every later arm must reuse
  let firstRecord = "";

  it("R31 CREATE: none of the episodes that do not fit is reused (closed, other specialty, no specialty, imported, another patient's); one is opened", async () => {
    // Controls: every row that must not be reused is really there, as described.
    const there = await rows<{ id: string; patient_id: string; title: string; status: string; ledger: boolean }>(
      raw`select e.id::text, e.patient_id::text, e.title, e.status::text,
                 exists (select 1 from migration_staging_rows l
                          where l.entity_type = 'clinical_episode' and l.imported_entity_id = e.id) as ledger
            from clinical_episodes e
           where e.id in (${epCClosed}::uuid, ${epCOther}::uuid, ${epCPlain}::uuid, ${epCImportedOpen}::uuid, ${epDOpen}::uuid)`,
    );
    const byId = Object.fromEntries(there.map((r) => [r.id, r]));
    expect(byId[epCClosed]).toMatchObject({ patient_id: patientC, title: "Osteopatia (01/08/2026)", status: "closed", ledger: false });
    expect(byId[epCOther]).toMatchObject({ patient_id: patientC, title: "Fisioterapia (05/09/2026)", status: "open", ledger: false });
    expect(byId[epCPlain]).toMatchObject({ patient_id: patientC, title: "Episódio (05/09/2026)", status: "open", ledger: false });
    expect(byId[epCImportedOpen]).toMatchObject({ patient_id: patientC, title: "Osteopatia", status: "open", ledger: true });
    expect(byId[epDOpen]).toMatchObject({ patient_id: patientD, title: "Osteopatia (06/09/2026)", status: "open", ledger: false });
    // The therapist may file for both patients, so only the episode can be the reason.
    expect(await records.mayFileRegistoFor(ctx(therapist, "therapist"), patientC)).toBe(true);
    expect(await records.mayFileRegistoFor(ctx(therapist, "therapist"), patientD)).toBe(true);
    expect(await openAppOsteopatiaOf(patientC)).toEqual([]);

    const [episodesC, episodesD] = [await countEpisodes(patientC), await countEpisodes(patientD)];
    const { id, episodeId } = await osteopatiaFor(ctx(therapist, "therapist"), patientC);
    expect([epCClosed, epCOther, epCPlain, epCImportedOpen, epDOpen]).not.toContain(episodeId);
    expect(await countEpisodes(patientC)).toBe(episodesC + 1);
    expect(await countEpisodes(patientD)).toBe(episodesD);
    expect(await openAppOsteopatiaOf(patientC)).toEqual([episodeId]);
    expect(await episodeOf(id)).toBe(episodeId);
    // Nothing was filed in any of the others.
    expect(
      await rows(
        raw`select 1 from clinical_records
             where episode_id in (${epCClosed}::uuid, ${epCOther}::uuid, ${epCPlain}::uuid, ${epCImportedOpen}::uuid, ${epDOpen}::uuid)`,
      ),
    ).toHaveLength(0);
    reused = episodeId!;
    firstRecord = id;
  });

  it("R31 REUSE: the next '+ Avaliação' files in that episode; no episode is opened and the only audit row is the registo's", async () => {
    expect(reused).not.toBe("");
    const [episodesC, audits] = [await countEpisodes(patientC), await countAudit()];
    const { id, episodeId } = await osteopatiaFor(ctx(therapist, "therapist"), patientC);
    expect(episodeId).toBe(reused);
    expect(await episodeOf(id)).toBe(reused);
    expect(await episodeOf(firstRecord)).toBe(reused);
    expect(await countEpisodes(patientC)).toBe(episodesC);
    expect(await openAppOsteopatiaOf(patientC)).toEqual([reused]);
    expect(await countAudit()).toBe(audits + 1);
    const audit = await rows<{ action: string; episode: string }>(
      raw`select action, metadata->>'episodeId' as episode from audit_log where entity_id = ${id}::uuid`,
    );
    expect(audit).toEqual([{ action: "clinical_record.create", episode: reused }]);
    // The reused episode is as it was: open, the therapist's, one create audit row from the arm above.
    const [ep] = await rows<{ status: string; primary_practitioner_id: string; n: number }>(
      raw`select e.status::text, e.primary_practitioner_id::text,
                 (select count(*)::int from audit_log a where a.entity_id = e.id) as n
            from clinical_episodes e where e.id = ${reused}::uuid`,
    );
    expect(ep).toEqual({ status: "open", primary_practitioner_id: therapist, n: 1 });
  });

  it("R31 REUSE: the owner files in the same episode; a ledger row of ANOTHER entity type carrying its id does not make it imported", async () => {
    // Only a 'clinical_episode' ledger row says an episode is imported. A row of
    // another entity type whose id happens to be this episode's is not that fact.
    await db.execute(
      raw`insert into migration_staging_rows (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
          values (${tenant}::uuid, ${randomUUID()}::uuid, 'fisiozero', 'clinical_record'::migration_entity_type,
                  ${`epi01b-r31-other-${reused.slice(0, 8)}`}, '{}'::jsonb, 'imported'::migration_staging_status, ${reused}::uuid)`,
    );
    const episodesC = await countEpisodes(patientC);
    const { id, episodeId } = await osteopatiaFor(ctx(owner, "owner"), patientC);
    expect(episodeId).toBe(reused);
    expect(await episodeOf(id)).toBe(reused);
    expect(await countEpisodes(patientC)).toBe(episodesC);
  });

  it("R31: the OTHER specialty has its own open episode on C, and is filed there, not in the Osteopatia one", async () => {
    const episodesC = await countEpisodes(patientC);
    const { episodeId } = await records.createDraftRecord(ctx(therapist, "therapist"), {
      patientId: patientC,
      formTemplateId: template,
      newEpisodeSpecialty: "Fisioterapia",
    });
    expect(episodeId).toBe(epCOther);
    expect(await countEpisodes(patientC)).toBe(episodesC);
  });

  it("R31: another patient's '+ Avaliação' reuses THEIR open episode, never C's", async () => {
    const episodesD = await countEpisodes(patientD);
    const { episodeId } = await osteopatiaFor(ctx(therapist, "therapist"), patientD);
    expect(episodeId).toBe(epDOpen);
    expect(await countEpisodes(patientD)).toBe(episodesD);
  });

  it("R31: a registo refused AFTER the episode was chosen leaves nothing: no registo, no new episode", async () => {
    const missingTemplate = randomUUID();
    const [episodesC, recs, audits] = [await countEpisodes(patientC), await countRecords(), await countAudit()];
    const outcome = await codeOf(
      records.createDraftRecord(ctx(therapist, "therapist"), {
        patientId: patientC,
        formTemplateId: missingTemplate,
        newEpisodeSpecialty: "Osteopatia",
      }),
    );
    expect(outcome).not.toBe("resolved");
    expect(await countEpisodes(patientC)).toBe(episodesC);
    expect(await countRecords()).toBe(recs);
    expect(await countAudit()).toBe(audits);
  });

  it("R31 MORE THAN ONE: the most recently opened is the one, and the older ones are left as they are", async () => {
    // A second and a third open app Osteopatia episode on C, as two requests
    // before this rule would have left them: one opened AFTER the reused one,
    // one long before it.
    const [later, earlier] = [randomUUID(), randomUUID()];
    await db.execute(
      raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status, opened_at)
          values (${later}::uuid, ${tenant}::uuid, ${patientC}::uuid, 'Osteopatia (01/01/2020)', 'open', now() + interval '1 day'),
                 (${earlier}::uuid, ${tenant}::uuid, ${patientC}::uuid, 'Osteopatia (31/12/2099)', 'open', now() - interval '400 days')`,
    );
    // Control: three candidates, and `later` is the most recently opened (its
    // TITLE carries the oldest date, so the title's date cannot be what decides).
    expect(await openAppOsteopatiaOf(patientC)).toEqual([later, reused, earlier]);
    const episodesC = await countEpisodes(patientC);
    for (const who of [ctx(therapist, "therapist"), ctx(owner, "owner")]) {
      const { id, episodeId } = await osteopatiaFor(who, patientC);
      expect(episodeId).toBe(later);
      expect(await episodeOf(id)).toBe(later);
    }
    expect(await countEpisodes(patientC)).toBe(episodesC);
    // Closing the most recent hands the next registo to the next most recent.
    await db.execute(raw`update clinical_episodes set status = 'closed', closed_at = now() where id = ${later}::uuid`);
    expect((await osteopatiaFor(ctx(therapist, "therapist"), patientC)).episodeId).toBe(reused);
    expect(await countEpisodes(patientC)).toBe(episodesC);
  });

  it("R31 AT ONCE: several requests for a patient with no open episode of the specialty open ONE, and all file in it", async () => {
    expect(await countEpisodes(patientE)).toBe(0);
    const who = ctx(therapist, "therapist");
    // Open the pool's connections first, so the requests below really overlap
    // (a cold pool hands the first one a connection and makes the rest wait).
    await Promise.all(Array.from({ length: 5 }, () => records.mayFileRegistoFor(who, patientE)));
    const filed = await Promise.all(Array.from({ length: 5 }, () => osteopatiaFor(who, patientE)));
    expect(new Set(filed.map((f) => f.id)).size).toBe(5);
    expect(new Set(filed.map((f) => f.episodeId)).size).toBe(1);
    expect(await countEpisodes(patientE)).toBe(1);
    expect(await openAppOsteopatiaOf(patientE)).toEqual([filed[0]!.episodeId]);
    const [n] = await rows<{ n: number }>(
      raw`select count(*)::int as n from clinical_records where patient_id = ${patientE}::uuid and episode_id = ${filed[0]!.episodeId}::uuid`,
    );
    expect(n!.n).toBe(5);
  }, 60_000);

  it("R31 THE LOCK: the write waits for a transaction holding the patient-and-specialty lock, then reuses the episode it committed", async () => {
    expect(await countEpisodes(patientF)).toBe(0);
    const who = ctx(therapist, "therapist");
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const held = randomUUID(); // the episode the lock holder commits

    // CONTROL: a lock on ANOTHER specialty, or ANOTHER patient, does not make it
    // wait. Held by this transaction while a Fisioterapia write for F completes.
    await db.transaction(async (tx) => {
      await tx.execute(episodes_.specialtyEpisodeLock(tenant, patientF, "Osteopatia"));
      await tx.execute(episodes_.specialtyEpisodeLock(tenant, patientE, "Fisioterapia"));
      const { episodeId } = await records.createDraftRecord(who, {
        patientId: patientF,
        formTemplateId: template,
        newEpisodeSpecialty: "Fisioterapia",
      });
      expect(episodeId).not.toBeNull();
    });
    expect(await openAppOsteopatiaOf(patientF)).toEqual([]);
    const episodesF = await countEpisodes(patientF);

    // The same lock: the write does not finish while it is held.
    let settled = false;
    let pending: Promise<{ id: string; episodeId: string | null }> | null = null;
    await db.transaction(async (tx) => {
      await tx.execute(episodes_.specialtyEpisodeLock(tenant, patientF, "Osteopatia"));
      pending = osteopatiaFor(who, patientF);
      pending.then(
        () => (settled = true),
        () => (settled = true),
      );
      await sleep(750);
      expect(settled, "the write finished while another transaction held its lock").toBe(false);
      // Nothing of the write is visible yet either: no episode, as before.
      expect(await countEpisodes(patientF)).toBe(episodesF);
      await tx.execute(
        raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status)
            values (${held}::uuid, ${tenant}::uuid, ${patientF}::uuid, 'Osteopatia (01/10/2026)', 'open')`,
      );
    });
    // Committed: the write goes on, reads the episode that now exists, and reuses it.
    const filed = await pending!;
    expect(filed.episodeId).toBe(held);
    expect(await episodeOf(filed.id)).toBe(held);
    expect(await countEpisodes(patientF)).toBe(episodesF + 1); // the holder's, and no second one
    expect(await openAppOsteopatiaOf(patientF)).toEqual([held]);
  }, 60_000);
  // ------------------------------------------------------------------ R4 on the R31 commit

  it("R31 MINOR 2: on the CREATE path, a registo refused after the NEW episode was inserted rolls the episode back", async () => {
    // Control: G has no episode at all, so this write cannot reuse: it must open one.
    expect(await countEpisodes(patientG)).toBe(0);
    expect(await records.mayFileRegistoFor(ctx(therapist, "therapist"), patientG)).toBe(true);
    const missingTemplate = randomUUID(); // no such form_templates row: the registo INSERT fails on its foreign key
    expect(await rows(raw`select 1 from form_templates where id = ${missingTemplate}::uuid`)).toHaveLength(0);
    const [recs, audits] = [await countRecords(), await countAudit()];

    let failure: unknown = null;
    try {
      await records.createDraftRecord(ctx(therapist, "therapist"), {
        patientId: patientG,
        formTemplateId: missingTemplate,
        newEpisodeSpecialty: "Osteopatia",
      });
    } catch (e) {
      failure = e;
    }
    // It failed AT THE REGISTO INSERT, which comes after the episode insert: a
    // foreign key violation (23503) on clinical_records' template, not a refusal
    // made before anything was written.
    expect(failure).not.toBeNull();
    const text = [failure, (failure as { cause?: unknown }).cause]
      .map((e) => `${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? ""} ${(e as { constraint_name?: string })?.constraint_name ?? ""}`)
      .join(" ");
    expect(text).toContain("23503");
    expect(text).toContain("clinical_records");

    // Nothing is left: no episode (open or otherwise), no registo, no audit row.
    expect(await countEpisodes(patientG)).toBe(0);
    expect(await rows(raw`select 1 from clinical_records where patient_id = ${patientG}::uuid`)).toHaveLength(0);
    expect(await countRecords()).toBe(recs);
    expect(await countAudit()).toBe(audits);

    // CONTROL: the same call with a template that exists DOES open the episode,
    // so the arm above really was on the path that inserts one.
    const { id, episodeId } = await osteopatiaFor(ctx(therapist, "therapist"), patientG);
    expect(await countEpisodes(patientG)).toBe(1);
    expect(await openAppOsteopatiaOf(patientG)).toEqual([episodeId]);
    expect(await episodeOf(id)).toBe(episodeId);
    const created = await rows<{ action: string }>(
      raw`select action from audit_log where entity_id in (${id}::uuid, ${episodeId}::uuid) order by action`,
    );
    expect(created.map((a) => a.action)).toEqual(["clinical_episode.create", "clinical_record.create"]);
  });

  it("R31 MINOR 1: a patient id posted in UPPERCASE reuses the open episode and waits on the same lock", async () => {
    const who = ctx(therapist, "therapist");
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    // F has exactly one open app Osteopatia episode (the lock arm's). Its id in
    // uppercase is a different TEXT and the same uuid.
    const [open] = await openAppOsteopatiaOf(patientF);
    expect(open).toBeTruthy();
    expect(await openAppOsteopatiaOf(patientF)).toHaveLength(1);
    const upper = patientF.toUpperCase();
    expect(upper).not.toBe(patientF);
    expect(await rows(raw`select 1 from patients where id = ${upper}::uuid and id = ${patientF}::uuid`)).toHaveLength(1);

    // REUSE: no second episode, for the therapist and the owner.
    const episodesF = await countEpisodes(patientF);
    for (const asWho of [who, ctx(owner, "owner")]) {
      const { id, episodeId } = await osteopatiaFor(asWho, upper);
      expect(episodeId).toBe(open);
      expect(await episodeOf(id)).toBe(open);
    }
    expect(await countEpisodes(patientF)).toBe(episodesF);
    expect(await openAppOsteopatiaOf(patientF)).toEqual([open]);

    // THE SAME LOCK: held here under the LOWERCASE key, the uppercase request waits.
    let settled = false;
    let pending: Promise<{ id: string; episodeId: string | null }> | null = null;
    await db.transaction(async (tx) => {
      await tx.execute(episodes_.specialtyEpisodeLock(tenant, patientF, "Osteopatia"));
      pending = osteopatiaFor(who, upper);
      pending.then(
        () => (settled = true),
        () => (settled = true),
      );
      await sleep(750);
      expect(settled, "the uppercase request did not wait for the lowercase lock").toBe(false);
    });
    const filed = await pending!;
    expect(filed.episodeId).toBe(open);
    expect(await countEpisodes(patientF)).toBe(episodesF);

    // And on a patient with NO open episode of the specialty: uppercase and
    // lowercase requests at once still open ONE (Fisioterapia on G, which has none).
    expect(
      await rows(raw`select 1 from clinical_episodes where patient_id = ${patientG}::uuid and title like 'Fisioterapia%'`),
    ).toHaveLength(0);
    const fisio = (patient: string) =>
      records.createDraftRecord(who, { patientId: patient, formTemplateId: template, newEpisodeSpecialty: "Fisioterapia" });
    const before = await countEpisodes(patientG);
    await Promise.all(Array.from({ length: 5 }, () => records.mayFileRegistoFor(who, patientG)));
    const mixed = await Promise.all([
      fisio(patientG.toUpperCase()),
      fisio(patientG),
      fisio(patientG.toUpperCase()),
      fisio(patientG),
    ]);
    expect(new Set(mixed.map((f) => f.episodeId)).size).toBe(1);
    expect(await countEpisodes(patientG)).toBe(before + 1);
  }, 60_000);
  // ------------------------------------------------------------------ REG-03

  it("REG-03 THE DRIVER'S SHAPE: a registo INSERT refused by ANOTHER foreign key reaches the caller wrapped and unmapped, the SQLSTATE and the key's name on the cause", async () => {
    const OTHER_KEY = "clinical_records_form_template_id_form_templates_id_fk";
    const missingTemplate = randomUUID(); // no such form_templates row: the registo INSERT fails on that foreign key
    expect(await rows(raw`select 1 from form_templates where id = ${missingTemplate}::uuid`)).toHaveLength(0);
    const [recs, audits] = [await countRecords(), await countAudit()];

    let failure: unknown = null;
    try {
      // In patient A's own open episode, so the application's guard passes and
      // the INSERT is reached.
      await records.createDraftRecord(ctx(therapist, "therapist"), {
        patientId: patientA,
        formTemplateId: missingTemplate,
        episodeId: epA,
      });
    } catch (e) {
      failure = e;
    }
    expect(failure).not.toBeNull();
    // Unmapped: the error Drizzle raised, not a refusal of the application's.
    expect((failure as Error).name).not.toBe("ClinicalError");
    // The outer error carries neither field; its cause, the driver's error, carries both.
    const outer = failure as { code?: unknown; constraint_name?: unknown; cause?: { code?: unknown; constraint_name?: unknown } };
    expect(outer.code).toBeUndefined();
    expect(outer.constraint_name).toBeUndefined();
    expect(outer.cause?.code).toBe("23503");
    expect(outer.cause?.constraint_name).toBe(OTHER_KEY);
    // The reader the writers use finds the name there, and it is not the episode key.
    expect(refusal.refusingForeignKey(failure)).toBe(OTHER_KEY);
    expect(refusal.isEpisodeKeyRefusal(failure)).toBe(false);
    expect(await countRecords()).toBe(recs);
    expect(await countAudit()).toBe(audits);
  });
});

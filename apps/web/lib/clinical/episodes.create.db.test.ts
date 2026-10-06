/**
 * episodes.create.db.test.ts: EPI-01b, piece 2. "+ Episódio" (`createEpisode`)
 * AGAINST REAL ROWS, AS THE REAL PRINCIPALS, beside piece 1's guard suite
 * (records.episode-guard.db.test.ts).
 *
 * THE ARMS, each refusal with a control proving its subject is really there:
 *   - THE ROW: a therapist opens an episode for a patient they registered. What
 *     lands is the server-built title ("<specialty> (<Lisbon day>)"), status
 *     open, that patient, the caller's tenant and name, and ONE audit row
 *     (`clinical_episode.create`) whose metadata is the patient id and nothing
 *     else;
 *   - THE TITLE: a title (or any other text) added to the input is not stored
 *     anywhere; a word off the list opens nothing;
 *   - REFUSED CALLERS LEAVE NO ROW: the owner, an admin and reception (by role);
 *     a therapist who neither treats nor created the patient; the therapist
 *     with another tenant's patient; another tenant's therapist with this
 *     tenant's patient. No episode and no audit row after any of them;
 *   - AN OPEN EPISODE OF THE SPECIALTY: a second call opens nothing and names
 *     the first; so does a confirmation that names some other episode; a
 *     confirmation that names it opens another, which is then the one named,
 *     and the one "+ Avaliação" on an imported group files in (ruling R31: the
 *     most recently opened). The first episode is left exactly as it was;
 *   - IT NEVER TOUCHES AN EXISTING EPISODE: with a closed episode of the
 *     specialty, an open one of the other specialty, an open one naming no
 *     specialty and an OPEN one the import ledger names all really there, none
 *     of them counts as open-of-the-specialty, one is opened, and every one of
 *     those rows reads back identical;
 *   - AT ONCE: two unconfirmed calls for a patient with none open ONE episode;
 *     the other is answered with it;
 *   - THE TAB'S READ (`listOpenAppEpisodes`): open app episodes only, most
 *     recently opened first, `empty` true only with no registo filed; an empty
 *     list for a therapist who may not write for the patient and for another
 *     tenant's caller; refused to a role that does not author.
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

/** The clinic's calendar day, dd/mm/yyyy, as the server titles a new episode. */
const lisbonDay = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date()).split("-").reverse().join("/");

d("EPI-01b piece 2: '+ Episódio' under real RLS", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let episodes: typeof import("./episodes");
  let records: typeof import("./records");

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const owner = randomUUID();
  const admin = randomUUID();
  const reception = randomUUID();
  const therapist = randomUUID(); // registered every patient of `tenant`, so may write for each
  const therapistUnrelated = randomUUID(); // same tenant, no relation to any patient
  const otherTenantTherapist = randomUUID();
  const patientRow = randomUUID(); // the row arms
  const patientOpen = randomUUID(); // the open-episode arms
  const patientKeep = randomUUID(); // holds episodes that must not change or count
  const patientRace = randomUUID(); // the at-once arm
  const patientForeign = randomUUID(); // the other tenant's
  const template = randomUUID();
  const epKeepClosed = randomUUID(); // a CLOSED app episode of the specialty
  const epKeepOther = randomUUID(); // an open app episode of the OTHER specialty
  const epKeepPlain = randomUUID(); // an open app episode naming no specialty
  const epKeepImportedOpen = randomUUID(); // an OPEN episode the import ledger names

  const ctx = (userId: string, role: RequestContext["role"], tenantId = tenant): RequestContext => ({ tenantId, role, userId });
  const asTherapist = () => ctx(therapist, "therapist");

  async function rows<T>(q: ReturnType<typeof raw>): Promise<T[]> {
    return (await db.execute(q)) as unknown as T[];
  }
  /** The ClinicalError code, the error's name for any other error, or "resolved". */
  async function codeOf(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      return typeof code === "string" ? code : (e as Error).name;
    }
    return "resolved";
  }
  type EpisodeRow = {
    id: string;
    tenant_id: string;
    patient_id: string;
    title: string;
    status: string;
    primary_practitioner_id: string | null;
    opened_at: string;
    closed_at: string | null;
  };
  const episodesOf = (patient: string) =>
    rows<EpisodeRow>(
      raw`select id::text, tenant_id::text, patient_id::text, title, status::text, primary_practitioner_id::text,
                 opened_at::text, closed_at::text
            from clinical_episodes where patient_id = ${patient}::uuid order by opened_at, id`,
    );
  const countEpisodesAll = async () =>
    (await rows<{ n: number }>(
      raw`select count(*)::int as n from clinical_episodes where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    ))[0]!.n;
  const countAuditAll = async () =>
    (await rows<{ n: number }>(
      raw`select count(*)::int as n from audit_log where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    ))[0]!.n;
  /** Open a new episode, or fail the test with what came back instead. */
  async function open(who: RequestContext, input: Parameters<typeof episodes.createEpisode>[1]): Promise<string> {
    const result = await episodes.createEpisode(who, input);
    if (result.kind !== "created") throw new Error(`expected a new episode, got ${JSON.stringify(result)}`);
    return result.id;
  }

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    episodes = await import("./episodes");
    records = await import("./records");

    for (const [id, slug] of [
      [tenant, "epi01b-novo"],
      [otherTenant, "epi01b-novo-other"],
    ] as const) {
      await db.execute(raw`insert into tenants (id, name, slug) values (${id}::uuid, ${slug}, ${`${slug}-${id.slice(0, 8)}`})`);
    }
    for (const [id, t, label] of [
      [owner, tenant, "owner"],
      [admin, tenant, "admin"],
      [reception, tenant, "reception"],
      [therapist, tenant, "therapist"],
      [therapistUnrelated, tenant, "unrelated"],
      [otherTenantTherapist, otherTenant, "other"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${t}::uuid, ${`${label}-${id.slice(0, 8)}@example.test`}, ${`Zzz ${label} Teste`})`,
      );
    }
    for (const [id, t, name, by] of [
      [patientRow, tenant, "Zzz Novo Episodio Teste A", therapist],
      [patientOpen, tenant, "Zzz Novo Episodio Teste B", therapist],
      [patientKeep, tenant, "Zzz Novo Episodio Teste C", therapist],
      [patientRace, tenant, "Zzz Novo Episodio Teste D", therapist],
      [patientForeign, otherTenant, "Zzz Novo Episodio Teste Outro", otherTenantTherapist],
    ] as const) {
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, created_by) values (${id}::uuid, ${t}::uuid, ${name}, ${by}::uuid)`,
      );
    }
    await db.execute(
      raw`insert into form_templates (id, tenant_id, key, title, schema)
          values (${template}::uuid, ${tenant}::uuid, 'epi01b-novo', '{"pt":"Ficha Teste","en":"Test record"}'::jsonb, '{}'::jsonb)`,
    );
    for (const [id, title, status] of [
      [epKeepClosed, "Osteopatia (01/08/2026)", "closed"],
      [epKeepOther, "Fisioterapia (05/09/2026)", "open"],
      [epKeepPlain, "Episódio (05/09/2026)", "open"],
      [epKeepImportedOpen, "Osteopatia", "open"],
    ] as const) {
      await db.execute(
        raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status, opened_at)
            values (${id}::uuid, ${tenant}::uuid, ${patientKeep}::uuid, ${title}, ${status}::episode_status, '2026-09-05T09:00:00Z')`,
      );
    }
    // The import ledger names epKeepImportedOpen, in the importer's shape. The
    // importer closes every episode it writes; this one is OPEN on purpose, so
    // only the ledger can be the reason it does not count.
    await db.execute(
      raw`insert into migration_staging_rows (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
          values (${tenant}::uuid, ${randomUUID()}::uuid, 'fisiozero', 'clinical_episode'::migration_entity_type,
                  ${`epi01b-novo-${epKeepImportedOpen.slice(0, 8)}`}, '{}'::jsonb, 'imported'::migration_staging_status, ${epKeepImportedOpen}::uuid)`,
    );
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

  // ------------------------------------------------------------------ the row
  it("THE ROW: the server-built title, open, the right patient and tenant, the caller's name; one audit row, ids only", async () => {
    expect(await episodesOf(patientRow)).toEqual([]);
    const audits = await countAuditAll();
    const dayBefore = lisbonDay();
    const id = await open(asTherapist(), { patientId: patientRow, specialty: "Osteopatia" });
    const dayAfter = lisbonDay();

    const all = await episodesOf(patientRow);
    expect(all).toHaveLength(1);
    const row = all[0]!;
    expect(row).toMatchObject({
      id,
      tenant_id: tenant,
      patient_id: patientRow,
      status: "open",
      primary_practitioner_id: therapist,
      closed_at: null,
    });
    expect([`Osteopatia (${dayBefore})`, `Osteopatia (${dayAfter})`]).toContain(row.title);
    expect(row.title).toMatch(/^Osteopatia \(\d{2}\/\d{2}\/\d{4}\)$/);

    expect(await countAuditAll()).toBe(audits + 1);
    const audit = await rows<{ action: string; entity_type: string; actor_user_id: string; tenant_id: string; metadata: unknown }>(
      raw`select action, entity_type, actor_user_id::text, tenant_id::text, metadata from audit_log where entity_id = ${id}::uuid`,
    );
    expect(audit).toEqual([
      {
        action: "clinical_episode.create",
        entity_type: "clinical_episode",
        actor_user_id: therapist,
        tenant_id: tenant,
        metadata: { patientId: patientRow },
      },
    ]);
  });

  it("THE TITLE: text added to the input is stored nowhere; the row carries the specialty and the date", async () => {
    const typed = `Texto escrito pelo cliente ${randomUUID()}`;
    const input = { patientId: patientRow, specialty: "Fisioterapia", title: typed, complaint: typed, diagnosis: typed, notes: typed };
    const id = await open(asTherapist(), input);
    const [row] = await rows<{ title: string; whole: string }>(
      raw`select title, to_jsonb(e)::text as whole from clinical_episodes e where id = ${id}::uuid`,
    );
    expect(row!.title).toMatch(/^Fisioterapia \(\d{2}\/\d{2}\/\d{4}\)$/);
    expect(row!.whole).not.toContain(typed);
    const inAudit = await rows<{ n: number }>(
      raw`select count(*)::int as n from audit_log a where tenant_id = ${tenant}::uuid and to_jsonb(a)::text like ${`%${typed}%`}`,
    );
    expect(inAudit[0]!.n).toBe(0);
  });

  it("a specialty that is not exactly a word on the list, or a malformed patient id, opens nothing", async () => {
    const [before, audits] = [await countEpisodesAll(), await countAuditAll()];
    for (const bad of ["", "osteopatia", "Osteopatia ", "Osteopatia (05/10/2026)", "Texto escrito pelo cliente"]) {
      expect(await codeOf(episodes.createEpisode(asTherapist(), { patientId: patientRow, specialty: bad })), JSON.stringify(bad)).toBe(
        "invalid",
      );
    }
    expect(await codeOf(episodes.createEpisode(asTherapist(), { patientId: "not-a-uuid", specialty: "Osteopatia" }))).toBe("invalid");
    expect(await countEpisodesAll()).toBe(before);
    expect(await countAuditAll()).toBe(audits);
  });

  // ------------------------------------------------------------ refused callers
  it("REFUSED CALLERS LEAVE NO ROW: owner, admin and reception by role; a therapist outside the patient's reach; either side of the tenant line", async () => {
    // Controls: every subject is really there, and the treating therapist's own call is not refused.
    expect((await rows(raw`select 1 from patients where id = ${patientKeep}::uuid and tenant_id = ${tenant}::uuid`)).length).toBe(1);
    expect((await rows(raw`select 1 from patients where id = ${patientForeign}::uuid and tenant_id = ${otherTenant}::uuid`)).length).toBe(1);
    expect(await records.mayFileRegistoFor(asTherapist(), patientRace)).toBe(true);
    expect(await records.mayFileRegistoFor(ctx(therapistUnrelated, "therapist"), patientRace)).toBe(false);

    const [before, audits] = [await countEpisodesAll(), await countAuditAll()];
    const refusals: [string, RequestContext, string, string][] = [
      ["owner", ctx(owner, "owner"), patientRace, "ForbiddenError"],
      ["admin", ctx(admin, "admin"), patientRace, "ForbiddenError"],
      ["reception", ctx(reception, "reception"), patientRace, "ForbiddenError"],
      ["a therapist who neither treats nor created the patient", ctx(therapistUnrelated, "therapist"), patientRace, "not_found"],
      ["the therapist, another tenant's patient", asTherapist(), patientForeign, "not_found"],
      ["another tenant's therapist, this tenant's patient", ctx(otherTenantTherapist, "therapist", otherTenant), patientRace, "not_found"],
    ];
    for (const [label, who, patient, code] of refusals) {
      expect(await codeOf(episodes.createEpisode(who, { patientId: patient, specialty: "Osteopatia" })), label).toBe(code);
      // A confirmation does not get a refused caller any further.
      expect(
        await codeOf(episodes.createEpisode(who, { patientId: patient, specialty: "Osteopatia", confirmedOpenEpisodeId: randomUUID() })),
        `${label}, confirming`,
      ).toBe(code);
    }
    expect(await countEpisodesAll()).toBe(before);
    expect(await countAuditAll()).toBe(audits);
    expect(await episodesOf(patientRace)).toEqual([]);
    expect(await episodesOf(patientForeign)).toEqual([]);
  });

  // ------------------------------------------------------- an open episode exists
  let first = "";
  let second = "";

  it("AN OPEN EPISODE OF THE SPECIALTY: the next call opens nothing and names it; so does a confirmation naming another episode", async () => {
    first = await open(asTherapist(), { patientId: patientOpen, specialty: "Osteopatia" });
    const snapshot = await episodesOf(patientOpen);
    const audits = await countAuditAll();

    expect(await episodes.createEpisode(asTherapist(), { patientId: patientOpen, specialty: "Osteopatia" })).toEqual({
      kind: "open_exists",
      episodeId: first,
    });
    expect(
      await episodes.createEpisode(asTherapist(), {
        patientId: patientOpen,
        specialty: "Osteopatia",
        confirmedOpenEpisodeId: randomUUID(),
      }),
    ).toEqual({ kind: "open_exists", episodeId: first });
    // The patient id in UPPERCASE is the same patient: it finds the same open episode.
    expect(await episodes.createEpisode(asTherapist(), { patientId: patientOpen.toUpperCase(), specialty: "Osteopatia" })).toEqual({
      kind: "open_exists",
      episodeId: first,
    });

    expect(await episodesOf(patientOpen)).toEqual(snapshot);
    expect(await countAuditAll()).toBe(audits);
  });

  it("the OTHER specialty has none open: it is opened without a question", async () => {
    const id = await open(asTherapist(), { patientId: patientOpen, specialty: "Fisioterapia" });
    const all = await episodesOf(patientOpen);
    expect(all.map((e) => e.id).sort()).toEqual([first, id].sort());
  });

  it("a confirmation that names the open episode opens ANOTHER, and the first is left exactly as it was", async () => {
    const before = (await episodesOf(patientOpen)).find((e) => e.id === first)!;
    second = await open(asTherapist(), { patientId: patientOpen, specialty: "Osteopatia", confirmedOpenEpisodeId: first });
    expect(second).not.toBe(first);
    const all = await episodesOf(patientOpen);
    expect(all.find((e) => e.id === first)).toEqual(before);
    expect(all.find((e) => e.id === second)).toMatchObject({ status: "open", patient_id: patientOpen, tenant_id: tenant });
    expect(all.filter((e) => /^Osteopatia \(/.test(e.title) && e.status === "open")).toHaveLength(2);
  });

  it("SEVERAL OPEN: the one named is the most recently opened, and it is the one '+ Avaliação' on an imported group files in (R31)", async () => {
    expect(await episodes.createEpisode(asTherapist(), { patientId: patientOpen, specialty: "Osteopatia" })).toEqual({
      kind: "open_exists",
      episodeId: second,
    });
    // A confirmation against the older one (a page drawn before the newer was opened) is asked again.
    expect(
      await episodes.createEpisode(asTherapist(), { patientId: patientOpen, specialty: "Osteopatia", confirmedOpenEpisodeId: first }),
    ).toEqual({ kind: "open_exists", episodeId: second });

    const count = (await episodesOf(patientOpen)).length;
    const filed = await records.createDraftRecord(asTherapist(), {
      patientId: patientOpen,
      formTemplateId: template,
      newEpisodeSpecialty: "Osteopatia",
    });
    expect(filed.episodeId).toBe(second);
    expect((await episodesOf(patientOpen)).length).toBe(count);
  });

  // ------------------------------------------------- existing episodes are not touched
  it("IT NEVER TOUCHES AN EXISTING EPISODE: a closed one, the other specialty, a title naming none and an OPEN imported one neither count nor change", async () => {
    const before = await episodesOf(patientKeep);
    // Controls: the four are really there, in the states that matter.
    expect(Object.fromEntries(before.map((e) => [e.id, `${e.title}|${e.status}`]))).toEqual({
      [epKeepClosed]: "Osteopatia (01/08/2026)|closed",
      [epKeepOther]: "Fisioterapia (05/09/2026)|open",
      [epKeepPlain]: "Episódio (05/09/2026)|open",
      [epKeepImportedOpen]: "Osteopatia|open",
    });
    const id = await open(asTherapist(), { patientId: patientKeep, specialty: "Osteopatia" });
    const after = await episodesOf(patientKeep);
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((e) => e.id !== id)).toEqual(before);
    // And the ledger still names exactly the one it named.
    const ledger = await rows<{ id: string }>(
      raw`select imported_entity_id::text as id from migration_staging_rows where tenant_id = ${tenant}::uuid and entity_type = 'clinical_episode'`,
    );
    expect(ledger).toEqual([{ id: epKeepImportedOpen }]);
  });

  // ------------------------------------------------------------------- at once
  it("AT ONCE: two unconfirmed calls for a patient with none open ONE episode, and the other is answered with it", async () => {
    expect(await episodesOf(patientRace)).toEqual([]);
    const results = await Promise.all([
      episodes.createEpisode(asTherapist(), { patientId: patientRace, specialty: "Fisioterapia" }),
      episodes.createEpisode(asTherapist(), { patientId: patientRace, specialty: "Fisioterapia" }),
    ]);
    const all = await episodesOf(patientRace);
    expect(all).toHaveLength(1);
    expect(results.map((r) => r.kind).sort()).toEqual(["created", "open_exists"]);
    for (const r of results) expect(r.kind === "created" ? r.id : r.episodeId).toBe(all[0]!.id);
  });

  // --------------------------------------------------------------- the tab's read
  it("THE TAB'S READ: open app episodes only, most recently opened first, `empty` only with no registo filed", async () => {
    const list = await episodes.listOpenAppEpisodes(asTherapist(), patientOpen);
    const osteo = list.filter((e) => e.title.startsWith("Osteopatia"));
    // `second` holds the registo the R31 arm filed; `first` holds none.
    expect(osteo.map((e) => [e.id, e.empty])).toEqual([
      [second, false],
      [first, true],
    ]);
    expect(list.every((e) => e.status === "open" && e.tenantId === tenant && e.patientId === patientOpen && !e.imported)).toBe(true);
    const opened = list.map((e) => e.openedAt.getTime());
    expect(opened).toEqual([...opened].sort((a, b) => b - a));

    // The closed one and the one the ledger names are left out; the rest are there.
    const keep = (await episodes.listOpenAppEpisodes(asTherapist(), patientKeep)).map((e) => e.id);
    expect(keep).toContain(epKeepOther);
    expect(keep).toContain(epKeepPlain);
    expect(keep).not.toContain(epKeepClosed);
    expect(keep).not.toContain(epKeepImportedOpen);
    expect(keep).toHaveLength(3); // the two above and the one the previous arm opened

    // The owner authors, so reads the same list.
    expect((await episodes.listOpenAppEpisodes(ctx(owner, "owner"), patientOpen)).map((e) => e.id)).toEqual(list.map((e) => e.id));
  });

  it("THE TAB'S READ, refused or empty: a therapist outside the patient's reach, another tenant's caller, a role that does not author", async () => {
    // Control: there is something to read.
    expect((await episodes.listOpenAppEpisodes(asTherapist(), patientOpen)).length).toBeGreaterThan(0);
    expect(await episodes.listOpenAppEpisodes(ctx(therapistUnrelated, "therapist"), patientOpen)).toEqual([]);
    expect(await episodes.listOpenAppEpisodes(ctx(otherTenantTherapist, "therapist", otherTenant), patientOpen)).toEqual([]);
    expect(await episodes.listOpenAppEpisodes(ctx(otherTenantTherapist, "owner", otherTenant), patientOpen)).toEqual([]);
    expect(await codeOf(episodes.listOpenAppEpisodes(ctx(admin, "admin"), patientOpen))).toBe("ForbiddenError");
    expect(await codeOf(episodes.listOpenAppEpisodes(ctx(reception, "reception"), patientOpen))).toBe("ForbiddenError");
  });
});

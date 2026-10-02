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
 *   - ANOTHER TENANT'S episode: refused, nothing written. The control shows the
 *     foreign key alone WOULD take it (an admin insert with it succeeds), which
 *     is the gap this guard closes;
 *   - CONTROL: the right episode files the registo in it, with its audit row;
 *   - "+ Avaliação" on an imported group (Q7): a NEW open episode titled with the
 *     specialty and the Lisbon date, the registo in it, the imported episode
 *     untouched; a word off the list files nothing; a refused registo leaves no
 *     episode behind;
 *   - "Nova versão" of a registo already in another patient's episode is refused;
 *     of one in its own episode, filed there;
 *   - admin and reception are refused before anything is read.
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
  const crossSource = randomUUID(); // a registo of A already filed in B's episode
  const ownSource = randomUUID(); // a registo of A in A's own episode

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
  const countAudit = async () =>
    (await rows<{ n: number }>(raw`select count(*)::int as n from audit_log where tenant_id = ${tenant}::uuid`))[0]!.n;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    records = await import("./records");

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
    ] as const) {
      await db.execute(
        raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status)
            values (${id}::uuid, ${t}::uuid, ${patient}::uuid, ${title}, ${status}::episode_status)`,
      );
    }
    // Two source registos for "Nova versão", drafts so the cleanup can remove
    // them (createAddendum does not ask the source's status). crossSource is the
    // shape Q9 forbids: patient A's registo in patient B's episode. Only an admin
    // insert can make it, which is the point: the database takes it.
    for (const [id, ep] of [
      [crossSource, epB],
      [ownSource, epA],
    ] as const) {
      await db.execute(
        raw`insert into clinical_records (id, tenant_id, patient_id, episode_id, form_template_id, practitioner_id, source, status, data)
            values (${id}::uuid, ${tenant}::uuid, ${patientA}::uuid, ${ep}::uuid, ${template}::uuid, ${therapist}::uuid,
                    'manual'::record_source, 'draft', '{}'::jsonb)`,
      );
    }
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. FK order; only drafts were written. */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from audit_log where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from clinical_records where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
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

  it("ANOTHER TENANT'S episode: refused, nothing written; the foreign key alone would have taken it", async () => {
    // Control 1: the episode exists, in the other tenant.
    expect(
      (await rows(raw`select 1 from clinical_episodes where id = ${epForeign}::uuid and tenant_id = ${otherTenant}::uuid`)).length,
    ).toBe(1);
    // Control 2: the gap. An admin insert pointing this tenant's registo at it
    // succeeds (no RLS on a foreign key check), and is rolled back.
    let fkTookIt = false;
    await db
      .transaction(async (tx) => {
        await tx.execute(
          raw`insert into clinical_records (tenant_id, patient_id, episode_id, form_template_id, source, status, data)
              values (${tenant}::uuid, ${patientA}::uuid, ${epForeign}::uuid, ${template}::uuid, 'manual'::record_source, 'draft', '{}'::jsonb)`,
        );
        fkTookIt = true;
        throw new Error("rollback");
      })
      .catch((e: Error) => {
        if (e.message !== "rollback") throw e;
      });
    expect(fkTookIt).toBe(true);

    const before = await countRecords();
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

  it("Q7: '+ Avaliação' on an imported group opens a NEW open episode for the specialty and files the registo there", async () => {
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

  it("'Nova versão' of a registo already in another patient's episode is refused; of one in its own, filed there", async () => {
    const before = await countRecords();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await codeOf(records.createAddendum(ctx(therapist, "therapist"), crossSource))).toBe("episode_mismatch");
    } finally {
      warn.mockRestore();
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
});

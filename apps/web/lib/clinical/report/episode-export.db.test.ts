/**
 * episode-export.db.test.ts: THE EPISODE PDF'S READS AND ITS AUDIT ROW AGAINST
 * REAL ROWS AND RLS.
 *
 * EPI-01b, piece 3. What the export may hold is decided by what the caller's
 * own reads return, and that is a property of the database: the tenant
 * boundary is RLS, the therapist's reach is the read scope and RLS together,
 * and the audit row is inserted under the caller's own policy. So this suite
 * runs the real statements, as the real principals, through the real entry
 * points (`readEpisodeExportRows`, `readEpisodeExportSelection`, the per-record
 * engine `generateClinicalReportPdf`, `renderEpisodeReport`,
 * `recordEpisodeExport`).
 *
 * EVERY REGISTO HERE IS A DRAFT, on purpose: a finalized registo can never be
 * deleted (clinical_records_enforce_immutability), so a suite that created one
 * could not remove its own rows. The rule that turns the rows read into a file
 * (finalized, not under AI review, not annulled, oldest first) is pure and is
 * pinned on every status in episode-export-core.test.ts; here the READ is
 * asserted row by row, and the selection and the engine are shown to produce
 * nothing from drafts.
 *
 * THE ARMS:
 *   - the owner, an admin of the patient's clinic and the treating therapist
 *     read the episode's registos, oldest first, each with its status, AI
 *     review state and annulment;
 *   - a therapist with no relation to the patient, and an admin of no clinic,
 *     read none of them, and the per-record engine finds none of them either
 *     (`not_found`);
 *   - reception is refused before any read;
 *   - an episode asked for under ANOTHER patient, an episode of ANOTHER TENANT
 *     (no row under RLS, both ways), and an IMPORTED episode are null, each
 *     with a control read proving the rows are really there;
 *   - an empty episode reads as an empty list, and selects nothing;
 *   - the audit row, written as each role, read back exactly: the ids of
 *     the registos in the file, in the file's order, and the two counts.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError, toClaims, type RequestContext } from "@osteojp/auth";
import { isClinicalError } from "../errors";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("the episode PDF's reads and audit row under real RLS", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let mod: typeof import("./episode-export");
  let generateClinicalReportPdf: typeof import("./generate").generateClinicalReportPdf;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const clinic = randomUUID();
  const owner = randomUUID();
  const admin = randomUUID(); // assigned to the patient's clinic
  const adminUnassigned = randomUUID(); // assigned to no clinic
  const therapistTreating = randomUUID(); // registers the patient, so reads them
  const therapistUnrelated = randomUUID(); // no relation to the patient
  const foreignOwner = randomUUID(); // the other tenant's owner
  const patient = randomUUID();
  const otherPatient = randomUUID(); // same tenant, another patient
  const foreignPatient = randomUUID(); // the other tenant's patient

  const epApp = randomUUID();
  const epEmpty = randomUUID();
  const epImported = randomUUID();
  const epOtherPatient = randomUUID();
  const epForeign = randomUUID();

  const rFirst = randomUUID(); // 1 September
  const rSecond = randomUUID(); // 8 September, version 1
  const rSecondV2 = randomUUID(); // 8 September, version 2 of rSecond
  const rAiPending = randomUUID(); // 15 September, under AI review
  const rAnnulled = randomUUID(); // 22 September, an annulment names it
  const rImported = randomUUID();
  const rOtherPatient = randomUUID();
  const rForeign = randomUUID();

  const ctx = (userId: string, role: RequestContext["role"], tenantId = tenant): RequestContext => ({
    tenantId,
    role,
    userId,
  });

  const episodeRow = (id: string, tenantId: string, patientId: string, title: string, status: "open" | "closed") =>
    raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status)
        values (${id}::uuid, ${tenantId}::uuid, ${patientId}::uuid, ${title}, ${status}::episode_status)`;

  const recordRow = (
    id: string,
    opts: {
      tenantId?: string;
      patientId?: string;
      episode: string;
      at: string;
      version?: number;
      supersedes?: string;
      ai?: string;
    },
  ) =>
    raw`insert into clinical_records
          (id, tenant_id, patient_id, episode_id, form_template_id, source, status, version,
           supersedes_id, created_at, ai_review_state, data)
        values (${id}::uuid, ${opts.tenantId ?? tenant}::uuid, ${opts.patientId ?? patient}::uuid,
                ${opts.episode}::uuid, null, 'manual'::record_source, 'draft', ${opts.version ?? 1},
                ${opts.supersedes ?? null}::uuid, ${opts.at}::timestamptz,
                ${opts.ai ?? null}::ai_review_state, '{"consultation_reason":"Texto inventado"}'::jsonb)`;

  const auditRows = async (userId: string) =>
    (await db.execute(
      raw`select action, entity_type, entity_id::text as entity_id, actor_user_id::text as actor,
                 tenant_id::text as tenant, metadata
            from audit_log
           where tenant_id = ${tenant}::uuid and actor_user_id = ${userId}::uuid
           order by created_at`,
    )) as unknown as Record<string, unknown>[];

  beforeAll(async () => {
    const dbMod = await import("@osteojp/db");
    db = dbMod.getDbAdmin();
    mod = await import("./episode-export");
    ({ generateClinicalReportPdf } = await import("./generate"));

    for (const [id, slug] of [
      [tenant, "epi-pdf"],
      [otherTenant, "epi-pdf-other"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug) values (${id}::uuid, ${slug}, ${`${slug}-${id.slice(0, 8)}`})`,
      );
    }
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${clinic}::uuid, ${tenant}::uuid, 'LV')`,
    );
    for (const [id, tenantId, label] of [
      [owner, tenant, "owner"],
      [admin, tenant, "admin"],
      [adminUnassigned, tenant, "admin-unassigned"],
      [therapistTreating, tenant, "treating"],
      [therapistUnrelated, tenant, "unrelated"],
      [foreignOwner, otherTenant, "foreign-owner"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenantId}::uuid, ${`${label}-${id.slice(0, 8)}@example.test`}, ${label})`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${patient}::uuid, ${tenant}::uuid, 'Paciente Episodio Inventado', ${clinic}::uuid,
                  ${therapistTreating}::uuid)`,
    );
    // ONLY the assigned admin gets a staff_locations row, and the located
    // appointment is what puts the patient in that admin's clinic (RLS reads an
    // admin's clinical reach from both).
    await db.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${tenant}::uuid, ${admin}::uuid, ${clinic}::uuid)`,
    );
    await db.execute(
      raw`insert into appointments (tenant_id, patient_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${tenant}::uuid, ${patient}::uuid, ${therapistTreating}::uuid, ${clinic}::uuid,
                  '2026-09-01T10:00:00Z'::timestamptz, '2026-09-01T10:45:00Z'::timestamptz,
                  'completed'::appointment_status)`,
    );
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${otherPatient}::uuid, ${tenant}::uuid, 'Outro Paciente Inventado', ${clinic}::uuid,
                  ${therapistTreating}::uuid)`,
    );
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name)
          values (${foreignPatient}::uuid, ${otherTenant}::uuid, 'Paciente Alheio Inventado')`,
    );

    await db.execute(episodeRow(epApp, tenant, patient, "Osteopatia (01/09/2026)", "open"));
    await db.execute(episodeRow(epEmpty, tenant, patient, "Fisioterapia (05/10/2026)", "open"));
    await db.execute(episodeRow(epImported, tenant, patient, "Osteopatia", "closed"));
    await db.execute(episodeRow(epOtherPatient, tenant, otherPatient, "Osteopatia (02/09/2026)", "open"));
    await db.execute(episodeRow(epForeign, otherTenant, foreignPatient, "Osteopatia (03/09/2026)", "open"));
    await db.execute(
      raw`insert into migration_staging_rows
            (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
          values (${tenant}::uuid, ${tenant}::uuid, 'fisiozero', 'clinical_episode'::migration_entity_type,
                  'epi-pdf-1', '{}'::jsonb, 'imported', ${epImported}::uuid)`,
    );

    // Inserted out of date order, so the order asserted below is the read's
    // (a version can only be inserted after the record it supersedes).
    await db.execute(recordRow(rAnnulled, { episode: epApp, at: "2026-09-22T09:00:00Z" }));
    await db.execute(recordRow(rSecond, { episode: epApp, at: "2026-09-08T09:00:00Z" }));
    await db.execute(recordRow(rAiPending, { episode: epApp, at: "2026-09-15T09:00:00Z", ai: "pending_review" }));
    await db.execute(recordRow(rSecondV2, { episode: epApp, at: "2026-09-08T09:00:00Z", version: 2, supersedes: rSecond }));
    await db.execute(recordRow(rFirst, { episode: epApp, at: "2026-09-01T09:00:00Z" }));
    await db.execute(recordRow(rImported, { episode: epImported, at: "2024-05-10T23:00:00Z" }));
    await db.execute(recordRow(rOtherPatient, { episode: epOtherPatient, patientId: otherPatient, at: "2026-09-02T09:00:00Z" }));
    await db.execute(
      recordRow(rForeign, { episode: epForeign, tenantId: otherTenant, patientId: foreignPatient, at: "2026-09-03T09:00:00Z" }),
    );
    await db.execute(
      raw`insert into record_annulments (tenant_id, record_id, annulled_by_user_id)
          values (${tenant}::uuid, ${rAnnulled}::uuid, ${owner}::uuid)`,
    );
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. FK order. */
  afterAll(async () => {
    if (!db) return;
    const both = raw`(${tenant}::uuid, ${otherTenant}::uuid)`;
    const statements = [
      raw`delete from audit_log where tenant_id in ${both}`,
      raw`delete from record_annulments where tenant_id in ${both}`,
      raw`delete from migration_staging_rows where tenant_id in ${both}`,
      raw`delete from clinical_records where tenant_id in ${both}`,
      raw`delete from clinical_episodes where tenant_id in ${both}`,
      raw`delete from appointments where tenant_id in ${both}`,
      raw`delete from patients where tenant_id in ${both}`,
      raw`delete from staff_locations where tenant_id in ${both}`,
      raw`delete from users where tenant_id in ${both}`,
      raw`delete from locations where tenant_id in ${both}`,
      raw`delete from tenants where id in ${both}`,
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

  const ask = { patientId: patient, episodeId: epApp };
  const ORDER = [rFirst, rSecond, rSecondV2, rAiPending, rAnnulled];

  it.each([
    ["the owner", owner, "owner"],
    ["an admin of the patient's clinic", admin, "admin"],
    ["the treating therapist", therapistTreating, "therapist"],
  ] as const)("%s reads the episode's registos, oldest first, a version after its record", async (_label, userId, role) => {
    const rows = await mod.readEpisodeExportRows(ctx(userId, role), ask);
    expect(rows?.map((r) => r.id)).toEqual(ORDER);
    expect(rows?.map((r) => [r.status, r.aiReviewState, r.annulled, r.version])).toEqual([
      ["draft", null, false, 1],
      ["draft", null, false, 1],
      ["draft", null, false, 2],
      ["draft", "pending_review", false, 1],
      ["draft", null, true, 1],
    ]);
    expect(rows?.every((r) => r.createdAt instanceof Date)).toBe(true);
  });

  it("a therapist with no relation to the patient has nothing to export from the episode", async () => {
    expect(await mod.readEpisodeExportSelection(ctx(therapistUnrelated, "therapist"), ask)).toBeNull();
  });

  it("an admin assigned to no clinic has nothing to export from the episode", async () => {
    expect(await mod.readEpisodeExportSelection(ctx(adminUnassigned, "admin"), ask)).toBeNull();
  });

  it("the per-record engine agrees: it finds none of them for those two, and finds them for the readers", async () => {
    const codeOf = async (userId: string, role: RequestContext["role"], recordId: string) => {
      try {
        await generateClinicalReportPdf(toClaims(ctx(userId, role)), recordId, "pt");
      } catch (e) {
        return isClinicalError(e) ? e.code : (e as Error).name;
      }
      return "printed";
    };
    for (const id of ORDER) {
      expect(await codeOf(therapistUnrelated, "therapist", id), id).toBe("not_found");
      expect(await codeOf(adminUnassigned, "admin", id), id).toBe("not_found");
      // Found, and refused by the print gate: a draft is never printed.
      expect(await codeOf(therapistTreating, "therapist", id), id).toBe("not_printable");
      expect(await codeOf(admin, "admin", id), id).toBe("not_printable");
      expect(await codeOf(owner, "owner", id), id).toBe("not_printable");
    }
  });

  it("an episode of drafts selects nothing, and the engine prints nothing from it", async () => {
    const treating = ctx(therapistTreating, "therapist");
    expect(await mod.readEpisodeExportSelection(treating, ask)).toBeNull();
    // Even handed the ids directly, the file is never made.
    const forced = { episodeId: epApp, patientId: patient, recordIds: ORDER, leftOut: 0 };
    expect(await mod.renderEpisodeReport(treating, forced, "pt")).toBeNull();
    expect(await mod.renderEpisodeReport(ctx(therapistUnrelated, "therapist"), forced, "pt")).toBeNull();
  });

  it("reception is refused before any read", async () => {
    await expect(mod.readEpisodeExportRows(ctx(randomUUID(), "reception"), ask)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an episode asked for under ANOTHER patient is null, whoever asks", async () => {
    // Control: asked for under its own patient, the same episode reads.
    expect(
      (await mod.readEpisodeExportRows(ctx(owner, "owner"), { patientId: otherPatient, episodeId: epOtherPatient }))?.map(
        (r) => r.id,
      ),
    ).toEqual([rOtherPatient]);
    expect(await mod.readEpisodeExportRows(ctx(owner, "owner"), { patientId: patient, episodeId: epOtherPatient })).toBeNull();
    expect(await mod.readEpisodeExportRows(ctx(owner, "owner"), { patientId: otherPatient, episodeId: epApp })).toBeNull();
  });

  it("an episode of ANOTHER TENANT is no row, both ways", async () => {
    // Control: the other tenant's own owner reads it.
    expect(
      (
        await mod.readEpisodeExportRows(ctx(foreignOwner, "owner", otherTenant), {
          patientId: foreignPatient,
          episodeId: epForeign,
        })
      )?.map((r) => r.id),
    ).toEqual([rForeign]);
    // This tenant's owner asking for the other tenant's episode.
    expect(
      await mod.readEpisodeExportRows(ctx(owner, "owner"), { patientId: foreignPatient, episodeId: epForeign }),
    ).toBeNull();
    // The other tenant's owner asking for this tenant's episode.
    expect(await mod.readEpisodeExportRows(ctx(foreignOwner, "owner", otherTenant), ask)).toBeNull();
  });

  it("an IMPORTED episode (the ledger names it) is null, though it holds a registo", async () => {
    const held = (await db.execute(
      raw`select count(*)::int as n from clinical_records where episode_id = ${epImported}::uuid`,
    )) as unknown as { n: number }[];
    expect(held[0]!.n).toBe(1);
    expect(await mod.readEpisodeExportRows(ctx(owner, "owner"), { patientId: patient, episodeId: epImported })).toBeNull();
  });

  it("an EMPTY episode reads as an empty list and selects nothing", async () => {
    expect(await mod.readEpisodeExportRows(ctx(owner, "owner"), { patientId: patient, episodeId: epEmpty })).toEqual([]);
    expect(await mod.readEpisodeExportSelection(ctx(owner, "owner"), { patientId: patient, episodeId: epEmpty })).toBeNull();
  });

  it("none of the reads above wrote an audit row", async () => {
    const n = (await db.execute(
      raw`select count(*)::int as n from audit_log where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    )) as unknown as { n: number }[];
    expect(n[0]!.n).toBe(0);
  });

  it.each([
    ["the owner", owner, "owner"],
    ["an admin", admin, "admin"],
    ["a therapist", therapistTreating, "therapist"],
  ] as const)("the audit row, written as %s under their own policy: one row, ids and counts only", async (_label, userId, role) => {
    // The file's order, as the writer is handed it: descending by id, so it is
    // neither the ids' own order nor its reverse, and a stored list that was
    // sorted or reversed on the way would not match.
    const inFile = [rFirst, rSecond, rSecondV2].sort().reverse();
    await mod.recordEpisodeExport(ctx(userId, role), { episodeId: epApp, patientId: patient, recordIds: inFile, leftOut: 2 });
    const rows = await auditRows(userId);
    expect(rows).toEqual([
      {
        action: "episode.export_pdf",
        entity_type: "clinical_episode",
        entity_id: epApp,
        actor: userId,
        tenant,
        metadata: {
          episodeId: epApp,
          patientId: patient,
          recordIds: inFile,
          recordsIncluded: 3,
          recordsLeftOut: 2,
        },
      },
    ]);
    const metadata = rows[0]!.metadata as { recordIds: string[]; recordsIncluded: number };
    expect(metadata.recordsIncluded).toBe(metadata.recordIds.length);
    // The two registos left out of this export are counted and not named.
    expect(JSON.stringify(rows[0])).not.toContain(rAiPending);
    expect(JSON.stringify(rows[0])).not.toContain(rAnnulled);
  });

  it("no audit row carries the patient's name or the registos' text", async () => {
    const n = (await db.execute(
      raw`select count(*)::int as n from audit_log a
           where tenant_id = ${tenant}::uuid
             and (to_jsonb(a)::text like '%Inventado%' or to_jsonb(a)::text like '%Texto%')`,
    )) as unknown as { n: number }[];
    // Control: the rows searched are there.
    const all = (await db.execute(
      raw`select count(*)::int as n from audit_log where tenant_id = ${tenant}::uuid`,
    )) as unknown as { n: number }[];
    expect(all[0]!.n).toBe(3);
    expect(n[0]!.n).toBe(0);
  });
});

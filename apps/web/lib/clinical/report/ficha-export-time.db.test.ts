/**
 * ficha-export-time.db.test.ts: EXPORT-01, GATE G5. "'Exportar ficha' for a
 * patient with 50 or more registos. EXPECT: completes inside the platform time
 * limit."
 *
 * THE MEASUREMENT. One synthetic patient with 60 registos across several
 * episodes (below), and the REAL server action behind the button,
 * `downloadPatientFichaUrlAction`, run three times as the owner and three
 * times as the treating therapist. Each run is timed from the call to the
 * answer, and each must be inside CEILING_MS. The six numbers are printed on
 * two lines starting "[G5]"; vitest shows a passing test's output under
 * `--reporter=verbose`.
 *
 * WHAT IS REAL: the action's own steps and their order; the tab's read and its
 * grouping under the caller's own claims and RLS; the selection rule; the
 * per-record engine for each of the 60 registos (its scoped load, one
 * transaction per registo, and the drawn pages); the heading pages; the join
 * into one document; the audit row, inserted under the caller's own policy.
 *
 * WHAT IS STUBBED, and why:
 *   - the session: the caller is handed in;
 *   - the document ceiling: it is a counter per user, not part of the work;
 *   - Storage: nothing is uploaded and nothing is signed. The file's size is
 *     printed, so the upload it stands for can be judged;
 *   - "AS IF FINALIZED", as in ficha-export.db.test.ts: every registo here is
 *     a DRAFT (a finalized registo can never be deleted, so a suite that
 *     created one could not remove its own rows), and a draft is in no file.
 *     The status alone is read as "locked", in memory, at the two places a
 *     status is asked: the tab's list and the engine's print gate. Every read
 *     stays the real one and no row changes.
 *
 * WHAT IT DOES NOT MEASURE: the session lookup, the upload and the signing
 * call, the distance between the hosting region and the database, and tables
 * of production's size. The database here is on the same machine as the test
 * and holds little beside this patient.
 *
 * THE NUMBERS MOVE WITH THE MACHINE. This file runs beside every other
 * DB-gated suite, and a run in that company can take many times what the same
 * run takes alone (measured on the day it was written, on a busy laptop: 0.5
 * to 1.5 s alone; beside four other suites, 0.4 s at best and 10.7 s at
 * worst). The numbers to read are the ones of this file run by itself.
 *
 * THE LIMIT IS NOT IN THE REPOSITORY. No source file sets `maxDuration`, and
 * `vercel.json` holds the region only, so the limit of this route is the
 * hosting project's own, a value kept in the hosting dashboard that nothing
 * here can read. What the repository does record is that production has let a
 * request of this app run for 59 seconds (packages/db/src/client.ts, the note
 * on the pool size: a p75 of 59 s on /patients). So the limit in force was no
 * shorter than that, and CEILING_MS is that number: a floor for the limit, not
 * the limit. If the route is ever given a limit of its own, this number
 * follows it.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { sql as raw } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@osteojp/auth";

const h = vi.hoisted(() => ({
  ctx: null as unknown as { tenantId: string; role: string; userId: string },
  /** Every file an export handed to Storage, in order. */
  uploads: [] as Uint8Array[],
}));

const SIGNED = "https://storage.example/signed?token=opaque";

vi.mock("server-only", () => ({}));

// The session: the caller is handed in. Everything else of the module is real,
// `runScoped` above all.
vi.mock("@/lib/auth/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/context")>()),
  requireRequestContext: async () => h.ctx,
}));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: async () => true }));
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (_path: string, bytes: Uint8Array) => {
          h.uploads.push(bytes);
          return { error: null };
        },
        createSignedUrl: async () => ({ data: { signedUrl: SIGNED }, error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  }),
}));

// "As if finalized" (see the header): the status the tab's list carries...
vi.mock("../ficha-groups", async (orig) => {
  const real = await orig<typeof import("../ficha-groups")>();
  return {
    ...real,
    listFichaRecords: async (...args: Parameters<typeof real.listFichaRecords>) =>
      (await real.listFichaRecords(...args)).map((r) => ({ ...r, status: "locked" as const })),
  };
});
// ...and the status the engine's print gate reads.
vi.mock("./report-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./report-model")>();
  return {
    ...actual,
    buildClinicalReportModel: (
      inputs: Parameters<typeof actual.buildClinicalReportModel>[0],
      locale: Parameters<typeof actual.buildClinicalReportModel>[1],
    ) => actual.buildClinicalReportModel({ ...inputs, record: { ...inputs.record, status: "locked" } }, locale),
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** See THE LIMIT IS NOT IN THE REPOSITORY in the header. */
const CEILING_MS = 59_000;
const RUNS = 3;

/** How the patient's 60 registos are filed. */
const IMPORTED_OSTEO = 25; // one imported episode each, as the importer made them
const IMPORTED_FISIO = 10; // the same, the other specialty
const APP_EPISODES = [8, 7, 5]; // three app episodes
const NO_EPISODE = 5;
const REGISTOS = IMPORTED_OSTEO + IMPORTED_FISIO + APP_EPISODES.reduce((a, b) => a + b, 0) + NO_EPISODE;
const SECTIONS = 2 + APP_EPISODES.length + 1;

// Invented text, and enough of it that a registo fills about a page: eight
// stored fields of some 350 characters each.
const PARAGRAPH = "Texto inventado para medir a exportacao da ficha. ".repeat(7).trim();
const STORED = Object.fromEntries(
  ["queixas", "motivos", "antecedentes", "exame", "diagnostico", "tratamento", "evolucao", "notas"].map((key) => [
    key,
    PARAGRAPH,
  ]),
);

d("EXPORT-01 G5: 'Exportar ficha' for a patient with 60 registos, timed", { timeout: 300_000 }, () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let actions: typeof import("@/app/patients/[id]/ficha-pdf-actions");

  const tenant = randomUUID();
  const clinic = randomUUID();
  const owner = randomUUID();
  const therapist = randomUUID(); // registers the patient, so may open them
  const patient = randomUUID();

  const ctxOf = (role: RequestContext["role"], userId: string) => ({ tenantId: tenant, role, userId });

  beforeAll(async () => {
    expect(REGISTOS).toBe(60);
    const dbMod = await import("@osteojp/db");
    db = dbMod.getDbAdmin();
    actions = await import("@/app/patients/[id]/ficha-pdf-actions");

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'export-01-time', ${`export-01-time-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${clinic}::uuid, ${tenant}::uuid, 'LV')`);
    for (const [id, label] of [
      [owner, "owner"],
      [therapist, "treating"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${`${label}-${id.slice(0, 8)}@example.test`}, ${label})`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${patient}::uuid, ${tenant}::uuid, 'Paciente Tempo Inventado', ${clinic}::uuid, ${therapist}::uuid)`,
    );

    const episode = async (title: string, imported: boolean): Promise<string> => {
      const id = randomUUID();
      await db.execute(
        raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status)
            values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${title}, 'closed'::episode_status)`,
      );
      if (imported) await ledger("clinical_episode", id);
      return id;
    };
    /** The importer's ledger row for one entity it created. */
    const ledger = (entityType: "clinical_episode" | "clinical_record", entityId: string) =>
      db.execute(
        raw`insert into migration_staging_rows
              (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
            values (${tenant}::uuid, ${tenant}::uuid, 'fisiozero', ${entityType}::migration_entity_type,
                    ${`export-01-time-${entityId}`}, '{}'::jsonb, 'imported', ${entityId}::uuid)`,
      );
    let day = 0;
    /** One draft registo, a day after the one before it. */
    const registo = async (episodeId: string | null, imported: boolean): Promise<string> => {
      const id = randomUUID();
      day += 1;
      const at = new Date(Date.UTC(2020, 0, day, 9)).toISOString();
      await db.execute(
        raw`insert into clinical_records
              (id, tenant_id, patient_id, episode_id, practitioner_id, form_template_id, source, status,
               version, created_at, data)
            values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${episodeId}::uuid, ${therapist}::uuid, null,
                    'manual'::record_source, 'draft', 1, ${at}::timestamptz, ${JSON.stringify(STORED)}::jsonb)`,
      );
      if (imported) await ledger("clinical_record", id);
      return id;
    };

    for (let i = 0; i < IMPORTED_OSTEO; i += 1) await registo(await episode("Osteopatia", true), true);
    for (let i = 0; i < IMPORTED_FISIO; i += 1) await registo(await episode("Fisioterapia", true), true);
    let annulled = "";
    for (const [n, size] of APP_EPISODES.entries()) {
      const id = await episode(`Osteopatia (0${n + 1}/03/2026)`, false);
      for (let i = 0; i < size; i += 1) annulled = await registo(id, false);
    }
    for (let i = 0; i < NO_EPISODE; i += 1) await registo(null, false);
    // One annulled registo, so the file draws a mark as a real one would.
    await db.execute(
      raw`insert into record_annulments (tenant_id, record_id, annulled_by_user_id)
          values (${tenant}::uuid, ${annulled}::uuid, ${owner}::uuid)`,
    );
  }, 120_000);

  /** Every delete is attempted and the first failure re-raised. FK order. */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from record_annulments where tenant_id = ${tenant}::uuid`,
      raw`delete from migration_staging_rows where tenant_id = ${tenant}::uuid`,
      raw`delete from clinical_records where tenant_id = ${tenant}::uuid`,
      raw`delete from clinical_episodes where tenant_id = ${tenant}::uuid`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
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
  }, 120_000);

  it.each([
    ["the owner", "owner", owner],
    ["the treating therapist", "therapist", therapist],
  ] as const)(`%s: ${RUNS} exports of the 60 registos, each inside the ceiling`, async (label, role, userId) => {
    h.ctx = ctxOf(role, userId);
    const before = h.uploads.length;
    const took: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const started = performance.now();
      const answer = await actions.downloadPatientFichaUrlAction(patient);
      took.push(performance.now() - started);
      // A refusal or a failure answers `{ url: null }`, and would be a fast one.
      expect(answer).toEqual({ url: SIGNED });
    }

    // Each export produced the whole file: every registo, under every section.
    const files = h.uploads.slice(before);
    expect(files).toHaveLength(RUNS);
    const pages = (await PDFDocument.load(files[0]!)).getPageCount();
    expect(pages).toBeGreaterThanOrEqual(REGISTOS + SECTIONS);

    console.info(
      `[G5] ${label}: ${took.map((ms) => `${Math.round(ms)} ms`).join(", ")} ` +
        `(${REGISTOS} registos, ${SECTIONS} sections, ${pages} pages, ${files[0]!.length} bytes; ceiling ${CEILING_MS} ms)`,
    );
    for (const ms of took) expect(ms).toBeLessThan(CEILING_MS);
  });

  it("every one of those exports held all 60 registos: one audit row each, with the counts", async () => {
    const rows = (await db.execute(
      raw`select action, actor_user_id::text as actor, metadata
            from audit_log
           where tenant_id = ${tenant}::uuid
           order by created_at`,
    )) as unknown as { action: string; actor: string; metadata: Record<string, unknown> }[];
    expect(rows).toHaveLength(2 * RUNS);
    expect(rows.map((r) => r.actor)).toEqual([...Array(RUNS).fill(owner), ...Array(RUNS).fill(therapist)]);
    for (const row of rows) {
      expect(row.action).toBe("patient.export_pdf");
      expect(row.metadata).toMatchObject({
        document: "ficha",
        patientId: patient,
        recordsIncluded: REGISTOS,
        recordsLeftOut: 0,
        sectionsIncluded: SECTIONS,
      });
      expect(new Set(row.metadata.recordIds as string[]).size).toBe(REGISTOS);
    }
  });
});

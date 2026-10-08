/**
 * export-audit.db.test.ts: EXPORT-01, GATE G4. "Each export. EXPECT: exactly
 * one audit row, no patient text in it."
 *
 * EVERY EXPORT IS RUN THROUGH ITS OWN SERVER ACTION, and the row is read back
 * from the real `audit_log`. The six exports and their actions:
 *
 *   "Transferir PDF" (a registo)         downloadReportUrlAction
 *   "PDF do episódio" (an app episode)   downloadEpisodeReportUrlAction
 *   "PDF do episódio" (imported group)   downloadImportedGroupReportUrlAction
 *   "Exportar ficha"                     downloadPatientFichaUrlAction
 *   the RGPD form                        generateRgpdFormUrlAction
 *   the Declaração de Presença           generateDeclaracaoUrlAction
 *
 * WHAT IS REAL: the action's own steps and their order; the audit writers
 * (export-audit.ts, and `recordEpisodeExport`); the caller's tenant-scoped
 * transaction and the `audit_log` INSERT policy it runs under, as each role;
 * the reads the writers make of the registo, the patient and the location.
 * The RGPD form and the Declaração run their real engines too: real reads, a
 * real PDF.
 *
 * WHAT IS STUBBED, and why. The session (the caller is handed in), Storage
 * (nothing is uploaded) and the document ceiling. And, for the four exports
 * that print registos, the read and the render of a FINISHED export: every
 * registo here is a DRAFT, on purpose, as in episode-export.db.test.ts (a
 * finalized registo can never be deleted, so a suite that created one could
 * not remove its own rows), and a draft is printed for nobody. Those arms
 * hand the action a selection and a file, and everything from the stored file
 * to the row is real. The same four are then run with NOTHING stubbed, on the
 * drafts: the real reads and the real engine refuse, and no row is written.
 * Which registos the real reads return for which role is
 * registo-export.db.test.ts's and ficha-export.db.test.ts's.
 *
 * THE ARMS:
 *   - each export, as each role that may run it: one new row, read back whole
 *     and compared exactly (the action, what it is filed on, the actor, the
 *     tenant, the metadata);
 *   - the ids in a row are the database's own, whatever spelling the request
 *     used;
 *   - a second export is a second row;
 *   - an export that hands out nothing writes nothing: reception on the five
 *     clinical exports, a draft, a patient outside the caller's reach, a
 *     location with no carimbo;
 *   - a row that cannot be written: no URL, the stored file removed, no row;
 *   - over every row this suite wrote: no name, no title, no clinical text and
 *     nothing typed in a dialog; every value is an id, a count or one of the
 *     four document words.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@osteojp/auth";

const h = vi.hoisted(() => ({
  ctx: null as unknown as { tenantId: string; role: string; userId: string },
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The session: the caller is handed in. Everything else of the module is real,
// `runScoped` above all.
vi.mock("@/lib/auth/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/context")>()),
  requireRequestContext: async () => h.ctx,
}));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: async () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ upload: h.upload, createSignedUrl: h.createSignedUrl, remove: h.remove }) },
  }),
}));

// THE ENGINES ANSWER FOR THEMSELVES unless an arm hands one an answer: each of
// these is the real function, wrapped so an arm can stand in for a finished
// export (see the header).
vi.mock("@/lib/clinical/report", async (orig) => {
  const real = await orig<typeof import("./report")>();
  return { ...real, generateRegistoReportPdf: vi.fn(real.generateRegistoReportPdf) };
});
vi.mock("@/lib/clinical/report/episode-export", async (orig) => {
  const real = await orig<typeof import("./report/episode-export")>();
  return {
    ...real,
    readEpisodeExportSelection: vi.fn(real.readEpisodeExportSelection),
    renderEpisodeReport: vi.fn(real.renderEpisodeReport),
    readImportedGroupExportSelection: vi.fn(real.readImportedGroupExportSelection),
    renderImportedGroupReport: vi.fn(real.renderImportedGroupReport),
  };
});
vi.mock("@/lib/clinical/report/ficha-export", async (orig) => {
  const real = await orig<typeof import("./report/ficha-export")>();
  return {
    ...real,
    readPatientFichaExportSelection: vi.fn(real.readPatientFichaExportSelection),
    renderPatientFichaReport: vi.fn(real.renderPatientFichaReport),
  };
});
vi.mock("@/lib/clinical/rgpd/generate", async (orig) => {
  const real = await orig<typeof import("./rgpd/generate")>();
  return { ...real, generateRgpdFormPdf: vi.fn(real.generateRgpdFormPdf) };
});
vi.mock("@/lib/clinical/declaracao/generate", async (orig) => {
  const real = await orig<typeof import("./declaracao/generate")>();
  return {
    ...real,
    declaracaoAvailability: vi.fn(real.declaracaoAvailability),
    generateDeclaracaoPdf: vi.fn(real.generateDeclaracaoPdf),
  };
});

// What the two action files import beside their exports, and never call here.
vi.mock("@/lib/clinical/records", () => ({
  createAddendum: vi.fn(),
  getRecordDetail: vi.fn(),
  signAndLockRecord: vi.fn(),
  updateRecordData: vi.fn(),
}));
vi.mock("@/lib/clinical/terms-acceptance", () => ({ recordTermsAcceptance: vi.fn() }));
vi.mock("@/lib/clinical/storage", () => ({
  confirmAttachment: vi.fn(),
  createAttachmentDownloadUrl: vi.fn(),
  createAttachmentUploadUrl: vi.fn(),
  ATTACHMENTS_BUCKET: "clinical-attachments",
}));
vi.mock("@/lib/patients/documents", () => ({
  confirmPatientDocument: vi.fn(),
  createPatientDocumentUploadUrl: vi.fn(),
}));
// The Declaração's NIF write-back is not this suite's: the patient is read as
// having a NIF already, so nothing is written back.
vi.mock("@/lib/patients/queries", () => ({ getPatient: async () => ({ nif: "000000000" }) }));
vi.mock("@/lib/patients/actions", () => ({ updatePatient: vi.fn() }));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const SIGNED = "https://storage.example/signed?token=opaque";
const BYTES = new Uint8Array([37, 80, 68, 70]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Role = RequestContext["role"];
type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor: string;
  tenant: string;
  metadata: Record<string, unknown>;
};

d("EXPORT-01 G4: every export writes exactly one audit row, ids and counts only", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let clinical: typeof import("@/app/clinical/[id]/actions");
  let episodeActions: typeof import("@/app/patients/[id]/episode-pdf-actions");
  let fichaActions: typeof import("@/app/patients/[id]/ficha-pdf-actions");
  let declaracaoActions: typeof import("@/app/patients/[id]/declaracao-actions");
  let registoEngine: ReturnType<typeof vi.fn>;
  let rgpdEngine: ReturnType<typeof vi.fn>;
  let episodeSelection: ReturnType<typeof vi.fn>;
  let episodeRender: ReturnType<typeof vi.fn>;
  let groupSelection: ReturnType<typeof vi.fn>;
  let groupRender: ReturnType<typeof vi.fn>;
  let fichaSelection: ReturnType<typeof vi.fn>;
  let fichaRender: ReturnType<typeof vi.fn>;
  let declaracaoAvailability: ReturnType<typeof vi.fn>;
  let declaracaoEngine: ReturnType<typeof vi.fn>;
  let fichaExport: typeof import("./report/ficha-export");

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const clinic = randomUUID(); // named as a clinic that has a carimbo
  const clinicNoStamp = randomUUID(); // a location with no carimbo
  const owner = randomUUID();
  const admin = randomUUID(); // assigned to the patient's clinic
  const therapist = randomUUID(); // registered the patient, so reads them
  const therapistUnrelated = randomUUID(); // no relation to the patient
  const reception = randomUUID();
  const patient = randomUUID();
  const foreignPatient = randomUUID(); // the other tenant's patient
  const episode = randomUUID();
  const r1 = randomUUID();
  const r2 = randomUUID();
  const r3 = randomUUID();
  const rForeign = randomUUID(); // the other tenant's registo
  // The order of a file, as a writer is handed it: neither the ids' own order
  // nor its reverse, so a stored list that was sorted or reversed on the way
  // would not match.
  const [low, mid, high] = [r1, r2, r3].sort() as [string, string, string];
  const IN_FILE = [mid, high, low];

  // Everything below that is text is invented, and none of it may reach a row.
  const PATIENT_NAME = "Paciente Exportacao Inventado";
  const EPISODE_TITLE = "Osteopatia (01/09/2026)";
  const GROUP_LABEL = "Especialidade Inventada";
  const CLINICAL_TEXT = "Texto inventado";
  const TYPED = { date: "2026-07-17", startTime: "09:30", endTime: "10:30", nif: "123456789", observacoes: "Observacao inventada" };

  const ctxOf = (role: Role, userId: string, tenantId = tenant) => ({ tenantId, role, userId });
  const CALLERS: Record<Role, string> = { owner, admin, therapist, reception };
  const CLINICAL_ROLES = ["owner", "admin", "therapist"] as const;

  const rowsOf = async (): Promise<AuditRow[]> =>
    (await db.execute(
      raw`select id::text as id, action, entity_type, entity_id::text as entity_id,
                 actor_user_id::text as actor, tenant_id::text as tenant, metadata
            from audit_log
           where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)
           order by created_at, id`,
    )) as unknown as AuditRow[];

  /** Runs `run`, and answers with what it returned and the rows it left behind. */
  async function exported<T>(run: () => Promise<T>): Promise<{ answer: T; rows: Omit<AuditRow, "id">[] }> {
    const before = new Set((await rowsOf()).map((r) => r.id));
    const answer = await run();
    const rows = (await rowsOf())
      .filter((r) => !before.has(r.id))
      .map((r) => ({
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        actor: r.actor,
        tenant: r.tenant,
        metadata: r.metadata,
      }));
    return { answer, rows };
  }

  const declaracaoRequest = (patientId: string = patient, locationId: string = clinic) => ({ patientId, locationId, ...TYPED });

  /**
   * THE SIX EXPORTS. `arrange` stands in for the read and the render of a
   * finished export where the header says one is needed; `run` is the action;
   * `row` is the whole row a finished export must leave, for `actor`.
   */
  const EXPORTS: {
    name: string;
    roles: readonly Role[];
    arrange: () => void;
    run: () => Promise<{ url: string | null }>;
    row: (actor: string) => Omit<AuditRow, "id">;
  }[] = [
    {
      name: "Transferir PDF (a registo)",
      roles: CLINICAL_ROLES,
      arrange: () => registoEngine.mockResolvedValue({ bytes: BYTES, filename: "relatorio-clinico.pdf" }),
      run: () => clinical.downloadReportUrlAction(r1),
      row: (actor) => ({
        action: "clinical_record.export_pdf",
        entity_type: "clinical_record",
        entity_id: r1,
        actor,
        tenant,
        metadata: { recordId: r1, patientId: patient },
      }),
    },
    {
      name: "PDF do episódio (an app episode)",
      roles: CLINICAL_ROLES,
      arrange: () => {
        episodeSelection.mockResolvedValue({ episodeId: episode, patientId: patient, recordIds: [r1, r2, r3], leftOut: 0 });
        // The engine printed two of the three, in the file's order, and left one out.
        episodeRender.mockResolvedValue({ bytes: BYTES, filename: "relatorio-episodio.pdf", recordIds: [high, low], leftOut: 1 });
      },
      run: () => episodeActions.downloadEpisodeReportUrlAction(patient, episode),
      row: (actor) => ({
        action: "episode.export_pdf",
        entity_type: "clinical_episode",
        entity_id: episode,
        actor,
        tenant,
        metadata: { episodeId: episode, patientId: patient, recordIds: [high, low], recordsIncluded: 2, recordsLeftOut: 1 },
      }),
    },
    {
      name: "PDF do episódio (an imported group)",
      roles: CLINICAL_ROLES,
      arrange: () => {
        groupSelection.mockResolvedValue({ patientId: patient, specialty: GROUP_LABEL, recordIds: [r1, r2, r3], leftOut: 2 });
        groupRender.mockResolvedValue({ bytes: BYTES, filename: "relatorio-episodio-importado.pdf", recordIds: IN_FILE, leftOut: 2 });
      },
      run: () => episodeActions.downloadImportedGroupReportUrlAction(patient, GROUP_LABEL),
      row: (actor) => ({
        action: "patient.export_pdf",
        entity_type: "patient",
        entity_id: patient,
        actor,
        tenant,
        metadata: { document: "imported_group", patientId: patient, recordIds: IN_FILE, recordsIncluded: 3, recordsLeftOut: 2 },
      }),
    },
    {
      name: "Exportar ficha",
      roles: CLINICAL_ROLES,
      arrange: () => {
        fichaSelection.mockResolvedValue({
          patientId: patient,
          sections: [
            { kind: "episode", label: EPISODE_TITLE, recordIds: [r1, r2] },
            { kind: "none", label: null, recordIds: [r3] },
          ],
          leftOut: 4,
        });
        fichaRender.mockResolvedValue({ bytes: BYTES, filename: "relatorio-ficha.pdf", recordIds: IN_FILE, sections: 2, leftOut: 4 });
      },
      run: () => fichaActions.downloadPatientFichaUrlAction(patient),
      row: (actor) => ({
        action: "patient.export_pdf",
        entity_type: "patient",
        entity_id: patient,
        actor,
        tenant,
        metadata: {
          document: "ficha",
          patientId: patient,
          recordIds: IN_FILE,
          recordsIncluded: 3,
          sectionsIncluded: 2,
          recordsLeftOut: 4,
        },
      }),
    },
    {
      // Nothing stubbed: the real read and the real PDF, for a draft as for any registo.
      name: "the RGPD form",
      roles: CLINICAL_ROLES,
      arrange: () => {},
      run: () => clinical.generateRgpdFormUrlAction(r1),
      row: (actor) => ({
        action: "patient.export_pdf",
        entity_type: "patient",
        entity_id: patient,
        actor,
        tenant,
        metadata: { document: "rgpd_form", patientId: patient, recordId: r1 },
      }),
    },
    {
      // Nothing stubbed: the real location check, the real read and the real PDF.
      name: "the Declaração de Presença",
      roles: ["owner", "admin", "therapist", "reception"],
      arrange: () => {},
      run: () => declaracaoActions.generateDeclaracaoUrlAction(declaracaoRequest()),
      row: (actor) => ({
        action: "patient.export_pdf",
        entity_type: "patient",
        entity_id: patient,
        actor,
        tenant,
        metadata: { document: "declaracao", patientId: patient, locationId: clinic },
      }),
    },
  ];
  const CASES = EXPORTS.flatMap((e) => e.roles.map((role) => [e.name, role, e] as const));

  /** How many exports this suite has finished; the last arm counts the rows against it. */
  let finished = 0;

  beforeAll(async () => {
    const dbMod = await import("@osteojp/db");
    db = dbMod.getDbAdmin();
    clinical = await import("@/app/clinical/[id]/actions");
    episodeActions = await import("@/app/patients/[id]/episode-pdf-actions");
    fichaActions = await import("@/app/patients/[id]/ficha-pdf-actions");
    declaracaoActions = await import("@/app/patients/[id]/declaracao-actions");
    const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
    registoEngine = asMock((await import("./report")).generateRegistoReportPdf);
    rgpdEngine = asMock((await import("./rgpd/generate")).generateRgpdFormPdf);
    const episodeExport = await import("./report/episode-export");
    episodeSelection = asMock(episodeExport.readEpisodeExportSelection);
    episodeRender = asMock(episodeExport.renderEpisodeReport);
    groupSelection = asMock(episodeExport.readImportedGroupExportSelection);
    groupRender = asMock(episodeExport.renderImportedGroupReport);
    fichaExport = await import("./report/ficha-export");
    fichaSelection = asMock(fichaExport.readPatientFichaExportSelection);
    fichaRender = asMock(fichaExport.renderPatientFichaReport);
    const declaracao = await import("./declaracao/generate");
    declaracaoAvailability = asMock(declaracao.declaracaoAvailability);
    declaracaoEngine = asMock(declaracao.generateDeclaracaoPdf);

    for (const [id, slug] of [
      [tenant, "export-audit"],
      [otherTenant, "export-audit-other"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug) values (${id}::uuid, ${`Clinica Inventada ${slug}`}, ${`${slug}-${id.slice(0, 8)}`})`,
      );
    }
    // "OsteoJP (LV)" is how a clinic with a carimbo is named (declaracao/generate.test.ts).
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${clinic}::uuid, ${tenant}::uuid, 'OsteoJP (LV)')`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name)
          values (${clinicNoStamp}::uuid, ${tenant}::uuid, 'Clinica Inventada Sem Carimbo')`,
    );
    for (const [id, label] of [
      [owner, "owner"],
      [admin, "admin"],
      [therapist, "treating"],
      [therapistUnrelated, "unrelated"],
      [reception, "reception"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${`${label}-${id.slice(0, 8)}@example.test`}, ${`Pessoa Inventada ${label}`})`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${patient}::uuid, ${tenant}::uuid, ${PATIENT_NAME}, ${clinic}::uuid, ${therapist}::uuid)`,
    );
    // ONLY the admin gets a staff_locations row, and the located appointment is
    // what puts the patient in that admin's clinic (RLS reads an admin's
    // clinical reach from both), as in episode-export.db.test.ts.
    await db.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${tenant}::uuid, ${admin}::uuid, ${clinic}::uuid)`,
    );
    await db.execute(
      raw`insert into appointments (tenant_id, patient_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${tenant}::uuid, ${patient}::uuid, ${therapist}::uuid, ${clinic}::uuid,
                  '2026-09-01T10:00:00Z'::timestamptz, '2026-09-01T10:45:00Z'::timestamptz,
                  'completed'::appointment_status)`,
    );
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name)
          values (${foreignPatient}::uuid, ${otherTenant}::uuid, 'Paciente Alheio Inventado')`,
    );
    await db.execute(
      raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status)
          values (${episode}::uuid, ${tenant}::uuid, ${patient}::uuid, ${EPISODE_TITLE}, 'open'::episode_status)`,
    );
    const recordRow = (id: string, tenantId: string, patientId: string, episodeId: string | null, at: string) =>
      raw`insert into clinical_records
            (id, tenant_id, patient_id, episode_id, form_template_id, source, status, version, created_at, data)
          values (${id}::uuid, ${tenantId}::uuid, ${patientId}::uuid, ${episodeId}::uuid, null,
                  'manual'::record_source, 'draft', 1, ${at}::timestamptz,
                  ${JSON.stringify({ consultation_reason: CLINICAL_TEXT })}::jsonb)`;
    await db.execute(recordRow(r1, tenant, patient, episode, "2026-09-01T09:00:00Z"));
    await db.execute(recordRow(r2, tenant, patient, episode, "2026-09-08T09:00:00Z"));
    await db.execute(recordRow(r3, tenant, patient, null, "2026-09-15T09:00:00Z"));
    await db.execute(recordRow(rForeign, otherTenant, foreignPatient, null, "2026-09-03T09:00:00Z"));
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. FK order. */
  afterAll(async () => {
    if (!db) return;
    const both = raw`(${tenant}::uuid, ${otherTenant}::uuid)`;
    const statements = [
      raw`delete from audit_log where tenant_id in ${both}`,
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

  let logged: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // Back to the real engines (each mock's own implementation is the real function).
    for (const m of [
      registoEngine,
      rgpdEngine,
      episodeSelection,
      episodeRender,
      groupSelection,
      groupRender,
      fichaSelection,
      fichaRender,
      declaracaoAvailability,
      declaracaoEngine,
    ]) {
      m.mockReset();
    }
    h.upload.mockReset().mockResolvedValue({ data: { path: "x" }, error: null });
    h.createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
    h.remove.mockReset().mockResolvedValue({ data: [], error: null });
    h.ctx = ctxOf("owner", owner);
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logged.mockRestore();
  });

  it("control: the table holds no row of this suite's tenants before the first export", async () => {
    expect(await rowsOf()).toEqual([]);
  });

  it.each(CASES)("%s, as %s: the file is handed out and exactly ONE row is written, this one", async (_name, role, e) => {
    h.ctx = ctxOf(role, CALLERS[role]);
    e.arrange();
    const { answer, rows } = await exported(e.run);
    expect(answer).toEqual({ url: SIGNED });
    expect(rows).toEqual([e.row(CALLERS[role])]);
    finished += 1;
    // A finished export removes nothing and logs nothing.
    expect(h.remove).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("the ids in a row are the database's own: a request that spells an id in capitals leaves the same row", async () => {
    registoEngine.mockResolvedValue({ bytes: BYTES, filename: "relatorio-clinico.pdf" });
    const registo = await exported(() => clinical.downloadReportUrlAction(r1.toUpperCase()));
    expect(registo.answer).toEqual({ url: SIGNED });
    expect(registo.rows).toEqual([EXPORTS[0]!.row(owner)]);

    const rgpd = await exported(() => clinical.generateRgpdFormUrlAction(r1.toUpperCase()));
    expect(rgpd.answer).toEqual({ url: SIGNED });
    expect(rgpd.rows).toEqual([EXPORTS[4]!.row(owner)]);

    const declaracao = await exported(() =>
      declaracaoActions.generateDeclaracaoUrlAction(declaracaoRequest(patient.toUpperCase(), clinic.toUpperCase())),
    );
    expect(declaracao.answer).toEqual({ url: SIGNED });
    expect(declaracao.rows).toEqual([EXPORTS[5]!.row(owner)]);
    finished += 3;
  });

  it("a second export is a second row: two of one export leave two rows, each the same", async () => {
    for (const e of EXPORTS) {
      e.arrange();
      const { rows } = await exported(async () => {
        await e.run();
        await e.run();
      });
      expect(rows, e.name).toEqual([e.row(owner), e.row(owner)]);
      finished += 2;
    }
  });

  describe("an export that hands out nothing writes no row", () => {
    const nothing = async (run: () => Promise<{ url: string | null }>, label?: string) => {
      const { answer, rows } = await exported(run);
      expect(answer.url, label).toBeNull();
      expect(rows, label).toEqual([]);
      expect(h.upload, label).not.toHaveBeenCalled();
    };

    it("RECEPTION on the five clinical exports: refused, nothing stored, no row", async () => {
      h.ctx = ctxOf("reception", reception);
      // Even with a finished export standing ready behind each of them.
      for (const e of EXPORTS.slice(0, 4)) e.arrange();
      for (const e of EXPORTS.slice(0, 5)) await nothing(e.run, e.name);
    });

    it.each(CLINICAL_ROLES)("a DRAFT, as %s, with nothing stubbed: the real reads and the real engine refuse, no row", async (role) => {
      h.ctx = ctxOf(role, CALLERS[role]);
      // The four exports that print registos. Every registo of the patient is a draft.
      for (const e of EXPORTS.slice(0, 4)) await nothing(e.run, e.name);
      // Control: the real reads did find the patient's three registos, and it
      // was the print rule that left every one of them out.
      const groups = await fichaExport.readPatientFichaGroups(h.ctx as RequestContext, { patientId: patient });
      expect(groups?.flatMap((g) => g.records.map((r) => r.status))).toEqual(["draft", "draft", "draft"]);
      expect(fichaSelection.mock.settledResults.at(-1)).toEqual({ type: "fulfilled", value: null });
      expect(registoEngine.mock.settledResults.at(-1)).toMatchObject({ type: "rejected", value: { code: "not_printable" } });
    });

    it("a patient outside the caller's reach, with nothing stubbed: no row", async () => {
      // A therapist with no relation to the patient.
      h.ctx = ctxOf("therapist", therapistUnrelated);
      for (const e of EXPORTS.slice(0, 5)) await nothing(e.run, e.name);
      // Another tenant's registo and patient, asked for by this tenant's owner.
      h.ctx = ctxOf("owner", owner);
      await nothing(() => clinical.downloadReportUrlAction(rForeign), "registo");
      await nothing(() => clinical.generateRgpdFormUrlAction(rForeign), "rgpd");
      await nothing(() => fichaActions.downloadPatientFichaUrlAction(foreignPatient), "ficha");
      await nothing(() => declaracaoActions.generateDeclaracaoUrlAction(declaracaoRequest(foreignPatient)), "declaracao");
    });

    it("a Declaração for a location with no carimbo: refused by name, no row", async () => {
      const { answer, rows } = await exported(() =>
        declaracaoActions.generateDeclaracaoUrlAction(declaracaoRequest(patient, clinicNoStamp)),
      );
      expect(answer).toEqual({ url: null, refused: "no_stamp" });
      expect(rows).toEqual([]);
    });
  });

  describe("a row that cannot be written: no URL, the stored file removed, no row", () => {
    it("a registo the caller does not read, though a file was made for it", async () => {
      // The engine is made to answer for a registo this therapist's own reads do not show.
      h.ctx = ctxOf("therapist", therapistUnrelated);
      registoEngine.mockResolvedValue({ bytes: BYTES, filename: "relatorio-clinico.pdf" });
      const { answer, rows } = await exported(() => clinical.downloadReportUrlAction(r1));
      expect(answer).toEqual({ url: null });
      expect(rows).toEqual([]);
      expect(h.upload).toHaveBeenCalledTimes(1);
      expect(h.remove).toHaveBeenCalledTimes(1);
      expect(h.remove).toHaveBeenCalledWith([h.upload.mock.calls[0]![0]]);
      expect(logged.mock.calls).toEqual([["[registo-pdf] the export failed at step: audit"]]);
    });

    it("the RGPD form of another tenant's registo, though a file was made for it", async () => {
      rgpdEngine.mockResolvedValue({ bytes: BYTES, filename: "consentimento-rgpd.pdf" });
      const { answer, rows } = await exported(() => clinical.generateRgpdFormUrlAction(rForeign));
      expect(answer).toEqual({ url: null });
      expect(rows).toEqual([]);
      expect(h.remove).toHaveBeenCalledWith([h.upload.mock.calls[0]![0]]);
      expect(logged.mock.calls).toEqual([["[rgpd-form] the export failed at step: audit"]]);
    });

    it("a Declaração for a patient or a location that is no row for the caller, though a file was made for it", async () => {
      declaracaoAvailability.mockResolvedValue("ok");
      declaracaoEngine.mockResolvedValue({ bytes: BYTES, filename: "declaracao-presenca.pdf" });
      for (const request of [declaracaoRequest(foreignPatient, clinic), declaracaoRequest(patient, randomUUID())]) {
        h.upload.mockClear();
        h.remove.mockClear();
        logged.mockClear();
        const { answer, rows } = await exported(() => declaracaoActions.generateDeclaracaoUrlAction(request));
        expect(answer).toEqual({ url: null });
        expect(rows).toEqual([]);
        expect(h.remove).toHaveBeenCalledWith([h.upload.mock.calls[0]![0]]);
        expect(logged.mock.calls).toEqual([["[declaracao] the export failed at step: audit"]]);
      }
    });

    it("a ficha or an imported group filed on a patient that is no patient: the row is refused by the table", async () => {
      // entity_id is a uuid column: a patient id that is not one cannot be written.
      fichaSelection.mockResolvedValue({ patientId: "not-a-uuid", sections: [{ kind: "none", label: null, recordIds: [r3] }], leftOut: 0 });
      fichaRender.mockResolvedValue({ bytes: BYTES, filename: "relatorio-ficha.pdf", recordIds: [r3], sections: 1, leftOut: 0 });
      const ficha = await exported(() => fichaActions.downloadPatientFichaUrlAction(patient));
      expect(ficha.answer).toEqual({ url: null });
      expect(ficha.rows).toEqual([]);
      expect(logged.mock.calls).toEqual([["[ficha-pdf] the ficha export failed at step: audit"]]);

      logged.mockClear();
      groupSelection.mockResolvedValue({ patientId: "not-a-uuid", specialty: GROUP_LABEL, recordIds: [r1], leftOut: 0 });
      groupRender.mockResolvedValue({ bytes: BYTES, filename: "relatorio-episodio-importado.pdf", recordIds: [r1], leftOut: 0 });
      const group = await exported(() => episodeActions.downloadImportedGroupReportUrlAction(patient, GROUP_LABEL));
      expect(group.answer).toEqual({ url: null });
      expect(group.rows).toEqual([]);
      expect(logged.mock.calls).toEqual([["[episode-pdf] the episode export failed at step: audit"]]);
      expect(h.remove).toHaveBeenCalledTimes(2);
    });
  });

  describe("over every row this suite wrote", () => {
    it("there is one row per finished export, and no other", async () => {
      // Control: the count is of real work (19 as each role, 3 in capitals, 12 in pairs).
      expect(finished).toBe(34);
      expect((await rowsOf()).length).toBe(finished);
    });

    it("no row holds a name, a title, clinical text or anything typed in a dialog", async () => {
      const forbidden = [
        "inventad", // the patient's, the staff's and the tenant's names, the clinical text, the group's label, the observações
        "paciente",
        "texto",
        "osteopatia", // the episode's title
        "especialidade", // the imported group's label
        "osteojp", // the clinic's name
        TYPED.nif,
        TYPED.date,
        TYPED.startTime,
        TYPED.endTime,
        "@", // an email address
      ];
      // `created_at` is left out of the search: a clock reading can spell an hour.
      for (const text of forbidden) {
        const n = (await db.execute(
          raw`select count(*)::int as n from audit_log a
               where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)
                 and (to_jsonb(a) - 'created_at')::text ilike ${`%${text}%`}`,
        )) as unknown as { n: number }[];
        expect(n[0]!.n, text).toBe(0);
      }
      // Control: the same search finds the rows when asked for what they do hold.
      const held = (await db.execute(
        raw`select count(*)::int as n from audit_log a
             where tenant_id = ${tenant}::uuid and to_jsonb(a)::text ilike ${`%${patient}%`}`,
      )) as unknown as { n: number }[];
      expect(held[0]!.n).toBe(finished);
    });

    it("every value is an id, a count or one of the four document words, under a known key", async () => {
      const KEYS: Record<string, string[]> = {
        "clinical_record.export_pdf": ["patientId", "recordId"],
        "episode.export_pdf": ["episodeId", "patientId", "recordIds", "recordsIncluded", "recordsLeftOut"],
        "patient.export_pdf:ficha": ["document", "patientId", "recordIds", "recordsIncluded", "recordsLeftOut", "sectionsIncluded"],
        "patient.export_pdf:imported_group": ["document", "patientId", "recordIds", "recordsIncluded", "recordsLeftOut"],
        "patient.export_pdf:rgpd_form": ["document", "patientId", "recordId"],
        "patient.export_pdf:declaracao": ["document", "locationId", "patientId"],
      };
      const DOCUMENTS = ["ficha", "imported_group", "rgpd_form", "declaracao"];
      const isId = (v: unknown) => typeof v === "string" && UUID.test(v);
      const isCount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;

      const rows = await rowsOf();
      const seen = new Set<string>();
      for (const row of rows) {
        const kind = row.action === "patient.export_pdf" ? `${row.action}:${String(row.metadata.document)}` : row.action;
        seen.add(kind);
        expect(Object.keys(row.metadata).sort(), kind).toEqual(KEYS[kind]);
        for (const [key, value] of Object.entries(row.metadata)) {
          if (key === "document") expect(DOCUMENTS, kind).toContain(value);
          else if (key === "recordIds") expect((value as unknown[]).every(isId), kind).toBe(true);
          else if (key.startsWith("records") || key.startsWith("sections")) expect(isCount(value), `${kind}.${key}`).toBe(true);
          else expect(isId(value), `${kind}.${key}`).toBe(true);
        }
        expect(isId(row.entity_id) && isId(row.actor) && row.tenant === tenant, kind).toBe(true);
        // The number of registos named is the number counted in.
        if (Array.isArray(row.metadata.recordIds)) {
          expect(row.metadata.recordsIncluded, kind).toBe(row.metadata.recordIds.length);
        }
      }
      // Control: all six kinds of row were among those checked.
      expect([...seen].sort()).toEqual(Object.keys(KEYS).sort());
    });
  });
});

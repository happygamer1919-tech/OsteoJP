/**
 * page-record-view.test.tsx: THE RECORD PAGE'S BRANCH, RENDERED.
 *
 * FICHA-IMPORTED-VIEW. The page used to draw the imported preview ("Conteudo
 * importado" plus the patient's imported originals) for every record without a
 * template. This suite renders the REAL page component, with its data reads
 * replaced by fixtures, and asserts which body each kind of record gets.
 *
 * It is the page, not `chooseRecordView`, under test here: if the page went
 * back to `schema ? form : imported`, the AI draft, patient-submission and
 * manual cases below would all render the imported preview and fail, even with
 * `chooseRecordView` untouched.
 *
 * Children that need a browser or the Next router (the attachments uploader,
 * the form, the section rail, the report button) are stubbed. Nothing they
 * render is asserted here.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "tenant-1", role: "therapist", userId: "user-1" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  getRecordDetail: vi.fn(),
  getFichaMedicaTemplate: vi.fn(),
  isImporterSourcedRecord: vi.fn(),
  listImportedPatientDocuments: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/records", () => ({
  getRecordDetail: h.getRecordDetail,
  getFichaMedicaTemplate: h.getFichaMedicaTemplate,
}));
vi.mock("@/lib/clinical/terms-acceptance", () => ({ getLatestTermsAcceptance: async () => null }));
vi.mock("@/lib/patients/documents", () => ({
  listImportedPatientDocuments: h.listImportedPatientDocuments,
}));
vi.mock("@/lib/clinical/record-origin", () => ({
  isImporterSourcedRecord: h.isImporterSourcedRecord,
}));
vi.mock("@/app/patients/[id]/document-actions", () => ({ documentDownloadUrlAction: vi.fn() }));
vi.mock("./actions", () => ({
  saveRecordAction: vi.fn(),
  signRecordAction: vi.fn(),
  versionRecordAction: vi.fn(),
}));
vi.mock("./Attachments", () => ({ Attachments: () => null }));
vi.mock("./DownloadReportButton", () => ({ DownloadReportButton: () => null }));
vi.mock("./PatientHeaderStrip", () => ({ PatientHeaderStrip: () => null }));
vi.mock("./section-rail", () => ({ SectionRail: () => null }));
vi.mock("./RecordForm", async () => {
  const { createElement } = await import("react");
  return { RecordForm: () => createElement("div", { "data-testid": "record-form" }) };
});

const pt = getStrings("pt");
const REC = "22222222-2222-4222-8222-222222222222";

const IMPORTED_DOC = {
  id: "33333333-3333-4333-8333-333333333333",
  fileName: "original-sintetico.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  storagePath: "tenant-1/migration/fisiozero/original-sintetico.pdf",
  createdAt: "2026-09-01T10:00:00.000Z",
};

/** Twelve null values, the shape of the complaint's empty extraction. */
const EMPTY_AI_DATA = {
  _aiIngestionRaw: {
    template: "osteopathy",
    _ai_meta: Object.fromEntries(
      [
        "consultation_reason",
        "relief_aggravation",
        "clinical_history",
        "systems_review.neurological",
        "systems_review.cardiovascular",
        "systems_review.respiratory",
        "systems_review.gastrointestinal",
        "systems_review.urological_gynecological",
        "systems_review.endocrine",
        "treatment_objectives",
        "treatment_plan",
        "observations",
      ].map((k) => [k, null]),
    ),
  },
};

const IMPORTED_DATA = { queixas: "Lombalgia sintetica", especialidade: "Osteopatia" };

type SeedField = { "x-label"?: { pt?: string }; properties?: Record<string, SeedField> };
type SeedTemplate = { key: string; version: number; schema: { properties: Record<string, SeedField> } };

/**
 * The CURRENT Ficha Medica seed: the highest osteopathy version on disk, which
 * is what `getFichaMedicaTemplate` resolves (highest active version of the key).
 * Chosen by version, not by file name, so a new version is picked up unedited.
 */
function currentFichaSeed(): SeedTemplate {
  const dir = path.join(__dirname, "../../../../../packages/db/seed/form-templates");
  const seeds = readdirSync(dir)
    .filter((f) => /^osteopathy-v\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as SeedTemplate)
    .filter((t) => t.key === "osteopathy");
  expect(seeds.length).toBeGreaterThan(0);
  return seeds.reduce((a, b) => (b.version > a.version ? b : a));
}
const FICHA = currentFichaSeed();
const FICHA_TEMPLATE = { id: "66666666-6666-4666-8666-666666666666", title: null, schema: FICHA.schema };
const ptLabel = (...segments: string[]) => {
  let field: SeedField | undefined = { properties: FICHA.schema.properties };
  for (const seg of segments) field = field?.properties?.[seg];
  const label = field?.["x-label"]?.pt;
  expect(label, `the seed has a pt label at ${segments.join(".")}`).toBeTruthy();
  return label!;
};

function record(over: Record<string, unknown> = {}) {
  return {
    id: REC,
    patientId: "patient-1",
    patientName: "Paciente Sintetico",
    patientSex: null,
    patientNumber: null,
    patientDateOfBirth: null,
    patientProfession: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    episodeId: null,
    episodeTitle: null,
    formTemplateId: null,
    status: "draft",
    source: "manual",
    aiReviewState: null,
    version: 1,
    supersedesId: null,
    data: {},
    signedAt: null,
    signedByName: null,
    updatedAt: "2026-09-01T10:00:00.000Z",
    template: null,
    attachments: [],
    ...over,
  };
}

async function renderPage(rec: ReturnType<typeof record>): Promise<string> {
  h.getRecordDetail.mockResolvedValue(rec);
  const { default: RecordDetailPage } = await import("./page");
  const el = await RecordDetailPage({
    params: Promise.resolve({ id: REC }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(el);
}

/** The page's visible text, tags stripped. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ");

beforeEach(() => {
  h.ctx = { tenantId: "tenant-1", role: "therapist", userId: "user-1" };
  h.getRecordDetail.mockReset();
  h.getFichaMedicaTemplate.mockReset();
  h.getFichaMedicaTemplate.mockResolvedValue(FICHA_TEMPLATE);
  h.isImporterSourcedRecord.mockReset();
  h.listImportedPatientDocuments.mockReset();
  h.listImportedPatientDocuments.mockResolvedValue([IMPORTED_DOC]);
});

describe("the record page draws the imported preview ONLY for importer-sourced records", () => {
  it("THE COMPLAINT: an AI ingestion draft with an empty extraction is NOT shown as imported", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(
      record({ source: "ai_ingested", aiReviewState: "pending_review", data: EMPTY_AI_DATA }),
    );
    expect(html).toContain('data-testid="ai-recording-draft"');
    expect(html).toContain(pt["clinical.aiDraftTitle"]);
    expect(html).toContain('data-testid="ai-recording-draft-empty"');
    expect(html).toContain(pt["clinical.aiDraftEmpty"]);
    expect(html).not.toContain(pt["clinical.importedPreviewTitle"]);
    expect(html).not.toContain('data-testid="imported-record-preview"');
    expect(html).not.toContain('data-testid="imported-patient-documents"');
    expect(textOf(html)).not.toMatch(/importad/i);
    // The originals list is not even read for a record that is not imported.
    expect(h.listImportedPatientDocuments).not.toHaveBeenCalled();
    // Nothing was filled, so there is no field to label and no template read.
    expect(h.getFichaMedicaTemplate).not.toHaveBeenCalled();
  });

  it("asks the importer-origin question once, for this record, in this request's context", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    await renderPage(record({ source: "ai_ingested", data: EMPTY_AI_DATA }));
    expect(h.isImporterSourcedRecord).toHaveBeenCalledTimes(1);
    expect(h.isImporterSourcedRecord).toHaveBeenCalledWith(h.ctx, REC);
  });

  it("an importer record gets the imported preview and the patient's imported originals", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(true);
    const html = await renderPage(record({ status: "locked", data: IMPORTED_DATA }));
    expect(html).toContain('data-testid="imported-record-preview"');
    expect(html).toContain(pt["clinical.importedPreviewTitle"]);
    expect(html).toContain("Lombalgia sintetica");
    expect(html).toContain('data-testid="imported-patient-documents"');
    expect(html).toContain(IMPORTED_DOC.fileName);
    expect(h.listImportedPatientDocuments).toHaveBeenCalledWith(h.ctx, "patient-1", REC);
  });

  it("a new version of an imported record (source manual, supersedes set) is imported too", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(true);
    const html = await renderPage(
      record({ version: 2, supersedesId: "44444444-4444-4444-8444-444444444444", data: IMPORTED_DATA }),
    );
    expect(html).toContain('data-testid="imported-record-preview"');
    expect(html).toContain('data-testid="imported-patient-documents"');
  });

  it.each([
    ["a manual record the importer never wrote", "manual"],
    ["a patient submission draft", "patient"],
  ])("%s gets the neutral view, with no 'importado' anywhere on the page", async (_label, source) => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(record({ source, data: { nota: "Registo sem modelo" } }));
    expect(html).toContain('data-testid="record-content"');
    expect(html).toContain(pt["clinical.recordContentTitle"]);
    expect(html).toContain("Registo sem modelo");
    expect(html).not.toContain('data-testid="imported-record-preview"');
    expect(html).not.toContain('data-testid="imported-patient-documents"');
    expect(html).not.toContain('data-testid="ai-recording-draft"');
    expect(textOf(html)).not.toMatch(/importad/i);
    expect(h.listImportedPatientDocuments).not.toHaveBeenCalled();
  });

  it("a neutral record with nothing stored says so, without the imported wording", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(record({ data: {} }));
    expect(html).toContain('data-testid="record-content-empty"');
    expect(html).toContain(pt["clinical.recordNoContent"]);
    expect(textOf(html)).not.toMatch(/importad/i);
  });

  it("a record with a template gets the form, and no origin read is spent on it", async () => {
    const html = await renderPage(
      record({
        formTemplateId: "55555555-5555-4555-8555-555555555555",
        template: { title: { pt: "Ficha Medica" }, schema: { type: "object", properties: {} } },
        source: "ai_ingested",
      }),
    );
    expect(html).toContain('data-testid="record-form"');
    expect(html).not.toContain('data-testid="ai-recording-draft"');
    expect(html).not.toContain('data-testid="imported-record-preview"');
    expect(h.isImporterSourcedRecord).not.toHaveBeenCalled();
  });
});

describe("the AI draft panel's way to the review screen", () => {
  it("a reviewer on a PENDING draft is sent to the review queue, where the draft is claimed", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(
      record({ source: "ai_ingested", aiReviewState: "pending_review", data: EMPTY_AI_DATA }),
    );
    expect(html).toContain('href="/clinical/review"');
    expect(html).toContain(pt["clinical.aiDraftReviewLink"]);
    expect(html).toContain(pt["clinical.aiDraftPending"]);
  });

  it("a reviewer on a CLAIMED draft goes straight to its review screen", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(
      record({ source: "ai_ingested", aiReviewState: "in_review", data: EMPTY_AI_DATA }),
    );
    expect(html).toContain(`href="/clinical/review/${REC}"`);
  });

  it("an admin, who cannot review, gets the panel but no link", async () => {
    h.ctx = { tenantId: "tenant-1", role: "admin", userId: "user-2" };
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(
      record({ source: "ai_ingested", aiReviewState: "pending_review", data: EMPTY_AI_DATA }),
    );
    expect(html).toContain('data-testid="ai-recording-draft"');
    expect(html).not.toContain('data-testid="ai-recording-draft-review-link"');
  });

  it("the panel lists what the recording DID fill, read-only", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(
      record({
        source: "ai_ingested",
        aiReviewState: "pending_review",
        data: { _aiIngestionRaw: { consultation_reason: "Dor cervical sintetica" } },
      }),
    );
    expect(html).toContain('data-testid="ai-recording-draft-fields"');
    expect(html).toContain("Dor cervical sintetica");
    expect(html).not.toContain('data-testid="ai-recording-draft-empty"');
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });
});

/**
 * ROUND 1 (reviewer, behaviour lens): the panel labelled each filled field with
 * its raw English contract key, so a pt-PT screen read "consultation_reason" and
 * "systems_review.neurological". The labels are now the Ficha Medica
 * template's own, the ones the form draws for the same fields.
 */
describe("the AI draft panel names each filled field in the ficha's own words", () => {
  const FILLED = {
    _aiIngestionRaw: {
      template: "osteopathy",
      consultation_reason: "Dor cervical sintetica",
      systems_review: { neurological: "Parestesias sinteticas" },
    },
  };

  it("labels come from the current Ficha Medica template, and no contract key is on the screen", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(
      record({ source: "ai_ingested", aiReviewState: "pending_review", data: FILLED }),
    );
    const text = textOf(html);
    expect(text).toContain(ptLabel("consultation_reason"));
    expect(text).toContain(`${ptLabel("systems_review")} · ${ptLabel("systems_review", "neurological")}`);
    expect(text).toContain("Dor cervical sintetica");
    expect(text).toContain("Parestesias sinteticas");
    // The English machine keys are gone from what a clinician reads.
    expect(text).not.toContain("consultation_reason");
    expect(text).not.toContain("systems_review");
    expect(text).not.toContain("neurological");
    // One template read, in this request's context.
    expect(h.getFichaMedicaTemplate).toHaveBeenCalledTimes(1);
    expect(h.getFichaMedicaTemplate).toHaveBeenCalledWith(h.ctx);
  });

  it("with no Ficha Medica template (a deploy fault) the values still show, under their key paths", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    h.getFichaMedicaTemplate.mockResolvedValue(null);
    const html = await renderPage(
      record({ source: "ai_ingested", aiReviewState: "pending_review", data: FILLED }),
    );
    const text = textOf(html);
    expect(text).toContain("consultation_reason");
    expect(text).toContain("systems_review.neurological");
    expect(text).toContain("Dor cervical sintetica");
  });

  it("no other view reads the Ficha Medica template", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    await renderPage(record({ source: "manual", data: { nota: "Registo sem modelo" } }));
    h.isImporterSourcedRecord.mockResolvedValue(true);
    await renderPage(record({ status: "locked", data: IMPORTED_DATA }));
    expect(h.getFichaMedicaTemplate).not.toHaveBeenCalled();
  });
});

/**
 * ROUND 1 (reviewer, behaviour lens): for a role that reads records but cannot
 * author them (admin), `readOnly` is true on a DRAFT, and the page drew
 * "Ficha finalizada e imutavel" right above a panel saying the draft waits for
 * review. The banner states a fact about the RECORD, so it now follows the
 * record's status; `readOnly` still decides whether the viewer may edit.
 */
describe("the immutability banner is shown for finalized records only", () => {
  const LOCKED = pt["clinical.lockedNotice"];

  it("an admin on a pending AI draft sees 'awaiting review' and NOT 'finalized and immutable'", async () => {
    h.ctx = { tenantId: "tenant-1", role: "admin", userId: "user-2" };
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(
      record({ source: "ai_ingested", aiReviewState: "pending_review", data: EMPTY_AI_DATA }),
    );
    expect(html).toContain(pt["clinical.aiDraftPending"]);
    expect(html).not.toContain(LOCKED);
  });

  it("an admin on a draft ficha with a template sees no banner either: the draft is not finalized", async () => {
    h.ctx = { tenantId: "tenant-1", role: "admin", userId: "user-2" };
    const html = await renderPage(
      record({
        formTemplateId: "55555555-5555-4555-8555-555555555555",
        template: { title: { pt: "Ficha Medica" }, schema: { type: "object", properties: {} } },
      }),
    );
    expect(html).toContain('data-testid="record-form"');
    expect(html).not.toContain(LOCKED);
  });

  it.each([
    ["an admin", "admin"],
    ["a therapist", "therapist"],
  ])("CONTROL: %s on a LOCKED record still gets the banner", async (_label, role) => {
    h.ctx = { tenantId: "tenant-1", role, userId: "user-3" };
    h.isImporterSourcedRecord.mockResolvedValue(true);
    const html = await renderPage(record({ status: "locked", data: IMPORTED_DATA }));
    expect(html).toContain(LOCKED);
  });

  it("CONTROL: a SIGNED ficha with a template still gets the banner", async () => {
    const html = await renderPage(
      record({
        status: "signed",
        formTemplateId: "55555555-5555-4555-8555-555555555555",
        template: { title: { pt: "Ficha Medica" }, schema: { type: "object", properties: {} } },
      }),
    );
    expect(html).toContain(LOCKED);
  });
});

/**
 * ROUND 2 (reviewer, behaviour lens): every template-less AI record went to the
 * recording-draft panel, whatever its status, and the panel drew only the
 * filled contract keys. A record signed with no template (possible before the
 * claim bound the Ficha Medica template) rendered "Ficha finalizada e
 * imutavel" above "Rascunho de gravacao de consulta" and "A gravacao nao
 * produziu conteudo", and the reviewer's text was on no part of the page.
 */
describe("a template-less AI record: the page drops nothing that is stored", () => {
  const NULL_META = EMPTY_AI_DATA._aiIngestionRaw;
  const REVIEWER_TEXT = "Texto do revisor sintetico";

  /** Every non-blank string leaf stored OUTSIDE the raw payload. */
  function storedLeavesOutsideRaw(data: Record<string, unknown>): string[] {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string" && v.trim() !== "") out.push(v);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    for (const [k, v] of Object.entries(data)) if (k !== "_aiIngestionRaw") walk(v);
    return out;
  }

  it.each(["signed", "locked"])(
    "THE DEFECT'S RECORD: a %s AI record with no template gets the neutral view, with the reviewer's text",
    async (status) => {
      h.isImporterSourcedRecord.mockResolvedValue(false);
      const html = await renderPage(
        record({
          source: "ai_ingested",
          status,
          aiReviewState: "approved",
          signedByName: status === "signed" ? "Revisor Sintetico" : null,
          data: { _aiIngestionRaw: NULL_META, observations: REVIEWER_TEXT },
        }),
      );
      expect(html).toContain('data-testid="record-content"');
      expect(html).toContain(pt["clinical.recordContentTitle"]);
      expect(textOf(html)).toContain(REVIEWER_TEXT);
      // Finalized, and said so; never also announced as a draft.
      expect(html).toContain(pt["clinical.lockedNotice"]);
      expect(html).not.toContain('data-testid="ai-recording-draft"');
      expect(html).not.toContain(pt["clinical.aiDraftTitle"]);
      expect(html).not.toContain(pt["clinical.aiDraftEmpty"]);
      expect(html).not.toContain(pt["clinical.aiDraftPending"]);
      expect(textOf(html)).not.toMatch(/importad/i);
      expect(h.getFichaMedicaTemplate).not.toHaveBeenCalled();
    },
  );

  it("a DRAFT carrying a reviewer's text outside the recording shows the panel AND the text", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const data = {
      _aiIngestionRaw: { ...NULL_META, consultation_reason: "Dor cervical sintetica" },
      consultation_reason: "Dor cervical sintetica",
      observations: REVIEWER_TEXT,
      systems_review: { respiratory: "Revisor respiratorio sintetico" },
    };
    const html = await renderPage(record({ source: "ai_ingested", aiReviewState: "in_review", data }));
    expect(html).toContain('data-testid="ai-recording-draft"');
    expect(html).toContain('data-testid="ai-recording-draft-other"');
    expect(html).toContain(pt["clinical.aiDraftOtherTitle"]);
    expect(html).not.toContain(pt["clinical.lockedNotice"]);
    const text = textOf(html);
    for (const leaf of storedLeavesOutsideRaw(data)) expect(text).toContain(leaf);
    // Shown once, in the fields: the other block does not repeat it.
    expect(text.split("Dor cervical sintetica")).toHaveLength(2);
  });

  it("an empty extraction with a reviewer's text: the recording is empty, and the text is still there", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const data = { _aiIngestionRaw: NULL_META, observations: REVIEWER_TEXT };
    const html = await renderPage(record({ source: "ai_ingested", aiReviewState: "in_review", data }));
    expect(html).toContain('data-testid="ai-recording-draft-empty"');
    expect(html).toContain('data-testid="ai-recording-draft-other"');
    expect(textOf(html)).toContain(REVIEWER_TEXT);
  });

  it("CONTROL: a draft as ingestion writes it has no 'other content' block", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    for (const data of [
      EMPTY_AI_DATA,
      { _aiIngestionRaw: { template: "osteopathy", consultation_reason: "Dor cervical sintetica" } },
    ]) {
      const html = await renderPage(record({ source: "ai_ingested", aiReviewState: "pending_review", data }));
      expect(html).toContain('data-testid="ai-recording-draft"');
      expect(html).not.toContain('data-testid="ai-recording-draft-other"');
      expect(html).not.toContain(pt["clinical.aiDraftOtherTitle"]);
    }
  });

  it("CONTROL: a stored key whose value is blank or null is not a block of its own", async () => {
    h.isImporterSourcedRecord.mockResolvedValue(false);
    const html = await renderPage(
      record({
        source: "ai_ingested",
        aiReviewState: "in_review",
        data: { _aiIngestionRaw: NULL_META, observations: "  ", treatment_plan: null },
      }),
    );
    expect(html).not.toContain('data-testid="ai-recording-draft-other"');
  });
});

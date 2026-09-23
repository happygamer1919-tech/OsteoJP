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
  isImporterSourcedRecord: vi.fn(),
  listImportedPatientDocuments: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/records", () => ({ getRecordDetail: h.getRecordDetail }));
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
    expect(html).toContain("consultation_reason");
    expect(html).toContain("Dor cervical sintetica");
    expect(html).not.toContain('data-testid="ai-recording-draft-empty"');
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });
});

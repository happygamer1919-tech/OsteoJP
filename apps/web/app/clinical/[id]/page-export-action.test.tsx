/**
 * page-export-action.test.tsx: EXPORT-01. WHERE THE REGISTO PAGE SHOWS
 * "Transferir PDF", AND WHERE IT SHOWS NOTHING.
 *
 * The REAL page component renders here, with its reads replaced by fixtures
 * and the button replaced by a marker that records the registo it was given.
 *
 *   G1  an IMPORTED registo that is finalized has the action, for the owner,
 *       an admin and a therapist alike; so has any other finalized registo the
 *       page draws without a form, and a registo with a template keeps it on
 *       the form's toolbar;
 *   G3  a DRAFT has no action, whatever its origin, and neither has a registo
 *       still under AI review;
 *   G2  a registo outside the viewer's reach is not a page at all: the page's
 *       read finds nothing and the page answers 404, for every role, so there
 *       is no action to show. Reception never reaches a registo page: the
 *       clinical layout sends it away.
 * Which registos the read finds for which role is the database's answer
 * (lib/clinical/report/registo-export.db.test.ts); what the action then does
 * is actions.export.test.ts's.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "tenant-1", role: "owner", userId: "user-1" } as {
    tenantId: string;
    role: string;
    userId: string;
  } | null,
  getRecordDetail: vi.fn(),
  isImporterSourcedRecord: vi.fn(),
  /** The props the page handed the form: its toolbar actions are among them. */
  formProps: [] as Record<string, unknown>[],
}));

class NotFound extends Error {}
class Redirect extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT ${url}`);
  }
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: async () => h.ctx,
  getRequestContext: async () => h.ctx,
}));
vi.mock("@/lib/clinical/records", () => ({
  getRecordDetail: h.getRecordDetail,
  getFichaMedicaTemplate: async () => null,
  mayFileRegistoFor: async () => true,
  canWriteRecord: async () => true,
}));
vi.mock("@/lib/clinical/terms-acceptance", () => ({ getLatestTermsAcceptance: async () => null }));
vi.mock("@/lib/patients/documents", () => ({ listImportedPatientDocuments: async () => [] }));
vi.mock("@/lib/clinical/record-origin", () => ({ isImporterSourcedRecord: h.isImporterSourcedRecord }));
vi.mock("@/app/patients/[id]/document-actions", () => ({ documentDownloadUrlAction: vi.fn() }));
vi.mock("@/components/app-shell", async () => {
  const { createElement } = await import("react");
  return { AppShell: ({ children }: { children: unknown }) => createElement("div", { "data-testid": "app-shell" }, children as never) };
});
vi.mock("./actions", () => ({
  saveRecordAction: vi.fn(),
  signRecordAction: vi.fn(),
  versionRecordAction: vi.fn(),
  downloadReportUrlAction: vi.fn(),
}));
vi.mock("./Attachments", () => ({ Attachments: () => null }));
vi.mock("./PatientHeaderStrip", () => ({ PatientHeaderStrip: () => null }));
vi.mock("./section-rail", () => ({ SectionRail: () => null }));
// The button, as a marker carrying the registo it would export.
vi.mock("./DownloadReportButton", async () => {
  const { createElement } = await import("react");
  return {
    DownloadReportButton: ({ recordId }: { recordId: string }) =>
      createElement("button", { "data-testid": "download-report", "data-record-id": recordId }),
  };
});
// The form draws its toolbar actions, so the button on a templated registo shows.
vi.mock("./RecordForm", async () => {
  const { createElement } = await import("react");
  return {
    RecordForm: (props: { extraActions?: unknown }) => {
      h.formProps.push({ ...props });
      return createElement("div", { "data-testid": "record-form" }, props.extraActions as never);
    },
  };
});

import ClinicalLayout from "../layout";
import RecordDetailPage from "./page";

const pt = getStrings("pt");
const REC = "22222222-2222-4222-8222-222222222222";
const BUTTON = 'data-testid="download-report"';
const STORED_SLOT = 'data-testid="record-export"';
const count = (html: string, needle: string) => html.split(needle).length - 1;

const TEMPLATE = {
  title: null,
  schema: { type: "object", properties: { consultation_reason: { type: "string" } } },
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
    createdAt: "2024-05-10T23:00:00.000Z",
    episodeId: null,
    episodeTitle: null,
    formTemplateId: null,
    status: "locked",
    practitionerId: null,
    source: "manual",
    aiReviewState: null,
    version: 1,
    supersedesId: null,
    data: { queixas: "Lombalgia sintetica" },
    signedAt: null,
    signedByName: null,
    updatedAt: "2026-09-01T10:00:00.000Z",
    dataHash: "0".repeat(64),
    template: null,
    attachments: [],
    ...over,
  };
}

async function renderPage(role: string, rec: ReturnType<typeof record> | null, imported = true): Promise<string> {
  h.ctx = { tenantId: "tenant-1", role, userId: "user-1" };
  h.getRecordDetail.mockResolvedValue(rec);
  h.isImporterSourcedRecord.mockResolvedValue(imported);
  const el = await RecordDetailPage({
    params: Promise.resolve({ id: REC }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  h.getRecordDetail.mockReset();
  h.isImporterSourcedRecord.mockReset();
  h.formProps = [];
});

describe("G1: an imported registo has the export action", () => {
  it.each(["owner", "admin", "therapist"])("%s on a LOCKED imported registo: one button, for this registo, above the imported content", async (role) => {
    const html = await renderPage(role, record());
    // Positive control: this is the imported view, with its read-only notice.
    expect(html).toContain('data-testid="imported-record-preview"');
    expect(html).toContain(pt["clinical.importedPreviewHelp"]);
    expect(count(html, BUTTON)).toBe(1);
    expect(html).toContain(`data-record-id="${REC}"`);
    expect(count(html, STORED_SLOT)).toBe(1);
    expect(html.indexOf(STORED_SLOT)).toBeLessThan(html.indexOf('data-testid="imported-record-preview"'));
  });

  it("a SIGNED imported registo (a later version signed here) has it too", async () => {
    const html = await renderPage("owner", record({ status: "signed", version: 2, supersedesId: "x" }));
    expect(count(html, BUTTON)).toBe(1);
  });

  it("an imported registo with nothing stored still has it: the export is the page, and the page says so", async () => {
    const html = await renderPage("owner", record({ data: {} }));
    expect(html).toContain(pt["clinical.importedNoContent"]);
    expect(count(html, BUTTON)).toBe(1);
  });

  it("a finalized registo with no template that the importer did not write has it, above its neutral content", async () => {
    const html = await renderPage("owner", record({ status: "signed" }), false);
    expect(html).toContain('data-testid="record-content"');
    expect(html).not.toContain('data-testid="imported-record-preview"');
    expect(count(html, BUTTON)).toBe(1);
    expect(count(html, STORED_SLOT)).toBe(1);
  });

  it("CONTROL: a finalized registo WITH a template keeps the button on the form's toolbar, once", async () => {
    const html = await renderPage("owner", record({ status: "signed", formTemplateId: "t-1", template: TEMPLATE }));
    expect(html).toContain('data-testid="record-form"');
    expect(count(html, BUTTON)).toBe(1);
    expect(count(html, STORED_SLOT)).toBe(0);
    expect(h.isImporterSourcedRecord).not.toHaveBeenCalled();
  });
});

describe("G3: a draft has no export action", () => {
  it.each(["owner", "admin", "therapist"])("%s on an imported DRAFT: the content shows, no button", async (role) => {
    const html = await renderPage(role, record({ status: "draft" }));
    expect(html).toContain('data-testid="imported-record-preview"');
    expect(html).toContain("Lombalgia sintetica");
    expect(count(html, BUTTON)).toBe(0);
    expect(count(html, STORED_SLOT)).toBe(0);
  });

  it("a draft with a template: the form, no button", async () => {
    const html = await renderPage("therapist", record({ status: "draft", formTemplateId: "t-1", template: TEMPLATE }));
    expect(html).toContain('data-testid="record-form"');
    expect(count(html, BUTTON)).toBe(0);
  });

  it("a draft with no template that the importer did not write: no button", async () => {
    const html = await renderPage("owner", record({ status: "draft" }), false);
    expect(html).toContain('data-testid="record-content"');
    expect(count(html, BUTTON)).toBe(0);
  });

  it.each(["pending_review", "in_review"])("a registo under AI review (%s) has no button even if it reads finalized: the engine would refuse it", async (ai) => {
    const html = await renderPage("owner", record({ status: "locked", source: "ai_ingested", aiReviewState: ai }), false);
    expect(html).toContain('data-testid="record-content"');
    expect(count(html, BUTTON)).toBe(0);
  });

  it("CONTROL: the same registo once its review is over has the button", async () => {
    const html = await renderPage("owner", record({ status: "locked", source: "ai_ingested", aiReviewState: "approved" }), false);
    expect(count(html, BUTTON)).toBe(1);
  });
});

describe("G2: outside the viewer's reach there is no page, so no action", () => {
  it.each(["owner", "admin", "therapist"])("%s: the read finds nothing, the page answers 404 and renders nothing", async (role) => {
    await expect(renderPage(role, null)).rejects.toBeInstanceOf(NotFound);
    expect(h.getRecordDetail).toHaveBeenCalledWith({ tenantId: "tenant-1", role, userId: "user-1" }, REC);
    // Nothing was asked about a record the viewer cannot read.
    expect(h.isImporterSourcedRecord).not.toHaveBeenCalled();
  });

  it("RECEPTION never reaches a registo page: the clinical layout sends it to the dashboard", async () => {
    h.ctx = { tenantId: "tenant-1", role: "reception", userId: "user-1" };
    const attempt = ClinicalLayout({ children: null });
    await expect(attempt).rejects.toBeInstanceOf(Redirect);
    await expect(attempt).rejects.toMatchObject({ url: "/dashboard" });
  });

  it.each(["owner", "admin", "therapist"])("CONTROL: the clinical layout lets %s through", async (role) => {
    h.ctx = { tenantId: "tenant-1", role, userId: "user-1" };
    const html = renderToStaticMarkup(await ClinicalLayout({ children: null }));
    expect(html).toContain('data-testid="app-shell"');
  });

  it("nobody signed in: the layout sends them to the login page", async () => {
    h.ctx = null;
    await expect(ClinicalLayout({ children: null })).rejects.toMatchObject({ url: "/login" });
  });
});

/**
 * page-write-controls.test.tsx: WHICH WRITE CONTROLS THE RECORD PAGE OFFERS.
 *
 * The permission matrix, which 0097 (held, packages/db/migrations-pending/
 * NEXT-AFTER-0096_clinical_records_write_matrix.sql) enforces once applied: a
 * therapist saves and signs only a draft they authored, for a patient they
 * treat or created, and files a new version only for a patient they treat or
 * created. The page used to ask only the capability, the status and CARE-02a's
 * write reach. TODAY, BEFORE 0097, that matched the database: 0045's UPDATE
 * admits a therapist on a draft they authored or on any draft of a patient
 * they treat or created, so Save and "Assinar e bloquear" on a colleague's
 * draft worked. From 0097 the UPDATE policy admits a therapist only on their
 * own draft, of a patient they treat or created, and each of those would
 * always fail. So this page change is visible on merge: a therapist loses Save
 * and Sign on a draft they did not author, and on their own draft of a
 * patient they no longer treat and did not create, before 0097 as after it.
 *
 * This suite renders the REAL page with its reads replaced by fixtures and a
 * RecordForm stub that prints the props the page hands it: `readOnly`, whether
 * a sign is offered, and the extra actions ("Nova versao"). The attachments
 * keep main's gate (finalized, no author capability, or outside CARE-02a's
 * pre-0096 write reach), which 0097 does not change.
 *
 * Deleting the authorship test, the patient test, or either from one control,
 * or dropping CARE-02a's reach from the attachments, turns an arm red.
 */
import { createElement, Fragment } from "react";
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
  mayFileRegistoFor: vi.fn(),
  canWriteRecord: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/records", () => ({
  getRecordDetail: h.getRecordDetail,
  getFichaMedicaTemplate: h.getFichaMedicaTemplate,
  mayFileRegistoFor: h.mayFileRegistoFor,
  canWriteRecord: h.canWriteRecord,
}));
vi.mock("@/lib/clinical/terms-acceptance", () => ({ getLatestTermsAcceptance: async () => null }));
vi.mock("@/lib/patients/documents", () => ({ listImportedPatientDocuments: vi.fn(async () => []) }));
vi.mock("@/lib/clinical/record-origin", () => ({ isImporterSourcedRecord: vi.fn(async () => false) }));
vi.mock("@/app/patients/[id]/document-actions", () => ({ documentDownloadUrlAction: vi.fn() }));
vi.mock("./actions", () => ({
  saveRecordAction: vi.fn(),
  signRecordAction: vi.fn(),
  versionRecordAction: vi.fn(),
}));
vi.mock("./Attachments", async () => {
  const { createElement } = await import("react");
  return {
    Attachments: (p: { readOnly: boolean }) =>
      createElement("div", { "data-testid": "attachments", "data-readonly": String(p.readOnly) }),
  };
});
vi.mock("./DownloadReportButton", () => ({ DownloadReportButton: () => null }));
vi.mock("./PatientHeaderStrip", () => ({ PatientHeaderStrip: () => null }));
vi.mock("./section-rail", () => ({ SectionRail: () => null }));
vi.mock("./RecordForm", async () => {
  const { createElement } = await import("react");
  return {
    RecordForm: (p: { readOnly: boolean; sign?: unknown; extraActions?: unknown }) =>
      createElement(
        "div",
        { "data-testid": "record-form", "data-readonly": String(p.readOnly), "data-sign": p.sign ? "offered" : "none" },
        p.extraActions as never,
      ),
  };
});

const pt = getStrings("pt");
const REC = "22222222-2222-4222-8222-222222222222";
const SCHEMA = { type: "object", properties: { observations: { type: "string", "x-label": { pt: "Observacoes" } } } };

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
    formTemplateId: "55555555-5555-4555-8555-555555555555",
    status: "draft",
    practitionerId: "user-1",
    source: "manual",
    aiReviewState: null,
    version: 1,
    supersedesId: null,
    data: {},
    signedAt: null,
    signedByName: null,
    updatedAt: "2026-09-01T10:00:00.000Z",
    dataHash: "0123456789abcdef0123456789abcdef",
    template: { title: null, schema: SCHEMA },
    attachments: [],
    ...over,
  };
}

type Controls = { readOnly: string; sign: string; newVersion: boolean; attachmentsReadOnly: string };

async function controls(rec: ReturnType<typeof record>, mayFile: boolean): Promise<Controls> {
  h.getRecordDetail.mockResolvedValue(rec);
  h.mayFileRegistoFor.mockResolvedValue(mayFile);
  const { default: RecordDetailPage } = await import("./page");
  const el = await RecordDetailPage({ params: Promise.resolve({ id: REC }), searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(el);
  const attr = (testId: string, name: string) =>
    html.match(new RegExp(`data-testid="${testId}"[^>]*data-${name}="([a-z]+)"`))?.[1] ?? "absent";
  return {
    readOnly: attr("record-form", "readonly"),
    sign: attr("record-form", "sign"),
    newVersion: html.includes(pt["clinical.newVersion"]),
    attachmentsReadOnly: attr("attachments", "readonly"),
  };
}

beforeEach(() => {
  h.ctx = { tenantId: "tenant-1", role: "therapist", userId: "user-1" };
  h.getRecordDetail.mockReset();
  h.getFichaMedicaTemplate.mockReset();
  h.mayFileRegistoFor.mockReset();
  // CARE-02a's test, ANDed with 0097's on the page; true unless an arm says not.
  h.canWriteRecord.mockReset();
  h.canWriteRecord.mockResolvedValue(true);
});

describe("a therapist is offered only the writes 0097 admits", () => {
  it("CONTROL: their own draft, of a patient they treat: Save and Sign", async () => {
    expect(await controls(record(), true)).toEqual({
      readOnly: "false",
      sign: "offered",
      newVersion: false,
      attachmentsReadOnly: "false",
    });
    expect(h.mayFileRegistoFor).toHaveBeenCalledWith(h.ctx, "patient-1");
  });

  it("a colleague's draft: read-only, no Sign, the attachments as on main", async () => {
    expect(await controls(record({ practitionerId: "user-9" }), true)).toEqual({
      readOnly: "true",
      sign: "none",
      newVersion: false,
      attachmentsReadOnly: "false",
    });
  });

  it("an unauthored draft is not theirs either: read-only, no Sign", async () => {
    const c = await controls(record({ practitionerId: null }), true);
    expect([c.readOnly, c.sign]).toEqual(["true", "none"]);
  });

  it("their own draft of a patient they no longer treat or created: read-only, no Sign", async () => {
    const c = await controls(record(), false);
    expect([c.readOnly, c.sign]).toEqual(["true", "none"]);
  });

  it("CONTROL: a signed registo of a patient they treat, whoever wrote it: Nova versao", async () => {
    const c = await controls(record({ status: "signed", practitionerId: "user-9" }), true);
    expect(c).toMatchObject({ readOnly: "true", sign: "none", newVersion: true });
  });

  it("a signed registo of a patient they neither treat nor created: no Nova versao", async () => {
    const c = await controls(record({ status: "signed" }), false);
    expect(c.newVersion).toBe(false);
  });

  it("CARE-02a still binds: their own draft outside the pre-0096 write reach: read-only, no Sign", async () => {
    h.canWriteRecord.mockResolvedValue(false);
    const c = await controls(record(), true);
    expect([c.readOnly, c.sign]).toEqual(["true", "none"]);
    expect(h.canWriteRecord).toHaveBeenCalledWith(h.ctx, REC);
  });

  it("CARE-02a still binds: a signed registo outside the pre-0096 write reach: no Nova versao", async () => {
    h.canWriteRecord.mockResolvedValue(false);
    const c = await controls(record({ status: "signed", practitionerId: "user-9" }), true);
    expect(c.newVersion).toBe(false);
  });

  it("CARE-02a still binds the attachments: a draft outside the pre-0096 write reach: attachments read-only", async () => {
    // A care-team reader: 0096 lets them open the registo, and
    // createAttachmentUploadUrl and confirmAttachment still refuse them, so
    // "Adicionar anexo" and the camera are not offered. Main's gate, kept.
    h.canWriteRecord.mockResolvedValue(false);
    expect(await controls(record({ practitionerId: "user-9" }), true)).toEqual({
      readOnly: "true",
      sign: "none",
      newVersion: false,
      attachmentsReadOnly: "true",
    });
  });
});

describe("CONTROL: the owner and the admin are unchanged", () => {
  it("the owner on a therapist's draft: Save and Sign", async () => {
    h.ctx = { tenantId: "tenant-1", role: "owner", userId: "user-0" };
    const c = await controls(record({ practitionerId: "user-9" }), true);
    expect([c.readOnly, c.sign]).toEqual(["false", "offered"]);
  });

  it("the owner on a signed registo: Nova versao", async () => {
    h.ctx = { tenantId: "tenant-1", role: "owner", userId: "user-0" };
    expect((await controls(record({ status: "signed" }), true)).newVersion).toBe(true);
  });

  it("an admin, who cannot author: read-only, no Sign, no Nova versao", async () => {
    h.ctx = { tenantId: "tenant-1", role: "admin", userId: "user-2" };
    expect(await controls(record({ practitionerId: "user-2" }), true)).toEqual({
      readOnly: "true",
      sign: "none",
      newVersion: false,
      attachmentsReadOnly: "true",
    });
  });
});

describe("the record page names a refused sign or new version", () => {
  /** The page's HTML for `?m=<m>`, on a therapist's own draft. */
  async function pageWith(m: string): Promise<string> {
    h.getRecordDetail.mockResolvedValue(record());
    h.mayFileRegistoFor.mockResolvedValue(true);
    const { default: RecordDetailPage } = await import("./page");
    const el = await RecordDetailPage({ params: Promise.resolve({ id: REC }), searchParams: Promise.resolve({ m }) });
    return renderToStaticMarkup(el);
  }
  const text = (t: string) => renderToStaticMarkup(createElement(Fragment, null, t));

  it("err:not_author (a draft with another author): its own pt-PT message, not the generic one", async () => {
    const html = await pageWith("err:not_author");
    expect(pt["clinical.notAuthor"]).toBeTruthy();
    expect(html).toContain(text(pt["clinical.notAuthor"]));
    expect(html).not.toContain(text(pt["clinical.error"]));
  });

  it("CONTROL err:stale keeps its own message, and err:not_found (a refused Nova versao) the generic one", async () => {
    const stale = await pageWith("err:stale");
    expect(stale).toContain(text(pt["clinical.signStale"]));
    expect(stale).not.toContain(text(pt["clinical.notAuthor"]));
    expect(await pageWith("err:not_found")).toContain(text(pt["clinical.error"]));
  });
});

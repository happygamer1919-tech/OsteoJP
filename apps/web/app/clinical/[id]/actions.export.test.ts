import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * downloadReportUrlAction: "Transferir PDF" ON A REGISTO (EXPORT-01).
 *
 *   - the record is read by the engine that reads it as the registo page does
 *     (`generateRegistoReportPdf`, with the caller's own context): the action
 *     hands it the caller, the id and the app's locale, and nothing else;
 *   - G2: RECEPTION is refused before the engine or the ceiling is asked; a
 *     registo outside the caller's reach (`not_found`) and a DRAFT
 *     (`not_printable`, G3) answer `{ url: null }` with nothing stored;
 *   - a registo the engine prints (an imported one and an annulled one among
 *     them: the engine never refuses those) is stored under the caller's tenant
 *     and handed back as a 60 second signed URL;
 *   - G4: a finished export asks for its audit row exactly once, after the
 *     file is stored and signed and before the URL is returned, with the
 *     caller and the registo's id and nothing else. When the row cannot be
 *     written the URL is not handed out and the file just stored is removed.
 * Which registos the engine finds for which role is the database's answer
 * (lib/clinical/report/registo-export.db.test.ts); the row itself, on the real
 * table, is lib/clinical/export-audit.db.test.ts's.
 *
 * generateRgpdFormUrlAction, the RGPD form asked for from a registo, is held
 * to the same G4 arms below.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "owner", userId: "user-1" },
  generate: vi.fn(),
  rgpd: vi.fn(),
  allowed: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
  admin: vi.fn(),
  auditRegisto: vi.fn(),
  auditRgpd: vi.fn(),
  /** The order the steps ran in. */
  steps: [] as string[],
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/records", () => ({
  createAddendum: vi.fn(),
  getRecordDetail: vi.fn(),
  signAndLockRecord: vi.fn(),
  updateRecordData: vi.fn(),
}));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: h.allowed }));
vi.mock("@/lib/clinical/export-audit", () => ({
  recordRegistoExport: h.auditRegisto,
  recordRgpdFormExport: h.auditRgpd,
}));
vi.mock("@/lib/clinical/terms-acceptance", () => ({ recordTermsAcceptance: vi.fn() }));
vi.mock("@/lib/clinical/storage", () => ({
  confirmAttachment: vi.fn(),
  createAttachmentDownloadUrl: vi.fn(),
  createAttachmentUploadUrl: vi.fn(),
  ATTACHMENTS_BUCKET: "clinical-attachments",
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: h.admin }));
vi.mock("@/lib/clinical/report", () => ({ generateRegistoReportPdf: h.generate }));
vi.mock("@/lib/clinical/rgpd/generate", () => ({ generateRgpdFormPdf: h.rgpd }));
vi.mock("@/lib/patients/documents", () => ({
  confirmPatientDocument: vi.fn(),
  createPatientDocumentUploadUrl: vi.fn(),
}));

import { ClinicalError } from "@/lib/clinical/errors";
import { downloadReportUrlAction, generateRgpdFormUrlAction } from "./actions";

const REC = "22222222-2222-4222-8222-222222222222";
const SIGNED = "https://storage.example/signed?token=opaque";
const BYTES = new Uint8Array([37, 80, 68, 70]);

let logged: ReturnType<typeof vi.spyOn>;

/** A mock that notes its step, then answers. */
const step = (name: string, answer: unknown) => async () => {
  h.steps.push(name);
  return answer;
};

beforeEach(() => {
  h.ctx = { ...h.ctx, role: "owner" };
  h.steps = [];
  h.generate.mockReset();
  h.generate.mockImplementation(step("render", { bytes: BYTES, filename: "relatorio-clinico-22222222.pdf" }));
  h.rgpd.mockReset();
  h.rgpd.mockImplementation(step("render", { bytes: BYTES, filename: "consentimento-rgpd-22222222.pdf" }));
  h.allowed.mockReset();
  h.allowed.mockImplementation(step("ceiling", true));
  h.upload.mockReset();
  h.upload.mockImplementation(step("upload", { data: { path: "x" }, error: null }));
  h.createSignedUrl.mockReset();
  h.createSignedUrl.mockImplementation(step("sign", { data: { signedUrl: SIGNED }, error: null }));
  h.remove.mockReset();
  h.remove.mockImplementation(step("remove", { data: [], error: null }));
  h.auditRegisto.mockReset();
  h.auditRegisto.mockImplementation(step("audit", undefined));
  h.auditRgpd.mockReset();
  h.auditRgpd.mockImplementation(step("audit", undefined));
  h.admin.mockReset();
  h.admin.mockReturnValue({
    storage: { from: () => ({ upload: h.upload, createSignedUrl: h.createSignedUrl, remove: h.remove }) },
  });
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
});

describe("downloadReportUrlAction: a registo the caller may open", () => {
  it.each(["owner", "admin", "therapist"])("%s: the engine is asked as that caller, for this registo, in the app's locale", async (role) => {
    h.ctx = { ...h.ctx, role };
    expect(await downloadReportUrlAction(REC)).toEqual({ url: SIGNED });
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.generate).toHaveBeenCalledWith(h.ctx, REC, "pt");
  });

  it("the file is stored under the caller's tenant by the record's id, and handed back as a 60 second signed URL", async () => {
    await downloadReportUrlAction(REC);
    const [path, bytes, options] = h.upload.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^${h.ctx.tenantId}/reports/${REC}/[0-9a-f-]{36}\\.pdf$`));
    expect(bytes).toBe(BYTES);
    expect(options).toEqual({ contentType: "application/pdf", upsert: true });
    expect(h.createSignedUrl).toHaveBeenCalledWith(path, 60, { download: "relatorio-clinico-22222222.pdf" });
  });
});

describe("downloadReportUrlAction: every refusal is the same answer, with nothing stored", () => {
  const nothingStored = () => {
    expect(h.admin).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.createSignedUrl).not.toHaveBeenCalled();
  };

  it("G2, RECEPTION (no clinical_records:read): refused before the ceiling and the engine", async () => {
    h.ctx = { ...h.ctx, role: "reception" };
    expect(await downloadReportUrlAction(REC)).toEqual({ url: null });
    expect(h.allowed).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    nothingStored();
  });

  it.each(["owner", "admin", "therapist"])("G2, %s against a registo outside their reach (the engine finds nothing): no URL", async (role) => {
    h.ctx = { ...h.ctx, role };
    h.generate.mockRejectedValue(new ClinicalError("not_found"));
    expect(await downloadReportUrlAction(REC)).toEqual({ url: null });
    nothingStored();
  });

  it("G3, a DRAFT (the engine refuses to print it): no URL", async () => {
    h.generate.mockRejectedValue(new ClinicalError("not_printable"));
    expect(await downloadReportUrlAction(REC)).toEqual({ url: null });
    nothingStored();
  });

  it("the document ceiling refuses: the engine is not asked", async () => {
    h.allowed.mockResolvedValue(false);
    expect(await downloadReportUrlAction(REC)).toEqual({ url: null });
    expect(h.generate).not.toHaveBeenCalled();
    nothingStored();
  });

  it("no id: refused before the ceiling", async () => {
    expect(await downloadReportUrlAction("")).toEqual({ url: null });
    expect(h.allowed).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });
});

/**
 * G4, for both documents this file's actions hand out. Each case: the action,
 * its engine, its audit writer, the folder its file is stored in, and the tag
 * of the one line it logs when the row cannot be written.
 */
const documents = [
  ["the registo's PDF", downloadReportUrlAction, h.generate, h.auditRegisto, h.auditRgpd, "reports", "registo-pdf"],
  ["the RGPD form", generateRgpdFormUrlAction, h.rgpd, h.auditRgpd, h.auditRegisto, "rgpd-forms", "rgpd-form"],
] as const;

describe.each(documents)("the audit row of an export (G4): %s", (_label, action, engine, audit, otherAudit, folder, tag) => {
  it("the order: the ceiling, the render, the upload, the signed URL, the audit row, and only then the URL", async () => {
    expect(await action(REC)).toEqual({ url: SIGNED });
    expect(h.steps).toEqual(["ceiling", "render", "upload", "sign", "audit"]);
    // A finished export removes nothing and logs nothing.
    expect(h.remove).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "therapist"])("%s: asked for ONCE, as that caller, with the registo's id and nothing else", async (role) => {
    h.ctx = { ...h.ctx, role };
    await action(REC);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(h.ctx, REC);
    // It is this document's row, never the other's.
    expect(otherAudit).not.toHaveBeenCalled();
  });

  it("two exports are two rows asked for: one per file handed out", async () => {
    await action(REC);
    await action(REC);
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it("the audit row cannot be written: the signed URL is NOT handed out, and the file just stored is removed", async () => {
    audit.mockRejectedValue(new Error("Zzz Paciente Inventado"));
    expect(await action(REC)).toEqual({ url: null });
    expect(h.steps).toEqual(["ceiling", "render", "upload", "sign", "remove"]);
    // The object removed is the one this call stored, and no other.
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith([h.upload.mock.calls[0]![0]]);
    expect(String(h.upload.mock.calls[0]![0])).toMatch(new RegExp(`^${h.ctx.tenantId}/${folder}/${REC}/`));
    // One line, naming the document and the step: no id, none of the error's text.
    expect(logged.mock.calls).toEqual([[`[${tag}] the export failed at step: audit`]]);
  });

  it.each(["error", "throws"] as const)(
    "the removal is best effort: when it fails too (%s), the answer and the line logged are the same",
    async (fault) => {
      audit.mockRejectedValue(new Error("boom"));
      h.remove.mockImplementation(async () => {
        if (fault === "throws") throw new Error("Zzz Paciente Inventado");
        return { data: null, error: { message: "x" } };
      });
      expect(await action(REC)).toEqual({ url: null });
      expect(h.remove).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls).toEqual([[`[${tag}] the export failed at step: audit`]]);
    },
  );

  it("no row is asked for, and nothing is removed, on any outcome that hands out no file", async () => {
    const outcomes: [string, () => void][] = [
      ["reception", () => (h.ctx = { ...h.ctx, role: "reception" })],
      ["the ceiling refuses", () => h.allowed.mockResolvedValue(false)],
      ["a registo outside the caller's reach", () => engine.mockRejectedValue(new ClinicalError("not_found"))],
      ["a draft", () => engine.mockRejectedValue(new ClinicalError("not_printable"))],
      ["the render fails", () => engine.mockRejectedValue(new Error("boom"))],
      ["the upload answers an error", () => h.upload.mockResolvedValue({ data: null, error: { message: "x" } })],
      ["the upload throws", () => h.upload.mockRejectedValue(new Error("boom"))],
      ["the signed URL answers an error", () => h.createSignedUrl.mockResolvedValue({ data: null, error: { message: "x" } })],
      ["the signed URL throws", () => h.createSignedUrl.mockRejectedValue(new Error("boom"))],
    ];
    for (const [label, arrange] of outcomes) {
      h.ctx = { ...h.ctx, role: "owner" };
      engine.mockReset();
      engine.mockResolvedValue({ bytes: BYTES, filename: "x.pdf" });
      h.allowed.mockReset();
      h.allowed.mockResolvedValue(true);
      h.upload.mockReset();
      h.upload.mockResolvedValue({ data: { path: "x" }, error: null });
      h.createSignedUrl.mockReset();
      h.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
      arrange();
      expect(await action(REC), label).toEqual({ url: null });
      expect(audit, label).not.toHaveBeenCalled();
      expect(h.remove, label).not.toHaveBeenCalled();
    }
  });
});

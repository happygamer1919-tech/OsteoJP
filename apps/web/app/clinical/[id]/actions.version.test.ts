import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * versionRecordAction: WHERE A REFUSED "NOVA VERSAO" LANDS.
 *
 * createAddendum refuses a new version with a ClinicalError: `not_found` for a
 * patient the therapist neither treats nor created (the permission matrix,
 * 0097's INSERT policy once applied), or for a source registo out of reach.
 * The action used to let that throw to error.tsx. It now returns to the
 * registo with `?m=err:<code>`, as signRecordAction does, and the record page
 * shows the message (page-write-controls.test.tsx pins the text). Anything
 * that is not a ClinicalError still throws, so a real fault still reaches the
 * error boundary and is never dressed up as a refusal.
 *
 * `redirect` throws, as Next's does, so each arm reads where the action sent
 * the caller and whether a new version's path was revalidated.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "tenant-1", role: "therapist", userId: "user-1" },
  createAddendum: vi.fn(),
  revalidatePath: vi.fn(),
}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT ${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/records", () => ({
  createAddendum: h.createAddendum,
  getRecordDetail: vi.fn(),
  signAndLockRecord: vi.fn(),
  updateRecordData: vi.fn(),
}));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: vi.fn() }));
vi.mock("@/lib/clinical/terms-acceptance", () => ({ recordTermsAcceptance: vi.fn() }));
vi.mock("@/lib/clinical/storage", () => ({
  confirmAttachment: vi.fn(),
  createAttachmentDownloadUrl: vi.fn(),
  createAttachmentUploadUrl: vi.fn(),
  ATTACHMENTS_BUCKET: "attachments",
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/clinical/report", () => ({ generateRegistoReportPdf: vi.fn() }));
vi.mock("@/lib/clinical/rgpd/generate", () => ({ generateRgpdFormPdf: vi.fn() }));
vi.mock("@/lib/patients/documents", () => ({
  confirmPatientDocument: vi.fn(),
  createPatientDocumentUploadUrl: vi.fn(),
}));

import { ClinicalError } from "@/lib/clinical/errors";
import { versionRecordAction } from "./actions";

const SOURCE = "22222222-2222-4222-8222-222222222222";
const NEW = "66666666-6666-4666-8666-666666666666";

/** Runs the action; returns where it redirected, or rethrows anything else. */
async function run(): Promise<string> {
  try {
    await versionRecordAction(SOURCE);
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error("versionRecordAction returned without redirecting");
}

beforeEach(() => {
  h.createAddendum.mockReset();
  h.revalidatePath.mockReset();
});

describe("versionRecordAction: a refusal stays on the registo with its code", () => {
  it("a patient the therapist neither treats nor created (not_found): back to the SOURCE registo with ?m=err:not_found", async () => {
    h.createAddendum.mockRejectedValue(new ClinicalError("not_found"));
    expect(await run()).toBe(`/clinical/${SOURCE}?m=err:not_found`);
    expect(h.createAddendum).toHaveBeenCalledWith(h.ctx, SOURCE);
    // No new version exists, so no new version's path is revalidated.
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("any other ClinicalError keeps its own code in the redirect", async () => {
    h.createAddendum.mockRejectedValue(new ClinicalError("finalized"));
    expect(await run()).toBe(`/clinical/${SOURCE}?m=err:finalized`);
  });

  it("CONTROL: a new version is filed: its path is revalidated and the caller lands on it", async () => {
    h.createAddendum.mockResolvedValue({ id: NEW });
    expect(await run()).toBe(`/clinical/${NEW}`);
    expect(h.revalidatePath).toHaveBeenCalledWith(`/clinical/${NEW}`);
  });

  it("an error that is not a ClinicalError still throws to the error boundary, with no redirect", async () => {
    const fault = new Error("connection reset");
    h.createAddendum.mockRejectedValue(fault);
    await expect(versionRecordAction(SOURCE)).rejects.toBe(fault);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

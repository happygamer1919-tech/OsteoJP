import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * signRecordAction: WHERE A SIGN ROLLED BACK AS A DEADLOCK VICTIM LANDS (M-4b).
 *
 * signAndLockRecord answers a deadlock victim with `concurrent_change`
 * (lib/clinical/records.single-row-deadlock.test.ts). The action has always
 * returned to the registo with `?m=err:<code>` for a named refusal, so that
 * code lands as `?m=err:concurrent_change`, and the record page draws the
 * retry sentence for it (page-write-controls.test.tsx pins the text). The
 * writer is called once: nothing is retried.
 *
 * CONTROLS: another named refusal keeps its own code, an error that is not a
 * ClinicalError is the bare `err` it was before, and a sign that goes through
 * lands on `?m=signed`.
 *
 * `redirect` throws, as Next's does, so each arm reads where the action sent
 * the caller.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "tenant-1", role: "therapist", userId: "user-1" },
  signAndLockRecord: vi.fn(),
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/records", () => ({
  createAddendum: vi.fn(),
  getRecordDetail: vi.fn(),
  signAndLockRecord: h.signAndLockRecord,
  updateRecordData: vi.fn(),
}));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: vi.fn() }));
vi.mock("@/lib/clinical/export-audit", () => ({ recordRegistoExport: vi.fn(), recordRgpdFormExport: vi.fn() }));
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
import { signRecordAction } from "./actions";

const REC = "22222222-2222-4222-8222-222222222222";
const HASH = "0123456789abcdef0123456789abcdef";

/** Runs the action; returns where it redirected, or rethrows anything else. */
async function run(): Promise<string> {
  try {
    await signRecordAction(REC, HASH);
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error("signRecordAction returned without redirecting");
}

beforeEach(() => {
  h.signAndLockRecord.mockReset();
});

describe("signRecordAction: a refused sign stays on the registo with its code", () => {
  it("M-4b: a sign rolled back as a deadlock victim: ?m=err:concurrent_change, and nothing is retried", async () => {
    h.signAndLockRecord.mockRejectedValue(new ClinicalError("concurrent_change"));
    expect(await run()).toBe(`/clinical/${REC}?m=err:concurrent_change`);
    expect(h.signAndLockRecord).toHaveBeenCalledTimes(1);
    expect(h.signAndLockRecord).toHaveBeenCalledWith(h.ctx, REC, HASH);
  });

  it("CONTROL: another named refusal keeps its own code", async () => {
    h.signAndLockRecord.mockRejectedValue(new ClinicalError("stale"));
    expect(await run()).toBe(`/clinical/${REC}?m=err:stale`);
  });

  it("CONTROL: an error that is not a ClinicalError is the bare err it was before", async () => {
    h.signAndLockRecord.mockRejectedValue(new Error("connection reset"));
    expect(await run()).toBe(`/clinical/${REC}?m=err`);
  });

  it("CONTROL: a sign that goes through lands on ?m=signed", async () => {
    h.signAndLockRecord.mockResolvedValue(undefined);
    expect(await run()).toBe(`/clinical/${REC}?m=signed`);
  });
});

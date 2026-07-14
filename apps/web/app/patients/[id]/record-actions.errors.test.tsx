import { vi, describe, it, expect, beforeEach } from "vitest";

// W6-01a: the delete/annul server actions must surface DISTINCT outcome codes,
// so the UI can show wrong-password vs signed-record-annul-only vs server-error
// instead of the opaque generic fallback. This asserts the action-level code
// (returned discriminant) and that the three distinguished pt-PT messages are
// distinct and none equals the generic fallback.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/admin/appointment-delete-password", () => ({ verifyDeletePassword: vi.fn() }));
vi.mock("@/lib/clinical/records", () => ({
  hardDeleteClinicalRecord: vi.fn(),
  annulRecord: vi.fn(),
}));

import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { verifyDeletePassword } from "@/lib/admin/appointment-delete-password";
import { hardDeleteClinicalRecord } from "@/lib/clinical/records";
import { ClinicalError } from "@/lib/clinical/errors";
import { hardDeleteRecordAction } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockVerify = vi.mocked(verifyDeletePassword);
const mockHardDelete = vi.mocked(hardDeleteClinicalRecord);

const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "thera-1" };
const s = getStrings(DEFAULT_LOCALE);

beforeEach(() => {
  mockCtx.mockReset();
  mockVerify.mockReset();
  mockHardDelete.mockReset();
  mockCtx.mockResolvedValue(therapist);
});

describe("hardDeleteRecordAction: distinct outcome codes (W6-01a)", () => {
  it("wrong password → { error: 'password' } (never a generic mask)", async () => {
    mockVerify.mockResolvedValue(false);
    const r = await hardDeleteRecordAction("rec-1", "pat-1", "nope");
    expect(r).toEqual({ ok: false, error: "password" });
    expect(mockHardDelete).not.toHaveBeenCalled();
  });

  it("signed record down the delete path → { error: 'not_draft' } (annul-only)", async () => {
    mockVerify.mockResolvedValue(true);
    mockHardDelete.mockRejectedValue(new ClinicalError("not_draft"));
    const r = await hardDeleteRecordAction("rec-1", "pat-1", "1234");
    expect(r).toEqual({ ok: false, error: "not_draft" });
  });

  it("unexpected DB failure (non-ClinicalError) → { error: 'error' } (distinct server-error, not swallowed)", async () => {
    mockVerify.mockResolvedValue(true);
    mockHardDelete.mockRejectedValue(new Error("23503 foreign_key_violation"));
    const r = await hardDeleteRecordAction("rec-1", "pat-1", "1234");
    expect(r).toEqual({ ok: false, error: "error" });
  });

  it("happy path (draft, correct password) → { ok: true }", async () => {
    mockVerify.mockResolvedValue(true);
    mockHardDelete.mockResolvedValue(undefined);
    const r = await hardDeleteRecordAction("rec-1", "pat-1", "1234");
    expect(r).toEqual({ ok: true });
  });
});

describe("distinguished pt-PT messages are distinct and non-generic (W6-01a)", () => {
  it("wrong-password, annul-only, and server-error messages differ and none is the generic fallback", () => {
    const generic = s["errors.generic"];
    const wrongPassword = s["clinical.recordActionWrongPassword"];
    const annulOnly = s["clinical.recordDeleteNotDraft"];
    const serverError = s["clinical.recordActionServerError"];

    for (const m of [wrongPassword, annulOnly, serverError]) {
      expect(m).toBeTruthy();
      expect(m).not.toBe(generic);
    }
    expect(new Set([wrongPassword, annulOnly, serverError]).size).toBe(3);
    // the signed-record message steers the user to Anular (anular / anuladas)
    expect(annulOnly.toLowerCase()).toContain("anula");
  });
});

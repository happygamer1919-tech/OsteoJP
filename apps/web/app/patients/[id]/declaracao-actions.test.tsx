import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
}));
vi.mock("@/lib/clinical/declaracao/generate", () => ({
  generateDeclaracaoPdf: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
// PL-20: the action now writes a captured NIF back to the patient when the
// record had none. Both sides of that decision are stubbed so the test asserts
// the DECISION, not the database.
vi.mock("@/lib/patients/queries", () => ({ getPatient: vi.fn() }));
vi.mock("@/lib/patients/actions", () => ({ updatePatient: vi.fn() }));
// SEC-web-surface-limiter-adoption route 6: the action now takes a per-user
// ceiling before it renders. STUBBED OPEN HERE, deliberately - this suite is
// about download-vs-preview and the NIF write-back, and the real helper is
// backed by the DURABLE store, which FAILS CLOSED with no DATABASE_URL. Left
// unstubbed it refuses every call and every assertion below fails for a reason
// that has nothing to do with what they test. The ceiling has its own suite
// (lib/clinical/document-rate-limit.test.ts), including the source guards that
// prove this action is wired to it.
vi.mock("@/lib/clinical/document-rate-limit", () => ({
  documentGenerationAllowed: vi.fn(async () => true),
}));

import { requireRequestContext } from "@/lib/auth/context";
import { generateDeclaracaoPdf } from "@/lib/clinical/declaracao/generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPatient } from "@/lib/patients/queries";
import { updatePatient } from "@/lib/patients/actions";
import { generateDeclaracaoUrlAction } from "./declaracao-actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockPdf = vi.mocked(generateDeclaracaoPdf);
const mockAdmin = vi.mocked(createSupabaseAdminClient);

const ctx: RequestContext = { tenantId: "t1", role: "reception", userId: "u1" };
const req = { patientId: "p1", date: "2026-07-17", startTime: "09:30", endTime: "10:30" };

// Capture the exact args createSignedUrl is called with, so the assertion is on
// the real decision site, not a proxy.
let signedUrlArgs: unknown[] = [];

function stubStorage() {
  const createSignedUrl = vi.fn((...args: unknown[]) => {
    signedUrlArgs = args;
    return Promise.resolve({ data: { signedUrl: "https://storage.example/signed?token=abc" }, error: null });
  });
  const upload = vi.fn(() => Promise.resolve({ data: { path: "x" }, error: null }));
  mockAdmin.mockReturnValue({
    storage: { from: () => ({ upload, createSignedUrl }) },
  } as unknown as ReturnType<typeof createSupabaseAdminClient>);
  return { createSignedUrl, upload };
}

beforeEach(() => {
  vi.clearAllMocks();
  signedUrlArgs = [];
  mockCtx.mockResolvedValue(ctx);
  mockPdf.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), filename: "declaracao-presenca-p1.pdf" });
});

describe("generateDeclaracaoUrlAction - W9-03 download-vs-preview (CB QA item 2)", () => {
  it("signs the URL with NO download option, so Storage serves it inline (preview, not download)", async () => {
    stubStorage();

    const result = await generateDeclaracaoUrlAction(req);

    expect(result.url).toBe("https://storage.example/signed?token=abc");
    // The fix: createSignedUrl(path, ttl) - exactly two args, no options object.
    // A third `{ download }` arg would force Content-Disposition: attachment and
    // re-introduce the forced download on BOTH the marcação and manual paths.
    expect(signedUrlArgs).toHaveLength(2);
    expect(signedUrlArgs[1]).toBe(60);
    // Belt and braces: whatever the args, none of them carry a `download` key.
    for (const arg of signedUrlArgs) {
      if (arg && typeof arg === "object") {
        expect(arg).not.toHaveProperty("download");
      }
    }
  });

  it("the manual path (no locationId) signs the URL the same inline way", async () => {
    // The "Introdução manual" option sets locationId = null; both paths hit this
    // one action, so proving it here proves it for the manual path too.
    stubStorage();

    await generateDeclaracaoUrlAction({ ...req, locationId: null });

    expect(signedUrlArgs).toHaveLength(2);
    for (const arg of signedUrlArgs) {
      if (arg && typeof arg === "object") expect(arg).not.toHaveProperty("download");
    }
  });

  it("still returns null (no leak) when the upload fails", async () => {
    const createSignedUrl = vi.fn();
    mockAdmin.mockReturnValue({
      storage: {
        from: () => ({
          upload: vi.fn(() => Promise.resolve({ data: null, error: { message: "boom" } })),
          createSignedUrl,
        }),
      },
    } as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const result = await generateDeclaracaoUrlAction(req);

    expect(result).toEqual({ url: null });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

describe("PL-20 — a captured NIF is written back only when the record had none", () => {
  const mockGetPatient = vi.mocked(getPatient);
  const mockUpdate = vi.mocked(updatePatient);

  beforeEach(() => {
    stubStorage();
    mockCtx.mockResolvedValue(ctx);
    mockPdf.mockResolvedValue({ bytes: new Uint8Array([1]), filename: "d.pdf" } as never);
    mockGetPatient.mockReset();
    mockUpdate.mockReset();
  });

  it("saves the NIF when the patient record is empty", async () => {
    mockGetPatient.mockResolvedValue({ id: "p1", nif: null } as never);
    await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });
    expect(mockUpdate).toHaveBeenCalledWith("p1", { nif: "123456789" });
  });

  it("does NOT overwrite a NIF the record already holds", async () => {
    // A one-off value typed onto a single declaration (a patient billing through
    // a company, a correction) must never rewrite the patient's fiscal number.
    mockGetPatient.mockResolvedValue({ id: "p1", nif: "111111111" } as never);
    await generateDeclaracaoUrlAction({ ...req, nif: "222222222" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // INC-nif-validationerror-at-the-desk: `updatePatient` now RETURNS a refusal
  // instead of throwing one. The write-back is a CONVENIENCE and the document is
  // what the user asked for, so a refused write must still not cost them the
  // declaration - the same outcome as before, now reached without an exception.
  it("still hands back the declaration when the write-back is REFUSED", async () => {
    mockGetPatient.mockResolvedValue({ id: "p1", nif: null } as never);
    mockUpdate.mockResolvedValue({
      ok: false,
      error: { field: "nif", message: "NIF inválido: o dígito de controlo não confere." },
    } as never);

    const result = await generateDeclaracaoUrlAction({ ...req, nif: "123456780" });

    expect(result.url).toBe("https://storage.example/signed?token=abc");
    expect(mockUpdate).toHaveBeenCalledWith("p1", { nif: "123456780" });
  });

  it("does not even read the patient when no NIF was supplied", async () => {
    await generateDeclaracaoUrlAction({ ...req });
    expect(mockGetPatient).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("still returns the document when the write-back fails", async () => {
    // The declaration is what the user asked for; a failed convenience write
    // must not cost them it.
    mockGetPatient.mockResolvedValue({ id: "p1", nif: null } as never);
    mockUpdate.mockRejectedValue(new Error("boom"));
    const result = await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });
    expect(result.url).toContain("https://storage.example/signed");
  });
});

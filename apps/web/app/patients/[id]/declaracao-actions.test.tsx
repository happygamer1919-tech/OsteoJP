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

import { requireRequestContext } from "@/lib/auth/context";
import { generateDeclaracaoPdf } from "@/lib/clinical/declaracao/generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

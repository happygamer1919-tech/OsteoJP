import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));

import { getRequestContext } from "@/lib/auth/context";
import { issueInvoiceAction } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockGetRequestContext = vi.mocked(getRequestContext);

const ENV_KEYS = ["INVOICEXPRESS_API_KEY", "INVOICEXPRESS_ACCOUNT_NAME"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  mockGetRequestContext.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const adminCtx: RequestContext = { tenantId: "t1", role: "admin", userId: "u1" };
const therapistCtx: RequestContext = { tenantId: "t1", role: "therapist", userId: "u2" };

describe("issueInvoiceAction — credential gating (ISSUANCE_VAT_RATE = 0)", () => {
  it("blocks immediately when neither credential is set", async () => {
    const result = await issueInvoiceAction("inv-1");

    expect(result).toEqual({ ok: false, error: "not_configured" });
    expect(mockGetRequestContext).not.toHaveBeenCalled();
  });

  it("blocks when only API key is set", async () => {
    process.env.INVOICEXPRESS_API_KEY = "test-key";

    const result = await issueInvoiceAction("inv-1");

    expect(result).toEqual({ ok: false, error: "not_configured" });
    expect(mockGetRequestContext).not.toHaveBeenCalled();
  });

  it("blocks when only account name is set", async () => {
    process.env.INVOICEXPRESS_ACCOUNT_NAME = "sandbox-account";

    const result = await issueInvoiceAction("inv-1");

    expect(result).toEqual({ ok: false, error: "not_configured" });
  });

  it("treats whitespace-only credentials as unset", async () => {
    process.env.INVOICEXPRESS_API_KEY = "   ";
    process.env.INVOICEXPRESS_ACCOUNT_NAME = "osteojp";

    const result = await issueInvoiceAction("inv-1");

    expect(result).toEqual({ ok: false, error: "not_configured" });
  });
});

describe("issueInvoiceAction — auth and permission gates (credentials configured)", () => {
  beforeEach(() => {
    process.env.INVOICEXPRESS_API_KEY = "sandbox-key";
    process.env.INVOICEXPRESS_ACCOUNT_NAME = "sandbox-account";
  });

  it("blocks unauthenticated requests", async () => {
    mockGetRequestContext.mockResolvedValue(null);

    const result = await issueInvoiceAction("inv-1");

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("blocks therapist (invoices:issue not in therapist capabilities)", async () => {
    mockGetRequestContext.mockResolvedValue(therapistCtx);

    const result = await issueInvoiceAction("inv-1");

    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("allows admin (has invoices:issue) to pass the permission gate", async () => {
    mockGetRequestContext.mockResolvedValue(adminCtx);

    const result = await issueInvoiceAction("inv-1");

    // Full IX call not yet wired — server_error is the placeholder.
    // Key: did NOT return not_configured, unauthenticated, or forbidden.
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe("server_error");
  });
});

describe("ISSUANCE_VAT_RATE constant", () => {
  it("is 0 (art. 9.º n.º 1 CIVA — JP-GATED)", async () => {
    const { ISSUANCE_VAT_RATE } = await import("./actions");
    expect(ISSUANCE_VAT_RATE).toBe(0);
  });
});

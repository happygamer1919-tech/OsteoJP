import { vi, describe, it, expect, beforeEach } from "vitest";

// W3-05 — per-tenant SERVER-ONLY secret home in tenants.settings.secrets.
// These pin: (1) writes are admin-gated, audited (key only), and preserve the
// rest of the blob; (2) reads round-trip; (3) the client-facing getTenantSettings
// NEVER exposes the secrets namespace (the safety property W3-06 relies on).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { getTenantSecret, setTenantSecret } from "./tenant-secret";
import { getTenantSettings } from "./settings";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "recep-1" };

beforeEach(() => {
  mockRunScoped.mockReset();
  vi.mocked(writeAudit).mockReset();
});

describe("setTenantSecret (W3-05)", () => {
  it("writes under settings.secrets[key], preserving other settings and secrets", async () => {
    const existing = { contacts: { email: "c@x.pt" }, secrets: { other: "keep" } };
    const captured: { set?: { settings?: Record<string, unknown> } } = {};
    const tx = {
      select: () => ({ from: async () => [{ settings: existing }] }),
      update: () => ({ set: async (v: { settings?: Record<string, unknown> }) => { captured.set = v; } }),
    };
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTenantSecret(admin, "appointmentDeletePasswordHash", "HASH123");

    const settings = captured.set!.settings as { contacts: unknown; secrets: Record<string, string> };
    expect(settings.contacts).toEqual({ email: "c@x.pt" }); // untouched
    expect(settings.secrets).toEqual({ other: "keep", appointmentDeletePasswordHash: "HASH123" });
    expect(writeAudit).toHaveBeenCalledTimes(1);
    // Audit records the KEY only, never the hash value.
    const auditArg = vi.mocked(writeAudit).mock.calls[0][2];
    expect(JSON.stringify(auditArg)).not.toContain("HASH123");
    expect(auditArg.metadata).toEqual({ key: "appointmentDeletePasswordHash" });
  });

  it("refuses a non-admin (settings:manage gate, server-enforced)", async () => {
    await expect(setTenantSecret(reception, "k", "v")).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("getTenantSecret (W3-05)", () => {
  function readTx(settings: unknown) {
    return { select: () => ({ from: async () => [{ settings }] }) };
  }

  it("reads a stored secret string back", async () => {
    mockRunScoped.mockImplementation((_a, cb) =>
      Promise.resolve(cb(readTx({ secrets: { k: "HASH" } }) as never)),
    );
    await expect(getTenantSecret(admin, "k")).resolves.toBe("HASH");
  });

  it("returns null when the key is unset", async () => {
    mockRunScoped.mockImplementation((_a, cb) =>
      Promise.resolve(cb(readTx({ secrets: {} }) as never)),
    );
    await expect(getTenantSecret(admin, "missing")).resolves.toBeNull();
  });
});

describe("client-facing getTenantSettings never exposes secrets (W3-05 safety)", () => {
  it("projects only name/nif/contacts/config — no secrets in the view", async () => {
    const settings = {
      contacts: { email: "c@x.pt", phone: "", address: "" },
      secrets: { appointmentDeletePasswordHash: "SUPER_SECRET_HASH" },
    };
    const tx = { select: () => ({ from: async () => [{ name: "Clinic", nif: "123", settings }] }) };
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const view = await getTenantSettings(admin);

    // The secret must not appear anywhere in the client-facing view.
    expect(JSON.stringify(view)).not.toContain("SUPER_SECRET_HASH");
    expect(JSON.stringify(view)).not.toContain("secrets");
    expect(view.name).toBe("Clinic");
  });
});

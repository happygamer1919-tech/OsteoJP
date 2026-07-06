import { vi, describe, it, expect, beforeEach } from "vitest";

// W3-06 — the delete password: default 1234 when unset, hashed once changed,
// verified server-side only, plaintext never persisted or returned.

vi.mock("server-only", () => ({}));
vi.mock("./tenant-secret", () => ({
  getTenantSecret: vi.fn(),
  setTenantSecret: vi.fn(),
}));

import { getTenantSecret, setTenantSecret } from "./tenant-secret";
import {
  DEFAULT_DELETE_PASSWORD,
  setDeletePassword,
  verifyDeletePassword,
} from "./appointment-delete-password";
import { hashSecret } from "./secret-hash";
import type { RequestContext } from "@/lib/auth/context";

const admin = { tenantId: "tenant-A", role: "admin", userId: "admin-1" } as RequestContext;
const mockGet = vi.mocked(getTenantSecret);
const mockSet = vi.mocked(setTenantSecret);

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
});

describe("verifyDeletePassword (W3-06)", () => {
  it("accepts the default 1234 when no hash is stored yet", async () => {
    mockGet.mockResolvedValue(null);
    expect(await verifyDeletePassword(admin, DEFAULT_DELETE_PASSWORD)).toBe(true);
    expect(await verifyDeletePassword(admin, "9999")).toBe(false);
  });

  it("verifies against the stored hash once a password is set", async () => {
    mockGet.mockResolvedValue(hashSecret("5678"));
    expect(await verifyDeletePassword(admin, "5678")).toBe(true);
    // The old default no longer works after a change.
    expect(await verifyDeletePassword(admin, "1234")).toBe(false);
  });
});

describe("setDeletePassword (W3-06)", () => {
  it("stores a HASH (never the plaintext) via the tenant-secret write", async () => {
    mockSet.mockResolvedValue(undefined);
    await setDeletePassword(admin, "5678");

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [, key, value] = mockSet.mock.calls[0];
    expect(key).toBe("appointmentDeletePasswordHash");
    expect(value).not.toBe("5678"); // stored value is a hash, not the plaintext
    expect(String(value).startsWith("scrypt$")).toBe(true);
  });

  it("rejects a too-short password", async () => {
    await expect(setDeletePassword(admin, "12")).rejects.toMatchObject({ code: "invalid" });
    expect(mockSet).not.toHaveBeenCalled();
  });
});

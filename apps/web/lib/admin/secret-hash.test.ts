import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));
import { hashSecret, verifySecret } from "./secret-hash";

// W3-06 — scrypt hashing for tenant secrets. Round-trips, rejects wrong inputs,
// and never stores the plaintext in the hash string.
describe("secret-hash (W3-06)", () => {
  it("verifies the correct plaintext against its own hash", () => {
    const h = hashSecret("1234");
    expect(verifySecret("1234", h)).toBe(true);
  });

  it("rejects a wrong plaintext", () => {
    const h = hashSecret("1234");
    expect(verifySecret("0000", h)).toBe(false);
  });

  it("produces a salted format (scrypt$salt$hash) that never contains the plaintext", () => {
    const h = hashSecret("hunter2");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h.split("$")).toHaveLength(3);
    expect(h).not.toContain("hunter2");
  });

  it("uses a random salt so two hashes of the same input differ", () => {
    expect(hashSecret("same")).not.toBe(hashSecret("same"));
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    expect(verifySecret("x", "not-a-valid-hash")).toBe(false);
    expect(verifySecret("x", "scrypt$$")).toBe(false);
  });
});

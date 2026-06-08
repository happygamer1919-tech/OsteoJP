import { describe, it, expect, vi } from "vitest";

// tenants.ts is "server-only" and imports @osteojp/db; neutralise server-only
// for the node runner. We exercise only the pure input validation here.
vi.mock("server-only", () => ({}));

import { normalizeTenantInput, isTenantInputError } from "./tenants";

describe("normalizeTenantInput", () => {
  it("trims name, lowercases slug, treats empty NIF as null", () => {
    expect(
      normalizeTenantInput({ name: "  Linda-a-Velha  ", slug: " Linda-A-Velha ", nif: "  " }),
    ).toEqual({ name: "Linda-a-Velha", slug: "linda-a-velha", nif: null });
  });

  it("keeps a valid 9-digit NIF", () => {
    expect(normalizeTenantInput({ name: "X Clinic", slug: "x-clinic", nif: "123456789" })).toEqual({
      name: "X Clinic",
      slug: "x-clinic",
      nif: "123456789",
    });
  });

  const code = (fn: () => unknown): string | false => {
    try {
      fn();
      return false;
    } catch (e) {
      return isTenantInputError(e) ? e.code : "non-domain-error";
    }
  };

  it("rejects an empty/too-short name", () => {
    expect(code(() => normalizeTenantInput({ name: " ", slug: "ok-slug" }))).toBe("invalid_name");
  });

  it("rejects a malformed slug", () => {
    expect(code(() => normalizeTenantInput({ name: "Clinic", slug: "Bad Slug!" }))).toBe("invalid_slug");
    expect(code(() => normalizeTenantInput({ name: "Clinic", slug: "-leading" }))).toBe("invalid_slug");
    expect(code(() => normalizeTenantInput({ name: "Clinic", slug: "double--hyphen" }))).toBe("invalid_slug");
  });

  it("rejects a non-9-digit NIF", () => {
    expect(code(() => normalizeTenantInput({ name: "Clinic", slug: "ok", nif: "12345" }))).toBe("invalid_nif");
    expect(code(() => normalizeTenantInput({ name: "Clinic", slug: "ok", nif: "12345678a" }))).toBe("invalid_nif");
  });
});

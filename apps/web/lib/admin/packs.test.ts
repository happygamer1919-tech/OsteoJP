import { describe, it, expect, vi } from "vitest";

// packs.ts pulls "server-only" via its provision/audit imports; neutralise it
// for the node runner. Only the pure validation is exercised here.
vi.mock("server-only", () => ({}));

import { normalizePackInput } from "./packs";
import { isAdminError } from "./errors";

/**
 * Pure validation for a pack definition (W8-01a). Locks the rules used by
 * createPack/updatePack before they touch the DB: name required, base service
 * required, session_count a positive integer, price a non-negative integer
 * (cents, never float), locationId null = all locations.
 */
describe("normalizePackInput", () => {
  const base = { name: "Pacote 10 NESA", baseServiceId: "svc-1", locationId: "loc-1", sessionCount: 10, priceCents: 39000 };

  it("trims the name and passes through valid input (money stays cents)", () => {
    expect(normalizePackInput({ ...base, name: "  Pacote 10 NESA  " })).toEqual(base);
  });

  it("null locationId means all locations", () => {
    expect(normalizePackInput({ ...base, locationId: null }).locationId).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(() => normalizePackInput({ ...base, name: "   " })).toThrow();
    try { normalizePackInput({ ...base, name: "" }); } catch (e) { expect(isAdminError(e) && e.code).toBe("invalid"); }
  });

  it("rejects a missing base service", () => {
    expect(() => normalizePackInput({ ...base, baseServiceId: "" })).toThrow();
  });

  it("rejects a non-positive or non-integer session count", () => {
    expect(() => normalizePackInput({ ...base, sessionCount: 0 })).toThrow();
    expect(() => normalizePackInput({ ...base, sessionCount: -5 })).toThrow();
    expect(() => normalizePackInput({ ...base, sessionCount: 2.5 })).toThrow();
  });

  it("rejects a negative or non-integer price (cents)", () => {
    expect(() => normalizePackInput({ ...base, priceCents: -1 })).toThrow();
    expect(() => normalizePackInput({ ...base, priceCents: 39000.5 })).toThrow();
  });

  it("accepts a zero price (a free pack is a valid, non-negative amount)", () => {
    expect(normalizePackInput({ ...base, priceCents: 0 }).priceCents).toBe(0);
  });
});

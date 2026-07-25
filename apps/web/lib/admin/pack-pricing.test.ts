import { describe, it, expect, vi } from "vitest";

// packs.ts (which re-exports effectivePriceCents for the packs surface) pulls
// "server-only" via its provision/audit imports; neutralise it for the node
// runner. Only the pure resolver is exercised here.
vi.mock("server-only", () => ({}));

import { effectivePriceCents } from "./packs";

/**
 * Read-path fallback for PACKS (W12-20): a per-location override wins when
 * present, otherwise the pack base price (service_packs.price_cents, NOT NULL).
 * Locks the SAME rule services use (resolvePackPriceCents mirrors
 * resolveServicePriceCents), consumed by the Admin > Serviços pack price grid.
 */
describe("pack effectivePriceCents (per-location override, then pack base)", () => {
  it("uses the per-location override when one exists", () => {
    expect(effectivePriceCents(32500, 30000)).toBe(30000);
  });

  it("falls back to the pack base price when there is no override", () => {
    // null override => the location inherits the pack's base price_cents.
    expect(effectivePriceCents(32500, null)).toBe(32500);
  });

  it("treats a 0 override as a real price (free pack at that location), not missing", () => {
    // `0 ?? base` must be 0 — a truthiness check would wrongly fall back.
    expect(effectivePriceCents(32500, 0)).toBe(0);
  });

  it("always resolves to a number for a pack (base is NOT NULL): override wins over base", () => {
    expect(effectivePriceCents(60000, 45000)).toBe(45000);
  });
});

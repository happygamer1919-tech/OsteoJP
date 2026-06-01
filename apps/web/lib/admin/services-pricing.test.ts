import { describe, it, expect } from "vitest";
import { effectivePriceCents } from "./pricing";

/**
 * Read-path fallback: a per-location override wins when present, otherwise the
 * service base price. Locks the rule used by resolveServicePriceCents and the
 * Admin > Services UI.
 */
describe("effectivePriceCents (per-location, then base)", () => {
  it("uses the per-location override when one exists", () => {
    expect(effectivePriceCents(5000, 4500)).toBe(4500);
  });

  it("falls back to the base price when there is no override", () => {
    expect(effectivePriceCents(5000, null)).toBe(5000);
  });

  it("treats a 0 override as a real price (free), not a missing one", () => {
    // `0 ?? base` must be 0 — a truthiness check would wrongly fall back.
    expect(effectivePriceCents(5000, 0)).toBe(0);
  });

  it("returns null when neither an override nor a base price is set", () => {
    expect(effectivePriceCents(null, null)).toBeNull();
  });

  it("uses the override even when the service has no base price", () => {
    expect(effectivePriceCents(null, 3000)).toBe(3000);
  });
});

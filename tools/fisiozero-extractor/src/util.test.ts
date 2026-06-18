import { describe, expect, it } from "vitest";
import { backoffDelay, randomBetween } from "./util";

describe("randomBetween", () => {
  it("returns min at rng=0 and max at rng≈1, inclusive", () => {
    expect(randomBetween(2000, 3000, () => 0)).toBe(2000);
    expect(randomBetween(2000, 3000, () => 0.9999999)).toBe(3000);
  });
  it("normalizes a swapped range", () => {
    expect(randomBetween(3000, 2000, () => 0)).toBe(2000);
  });
});

describe("backoffDelay", () => {
  it("grows the ceiling exponentially and applies full jitter", () => {
    // rng=1 → just under the ceiling (base * 2^attempt)
    expect(backoffDelay(0, 1000, 30_000, () => 0.999999)).toBeLessThanOrEqual(1000);
    expect(backoffDelay(2, 1000, 30_000, () => 0.999999)).toBeLessThanOrEqual(4000);
    expect(backoffDelay(2, 1000, 30_000, () => 0)).toBe(0);
  });
  it("respects the cap", () => {
    expect(backoffDelay(20, 1000, 5000, () => 0.999999)).toBeLessThanOrEqual(5000);
  });
});

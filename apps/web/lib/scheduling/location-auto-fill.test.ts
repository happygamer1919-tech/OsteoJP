import { describe, it, expect } from "vitest";
import { pickAutoFillLocation } from "./location-auto-fill";

// W4-12 — the owner ruling (Ivan 2026-07-06): auto-fill Localização from the
// therapist's location assignment ONLY when they have exactly one active
// location; zero or multiple = no auto-fill; never clobber a manual pick; only
// on a real therapist selection.

const ON = { userChangedTherapist: true, userChangedLocation: false };

describe("pickAutoFillLocation", () => {
  it("exactly one active location → auto-fills it", () => {
    expect(pickAutoFillLocation(["loc-A"], ON)).toBe("loc-A");
  });

  it("zero active locations → no auto-fill", () => {
    expect(pickAutoFillLocation([], ON)).toBeNull();
  });

  it("multiple active locations → no auto-fill (manual stays)", () => {
    expect(pickAutoFillLocation(["loc-A", "loc-B"], ON)).toBeNull();
    expect(pickAutoFillLocation(["loc-A", "loc-B", "loc-C"], ON)).toBeNull();
  });

  it("never fires when the therapist change was not user-driven (mount/edit)", () => {
    expect(
      pickAutoFillLocation(["loc-A"], { userChangedTherapist: false, userChangedLocation: false }),
    ).toBeNull();
  });

  it("never clobbers a manual location pick", () => {
    expect(
      pickAutoFillLocation(["loc-A"], { userChangedTherapist: true, userChangedLocation: true }),
    ).toBeNull();
  });
});

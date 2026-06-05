import { describe, expect, it } from "vitest";
import {
  CANCELLATION_CUTOFF_HOURS,
  canSelfModify,
  isWithinCancellationCutoff,
} from "./cutoff";

// The 24h cutoff is the server-enforced gate for self-cancel/reschedule. These
// lock the boundary so the route can rely on it regardless of client state.

const now = new Date("2026-06-10T12:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe("isWithinCancellationCutoff", () => {
  it("defaults to a 24h rule", () => {
    expect(CANCELLATION_CUTOFF_HOURS).toBe(24);
  });

  it("rejects (within cutoff) when the appointment is under 24h away", () => {
    expect(isWithinCancellationCutoff(hours(23.9), now)).toBe(true);
    expect(isWithinCancellationCutoff(hours(1), now)).toBe(true);
  });

  it("allows (outside cutoff) when the appointment is more than 24h away", () => {
    expect(isWithinCancellationCutoff(hours(24.1), now)).toBe(false);
    expect(isWithinCancellationCutoff(hours(72), now)).toBe(false);
  });

  it("treats exactly 24h out as still allowed (half-open boundary)", () => {
    expect(isWithinCancellationCutoff(hours(24), now)).toBe(false);
  });

  it("rejects an appointment that already started or passed", () => {
    expect(isWithinCancellationCutoff(hours(0), now)).toBe(true);
    expect(isWithinCancellationCutoff(hours(-5), now)).toBe(true);
  });

  it("canSelfModify is the inverse", () => {
    expect(canSelfModify(hours(48), now)).toBe(true);
    expect(canSelfModify(hours(2), now)).toBe(false);
  });
});

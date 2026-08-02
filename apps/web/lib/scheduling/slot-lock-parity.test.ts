import { describe, expect, it } from "vitest";
import * as web from "./slot-lock";
import * as api from "../../../api/lib/appointments/slot-lock";

// PARITY GUARD for the deliberate duplication in slot-lock.ts.
//
// apps/web and apps/api are separate Next builds and cannot import each other
// at runtime, so the lock-key logic exists twice. That is only acceptable if
// drift is impossible to land silently.
//
// This test imports BOTH modules directly - a test-time import across the
// monorepo, never bundled into either app - and asserts they agree on every
// output that decides WHICH lock is taken. If the two ever disagree, two
// writers for the same slot would take DIFFERENT keys, both acquire
// immediately, and the lock would appear to work while protecting nothing.
// That is the specific failure this file exists to make impossible.

const T = "11111111-1111-1111-1111-111111111111";
const P = "22222222-2222-2222-2222-222222222222";

const at = (iso: string) => new Date(iso);

/** Windows chosen to exercise boundaries, not just happy paths. */
const WINDOWS: [string, string][] = [
  ["2026-10-05T09:00:00Z", "2026-10-05T09:15:00Z"], // exactly one bucket
  ["2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z"], // several buckets
  ["2026-10-05T09:30:00Z", "2026-10-05T10:30:00Z"], // overlaps the previous
  ["2026-10-05T09:07:00Z", "2026-10-05T09:52:00Z"], // off-grid start and end
  ["2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z"], // back-to-back pair, first
  ["2026-10-05T11:00:00Z", "2026-10-05T12:00:00Z"], // back-to-back pair, second
  ["2026-10-05T23:50:00Z", "2026-10-06T00:20:00Z"], // crosses midnight UTC
  ["2026-10-05T09:00:00Z", "2026-10-05T09:00:00Z"], // zero length
  ["2026-10-05T10:00:00Z", "2026-10-05T09:00:00Z"], // inverted
  ["2026-03-29T00:30:00Z", "2026-03-29T02:30:00Z"], // EU DST spring-forward day
  ["2026-10-25T00:30:00Z", "2026-10-25T02:30:00Z"], // EU DST fall-back day
];

describe("slot-lock parity: apps/web mirror matches apps/api", () => {
  it("agrees on the bucket width", () => {
    expect(web.SLOT_BUCKET_SECONDS).toBe(api.SLOT_BUCKET_SECONDS);
  });

  it.each(WINDOWS)("agrees on buckets for %s -> %s", (start, end) => {
    expect(web.slotBuckets(at(start), at(end))).toEqual(
      api.slotBuckets(at(start), at(end)),
    );
  });

  it("agrees on the lock payload format", () => {
    for (const bucket of [0, 1, 100, 1_797_000, -5]) {
      expect(web.slotLockPayload(T, P, bucket)).toBe(
        api.slotLockPayload(T, P, bucket),
      );
    }
  });

  it("produces byte-identical payload SETS for every window", () => {
    // The real invariant: two writers for the same slot must derive the SAME
    // keys. Comparing the full payload set is what proves that end to end.
    for (const [start, end] of WINDOWS) {
      const w = web
        .slotBuckets(at(start), at(end))
        .map((b) => web.slotLockPayload(T, P, b));
      const a = api
        .slotBuckets(at(start), at(end))
        .map((b) => api.slotLockPayload(T, P, b));
      expect(w).toEqual(a);
    }
  });

  it("guards against a vacuous pass: the fixtures actually produce buckets", () => {
    // If slotBuckets ever returned [] on both sides, every assertion above
    // would pass while protecting nothing.
    for (const [start, end] of WINDOWS) {
      expect(web.slotBuckets(at(start), at(end)).length).toBeGreaterThan(0);
    }
  });
});

describe("acquireSlotLocksForMany (batch/recurrence ordering)", () => {
  it("deduplicates rows that land in the same bucket", () => {
    const one = web.acquireSlotLocksForMany(T, [
      { practitionerId: P, startsAt: at("2026-10-05T09:00:00Z"), endsAt: at("2026-10-05T09:15:00Z") },
      { practitionerId: P, startsAt: at("2026-10-05T09:00:00Z"), endsAt: at("2026-10-05T09:15:00Z") },
    ]);
    const two = web.acquireSlotLocksForMany(T, [
      { practitionerId: P, startsAt: at("2026-10-05T09:00:00Z"), endsAt: at("2026-10-05T09:15:00Z") },
    ]);
    // Same distinct bucket set => same generated SQL.
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it("orders locks deterministically regardless of row order", () => {
    const rows = [
      { practitionerId: P, startsAt: at("2026-10-05T11:00:00Z"), endsAt: at("2026-10-05T11:15:00Z") },
      { practitionerId: P, startsAt: at("2026-10-05T09:00:00Z"), endsAt: at("2026-10-05T09:15:00Z") },
    ];
    // Two transactions receiving the same slots in OPPOSITE order must acquire
    // in the same sequence, or they can deadlock against each other.
    expect(JSON.stringify(web.acquireSlotLocksForMany(T, rows))).toBe(
      JSON.stringify(web.acquireSlotLocksForMany(T, [...rows].reverse())),
    );
  });

  it("returns null for an empty row set rather than emitting empty SQL", () => {
    expect(web.acquireSlotLocksForMany(T, [])).toBeNull();
  });
});

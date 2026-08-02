import { describe, expect, it } from "vitest";
import {
  SLOT_BUCKET_SECONDS,
  slotBuckets,
  slotLockPayload,
} from "./slot-lock";

// Unit tests for the lock KEY derivation. The lock's runtime behaviour (two
// real sessions actually serializing) is proven separately by the DB-gated
// suite in packages/db; this file pins the arithmetic that decides WHICH keys
// are taken, because a wrong key means the lock is held and useless.

const at = (iso: string) => new Date(iso);

describe("slotBuckets", () => {
  it("puts a window inside one bucket when it fits", () => {
    expect(slotBuckets(at("2026-10-05T09:00:00Z"), at("2026-10-05T09:15:00Z"))).toHaveLength(1);
  });

  it("spans every bucket a long window touches", () => {
    // 09:00-10:00 at 15-minute buckets = 4 buckets.
    expect(slotBuckets(at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z"))).toHaveLength(4);
  });

  it("returns buckets in ASCENDING order (deadlock avoidance)", () => {
    const b = slotBuckets(at("2026-10-05T09:00:00Z"), at("2026-10-05T11:00:00Z"));
    expect(b).toEqual([...b].sort((x, y) => x - y));
    expect(new Set(b).size).toBe(b.length); // no duplicates
  });

  it("THE POINT: two overlapping-but-different windows share a bucket", () => {
    // If these did not intersect, the lock would not serialize the exact case
    // it exists for: 09:00-10:00 and 09:30-10:30 overlap but share no start.
    const a = slotBuckets(at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z"));
    const b = slotBuckets(at("2026-10-05T09:30:00Z"), at("2026-10-05T10:30:00Z"));
    expect(a.some((x) => b.includes(x))).toBe(true);
  });

  it("does NOT make back-to-back windows contend (half-open)", () => {
    // 10:00-11:00 and 11:00-12:00 do not overlap, so they must not share a
    // bucket, or ordinary consecutive bookings would serialize needlessly.
    const a = slotBuckets(at("2026-10-05T10:00:00Z"), at("2026-10-05T11:00:00Z"));
    const b = slotBuckets(at("2026-10-05T11:00:00Z"), at("2026-10-05T12:00:00Z"));
    expect(a.some((x) => b.includes(x))).toBe(false);
  });

  it("never returns an empty set, even for a zero-length or inverted window", () => {
    // An empty set would mean NO lock is taken and the write proceeds
    // unprotected. Failing closed here matters more than being clever.
    expect(slotBuckets(at("2026-10-05T09:00:00Z"), at("2026-10-05T09:00:00Z"))).toHaveLength(1);
    expect(slotBuckets(at("2026-10-05T10:00:00Z"), at("2026-10-05T09:00:00Z"))).toHaveLength(1);
  });

  it("uses 15-minute buckets", () => {
    expect(SLOT_BUCKET_SECONDS).toBe(900);
  });
});

describe("slotLockPayload", () => {
  const T = "11111111-1111-1111-1111-111111111111";
  const P1 = "22222222-2222-2222-2222-222222222222";
  const P2 = "33333333-3333-3333-3333-333333333333";

  it("scopes by therapist: two therapists never contend for the same slot", () => {
    expect(slotLockPayload(T, P1, 100)).not.toBe(slotLockPayload(T, P2, 100));
  });

  it("scopes by tenant: two clinics never contend", () => {
    const other = "44444444-4444-4444-4444-444444444444";
    expect(slotLockPayload(T, P1, 100)).not.toBe(slotLockPayload(other, P1, 100));
  });

  it("scopes by bucket: different times never contend", () => {
    expect(slotLockPayload(T, P1, 100)).not.toBe(slotLockPayload(T, P1, 101));
  });

  it("is stable for the same triple", () => {
    expect(slotLockPayload(T, P1, 100)).toBe(slotLockPayload(T, P1, 100));
  });

  it("is never table-global", () => {
    // A constant key would serialize the entire clinic's bookings.
    expect(slotLockPayload(T, P1, 100)).toContain(P1);
    expect(slotLockPayload(T, P1, 100)).toContain(T);
  });
});

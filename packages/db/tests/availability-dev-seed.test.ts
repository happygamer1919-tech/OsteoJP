import { describe, expect, it } from "vitest";
import { buildRows, SCHEDULES, TENANT_ID } from "../seed/availability-dev";
import { LOC_LAV, LOC_CB, LOC_MTN } from "../seed/dev-ids";

// Pure, DB-free checks on the availability_templates dev seed. These run in the
// normal `pnpm test` (no DATABASE_URL needed) and lock the seed's shape so a
// later edit can't silently drop a therapist's working windows or introduce a
// duplicate row. The live seed run against dev is a separate manual step.
//
// buildRows now takes a seq→userId resolver (FA-1: user_id resolves by email at
// seed time). The shape is independent of the actual user id, so the test feeds
// a deterministic stand-in id per therapist seq and asserts against it.

const TEST_ID = (seq: number): string =>
  `de000004-0000-0000-0000-${seq.toString(16).padStart(12, "0")}`;

const rows = buildRows(TEST_ID);

// Role therapist = seq 1..4 (seq 5 is admin but also practices — see dev-reference).
const THERAPISTS = [1, 2, 3, 4].map(TEST_ID);
const LOCATIONS = new Set([LOC_LAV, LOC_CB, LOC_MTN]);

const countFor = (userId: string) => rows.filter((r) => r.userId === userId).length;
const countForSeq = (seq: number) => countFor(TEST_ID(seq));

describe("availability-dev seed", () => {
  it("produces the expected total row count", () => {
    expect(rows.length).toBe(34);
  });

  it("gives every seeded therapist at least one template row", () => {
    for (const t of THERAPISTS) expect(countFor(t)).toBeGreaterThan(0);
  });

  it("matches the intended per-practitioner counts", () => {
    expect(countForSeq(1)).toBe(10); // LAV Mon–Fri × 2 shifts
    expect(countForSeq(2)).toBe(8); //  LAV Mon/Wed/Fri × 2 + CB Tue/Thu × 1
    expect(countForSeq(3)).toBe(10); // CB Mon–Fri × 2 shifts
    expect(countForSeq(4)).toBe(3); //  MTN Mon/Wed/Fri × 1 shift
    expect(countForSeq(5)).toBe(3); //  admin: one shift per clinic
  });

  it("uses unique, well-formed ids (idempotent upsert keys)", () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^de000008-[0-9a-f]{4}-[0-9a-f]{4}-0000-000000000000$/);
  });

  it("keeps every row tenant-scoped and active", () => {
    for (const r of rows) {
      expect(r.tenantId).toBe(TENANT_ID);
      expect(r.isActive).toBe(true);
      expect(r.validFrom).toBeNull();
      expect(r.validUntil).toBeNull();
    }
  });

  it("only references seeded locations", () => {
    for (const r of rows) expect(LOCATIONS.has(r.locationId)).toBe(true);
  });

  it("uses valid weekdays (Mon–Fri, inside the 0..6 CHECK)", () => {
    for (const r of rows) {
      expect(r.weekday).toBeGreaterThanOrEqual(0);
      expect(r.weekday).toBeLessThanOrEqual(6);
      // The seed intentionally schedules weekdays only (1=Mon..5=Fri).
      expect(r.weekday).toBeGreaterThanOrEqual(1);
      expect(r.weekday).toBeLessThanOrEqual(5);
    }
  });

  it("keeps start strictly before end on every shift (respects start_before_end CHECK)", () => {
    for (const r of rows) expect(r.startTime < r.endTime).toBe(true);
  });

  it("never emits an exact-duplicate natural key (respects dedupe_uq)", () => {
    const keys = rows.map(
      (r) => `${r.tenantId}|${r.userId}|${r.locationId}|${r.weekday}|${r.startTime}|${r.endTime}|${r.validFrom}|${r.validUntil}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers all three clinics across the schedule set", () => {
    const locs = new Set(SCHEDULES.map((s) => s.locationId));
    expect(locs).toEqual(new Set([LOC_LAV, LOC_CB, LOC_MTN]));
  });
});

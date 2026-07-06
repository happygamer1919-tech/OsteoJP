import { describe, it, expect } from "vitest";
import {
  buildTargetRows,
  PRIMARY_LOCATION,
  TENANT_ID,
} from "../seed/working-hours-real";
import { LOC_CB, LOC_LAV, LOC_MTN } from "../seed/dev-ids";

// W3-09 — the real clinic schedule target rows are pure and shape-checked here
// (no DB): Mon–Fri 08:00–20:00 + Sat 09:00–13:00 per dev therapist, respecting
// the availability_templates CHECKS (weekday 0–6, start<end).
const userIdBySeq = (seq: number) => `user-${seq}`;

describe("buildTargetRows (W3-09 real clinic schedule)", () => {
  const rows = buildTargetRows(userIdBySeq);

  it("produces 6 rows per therapist × 5 therapists = 30", () => {
    expect(rows).toHaveLength(30);
  });

  it("gives each therapist Mon–Fri 08:00–20:00 and Sat 09:00–13:00", () => {
    for (const seq of [1, 2, 3, 4, 5]) {
      const mine = rows.filter((r) => r.userId === `user-${seq}`);
      const weekdays = mine.map((r) => r.weekday).sort((a, b) => a - b);
      expect(weekdays).toEqual([1, 2, 3, 4, 5, 6]); // Mon..Sat, never Sun (0)
      for (const r of mine.filter((r) => r.weekday <= 5)) {
        expect([r.startTime, r.endTime]).toEqual(["08:00", "20:00"]);
      }
      const sat = mine.find((r) => r.weekday === 6)!;
      expect([sat.startTime, sat.endTime]).toEqual(["09:00", "13:00"]);
      // All at the therapist's single primary location.
      expect(new Set(mine.map((r) => r.locationId)).size).toBe(1);
      expect(mine[0]!.locationId).toBe(PRIMARY_LOCATION[seq]);
    }
  });

  it("respects the CHECK invariants and tenant scoping", () => {
    for (const r of rows) {
      expect(r.weekday).toBeGreaterThanOrEqual(0);
      expect(r.weekday).toBeLessThanOrEqual(6);
      expect(r.startTime < r.endTime).toBe(true); // start_time < end_time
      expect(r.tenantId).toBe(TENANT_ID);
      expect(r.isActive).toBe(true);
    }
  });

  it("uses stable, unique ids (idempotent upsert key)", () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("de000009-"))).toBe(true);
  });

  it("maps primary locations to the three real clinics", () => {
    expect(new Set(Object.values(PRIMARY_LOCATION))).toEqual(new Set([LOC_LAV, LOC_CB, LOC_MTN]));
  });
});

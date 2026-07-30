import { describe, expect, it } from "vitest";
import { ADVISORY_CONFLICT_KINDS, blockingConflicts } from "./conflict-core";
import type { ConflictInfo } from "./types";

// PL-11 (owner ruling 2026-07-30): availability is advisory and must NEVER block a
// save; therapist/room double-bookings and time_off absences still block.
function mk(kind: ConflictInfo["kind"]): ConflictInfo {
  return {
    kind,
    id: `${kind}:x`,
    patientName: null,
    startsAt: "2026-05-04T09:00:00.000Z",
    endsAt: "2026-05-04T10:00:00.000Z",
    room: null,
  };
}

describe("blockingConflicts (PL-11 availability-advisory)", () => {
  it("drops availability (advisory), keeps therapist/room/time_off (blocking)", () => {
    const all = [mk("availability"), mk("therapist"), mk("room"), mk("time_off")];
    const blocking = blockingConflicts(all);
    expect(blocking.map((c) => c.kind).sort()).toEqual(["room", "therapist", "time_off"]);
    expect(blocking.some((c) => c.kind === "availability")).toBe(false);
  });

  it("an availability-only conflict set becomes empty -> the save is NOT blocked", () => {
    expect(blockingConflicts([mk("availability")])).toEqual([]);
  });

  it("a set with no availability is unchanged", () => {
    const all = [mk("therapist"), mk("room")];
    expect(blockingConflicts(all)).toHaveLength(2);
  });

  it("availability is the only advisory kind", () => {
    expect([...ADVISORY_CONFLICT_KINDS]).toEqual(["availability"]);
  });
});

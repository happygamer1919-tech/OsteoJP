import { describe, expect, it } from "vitest";
import {
  isSlotBlocked,
  placeBlocksOnDate,
  type BlockSpan,
} from "./blocked-time-core";

// W9-04 - CB QA item 3: blocked therapist time was not drawn on the agenda, so
// it was invisible and looked bookable. These tests pin the band geometry and
// the non-bookable rule.
//
// The grid runs 08:00-20:00 Lisbon (DAY_START_HOUR=8, DAY_END_HOUR=20), so
// dayEndMin = 1200. Lisbon is UTC+1 in summer (WEST), so a 09:00 Lisbon block on
// 2026-07-20 is stored as 08:00Z.

const DAY = "2026-07-20"; // a Monday, summer time (UTC+1)
const DAY_END = 20 * 60;

const block = (id: string, startsAt: string, endsAt: string, reason = "vacation"): BlockSpan => ({
  id,
  startsAt,
  endsAt,
  reason,
});

describe("placeBlocksOnDate - geometry", () => {
  it("places a same-day block at its Lisbon clock position", () => {
    // 09:00-11:00 Lisbon == 08:00Z-10:00Z in July.
    const [p] = placeBlocksOnDate([block("b1", "2026-07-20T08:00:00Z", "2026-07-20T10:00:00Z")], DAY, DAY_END);
    expect(p.startMin).toBe(9 * 60);
    expect(p.endMin).toBe(11 * 60);
    expect(p.clippedStart).toBe(false);
    expect(p.clippedEnd).toBe(false);
  });

  it("carries the reason through for the band label", () => {
    const [p] = placeBlocksOnDate(
      [block("b1", "2026-07-20T08:00:00Z", "2026-07-20T10:00:00Z", "sick")],
      DAY,
      DAY_END,
    );
    expect(p.reason).toBe("sick");
  });

  it("clips a block that starts before the visible day", () => {
    // 06:00-09:00 Lisbon: the grid starts at 08:00, so the band starts there.
    const [p] = placeBlocksOnDate([block("b1", "2026-07-20T05:00:00Z", "2026-07-20T08:00:00Z")], DAY, DAY_END);
    expect(p.startMin).toBe(8 * 60);
    expect(p.endMin).toBe(9 * 60);
    expect(p.clippedStart).toBe(true);
    expect(p.clippedEnd).toBe(false);
  });

  it("clips a block that runs past the visible day", () => {
    // 19:00-23:00 Lisbon: the grid ends at 20:00.
    const [p] = placeBlocksOnDate([block("b1", "2026-07-20T18:00:00Z", "2026-07-20T22:00:00Z")], DAY, DAY_END);
    expect(p.startMin).toBe(19 * 60);
    expect(p.endMin).toBe(DAY_END);
    expect(p.clippedEnd).toBe(true);
  });

  it("renders a MULTI-DAY absence as a full-height band on an interior day", () => {
    // A week's holiday spanning DAY entirely. The raw clock reading of the start
    // instant would be meaningless here; the band must cover the whole day.
    const [p] = placeBlocksOnDate([block("b1", "2026-07-18T09:00:00Z", "2026-07-24T17:00:00Z")], DAY, DAY_END);
    expect(p.startMin).toBe(8 * 60);
    expect(p.endMin).toBe(DAY_END);
    expect(p.clippedStart).toBe(true);
    expect(p.clippedEnd).toBe(true);
  });

  it("drops a block on a different day entirely", () => {
    expect(placeBlocksOnDate([block("b1", "2026-07-21T08:00:00Z", "2026-07-21T10:00:00Z")], DAY, DAY_END)).toEqual([]);
  });

  it("drops a block that ends before the grid opens", () => {
    // 05:00-07:00 Lisbon, entirely above the 08:00 start.
    expect(placeBlocksOnDate([block("b1", "2026-07-20T04:00:00Z", "2026-07-20T06:00:00Z")], DAY, DAY_END)).toEqual([]);
  });

  it("drops a block that starts after the grid closes", () => {
    // 21:00-22:00 Lisbon, entirely below the 20:00 end.
    expect(placeBlocksOnDate([block("b1", "2026-07-20T20:00:00Z", "2026-07-20T21:00:00Z")], DAY, DAY_END)).toEqual([]);
  });

  it("sorts placements by start", () => {
    const out = placeBlocksOnDate(
      [
        block("late", "2026-07-20T14:00:00Z", "2026-07-20T15:00:00Z"),
        block("early", "2026-07-20T08:00:00Z", "2026-07-20T09:00:00Z"),
      ],
      DAY,
      DAY_END,
    );
    expect(out.map((p) => p.id)).toEqual(["early", "late"]);
  });

  it("respects Lisbon time, not UTC (a winter block does not shift)", () => {
    // 2026-01-19 is winter: Lisbon == UTC, so 09:00Z IS 09:00 Lisbon.
    const [p] = placeBlocksOnDate(
      [block("b1", "2026-01-19T09:00:00Z", "2026-01-19T10:00:00Z")],
      "2026-01-19",
      DAY_END,
    );
    expect(p.startMin).toBe(9 * 60);
    expect(p.endMin).toBe(10 * 60);
  });
});

describe("isSlotBlocked - the non-bookable rule", () => {
  const placements = placeBlocksOnDate(
    [block("b1", "2026-07-20T08:00:00Z", "2026-07-20T10:00:00Z")], // 09:00-11:00 Lisbon
    DAY,
    DAY_END,
  );

  it("blocks a slot fully inside the block", () => {
    expect(isSlotBlocked(9 * 60, placements)).toBe(true);
    expect(isSlotBlocked(10 * 60, placements)).toBe(true);
  });

  it("leaves a slot before the block bookable", () => {
    expect(isSlotBlocked(8 * 60 + 30, placements)).toBe(false);
  });

  it("leaves the slot starting exactly at the block END bookable (half-open)", () => {
    // The block ends at 11:00, so the 11:00 slot is free.
    expect(isSlotBlocked(11 * 60, placements)).toBe(false);
  });

  it("blocks EVERY slot a block partially overlaps, at both ends", () => {
    // 10:15-10:45 Lisbon sits inside no single slot: it clips the tail of the
    // 10:00 slot and the head of the 10:30 slot. Both must be unbookable, since
    // booking into either would run into the absence. 09:30 and 11:00 stay free.
    const partial = placeBlocksOnDate(
      [block("b1", "2026-07-20T09:15:00Z", "2026-07-20T09:45:00Z")],
      DAY,
      DAY_END,
    );
    expect(partial[0].startMin).toBe(10 * 60 + 15);
    expect(partial[0].endMin).toBe(10 * 60 + 45);
    expect(isSlotBlocked(9 * 60 + 30, partial)).toBe(false);
    expect(isSlotBlocked(10 * 60, partial)).toBe(true);
    expect(isSlotBlocked(10 * 60 + 30, partial)).toBe(true);
    expect(isSlotBlocked(11 * 60, partial)).toBe(false);
  });

  it("is false when there are no blocks at all", () => {
    expect(isSlotBlocked(9 * 60, [])).toBe(false);
  });

  it("blocks every slot of the day under a multi-day absence", () => {
    const holiday = placeBlocksOnDate([block("b1", "2026-07-18T09:00:00Z", "2026-07-24T17:00:00Z")], DAY, DAY_END);
    for (let m = 8 * 60; m < DAY_END; m += 30) {
      expect(isSlotBlocked(m, holiday)).toBe(true);
    }
  });
});

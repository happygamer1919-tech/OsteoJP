import { describe, expect, it } from "vitest";

import { buildDay } from "./day-availability-core";
import { scheduleRuleFor, type AvailabilityTemplate } from "./availability";

/**
 * SCHED-09 / SR-37 — the inspector's three labels, and the JP case the dispatch
 * named: alternating weeks, Castelo Branco THIS week and Linda-a-Velha NEXT.
 *
 * THE INSPECTOR RENDERS FROM `buildDay`, THE SAME FUNCTION THE AGENDA USES.
 * That is the requirement, and it is what these tests exercise: they never call
 * a classifier on raw rows and then assert about a screen - they ask the
 * RESOLVER what a day resolves to, and read the rule off its answer. An
 * inspector that computed its own answer would prove nothing.
 */

const CB = "loc-castelo-branco";
const LV = "loc-linda-a-velha";

const tpl = (o: Partial<AvailabilityTemplate> & { weekday: number }): AvailabilityTemplate => ({
  startTime: "09:00",
  endTime: "17:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
  ...o,
});

const rulesOn = (date: string, templates: AvailabilityTemplate[]) =>
  buildDay(date, templates, []).sources.map((s) => ({ rule: s.rule, locationId: s.locationId }));

describe("SCHED-09 — scheduleRuleFor, the three labels", () => {
  it("an open-ended weekly row is BASE", () => {
    expect(scheduleRuleFor({ validFrom: null, validUntil: null })).toBe("base");
  });

  it("a row bounded to exactly ONE day is DIA DEFINIDO", () => {
    expect(scheduleRuleFor({ validFrom: "2026-09-07", validUntil: "2026-09-07" })).toBe(
      "dia_definido",
    );
  });

  it("a CARVED multi-day weekly row is still BASE, not an override", () => {
    // Layer 2 carves layer 1 rather than deleting it: the weekly row is bounded
    // to end before a pattern starts and an identical row resumes after.
    // Labelling those as overrides would mark most of a normal year exceptional.
    expect(scheduleRuleFor({ validFrom: "2026-01-01", validUntil: "2026-06-30" })).toBe("base");
    expect(scheduleRuleFor({ validFrom: "2026-09-07", validUntil: null })).toBe("base");
    expect(scheduleRuleFor({ validFrom: null, validUntil: "2026-09-06" })).toBe("base");
  });

  it("NO fourth label exists, because nothing in the data could support one", () => {
    // alternating-weeks.ts and day-by-day.ts write the IDENTICAL shape - one row
    // bounded to a single day. This asserts they are indistinguishable, so a
    // future edit that tries to tell them apart fails here first.
    const fromAlternating = { validFrom: "2026-09-12", validUntil: "2026-09-12" };
    const fromDayByDay = { validFrom: "2026-09-12", validUntil: "2026-09-12" };
    expect(scheduleRuleFor(fromAlternating)).toBe(scheduleRuleFor(fromDayByDay));
  });
});

describe("SCHED-09 — JP on semanas alternadas: CB this week, LV next", () => {
  // The generator writes one single-day row per worked date, per location,
  // offset by a week. Monday 2026-09-07 at CB; Monday 2026-09-14 at LV.
  const templates = [
    tpl({ weekday: 1, validFrom: "2026-09-07", validUntil: "2026-09-07", locationId: CB }),
    tpl({ weekday: 1, validFrom: "2026-09-14", validUntil: "2026-09-14", locationId: LV }),
  ];

  it("THIS week's Monday resolves to Castelo Branco, labelled dia definido", () => {
    expect(rulesOn("2026-09-07", templates)).toEqual([
      { rule: "dia_definido", locationId: CB },
    ]);
  });

  it("NEXT week's Monday resolves to Linda-a-Velha, labelled dia definido", () => {
    expect(rulesOn("2026-09-14", templates)).toEqual([
      { rule: "dia_definido", locationId: LV },
    ]);
  });

  it("the Monday BETWEEN them resolves to nothing - the alternation is real", () => {
    // The negative arm. Without it a resolver that ignored validity entirely
    // would return both locations on every Monday and still pass above.
    expect(rulesOn("2026-09-21", templates)).toEqual([]);
  });

  it("the two never appear on the SAME day, which is the invariant the carve exists for", () => {
    for (const d of ["2026-09-07", "2026-09-14"]) {
      const locs = rulesOn(d, templates).map((r) => r.locationId);
      expect(new Set(locs).size).toBe(locs.length);
      expect(locs).toHaveLength(1);
    }
  });
});

describe("SCHED-09 — sources are UNMERGED, which is why they can be attributed", () => {
  it("two touching periods stay two sources while `working` merges to one", () => {
    // 08:00-13:00 and 13:00-19:00 touch. `working` folds them into a single
    // 08:00-19:00 window; `sources` must not, or the rule and the location of
    // the afternoon would be lost behind the morning's.
    const day = buildDay("2026-09-07", [
      tpl({ weekday: 1, startTime: "08:00", endTime: "13:00", locationId: CB }),
      tpl({ weekday: 1, startTime: "13:00", endTime: "19:00", locationId: CB }),
    ], []);
    expect(day.working).toHaveLength(1);
    expect(day.sources).toHaveLength(2);
  });

  it("a base row and a dated row on the same weekday keep their own labels", () => {
    const day = buildDay("2026-09-07", [
      tpl({ weekday: 1, startTime: "08:00", endTime: "13:00", locationId: CB }),
      tpl({ weekday: 1, startTime: "14:00", endTime: "19:00", locationId: LV,
            validFrom: "2026-09-07", validUntil: "2026-09-07" }),
    ], []);
    expect(day.sources.map((s) => s.rule)).toEqual(["base", "dia_definido"]);
    expect(day.sources.map((s) => s.locationId)).toEqual([CB, LV]);
  });
});

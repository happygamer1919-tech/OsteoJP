import { describe, expect, it } from "vitest";
import {
  blockEditHref,
  expandWeeklyRules,
  foldForFilter,
  groupByWeekday,
  isWeeklyBlockId,
  matchesFilter,
  pontualLine,
  sortNewestFirst,
  WEEKLY_BLOCK_REASON,
  weeklyBlockId,
  weeklyLine,
  weeklyRuleInputError,
  type WeeklyRule,
} from "./weekly-blocks-core";

/**
 * BLOQUEIOS DE REPETICAO SEMANAL - the pure half.
 *
 * The expansion is what every staff reader trusts (the conflict check, the
 * agenda band, the availability read), so it is pinned at the instants that
 * matter: an ordinary winter and summer week, both clock-change Sundays, and
 * the edges of a half-open range.
 */

const rule = (over: Partial<WeeklyRule> = {}): WeeklyRule => ({
  id: "r1",
  userId: "t1",
  weekday: 1, // Monday
  startTime: "08:00:00",
  endTime: "11:00:00",
  ...over,
});

const span = (b: { startsAt: Date; endsAt: Date }) => [b.startsAt.toISOString(), b.endsAt.toISOString()];

describe("expandWeeklyRules: Lisbon wall clock, every matching date", () => {
  it("a Monday 08:00-11:00 rule on a WINTER Monday is 08:00Z-11:00Z (WET = UTC)", () => {
    const out = expandWeeklyRules([rule()], new Date("2026-11-02T00:00:00Z"), new Date("2026-11-03T00:00:00Z"));
    expect(out.map(span)).toEqual([["2026-11-02T08:00:00.000Z", "2026-11-02T11:00:00.000Z"]]);
  });

  it("the same rule on a SUMMER Monday is 07:00Z-10:00Z (WEST = UTC+1): the wall clock holds, the instant moves", () => {
    const out = expandWeeklyRules([rule()], new Date("2026-07-06T00:00:00+01:00"), new Date("2026-07-07T00:00:00+01:00"));
    expect(out.map(span)).toEqual([["2026-07-06T07:00:00.000Z", "2026-07-06T10:00:00.000Z"]]);
  });

  it("on the AUTUMN clock-change Sunday (2026-10-25, 02:00 WEST -> 01:00 WET) a Sunday rule is read in WET", () => {
    const out = expandWeeklyRules(
      [rule({ weekday: 0 })],
      new Date("2026-10-24T23:00:00Z"), // Lisbon midnight of the 25th (still WEST)
      new Date("2026-10-26T00:00:00Z"), // Lisbon midnight of the 26th (WET)
    );
    expect(out.map(span)).toEqual([["2026-10-25T08:00:00.000Z", "2026-10-25T11:00:00.000Z"]]);
  });

  it("on the SPRING clock-change Sunday (2026-03-29, 01:00 WET -> 02:00 WEST) a Sunday rule is read in WEST", () => {
    const out = expandWeeklyRules(
      [rule({ weekday: 0 })],
      new Date("2026-03-29T00:00:00Z"),
      new Date("2026-03-29T23:00:00Z"),
    );
    expect(out.map(span)).toEqual([["2026-03-29T07:00:00.000Z", "2026-03-29T10:00:00.000Z"]]);
  });

  it("a whole week yields one block per matching weekday, sorted, with ids naming rule and date", () => {
    const rules = [rule(), rule({ id: "r2", weekday: 3, startTime: "14:00", endTime: "18:00" })];
    const out = expandWeeklyRules(rules, new Date("2026-11-02T00:00:00Z"), new Date("2026-11-09T00:00:00Z"));
    expect(out.map((b) => b.id)).toEqual([weeklyBlockId("r1", "2026-11-02"), weeklyBlockId("r2", "2026-11-04")]);
    expect(out.every((b) => b.reason === WEEKLY_BLOCK_REASON)).toBe(true);
  });

  it("two weeks: the rule repeats with NO end, one block each Monday", () => {
    const out = expandWeeklyRules([rule()], new Date("2026-11-01T00:00:00Z"), new Date("2026-11-15T00:00:00Z"));
    expect(out.map((b) => b.id)).toEqual(["weekly:r1:2026-11-02", "weekly:r1:2026-11-09"]);
  });

  it("half-open range: a window ending exactly at the rule's start does not touch it, one minute later does", () => {
    const at = (iso: string) => new Date(iso);
    expect(expandWeeklyRules([rule()], at("2026-11-02T07:00:00Z"), at("2026-11-02T08:00:00Z"))).toEqual([]);
    expect(expandWeeklyRules([rule()], at("2026-11-02T11:00:00Z"), at("2026-11-02T12:00:00Z"))).toEqual([]);
    expect(expandWeeklyRules([rule()], at("2026-11-02T07:30:00Z"), at("2026-11-02T08:01:00Z"))).toHaveLength(1);
    expect(expandWeeklyRules([rule()], at("2026-11-02T10:59:00Z"), at("2026-11-02T12:00:00Z"))).toHaveLength(1);
  });

  it("a range ending exactly at a Lisbon midnight does not pull in the next date", () => {
    const tuesday = rule({ weekday: 2, startTime: "00:00", endTime: "01:00" });
    const out = expandWeeklyRules([tuesday], new Date("2026-11-02T20:00:00Z"), new Date("2026-11-03T00:00:00Z"));
    expect(out).toEqual([]);
  });

  it("a short appointment window inside a rule is caught (the conflict check's case)", () => {
    const out = expandWeeklyRules([rule()], new Date("2026-11-09T09:00:00Z"), new Date("2026-11-09T10:00:00Z"));
    expect(out.map(span)).toEqual([["2026-11-09T08:00:00.000Z", "2026-11-09T11:00:00.000Z"]]);
  });

  it("a rule on another weekday, an empty rule list and an inverted range all yield nothing", () => {
    const day = [new Date("2026-11-02T00:00:00Z"), new Date("2026-11-03T00:00:00Z")] as const;
    expect(expandWeeklyRules([rule({ weekday: 2 })], ...day)).toEqual([]);
    expect(expandWeeklyRules([], ...day)).toEqual([]);
    expect(expandWeeklyRules([rule()], day[1], day[0])).toEqual([]);
  });

  it("the caller's label becomes the band note; none is null", () => {
    const day = [new Date("2026-11-02T00:00:00Z"), new Date("2026-11-03T00:00:00Z")] as const;
    expect(expandWeeklyRules([rule()], ...day, "Bloqueio semanal")[0]!.note).toBe("Bloqueio semanal");
    expect(expandWeeklyRules([rule()], ...day)[0]!.note).toBeNull();
  });
});

describe("weekly ids and where a band click goes", () => {
  it("only an expanded weekly id reads as weekly", () => {
    expect(isWeeklyBlockId(weeklyBlockId("abc", "2026-11-02"))).toBe(true);
    expect(isWeeklyBlockId("3f1c0a7e-0000-4000-8000-000000000000")).toBe(false);
    expect(isWeeklyBlockId("availability:2026")).toBe(false);
  });

  it("a weekly band opens the Bloqueios page; a time_off band keeps SCHED-21's deep link", () => {
    expect(blockEditHref("t1", "weekly:r1:2026-11-02")).toBe("/horarios/bloqueios");
    expect(blockEditHref("t1", "b-9")).toBe("/horarios?t=t1&editBlock=b-9");
  });
});

describe("the two list formats, Fisiozero's shape", () => {
  it("weekly: '[Terapeuta]: HH:MM -- HH:MM', seconds dropped", () => {
    expect(weeklyLine({ therapistName: "Tiago Reis", startTime: "08:00:00", endTime: "11:00:00" })).toBe(
      "Tiago Reis: 08:00 -- 11:00",
    );
  });

  it("pontual: 'Nome: YYYY-MM-DD (HH:MM:SS) ate YYYY-MM-DD (HH:MM:SS) | Motivo', read in Lisbon", () => {
    const row = {
      id: "b1",
      userId: "t1",
      therapistName: "Tiago Reis",
      startsAt: new Date("2026-11-24T05:00:00Z"), // WET: 05:00 Lisbon
      endsAt: new Date("2026-11-26T23:54:00Z"),
      note: "Ferias",
    };
    expect(pontualLine(row, "até")).toBe("Tiago Reis: 2026-11-24 (05:00:00) até 2026-11-26 (23:54:00) | Ferias");
  });

  it("pontual in summer shows Lisbon time, not UTC; a note-less row has no '|'", () => {
    const row = {
      id: "b2",
      userId: "t1",
      therapistName: "Ana",
      startsAt: new Date("2026-07-01T08:00:00Z"), // 09:00 WEST
      endsAt: new Date("2026-07-01T09:30:00Z"),
      note: "  ",
    };
    expect(pontualLine(row, "até")).toBe("Ana: 2026-07-01 (09:00:00) até 2026-07-01 (10:30:00)");
  });

  it("a whole-day block stored midnight to midnight reads as stored", () => {
    const row = {
      id: "b3",
      userId: "t1",
      therapistName: "Ana",
      startsAt: new Date("2026-12-24T00:00:00Z"),
      endsAt: new Date("2026-12-27T00:00:00Z"),
      note: "Natal",
    };
    expect(pontualLine(row, "até")).toBe("Ana: 2026-12-24 (00:00:00) até 2026-12-27 (00:00:00) | Natal");
  });
});

describe("grouping and ordering", () => {
  const w = (weekday: number, startTime: string, therapistName: string, id = `${weekday}-${startTime}-${therapistName}`) => ({
    id,
    userId: "u",
    weekday,
    startTime,
    endTime: "23:00",
    therapistName,
  });

  it("weekly groups run Monday to Sunday, empty days left out, each sorted by start then name", () => {
    const groups = groupByWeekday([w(0, "09:00", "Zé"), w(1, "10:00", "Bea"), w(1, "08:00", "Rui"), w(1, "08:00", "Ana"), w(6, "08:00", "Ana")]);
    expect(groups.map((g) => g.weekday)).toEqual([1, 6, 0]);
    expect(groups[0]!.rows.map((r) => `${r.startTime} ${r.therapistName}`)).toEqual(["08:00 Ana", "08:00 Rui", "10:00 Bea"]);
  });

  it("pontual: newest first, by start, then end, then name", () => {
    const p = (start: string, end: string, therapistName: string) => ({
      startsAt: new Date(start),
      endsAt: new Date(end),
      therapistName,
    });
    const sorted = sortNewestFirst([
      p("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z", "A"),
      p("2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z", "B"),
      p("2026-12-01T09:00:00Z", "2026-12-03T10:00:00Z", "C"),
    ]);
    expect(sorted.map((r) => r.therapistName)).toEqual(["C", "B", "A"]);
  });
});

describe("the Filtrar box", () => {
  it("folds accents and case, and every term must match", () => {
    expect(foldForFilter("  Férias  DE Natal ")).toBe("ferias de natal");
    const line = "Tiago Reis: 2026-11-24 (05:00:00) até 2026-11-26 (23:54:00) | Férias";
    expect(matchesFilter(line, "ferias")).toBe(true);
    expect(matchesFilter(line, "TIAGO 2026-11")).toBe(true);
    expect(matchesFilter(line, "tiago doente")).toBe(false);
    expect(matchesFilter(line, "   ")).toBe(true);
  });
});

describe("input validation, before the server and the CHECKs", () => {
  const ok = { userId: "t1", weekday: 1, startTime: "08:00", endTime: "11:00" };
  it("weekly: accepts a good rule and names the first problem otherwise", () => {
    expect(weeklyRuleInputError(ok)).toBeNull();
    expect(weeklyRuleInputError({ ...ok, weekday: 0 })).toBeNull();
    expect(weeklyRuleInputError({ ...ok, userId: "" })).toBe("therapist");
    expect(weeklyRuleInputError({ ...ok, weekday: Number.NaN })).toBe("weekday");
    expect(weeklyRuleInputError({ ...ok, weekday: 7 })).toBe("weekday");
    expect(weeklyRuleInputError({ ...ok, startTime: "8:00" })).toBe("times");
    expect(weeklyRuleInputError({ ...ok, endTime: "24:00" })).toBe("times");
    expect(weeklyRuleInputError({ ...ok, endTime: "08:00" })).toBe("order");
    expect(weeklyRuleInputError({ ...ok, startTime: "11:00", endTime: "08:00" })).toBe("order");
  });
});

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyStart, closureFor, overlapsClosure, type ClinicHours } from "./clinic-hours";
import { lisbonDateTimeToUtc, lisbonMinutesFromMidnight, lisbonParts } from "./time";

/**
 * DST-1025. LISBON LEAVES SUMMER TIME ON SUNDAY 2026-10-25: at 01:00 UTC the
 * clock goes from 02:00 WEST back to 01:00 WET, so 01:00 to 01:59 happens twice.
 *
 * Every instant below is a REAL instant around the change (00:30Z to 02:30Z),
 * or on the Saturday before and the Monday after, and every assertion is the
 * Lisbon reading of that instant and the verdict the guard reaches on it. A
 * guard that read Lisbon with a fixed +01:00 offset, or by hand, passes the
 * Saturday and fails the Monday: the Monday rows are the discriminating ones.
 *
 * Two guards are covered, both closed-hours checks:
 *   1. the clinic's hours (AGENDA-2100 and the midday closure, ./clinic-hours.ts),
 *      fed by ./time.ts, which reads the zone Europe/Lisbon through Intl;
 *   2. the closed-hours check of the 0106 apply blocks
 *      (docs/migration-apply-0106.md), which reads `TZ=Europe/Lisbon date` and
 *      decides with an awk program. Both are taken from the document itself and
 *      run here with the real `date` and `awk`.
 */

/** One clinic, weekday hours of the weekday table: 08:00 to 21:00, a midday closure 13:00 to 14:00. */
const CLINIC: ClinicHours = {
  opensAt: "08:00:00",
  closesAt: "21:00:00",
  middayClosedFrom: "13:00:00",
  middayClosedTo: "14:00:00",
};

const at = (iso: string) => new Date(iso);

describe("DST-1025: the agenda reads Lisbon across the change", () => {
  // [instant, Lisbon date, Lisbon HH:MM, minutes from Lisbon midnight]
  const READINGS: ReadonlyArray<readonly [string, string, string, number]> = [
    ["2026-10-24T23:30:00.000Z", "2026-10-25", "00:30", 30],
    ["2026-10-25T00:30:00.000Z", "2026-10-25", "01:30", 90], // WEST, the first 01:30
    ["2026-10-25T00:59:00.000Z", "2026-10-25", "01:59", 119],
    ["2026-10-25T01:00:00.000Z", "2026-10-25", "01:00", 60], // WET: the clock went back
    ["2026-10-25T01:30:00.000Z", "2026-10-25", "01:30", 90], // WET, the second 01:30
    ["2026-10-25T02:30:00.000Z", "2026-10-25", "02:30", 150],
  ];

  it.each(READINGS)("%s reads %s %s in Lisbon", (iso, date, hhmm, minutes) => {
    const p = lisbonParts(at(iso));
    expect(p.date).toBe(date);
    expect(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`).toBe(hhmm);
    expect(lisbonMinutesFromMidnight(at(iso))).toBe(minutes);
  });

  it("a Lisbon wall time on either side of the change becomes the right instant", () => {
    expect(lisbonDateTimeToUtc("2026-10-25", "00:30").toISOString()).toBe("2026-10-24T23:30:00.000Z");
    expect(lisbonDateTimeToUtc("2026-10-25", "02:30").toISOString()).toBe("2026-10-25T02:30:00.000Z");
    expect(lisbonDateTimeToUtc("2026-10-24", "08:00").toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(lisbonDateTimeToUtc("2026-10-26", "08:00").toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });
});

describe("DST-1025: the clinic-hours guard (AGENDA-2100) across the change", () => {
  const verdict = (iso: string) => classifyStart(lisbonMinutesFromMidnight(at(iso)), CLINIC);

  it("the night of the change is before opening, at every instant from 00:30Z to 02:30Z", () => {
    for (const iso of [
      "2026-10-25T00:30:00.000Z",
      "2026-10-25T01:00:00.000Z",
      "2026-10-25T01:30:00.000Z",
      "2026-10-25T02:30:00.000Z",
    ]) {
      expect(verdict(iso), iso).toBe("before_open");
    }
  });

  // [instant, Lisbon reading, verdict]
  const DAYS: ReadonlyArray<readonly [string, string, string]> = [
    // Saturday, still summer time: Lisbon is UTC+1.
    ["2026-10-24T06:30:00.000Z", "07:30 WEST", "before_open"],
    ["2026-10-24T07:00:00.000Z", "08:00 WEST", "ok"],
    ["2026-10-24T19:00:00.000Z", "20:00 WEST", "ok"],
    ["2026-10-24T19:30:00.000Z", "20:30 WEST", "after_latest_start"],
    // Monday, winter time: Lisbon is UTC+0. A fixed +01:00 gets every one of these wrong.
    ["2026-10-26T07:30:00.000Z", "07:30 WET", "before_open"],
    ["2026-10-26T08:00:00.000Z", "08:00 WET", "ok"],
    ["2026-10-26T19:30:00.000Z", "19:30 WET", "ok"],
    ["2026-10-26T20:00:00.000Z", "20:00 WET", "ok"],
    ["2026-10-26T20:30:00.000Z", "20:30 WET", "after_latest_start"],
  ];

  it.each(DAYS)("%s (%s) is %s", (iso, reading, want) => {
    const p = lisbonParts(at(iso));
    expect(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`).toBe(reading.slice(0, 5));
    expect(verdict(iso)).toBe(want);
  });

  it("the midday closure sits at 13:00 Lisbon on both sides of the change", () => {
    expect(closureFor("2026-10-24", CLINIC)).toEqual({
      start: at("2026-10-24T12:00:00.000Z"),
      end: at("2026-10-24T13:00:00.000Z"),
    });
    expect(closureFor("2026-10-26", CLINIC)).toEqual({
      start: at("2026-10-26T13:00:00.000Z"),
      end: at("2026-10-26T14:00:00.000Z"),
    });
    // Monday 12:00 to 13:00 Lisbon (WET) ends as the closure starts: allowed.
    expect(overlapsClosure(at("2026-10-26T12:00:00.000Z"), at("2026-10-26T13:00:00.000Z"), "2026-10-26", CLINIC)).toBe(false);
    // Monday 13:30 to 14:30 Lisbon runs through the closure.
    expect(overlapsClosure(at("2026-10-26T13:30:00.000Z"), at("2026-10-26T14:30:00.000Z"), "2026-10-26", CLINIC)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The 0106 apply blocks' closed-hours check                           */
/* ------------------------------------------------------------------ */

const DOC = readFileSync(join(__dirname, "..", "..", "..", "..", "docs", "migration-apply-0106.md"), "utf8");
const DOC_LINES = DOC.split("\n");

/** The stage blocks' clock read, as written: `DTZ=$(TZ=<zone> date '<format>') || ...`. */
const CLOCK_READ = DOC_LINES.map((l) => /^DTZ=\$\(TZ=(\S+) date '([^']+)'\) \|\| \{/.exec(l)).find((m) => m !== null);
/** The stage blocks' decision: `if awk -v s="${DT}" '<program>'; then CLOCK=closed; else CLOCK=open; fi`. */
const STAGE_AWK = DOC_LINES.map((l) => /^if awk -v s="\$\{DT\}" '([^']+)'; then CLOCK=closed; else CLOCK=open; fi$/.exec(l)).find(
  (m) => m !== null,
)?.[1];
/** The dispatch blocks' decision, on `${DOW}${LT}`. */
const DISPATCH_AWK = DOC_LINES.map((l) =>
  /^if awk -v s="\$\{DOW\}\$\{LT\}" '([^']+)'; then CLOCK=closed; else CLOCK=open; fi$/.exec(l),
).find((m) => m !== null)?.[1];

/** GNU date reads an epoch with `-d @N`, BSD date (macOS, where GREEN runs) with `-r N`. */
const GNU_DATE = spawnSync("date", ["-u", "-d", "@0", "+%s"], { encoding: "utf8" }).stdout.trim() === "0";

/** The block's own clock read, at a real instant instead of now. */
function readClock(instant: string, zone: string, format: string): string {
  const s = String(Date.parse(instant) / 1000);
  const r = spawnSync("date", GNU_DATE ? ["-d", `@${s}`, format] : ["-r", s, format], {
    encoding: "utf8",
    env: { ...process.env, TZ: zone },
  });
  if (r.status !== 0) throw new Error(`date failed: ${r.stderr}`);
  return r.stdout.trim();
}

function decide(program: string, reading: string): "closed" | "open" {
  const r = spawnSync("awk", ["-v", `s=${reading}`, program], { encoding: "utf8" });
  if (r.status === 0) return "closed";
  if (r.status === 1) return "open";
  throw new Error(`awk exited ${r.status}: ${r.stderr}`);
}

describe("DST-1025: the 0106 apply blocks' closed-hours check across the change", () => {
  it("the document holds the clock read and both decisions this test runs", () => {
    expect(CLOCK_READ?.[1]).toBe("Europe/Lisbon");
    expect(CLOCK_READ?.[2]).toBe("+%u%H%M %Z");
    expect(STAGE_AWK).toBeTruthy();
    expect(DISPATCH_AWK).toBe(STAGE_AWK);
  });

  // [instant, the clock line the block prints, the decision]
  const CLOCKS: ReadonlyArray<readonly [string, string, "closed" | "open"]> = [
    ["2026-10-25T00:30:00.000Z", "70130 WEST", "closed"],
    ["2026-10-25T00:59:00.000Z", "70159 WEST", "closed"],
    ["2026-10-25T01:00:00.000Z", "70100 WET", "closed"],
    ["2026-10-25T01:30:00.000Z", "70130 WET", "closed"],
    ["2026-10-25T02:30:00.000Z", "70230 WET", "closed"],
    // Saturday, summer time: open 08:00 to 13:00.
    ["2026-10-24T06:30:00.000Z", "60730 WEST", "closed"],
    ["2026-10-24T07:30:00.000Z", "60830 WEST", "open"],
    ["2026-10-24T12:30:00.000Z", "61330 WEST", "closed"],
    // Monday, winter time: open 08:00 to 21:00. A fixed +01:00 reads both an hour late and flips them.
    ["2026-10-26T07:30:00.000Z", "10730 WET", "closed"],
    ["2026-10-26T20:30:00.000Z", "12030 WET", "open"],
  ];

  it.each(CLOCKS)("at %s the block reads %s and finds it %s", (iso, line, want) => {
    const [zone, format] = [CLOCK_READ![1], CLOCK_READ![2]];
    const read = readClock(iso, zone, format);
    expect(read).toBe(line);
    // DT=$(echo "${DTZ}" | cut -c1-5), as the block splits it.
    expect(decide(STAGE_AWK!, read.slice(0, 5))).toBe(want);
  });
});

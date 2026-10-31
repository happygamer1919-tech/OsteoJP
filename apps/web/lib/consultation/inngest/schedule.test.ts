/**
 * R27: WHEN THE CONSULTATION RETRY SCANNER WAKES, AND WHAT THAT DOES TO THE
 * 7-DAY AUDIO BOUND.
 *
 *   1. THE WAKES. RETRY_CRON is expanded the way the reminder sweep's schedule
 *      test expands SWEEP_CRON (lib/reminders/sweep.test.ts): the minute and hour
 *      fields are read off the expression and turned into Lisbon wall times, and
 *      each wall time becomes an instant through lib/scheduling/time.ts, which
 *      reads the zone Europe/Lisbon through Intl. 7 wakes a day, 08:00 to 20:00,
 *      on a winter day, a summer day, and both days the clocks change.
 *   2. THE GAPS between wakes over a whole year: 2 hours in the day, 12 hours
 *      overnight, 11 on the night the clocks go forward, 13 on the night they go
 *      back, and nothing longer.
 *   3. THE BOUND. retry-policy.test.ts proves the policy's waits (about 34 hours)
 *      fit inside the bucket's 7-day lifecycle, but a retry happens at the first
 *      WAKE after its wait, not at the end of the wait. Here the scanner's own
 *      decision (isDue) is replayed against every real wake of a year, for a
 *      first fire at every 20 minutes of that year, and the last attempt must
 *      still land inside the 7 days.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { RETRY_CRON, retryPendingConsultationFires } = await import("./functions");
const { SWEEP_CRON } = await import("../../reminders/sweep");
const { addDays, lisbonDateTimeToUtc, lisbonParts } = await import("../../scheduling/time");
const { AUDIO_LIFECYCLE_MS, RETRY_CEILING, isDue, worstCaseTotalDelayMs } = await import("../retry-policy");

const MIN = 60_000;
const HOUR = 60 * MIN;

/** One cron field: "N", "*", "*\/S", "A-B", "A-B/S", or a comma list of those. */
function expandField(field: string, lo: number, hi: number): number[] {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`cron field part not understood: ${part}`);
    const [from, to] = m[1] === "*" ? [lo, hi] : m[1].includes("-") ? m[1].split("-").map(Number) : [Number(m[1]), m[2] ? hi : Number(m[1])];
    const step = m[2] ? Number(m[2]) : 1;
    if (from < lo || to > hi || from > to || step < 1) throw new Error(`cron field out of range: ${part}`);
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

/** The Lisbon minutes-from-midnight a daily Lisbon cron fires at. */
function dailyTicks(cron: string): number[] {
  const m = cron.match(/^TZ=Europe\/Lisbon (\S+) (\S+) \* \* \*$/);
  if (!m) throw new Error(`not a daily Lisbon cron: ${cron}`);
  const minutes = expandField(m[1], 0, 59);
  const hours = expandField(m[2], 0, 23);
  return hours.flatMap((h) => minutes.map((mm) => h * 60 + mm));
}

const hhmm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

/** The instants the scanner wakes on one Lisbon date. */
function wakesOn(date: string): Date[] {
  return dailyTicks(RETRY_CRON).map((t) => lisbonDateTimeToUtc(date, hhmm(t)));
}

/** Every wake from `from` to `to` (Lisbon dates, inclusive), in order. */
function wakesBetween(from: string, to: string): Date[] {
  const out: Date[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(...wakesOn(d));
  return out;
}

describe("the wakes: every 2 hours from 08:00 to 20:00 Lisbon", () => {
  it("is the sweep's form, and the scanner is declared with it", () => {
    expect(RETRY_CRON).toBe("TZ=Europe/Lisbon 0 8-20/2 * * *");
    expect(dailyTicks(RETRY_CRON).map(hhmm)).toEqual(["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]);
    const opts = (retryPendingConsultationFires as unknown as { opts: { triggers: unknown } }).opts;
    expect(opts.triggers).toEqual([{ cron: RETRY_CRON }]);
  });

  it("the expansion agrees with the sweep's own schedule test: 60 passes, 07:00 to 21:45", () => {
    const ticks = dailyTicks(SWEEP_CRON);
    expect(ticks).toHaveLength(60);
    expect(hhmm(ticks[0]!)).toBe("07:00");
    expect(hhmm(ticks.at(-1)!)).toBe("21:45");
  });

  it("refuses a field it cannot read, rather than guessing", () => {
    expect(() => dailyTicks("*/5 * * * *")).toThrow(/not a daily Lisbon cron/);
    expect(() => expandField("8-20/x", 0, 23)).toThrow(/not understood/);
    expect(() => expandField("8-24", 0, 23)).toThrow(/out of range/);
  });

  // [Lisbon date, what the day is, the UTC instant of the 08:00 wake, of the 20:00 wake]
  const DAYS: ReadonlyArray<readonly [string, string, string, string]> = [
    ["2027-01-13", "a winter day (WET, UTC+0)", "2027-01-13T08:00:00.000Z", "2027-01-13T20:00:00.000Z"],
    ["2027-07-14", "a summer day (WEST, UTC+1)", "2027-07-14T07:00:00.000Z", "2027-07-14T19:00:00.000Z"],
    ["2027-03-28", "the day the clocks go forward (01:00 UTC)", "2027-03-28T07:00:00.000Z", "2027-03-28T19:00:00.000Z"],
    ["2026-10-25", "the day the clocks go back (01:00 UTC)", "2026-10-25T08:00:00.000Z", "2026-10-25T20:00:00.000Z"],
    ["2027-10-31", "the next day the clocks go back", "2027-10-31T08:00:00.000Z", "2027-10-31T20:00:00.000Z"],
  ];

  it.each(DAYS)("%s, %s: 7 wakes, 08, 10, 12, 14, 16, 18 and 20 Lisbon", (date, _what, first, last) => {
    const wakes = wakesOn(date);
    expect(wakes).toHaveLength(7);
    // Each instant READS BACK as the Lisbon wall time it was made from, on that date.
    expect(wakes.map((w) => lisbonParts(w))).toEqual(
      [8, 10, 12, 14, 16, 18, 20].map((hour) => ({ date, hour, minute: 0 })),
    );
    expect(wakes[0]!.toISOString()).toBe(first);
    expect(wakes.at(-1)!.toISOString()).toBe(last);
    // Two real hours apart, all day, on the change days too (the change is at 01:00 UTC).
    for (let i = 1; i < wakes.length; i++) expect(wakes[i]!.getTime() - wakes[i - 1]!.getTime()).toBe(2 * HOUR);
  });

  it("7 wakes on every day of a whole year, so about 210 a month", () => {
    const days: string[] = [];
    for (let d = "2026-11-01"; d <= "2027-10-31"; d = addDays(d, 1)) days.push(d);
    expect(days).toHaveLength(365);
    for (const d of days) expect(new Set(wakesOn(d).map((w) => w.getTime())).size).toBe(7);
    expect(wakesBetween("2026-11-01", "2026-11-30")).toHaveLength(210);
  });
});

describe("the gaps between wakes", () => {
  const YEAR = wakesBetween("2026-10-01", "2027-11-15");

  it("are 2 hours by day and 12 overnight, 11 or 13 on the nights the clocks change, never longer", () => {
    const gaps = new Map<number, number>();
    const thirteen: string[] = [];
    const eleven: string[] = [];
    for (let i = 1; i < YEAR.length; i++) {
      const h = (YEAR[i]!.getTime() - YEAR[i - 1]!.getTime()) / HOUR;
      gaps.set(h, (gaps.get(h) ?? 0) + 1);
      if (h === 13) thirteen.push(lisbonParts(YEAR[i]!).date);
      if (h === 11) eleven.push(lisbonParts(YEAR[i]!).date);
    }
    expect([...gaps.keys()].sort((a, b) => a - b)).toEqual([2, 11, 12, 13]);
    expect(thirteen).toEqual(["2026-10-25", "2027-10-31"]);
    expect(eleven).toEqual(["2027-03-28"]);
    expect(Math.max(...gaps.keys())).toBe(13);
  });
});

describe("the 7-day audio bound, with every retry rounded up to a wake", () => {
  const WAKES = wakesBetween("2026-10-01", "2027-11-30");
  // A run that starts late records a later attempt than the wake it ran on;
  // the next run deciding on time then sees a shorter elapsed wait. Both are
  // taken against the bound: decisions at the wake itself, attempts recorded
  // a full minute after it.
  const LATE_START_MS = MIN;

  /**
   * Replays the scanner from a row's first state to its last attempt, against
   * the real wakes. Returns the elapsed time from `t0` to the last attempt.
   */
  function lastAttemptAfter(t0: Date, attemptsBefore: 0 | 1, wakes: Date[] = WAKES): number {
    let attemptCount: number = attemptsBefore;
    let lastAttemptAt: Date | null = attemptsBefore === 0 ? null : t0;
    let i = wakes.findIndex((w) => w.getTime() > t0.getTime());
    if (i < 0) throw new Error(`no wake after ${t0.toISOString()}`);
    let last = t0.getTime();
    while (attemptCount < RETRY_CEILING) {
      const wake = wakes[i];
      if (!wake) throw new Error(`ran out of wakes after ${t0.toISOString()}`);
      if (isDue({ attemptCount, lastAttemptAt }, wake)) {
        attemptCount += 1;
        lastAttemptAt = new Date(wake.getTime() + LATE_START_MS);
        last = lastAttemptAt.getTime();
      }
      i += 1;
    }
    return last - t0.getTime();
  }

  /** A first fire every 20 minutes across a year that holds both clock changes. */
  function starts(): Date[] {
    const out: Date[] = [];
    const end = lisbonDateTimeToUtc("2027-11-07", "00:00").getTime();
    for (let t = lisbonDateTimeToUtc("2026-10-18", "00:00").getTime(); t < end; t += 20 * MIN) out.push(new Date(t));
    return out;
  }

  it("a first send that failed: the eighth attempt lands inside 7 days, at every start in a year", () => {
    let worst = 0;
    for (const t0 of starts()) worst = Math.max(worst, lastAttemptAfter(t0, 1));
    // The policy's own waits, plus at most one longest night per wait, plus the late starts.
    const bound = worstCaseTotalDelayMs() + (RETRY_CEILING - 1) * (13 * HOUR + LATE_START_MS);
    expect(worst).toBeLessThanOrEqual(bound);
    expect(bound).toBeLessThan(AUDIO_LIFECYCLE_MS);
    expect(worst).toBeLessThan(AUDIO_LIFECYCLE_MS);
    // With a day to spare, not by a minute.
    expect(worst).toBeLessThan(AUDIO_LIFECYCLE_MS - 24 * HOUR);
  });

  it("a row whose first send never ran: all eight attempts still land inside 7 days", () => {
    let worst = 0;
    for (const t0 of starts()) worst = Math.max(worst, lastAttemptAfter(t0, 0));
    const bound = worstCaseTotalDelayMs() + RETRY_CEILING * (13 * HOUR + LATE_START_MS);
    expect(worst).toBeLessThanOrEqual(bound);
    expect(worst).toBeLessThan(AUDIO_LIFECYCLE_MS - 24 * HOUR);
  });

  it("SEEDED: the same replay catches a schedule that would outlive the audio", () => {
    // A once-a-week wake: the replay must report the bound broken, or it proves nothing.
    const weekly: Date[] = [];
    for (let d = "2026-10-05"; d <= "2027-12-31"; d = addDays(d, 7)) weekly.push(lisbonDateTimeToUtc(d, "08:00"));
    const t0 = lisbonDateTimeToUtc("2026-11-02", "09:00");
    expect(lastAttemptAfter(t0, 1, weekly)).toBeGreaterThan(AUDIO_LIFECYCLE_MS);
  });
});

/**
 * sweep.test.ts: what the reminder sweep rests on, without a database.
 *
 *   1. THE RANGES, with `now` passed in: which starts a pass takes for each
 *      offset, the day's last pass, and the two days a year the clocks change.
 *   2. THE PASS: the ceiling over every tenant, a tenant that fails, the steps
 *      and the log lines.
 *   3. IT CAN SEND NOTHING: the files the sweep is made of import no sender,
 *      read with the compiler's own parser and held to a closed list.
 *
 * The selection itself (which rows, taken once, two tenants) is proven on
 * seeded rows, as the job, in sweep.db.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { lisbonDateTimeToUtc, lisbonParts } = await import("../scheduling/time");
const { REMINDER_OFFSETS } = await import("./offsets");
const { REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER } = await import("./reminder-population");
const {
  ReminderSweepError,
  SWEEP_CRON,
  SWEEP_HEARTBEAT_ACTION,
  SWEEP_HEARTBEAT_ENTITY,
  SWEEP_LAST_PASS_MINUTES,
  SWEEP_LAST_PASS_TAKES_MARKS_BEFORE,
  SWEEP_LOG_PREFIX,
  SWEEP_MARK_CEILING,
  SWEEP_REMINDABLE_STATUSES,
  SWEEP_SHADOW_ACTION,
  runReminderSweep,
  sweepLockPayload,
  sweepLookAheadLimit,
  sweepStartRange,
} = await import("./sweep");
type SweepStartRange = import("./sweep").SweepStartRange;
type SweepTenantOutcome = import("./sweep").SweepTenantOutcome;

const MIN = 60_000;
const HOUR = 60 * MIN;
const H24 = { minutesBefore: 24 * 60 };
const H48 = { minutesBefore: 48 * 60 };

/** A Lisbon wall-clock time as an instant. */
const lisbon = (date: string, hhmm: string) => lisbonDateTimeToUtc(date, hhmm);
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);

/** Does a visit starting at `start` have a due mark in this range? The rule the SQL states. */
function takes(range: SweepStartRange, start: Date): boolean {
  if (start.getTime() <= range.after.getTime()) return false;
  return range.limitIncluded ? start.getTime() <= range.limit.getTime() : start.getTime() < range.limit.getTime();
}

describe("the sweep's ranges, with now passed in", () => {
  it("an ordinary pass takes the marks at or before its clock, of visits still ahead", () => {
    const now = lisbon("2027-02-10", "10:15");
    expect(sweepLookAheadLimit(now)).toBeNull();

    const sms = sweepStartRange(now, H24);
    expect(sms).toEqual({ after: now, limit: plus(now, 24 * HOUR), limitIncluded: true });
    // The mark is due this very instant: taken. One minute later: not yet.
    expect(takes(sms, plus(now, 24 * HOUR))).toBe(true);
    expect(takes(sms, plus(now, 24 * HOUR + MIN))).toBe(false);
    // The visit must still be ahead: starting now is too late, a minute from now is not.
    expect(takes(sms, now)).toBe(false);
    expect(takes(sms, plus(now, MIN))).toBe(true);
    expect(takes(sms, plus(now, -MIN))).toBe(false);

    const email = sweepStartRange(now, H48);
    expect(email).toEqual({ after: now, limit: plus(now, 48 * HOUR), limitIncluded: true });
    expect(takes(email, plus(now, 48 * HOUR))).toBe(true);
    expect(takes(email, plus(now, 48 * HOUR + MIN))).toBe(false);
  });

  it("the range follows the offset it is given, minute for minute", () => {
    const now = lisbon("2027-02-10", "10:15");
    for (const offset of REMINDER_OFFSETS) {
      expect(sweepStartRange(now, offset).limit.getTime() - now.getTime()).toBe(offset.minutesBefore * MIN);
    }
    expect(sweepStartRange(now, { minutesBefore: 90 }).limit).toEqual(plus(now, 90 * MIN));
  });

  it("the cron is every 15 minutes from 07:00 to 21:45 Lisbon, 60 passes a day, and only the last one looks ahead", () => {
    expect(SWEEP_CRON).toBe("TZ=Europe/Lisbon */15 7-21 * * *");
    const [, everyMinutes, firstHour, lastHour] = SWEEP_CRON.match(/^TZ=Europe\/Lisbon \*\/(\d+) (\d+)-(\d+) \* \* \*$/)!;
    const ticks: number[] = [];
    for (let h = Number(firstHour); h <= Number(lastHour); h++) {
      for (let m = 0; m < 60; m += Number(everyMinutes)) ticks.push(h * 60 + m);
    }
    expect(ticks).toHaveLength(60);
    expect(ticks[0]).toBe(7 * 60);
    // The constant the look-ahead keys on IS the cron's last tick.
    expect(ticks.at(-1)).toBe(SWEEP_LAST_PASS_MINUTES);
    expect(SWEEP_LAST_PASS_MINUTES).toBe(21 * 60 + 45);
    expect(SWEEP_LAST_PASS_TAKES_MARKS_BEFORE).toBe("23:00");

    const hhmm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    const lookingAhead = ticks.filter((t) => sweepLookAheadLimit(lisbon("2027-02-10", hhmm(t))) !== null);
    expect(lookingAhead).toEqual([SWEEP_LAST_PASS_MINUTES]);
  });

  it("the last pass takes the marks due BEFORE 23:00: 75 minutes ahead, and 23:00 itself waits for the morning", () => {
    const day = "2027-02-10";
    const eleven = lisbon(day, "23:00");
    // The edges of "the last pass", to the second.
    expect(sweepLookAheadLimit(plus(lisbon(day, "21:45"), -1000))).toBeNull();
    expect(sweepLookAheadLimit(lisbon(day, "21:45"))).toEqual(eleven);
    // A pass the scheduler started late is still the last pass.
    expect(sweepLookAheadLimit(plus(lisbon(day, "21:45"), 20_000))).toEqual(eleven);
    expect(sweepLookAheadLimit(plus(eleven, -1000))).toEqual(eleven);
    // At 23:00 there is nothing ahead of the clock left to take.
    expect(sweepLookAheadLimit(eleven)).toBeNull();
    expect(sweepLookAheadLimit(lisbon(day, "23:30"))).toBeNull();

    const now = lisbon(day, "21:45");
    expect(eleven.getTime() - now.getTime()).toBe(75 * MIN);
    const sms = sweepStartRange(now, H24);
    expect(sms).toEqual({ after: now, limit: plus(eleven, 24 * HOUR), limitIncluded: false });
    // Tomorrow 22:59: its mark is 22:59 tonight, taken now. Tomorrow 23:00: not.
    expect(takes(sms, lisbon("2027-02-11", "22:59"))).toBe(true);
    expect(takes(sms, lisbon("2027-02-11", "23:00"))).toBe(false);
    // And everything an ordinary pass would take is still taken.
    expect(takes(sms, plus(now, 24 * HOUR))).toBe(true);
    expect(takes(sms, plus(now, MIN))).toBe(true);
    expect(takes(sms, now)).toBe(false);

    const email = sweepStartRange(now, H48);
    expect(email).toEqual({ after: now, limit: plus(eleven, 48 * HOUR), limitIncluded: false });

    // The pass before it, 21:30, looks no further than its own clock.
    const before = lisbon(day, "21:30");
    expect(sweepStartRange(before, H24)).toEqual({ after: before, limit: plus(before, 24 * HOUR), limitIncluded: true });
  });

  it("summer and winter: 23:00 Lisbon is 22:00 UTC in July and 23:00 UTC in December", () => {
    expect(sweepLookAheadLimit(lisbon("2026-07-15", "21:45"))!.toISOString()).toBe("2026-07-15T22:00:00.000Z");
    expect(sweepLookAheadLimit(lisbon("2026-12-15", "21:45"))!.toISOString()).toBe("2026-12-15T23:00:00.000Z");
  });

  /**
   * THE CLOCKS GO BACK on Sunday 2026-10-25 at 01:00 UTC (02:00 becomes 01:00).
   * At that day's midnight Lisbon was still an hour ahead of UTC; by the
   * evening it is not. An offset read at midnight puts 23:00 an hour early.
   */
  describe("the day the clocks go back, Sunday 2026-10-25", () => {
    const SUNDAY = "2026-10-25";

    it("the last pass runs at 21:45 on the wall, which is 21:45 UTC, and looks ahead to 23:00 UTC", () => {
      const now = new Date("2026-10-25T21:45:00.000Z");
      expect(lisbonParts(now)).toEqual({ date: SUNDAY, hour: 21, minute: 45 });
      expect(lisbon(SUNDAY, "21:45")).toEqual(now);
      expect(sweepLookAheadLimit(now)!.toISOString()).toBe("2026-10-25T23:00:00.000Z");
      expect(sweepStartRange(now, H24)).toEqual({
        after: now,
        limit: new Date("2026-10-26T23:00:00.000Z"),
        limitIncluded: false,
      });
      expect(sweepStartRange(now, H48).limit.toISOString()).toBe("2026-10-27T23:00:00.000Z");
    });

    it("20:45 UTC is the last pass on the Saturday and an ordinary pass on the Sunday", () => {
      // Saturday: Lisbon is an hour ahead, so 20:45 UTC is 21:45 on the wall.
      const saturday = new Date("2026-10-24T20:45:00.000Z");
      expect(lisbonParts(saturday)).toEqual({ date: "2026-10-24", hour: 21, minute: 45 });
      expect(sweepLookAheadLimit(saturday)!.toISOString()).toBe("2026-10-24T22:00:00.000Z");
      // Sunday: the same UTC time is 20:45 on the wall.
      const sunday = new Date("2026-10-25T20:45:00.000Z");
      expect(lisbonParts(sunday)).toEqual({ date: SUNDAY, hour: 20, minute: 45 });
      expect(sweepLookAheadLimit(sunday)).toBeNull();
    });

    it("a mark is 24 elapsed hours before the start, not the same time on the wall the day before", () => {
      // Saturday's last pass, 21:45 on the wall, takes marks due before 23:00
      // on the wall, which is 22:00 UTC.
      const saturdayLast = lisbon("2026-10-24", "21:45");
      const sms = sweepStartRange(saturdayLast, H24);
      // Sunday 22:30 on the wall is 22:30 UTC. 24 hours before is Saturday
      // 22:30 UTC, which is 23:30 on Saturday's wall: NOT before 23:00.
      const sundayLate = lisbon(SUNDAY, "22:30");
      expect(sundayLate.toISOString()).toBe("2026-10-25T22:30:00.000Z");
      expect(takes(sms, sundayLate)).toBe(false);
      // Sunday 21:30 on the wall: its mark is Saturday 22:30 on the wall. Taken.
      expect(takes(sms, lisbon(SUNDAY, "21:30"))).toBe(true);
      // The edge, to the minute: Sunday 21:59 on the wall is the last start taken.
      expect(takes(sms, lisbon(SUNDAY, "21:59"))).toBe(true);
      expect(takes(sms, lisbon(SUNDAY, "22:00"))).toBe(false);
    });

    it("the first pass of the Sunday, 07:00 on the wall, takes 24 elapsed hours", () => {
      const now = lisbon(SUNDAY, "07:00");
      expect(now.toISOString()).toBe("2026-10-25T07:00:00.000Z");
      expect(sweepStartRange(now, H24).limit.toISOString()).toBe("2026-10-26T07:00:00.000Z");
      // Saturday's 07:00 pass, an hour earlier in UTC, reaches Sunday 06:00 on the wall.
      const saturday = lisbon("2026-10-24", "07:00");
      expect(saturday.toISOString()).toBe("2026-10-24T06:00:00.000Z");
      expect(sweepStartRange(saturday, H24).limit).toEqual(lisbon(SUNDAY, "06:00"));
    });
  });

  /**
   * THE CLOCKS GO FORWARD on Sunday 2027-03-28 at 01:00 UTC (01:00 becomes
   * 02:00). At that day's midnight Lisbon was on UTC; by the evening it is an
   * hour ahead. An offset read at midnight puts 23:00 an hour late.
   */
  describe("the day the clocks go forward, Sunday 2027-03-28", () => {
    const SUNDAY = "2027-03-28";

    it("the last pass runs at 21:45 on the wall, which is 20:45 UTC, and looks ahead to 22:00 UTC", () => {
      const now = new Date("2027-03-28T20:45:00.000Z");
      expect(lisbonParts(now)).toEqual({ date: SUNDAY, hour: 21, minute: 45 });
      expect(lisbon(SUNDAY, "21:45")).toEqual(now);
      expect(sweepLookAheadLimit(now)!.toISOString()).toBe("2027-03-28T22:00:00.000Z");
      expect(sweepStartRange(now, H24)).toEqual({
        after: now,
        limit: new Date("2027-03-29T22:00:00.000Z"),
        limitIncluded: false,
      });
      expect(sweepStartRange(now, H48).limit.toISOString()).toBe("2027-03-30T22:00:00.000Z");
    });

    it("21:45 UTC is the last pass on the Saturday and past every pass on the Sunday", () => {
      const saturday = new Date("2027-03-27T21:45:00.000Z");
      expect(lisbonParts(saturday)).toEqual({ date: "2027-03-27", hour: 21, minute: 45 });
      expect(sweepLookAheadLimit(saturday)!.toISOString()).toBe("2027-03-27T23:00:00.000Z");
      // Sunday: the same UTC time is 22:45 on the wall, still before 23:00.
      const sunday = new Date("2027-03-28T21:45:00.000Z");
      expect(lisbonParts(sunday)).toEqual({ date: SUNDAY, hour: 22, minute: 45 });
      expect(sweepLookAheadLimit(sunday)!.toISOString()).toBe("2027-03-28T22:00:00.000Z");
      // And Sunday 20:44 UTC is 21:44 on the wall: not the last pass yet.
      expect(sweepLookAheadLimit(new Date("2027-03-28T20:44:00.000Z"))).toBeNull();
    });

    it("a mark is 24 elapsed hours before the start, not the same time on the wall the day before", () => {
      // Saturday's last pass, 21:45 on the wall (21:45 UTC), takes marks due
      // before 23:00 UTC.
      const saturdayLast = lisbon("2027-03-27", "21:45");
      const sms = sweepStartRange(saturdayLast, H24);
      // Sunday 23:30 on the wall is 22:30 UTC. 24 hours before is Saturday
      // 22:30 on the wall: before 23:00, so it IS taken, though "23:30" reads late.
      const sundayLate = lisbon(SUNDAY, "23:30");
      expect(sundayLate.toISOString()).toBe("2027-03-28T22:30:00.000Z");
      expect(takes(sms, sundayLate)).toBe(true);
      // The edge, to the minute: Sunday 23:59 on the wall is the last start taken.
      expect(takes(sms, lisbon(SUNDAY, "23:59"))).toBe(true);
      expect(takes(sms, lisbon("2027-03-29", "00:00"))).toBe(false);
    });

    it("the first pass of the Sunday, 07:00 on the wall, takes 24 elapsed hours", () => {
      const now = lisbon(SUNDAY, "07:00");
      expect(now.toISOString()).toBe("2027-03-28T06:00:00.000Z");
      expect(sweepStartRange(now, H24).limit.toISOString()).toBe("2027-03-29T06:00:00.000Z");
      // Saturday's 07:00 pass, an hour later in UTC, reaches Sunday 08:00 on the wall.
      const saturday = lisbon("2027-03-27", "07:00");
      expect(saturday.toISOString()).toBe("2027-03-27T07:00:00.000Z");
      expect(sweepStartRange(saturday, H24).limit).toEqual(lisbon(SUNDAY, "08:00"));
    });
  });
});

describe("what the sweep is held to", () => {
  it("takes the visits the dispatcher would still remind: the same statuses, read from dispatch.ts", () => {
    // The dispatcher keeps its set private and the sweep must not import that
    // file, so the copy is held to the source text.
    const dispatch = readFileSync(join(__dirname, "dispatch.ts"), "utf8");
    const inDispatch = dispatch.match(/REMINDABLE_STATUSES = new Set\(\[([^\]]+)\]\)/)?.[1];
    expect(inDispatch, "REMINDABLE_STATUSES not found in dispatch.ts").toBeTruthy();
    const theirs = [...inDispatch!.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(theirs.length).toBeGreaterThan(0);
    expect([...SWEEP_REMINDABLE_STATUSES].sort()).toEqual(theirs);
  });

  /**
   * THE SWITCH IS OFF, AND THE CRON CANNOT TURN IT ON. Whether a visit that
   * never had a reminder is owed one is the owner's open question. The sweep
   * reads the one switch of reminder-population.ts; the option that overrides
   * it exists for the DB test and is passed by nothing that runs in production.
   */
  it("leaves out the visits that never had a reminder: one switch, off, and nothing in production overrides it", () => {
    expect(REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER).toBe(false);
    const sweep = readFileSync(join(__dirname, "sweep.ts"), "utf8");
    expect(sweep).toContain(
      "const includeNeverReminded = args.includeNeverReminded ?? REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER;",
    );
    expect(sweep).toContain("includeNeverReminded ? undefined : hasSchedulingEvent(tx)");
    // The pass hands each tenant its id, its clock, its limit and the pass id, and no switch.
    expect(sweep).toContain("sweepTenant({ tenantId, now: clock(), limit, passId: deps.passId })");
    const cron = readFileSync(join(__dirname, "inngest/sweep.ts"), "utf8");
    expect(cron).not.toContain("includeNeverReminded");
  });

  it("the ceiling is 50 marks a pass, and the names of its rows and its lock are fixed", () => {
    expect(SWEEP_MARK_CEILING).toBe(50);
    expect(SWEEP_SHADOW_ACTION).toBe("appointment.reminder_sweep_shadow");
    expect(SWEEP_HEARTBEAT_ACTION).toBe("reminder_sweep.pass");
    expect(SWEEP_HEARTBEAT_ENTITY).toBe("reminder_sweep");
    expect(sweepLockPayload("tenant-1")).toBe("reminder-sweep:tenant-1");
  });
});

/* ------------------------------------------------------------------ */
/* The pass                                                            */
/* ------------------------------------------------------------------ */

const T1 = "aaaaaaaa-0000-4000-8000-000000000001";
const T2 = "aaaaaaaa-0000-4000-8000-000000000002";
const T3 = "aaaaaaaa-0000-4000-8000-000000000003";

/** A tenant's pass that takes what it is allowed of what it has due, and records every call. */
function fakeSweep(dueByTenant: Record<string, number>) {
  const calls: { tenantId: string; now: Date; limit: number; passId?: string; includeNeverReminded?: boolean }[] = [];
  const sweepTenant = async (args: (typeof calls)[number]): Promise<SweepTenantOutcome> => {
    calls.push(args);
    const due = dueByTenant[args.tenantId] ?? 0;
    if (due < 0) throw Object.assign(new Error("a patient's name must never reach a log"), { name: "PostgresError" });
    const recorded = Math.min(due, args.limit);
    return { due, recorded, overCeiling: due > recorded };
  };
  return { calls, sweepTenant };
}

describe("one pass of the sweep", () => {
  const NOW = new Date("2027-02-10T10:15:00.000Z");

  it("sweeps every tenant in its own step, with the pass's id and clock, and logs counts only", async () => {
    const { calls, sweepTenant } = fakeSweep({ [T1]: 3, [T2]: 0 });
    const steps: string[] = [];
    const lines: string[] = [];
    const alarms: string[] = [];
    const out = await runReminderSweep({
      listTenantIds: async () => [T1, T2],
      step: async (id, fn) => {
        steps.push(id);
        return fn();
      },
      passId: "01JRUNID",
      now: () => NOW,
      sweepTenant,
      log: (l) => lines.push(l),
      alarm: (l) => alarms.push(l),
    });
    expect(out).toEqual({ mode: "shadow", tenants: 2, failedTenants: 0, due: 3, recorded: 3, overCeiling: false });
    expect(steps).toEqual(["list-tenants", `sweep-tenant-${T1}`, `sweep-tenant-${T2}`]);
    expect(calls).toEqual([
      { tenantId: T1, now: NOW, limit: 50, passId: "01JRUNID" },
      { tenantId: T2, now: NOW, limit: 47, passId: "01JRUNID" },
    ]);
    expect(lines).toEqual([`${SWEEP_LOG_PREFIX} mode=shadow tenants=2 failed=0 due=3 recorded=3`]);
    expect(alarms).toEqual([]);
  });

  it("never takes more than the ceiling over all tenants, and says so when more was due", async () => {
    const { calls, sweepTenant } = fakeSweep({ [T1]: 30, [T2]: 45, [T3]: 4 });
    const alarms: string[] = [];
    const out = await runReminderSweep({
      listTenantIds: async () => [T1, T2, T3],
      now: () => NOW,
      sweepTenant,
      log: () => {},
      alarm: (l) => alarms.push(l),
    });
    expect(calls.map((c) => c.limit)).toEqual([50, 20, 0]);
    expect(out).toEqual({ mode: "shadow", tenants: 3, failedTenants: 0, due: 79, recorded: 50, overCeiling: true });
    expect(out.recorded).toBeLessThanOrEqual(SWEEP_MARK_CEILING);
    expect(alarms).toEqual([`${SWEEP_LOG_PREFIX} OVER THE CEILING due=79 recorded=50 ceiling=50`]);
  });

  it("exactly the ceiling is not over it", async () => {
    const { sweepTenant } = fakeSweep({ [T1]: 50 });
    const alarms: string[] = [];
    const out = await runReminderSweep({
      listTenantIds: async () => [T1],
      now: () => NOW,
      sweepTenant,
      log: () => {},
      alarm: (l) => alarms.push(l),
    });
    expect(out).toMatchObject({ due: 50, recorded: 50, overCeiling: false });
    expect(alarms).toEqual([]);
  });

  it("a tenant that fails does not stop the others; the pass then fails, naming an id and the error's name only", async () => {
    const { calls, sweepTenant } = fakeSweep({ [T1]: 2, [T2]: -1, [T3]: 5 });
    const lines: string[] = [];
    const alarms: string[] = [];
    const failure = await runReminderSweep({
      listTenantIds: async () => [T1, T2, T3],
      now: () => NOW,
      sweepTenant,
      log: (l) => lines.push(l),
      alarm: (l) => alarms.push(l),
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ReminderSweepError);
    const error = failure as InstanceType<typeof ReminderSweepError>;
    expect(error.name).toBe("ReminderSweepError");
    expect(error.message).toBe("reminder sweep: 1 of 3 tenant(s) could not be swept");
    expect(error.outcome).toEqual({ mode: "shadow", tenants: 3, failedTenants: 1, due: 7, recorded: 7, overCeiling: false });
    // The tenant after the failure was still swept, with the whole budget left to it.
    expect(calls.map((c) => [c.tenantId, c.limit])).toEqual([
      [T1, 50],
      [T2, 48],
      [T3, 48],
    ]);
    expect(alarms).toEqual([`${SWEEP_LOG_PREFIX} tenant FAILED tenantId=${T2}: PostgresError`]);
    expect(lines).toEqual([`${SWEEP_LOG_PREFIX} mode=shadow tenants=3 failed=1 due=7 recorded=7`]);
    expect([...alarms, ...lines, error.message].join("\n")).not.toContain("patient");
  });

  it("a thrown value that is not an Error is logged as unknown", async () => {
    const alarms: string[] = [];
    await expect(
      runReminderSweep({
        listTenantIds: async () => [T1],
        sweepTenant: async () => {
          throw "a string";
        },
        log: () => {},
        alarm: (l) => alarms.push(l),
      }),
    ).rejects.toBeInstanceOf(ReminderSweepError);
    expect(alarms).toEqual([`${SWEEP_LOG_PREFIX} tenant FAILED tenantId=${T1}: unknown`]);
  });

  it("when the tenants cannot be listed nothing is swept and the error goes on", async () => {
    const { calls, sweepTenant } = fakeSweep({ [T1]: 1 });
    const boom = new Error("list failed");
    await expect(
      runReminderSweep({
        listTenantIds: async () => {
          throw boom;
        },
        sweepTenant,
        log: () => {},
        alarm: () => {},
      }),
    ).rejects.toBe(boom);
    expect(calls).toEqual([]);
  });

  it("a step the scheduler already has is not run again: no clock is read and no tenant is swept twice", async () => {
    // What a resumed run looks like: the scheduler hands back the stored
    // result of a finished step and never calls its body.
    const { calls, sweepTenant } = fakeSweep({ [T1]: 9, [T2]: 1 });
    const stored: Record<string, unknown> = {
      "list-tenants": [T1, T2],
      [`sweep-tenant-${T1}`]: { due: 49, recorded: 49, overCeiling: false },
    };
    let clockReads = 0;
    const out = await runReminderSweep({
      listTenantIds: async () => {
        throw new Error("must not be listed again");
      },
      step: (async (id: string, fn: () => Promise<unknown>) => (id in stored ? stored[id] : fn())) as never,
      now: () => {
        clockReads += 1;
        return NOW;
      },
      sweepTenant,
      log: () => {},
      alarm: () => {},
    });
    // T2's limit comes from T1's STORED result, not from a second sweep of T1.
    expect(calls).toEqual([{ tenantId: T2, now: NOW, limit: 1, passId: undefined }]);
    expect(clockReads).toBe(1);
    expect(out).toMatchObject({ due: 50, recorded: 50, overCeiling: false });
  });

  it("with no tenant at all the pass is an empty one", async () => {
    const lines: string[] = [];
    const out = await runReminderSweep({ listTenantIds: async () => [], log: (l) => lines.push(l), alarm: () => {} });
    expect(out).toEqual({ mode: "shadow", tenants: 0, failedTenants: 0, due: 0, recorded: 0, overCeiling: false });
    expect(lines).toEqual([`${SWEEP_LOG_PREFIX} mode=shadow tenants=0 failed=0 due=0 recorded=0`]);
  });
});

/* ------------------------------------------------------------------ */
/* It can send nothing                                                 */
/* ------------------------------------------------------------------ */

const WEB_ROOT = resolve(__dirname, "../..");

type FileFacts = {
  /** Every module this file loads at run time, as written. `import type` is not one. */
  imports: { specifier: string; names: string[] }[];
  /** `object.property` for every property read off a plain identifier. */
  members: string[];
};

/** Read one file with the TypeScript compiler's own parser. No text matching. */
function factsOf(file: string): FileFacts {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const facts: FileFacts = { imports: [], members: [] };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause?.isTypeOnly) {
        const names: string[] = [];
        if (clause?.name) names.push("default");
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) names.push("*");
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            if (!el.isTypeOnly) names.push((el.propertyName ?? el.name).text);
          }
        }
        facts.imports.push({ specifier: node.moduleSpecifier.text, names });
      }
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      facts.imports.push({ specifier: node.moduleSpecifier.text, names: ["*"] });
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const dynamic = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require");
      if (dynamic) {
        const [arg] = node.arguments;
        facts.imports.push({ specifier: arg && ts.isStringLiteral(arg) ? arg.text : "<computed>", names: ["*"] });
      }
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      facts.members.push(`${node.expression.text}.${node.name.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return facts;
}

/** A specifier that names a file of this app, as a path; null for a package. */
function localFile(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(WEB_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot resolve ${specifier} from ${from}`);
}

/** Everything reachable from `entry` at run time: this app's files, and the names taken from each package. */
function reach(entry: string): { files: string[]; packages: Record<string, string[]> } {
  const files = new Set<string>();
  const packages = new Map<string, Set<string>>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const imp of factsOf(file).imports) {
      const local = localFile(file, imp.specifier);
      if (local) queue.push(local);
      else {
        const names = packages.get(imp.specifier) ?? new Set<string>();
        for (const n of imp.names) names.add(n);
        packages.set(imp.specifier, names);
      }
    }
  }
  return {
    files: [...files].map((f) => relative(WEB_ROOT, f)).sort(),
    packages: Object.fromEntries([...packages].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()])),
  };
}

describe("the sweep can send nothing", () => {
  const SWEEP = join(__dirname, "sweep.ts");
  const CRON = join(__dirname, "inngest/sweep.ts");

  /**
   * A CLOSED LIST. Everything the pass is made of, to the file. No dispatcher,
   * no transport, no sender, no provider SDK, no scheduler client. A new
   * import fails here and has to be added by hand, in sight of this comment.
   */
  it("sweep.ts reaches exactly these files of the app, and none of them is a sender", () => {
    const reached = reach(SWEEP);
    expect(reached.files).toEqual([
      "lib/audit/metadata-contract.ts",
      "lib/reminders/context.ts",
      "lib/reminders/offsets.ts",
      "lib/reminders/reminder-claim.ts",
      "lib/reminders/reminder-population.ts",
      "lib/reminders/sweep.ts",
      "lib/scheduling/time.ts",
    ]);
    // From the packages: the query builder, and from the database package
    // three tables and the tenant context. The ledger's table is there because
    // the claim's file READS it; the test below holds that the sweep's own two
    // files do not take it.
    expect(reached.packages).toEqual({
      "@osteojp/db": ["appointments", "auditLog", "reminderClaims", "reminderDispatches", "withTenantContext"],
      "drizzle-orm": [
        "and",
        "count",
        "eq",
        "exists",
        "gt",
        "gte",
        "inArray",
        "like",
        "lt",
        "lte",
        "not",
        "notExists",
        "or",
        "sql",
      ],
      "drizzle-orm/pg-core": ["alias"],
      "server-only": [],
    });
  });

  it("the scheduled function adds the scheduler's client and the tenant lister, and uses them for nothing else", () => {
    const reached = reach(CRON);
    expect(reached.files).toEqual([
      "lib/audit/metadata-contract.ts",
      "lib/reminders/context.ts",
      "lib/reminders/inngest/client.ts",
      "lib/reminders/inngest/sweep.ts",
      "lib/reminders/offsets.ts",
      "lib/reminders/reminder-claim.ts",
      "lib/reminders/reminder-population.ts",
      "lib/reminders/sweep.ts",
      "lib/scheduling/time.ts",
    ]);
    expect(Object.keys(reached.packages)).toEqual([
      "@osteojp/db",
      "drizzle-orm",
      "drizzle-orm/pg-core",
      "inngest",
      "server-only",
    ]);
    expect(reached.packages["@osteojp/db"]).toEqual([
      "appointments",
      "auditLog",
      "getDbAdmin",
      "listTenantIdsForRetention",
      "reminderClaims",
      "reminderDispatches",
      "withTenantContext",
    ]);

    // The client can send events and a step can sleep, wait or send. The
    // function declares itself and runs steps, and that is all it does with either.
    const members = factsOf(CRON).members;
    expect(members.filter((m) => m.startsWith("inngest."))).toEqual(["inngest.createFunction"]);
    expect(members.filter((m) => m.startsWith("step."))).toEqual(["step.run"]);
    // And the pass itself never sees the client or a step object at all.
    const passMembers = factsOf(SWEEP).members;
    expect(passMembers.filter((m) => m.startsWith("inngest.") || m.startsWith("step."))).toEqual([]);
  });

  it("neither file writes the ledger, takes a claim or releases one", () => {
    for (const file of [SWEEP, CRON]) {
      const facts = factsOf(file);
      const names = facts.imports.flatMap((i) => i.names);
      expect(names, file).not.toContain("reminderDispatches");
      expect(names, file).not.toContain("takeReminderClaim");
      expect(names, file).not.toContain("releaseReminderClaim");
      expect(names, file).not.toContain("recordDispatch");
    }
    // What sweep.ts takes from the claim's file is two action names, to read with.
    const fromClaim = factsOf(SWEEP).imports.find((i) => i.specifier === "./reminder-claim");
    expect(fromClaim?.names).toEqual(["REMINDER_CLAIM_ACTION", "REMINDER_CLAIM_RELEASE_ACTION"]);
  });

  /**
   * NEGATIVE CONTROL. The same reader, pointed at the file that DOES send,
   * finds the dispatcher, a transport and a step that sends events. So an
   * empty answer above is the reader seeing nothing, not the reader being blind.
   */
  it("negative control: the same reader finds the senders where they are", () => {
    const functions = join(__dirname, "inngest/functions.ts");
    const reached = reach(functions);
    expect(reached.files).toContain("lib/reminders/dispatch.ts");
    expect(reached.files).toContain("lib/reminders/clients.ts");
    expect(factsOf(functions).members).toContain("step.sendEvent");
    expect(factsOf(functions).members).toContain("step.sleepUntil");
    // A type-only import is not a run-time import, and the reader knows it.
    const typeOnly = factsOf(join(__dirname, "offsets.ts")).imports.map((i) => i.specifier);
    expect(readFileSync(join(__dirname, "offsets.ts"), "utf8")).toContain('import type { Channel } from "@osteojp/notify"');
    expect(typeOnly).not.toContain("@osteojp/notify");
  });
});

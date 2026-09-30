import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("../auth/context", () => ({ runScoped: vi.fn() }));

import { runScoped } from "../auth/context";
import {
  CARE_TEAM_CLINIC_HELPER,
  CARE_TEAM_CLINIC_HELPER_CALL,
  careTeamClinicHelperPresent,
  probeCareTeamClinicHelper,
  resetCareTeamClinicHelperCache,
} from "./care-team-reads-gate";

/**
 * CARE-02a (0098 v2): the schema gate in front of the clinic-limited care-team
 * helper. The app names that helper only once this says it exists, because a
 * statement naming a missing function raises 42883 and takes the whole read
 * down (care-team-reads-gate.ts). What is pinned here:
 *
 *   - the question is `to_regprocedure` of the nullary helper, the same call
 *     the DB-gated suites ask, so the app and its proof mean one thing by
 *     "0098 is applied";
 *   - "present" is kept for the life of the process, "absent" is asked again
 *     after a minute (an apply takes effect without a redeploy), the
 *     asymmetry shared-resource.ts gives NESA's probes;
 *   - the probe runs under the CALLER's claims (runScoped), not an admin
 *     connection.
 */
const ctx = {
  tenantId: "00000000-0000-4000-8000-0000000000a1",
  role: "therapist" as const,
  userId: "00000000-0000-4000-8000-0000000000b1",
};

const mockRunScoped = vi.mocked(runScoped);

/** A fake transaction answering the probe with `present`, capturing each statement. */
function database(answers: boolean[]) {
  const seen: SQL[] = [];
  mockRunScoped.mockImplementation((async (_c: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      execute: async (q: SQL) => {
        seen.push(q);
        return [{ present: answers.shift() ?? false }];
      },
    })) as unknown as typeof runScoped);
  return seen;
}

describe("CARE-02a v2: the clinic-limited helper's schema gate", () => {
  beforeEach(() => {
    resetCareTeamClinicHelperCache();
    mockRunScoped.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("names one nullary public function, and asks to_regprocedure about exactly it", async () => {
    expect(CARE_TEAM_CLINIC_HELPER).toMatch(/^[a-z_]+$/);
    expect(CARE_TEAM_CLINIC_HELPER_CALL).toBe(`public.${CARE_TEAM_CLINIC_HELPER}()`);
    const seen: SQL[] = [];
    await probeCareTeamClinicHelper({
      execute: async (q: SQL) => {
        seen.push(q);
        return [{ present: true }];
      },
    });
    const q = new PgDialect().sqlToQuery(seen[0]!);
    expect(q.sql).toBe("select to_regprocedure($1) is not null as present");
    expect(q.params).toEqual([CARE_TEAM_CLINIC_HELPER_CALL]);
  });

  it("probeCareTeamClinicHelper reads the driver's two result shapes, and only `true` is present", async () => {
    const as = (r: unknown) => probeCareTeamClinicHelper({ execute: async () => r });
    expect(await as([{ present: true }])).toBe(true);
    expect(await as({ rows: [{ present: true }] })).toBe(true);
    expect(await as([{ present: false }])).toBe(false);
    expect(await as([])).toBe(false);
    expect(await as([{ present: "t" }])).toBe(false);
  });

  it("asks under the caller's own claims", async () => {
    database([true]);
    await careTeamClinicHelperPresent(ctx);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
    expect(mockRunScoped.mock.calls[0]![0]).toBe(ctx);
  });

  it("PRESENT is kept for the life of the process: asked once, however much time passes", async () => {
    database([true]);
    expect(await careTeamClinicHelperPresent(ctx)).toBe(true);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(await careTeamClinicHelperPresent(ctx)).toBe(true);
    expect(await careTeamClinicHelperPresent(ctx)).toBe(true);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
  });

  it("ABSENT is believed for a minute, then asked again, so an apply switches the app on without a redeploy", async () => {
    database([false, true]);
    expect(await careTeamClinicHelperPresent(ctx)).toBe(false);
    vi.advanceTimersByTime(59_999);
    expect(await careTeamClinicHelperPresent(ctx)).toBe(false);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await careTeamClinicHelperPresent(ctx)).toBe(true);
    expect(mockRunScoped).toHaveBeenCalledTimes(2);
  });

  it("a probe that fails is not read as absent: the error reaches the caller", async () => {
    mockRunScoped.mockRejectedValue(new Error("connection reset"));
    await expect(careTeamClinicHelperPresent(ctx)).rejects.toThrow("connection reset");
    mockRunScoped.mockReset();
    database([true]);
    expect(await careTeamClinicHelperPresent(ctx)).toBe(true);
  });
});

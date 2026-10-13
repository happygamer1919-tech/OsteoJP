/**
 * inngest/sweep.test.ts: the scheduled function as the scheduler is given it,
 * and what its handler hands to the pass. What a pass does is in
 * ../sweep.test.ts and ../sweep.db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  runReminderSweep: vi.fn(),
  getDbAdmin: vi.fn(),
  listTenantIdsForRetention: vi.fn(),
}));

vi.mock("../sweep", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sweep")>();
  return { ...actual, runReminderSweep: h.runReminderSweep };
});
vi.mock("@osteojp/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/db")>();
  return { ...actual, getDbAdmin: h.getDbAdmin, listTenantIdsForRetention: h.listTenantIdsForRetention };
});

const { SWEEP_CRON } = await import("../sweep");
const { sweepDueReminders } = await import("./sweep");
const { functions } = await import("./functions");
const { inngest } = await import("./client");

/** The options an InngestFunction was constructed with (see functions.test.ts). */
function authoredOptions(fn: unknown): Record<string, unknown> {
  return (fn as { opts?: Record<string, unknown> }).opts ?? {};
}

type Handler = (ctx: unknown) => Promise<unknown>;
const handler = (sweepDueReminders as unknown as { fn: Handler }).fn;

beforeEach(() => {
  h.runReminderSweep.mockReset();
  h.getDbAdmin.mockReset();
  h.listTenantIdsForRetention.mockReset();
});

describe("sweep-due-reminders, as the scheduler is given it", () => {
  it("is a cron, every 15 minutes in Lisbon's clinic hours, one run at a time, never retried", () => {
    expect(sweepDueReminders.id()).toBe("sweep-due-reminders");
    const opts = authoredOptions(sweepDueReminders);
    // Everything it is declared with, so a setting cannot be added unseen: a
    // new one is not live until the owner's Resync, and the PR must say so.
    expect(opts).toEqual({
      id: "sweep-due-reminders",
      triggers: [{ cron: SWEEP_CRON }],
      concurrency: { limit: 1 },
      retries: 0,
    });
    expect(SWEEP_CRON).toBe("TZ=Europe/Lisbon */15 7-21 * * *");
  });

  it("starts on the clock and on no event: nothing an appointment save emits can start a pass", () => {
    const triggers = authoredOptions(sweepDueReminders).triggers as Record<string, unknown>[];
    expect(triggers).toHaveLength(1);
    expect(Object.keys(triggers[0]!)).toEqual(["cron"]);
  });

  it("is served: it is on the list the route registers", () => {
    expect(functions).toContain(sweepDueReminders);
  });
});

describe("the handler", () => {
  it("hands the pass its steps, the run's id and the tenant lister, and returns the pass's answer", async () => {
    const answer = { mode: "shadow", tenants: 1, failedTenants: 0, due: 0, recorded: 0, overCeiling: false };
    h.runReminderSweep.mockResolvedValue(answer);
    const ran: string[] = [];
    const step = {
      run: vi.fn(async (id: string, fn: () => Promise<unknown>) => {
        ran.push(id);
        return fn();
      }),
    };
    const send = vi.spyOn(inngest, "send");

    expect(await handler({ step, runId: "01JRUNID" })).toBe(answer);

    expect(h.runReminderSweep).toHaveBeenCalledTimes(1);
    const deps = h.runReminderSweep.mock.calls[0]![0] as {
      step: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
      passId: string;
      listTenantIds: () => Promise<string[]>;
    };
    // Exactly these three: no clock, no switch, no tenant pass of its own.
    expect(Object.keys(deps).sort()).toEqual(["listTenantIds", "passId", "step"]);
    expect(deps.passId).toBe("01JRUNID");

    // The step it hands over is the scheduler's own `step.run`.
    expect(await deps.step("a-step", async () => 7)).toBe(7);
    expect(ran).toEqual(["a-step"]);

    // The lister is the one packages/db already has, on the owning connection,
    // and it is not called until the pass asks.
    expect(h.getDbAdmin).not.toHaveBeenCalled();
    const admin = { execute: vi.fn() };
    h.getDbAdmin.mockReturnValue(admin);
    h.listTenantIdsForRetention.mockResolvedValue(["t-1", "t-2"]);
    expect(await deps.listTenantIds()).toEqual(["t-1", "t-2"]);
    expect(h.listTenantIdsForRetention).toHaveBeenCalledWith(admin);
    // The owning connection is used for the listing and for nothing else here.
    expect(admin.execute).not.toHaveBeenCalled();

    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });

  it("a pass that fails makes the run fail: the error is not swallowed", async () => {
    const boom = new Error("pass failed");
    h.runReminderSweep.mockRejectedValue(boom);
    await expect(handler({ step: { run: vi.fn() }, runId: "01JRUNID" })).rejects.toBe(boom);
  });

  it("uses nothing of the step but `run`: a step object with only that is enough", async () => {
    // A handler that slept, waited for an event or sent one would throw here.
    h.runReminderSweep.mockImplementation(async (deps: { step: (id: string, fn: () => Promise<unknown>) => Promise<unknown> }) =>
      deps.step("only-run", async () => "ok"),
    );
    const step = { run: async (_id: string, fn: () => Promise<unknown>) => fn() };
    expect(await handler({ step, runId: "01JRUNID" })).toBe("ok");
  });
});

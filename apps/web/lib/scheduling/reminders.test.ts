import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the reminder pipeline entrypoint: we assert the scheduling layer EMITS the
// schedule event per occurrence, without touching Inngest. enqueueAppointmentReminders
// itself (it fires appointment/scheduled) is covered by reminders-e2e.smoke.test.ts.
const enqueue = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reminders", () => ({ enqueueAppointmentReminders: enqueue }));

import { enqueueRemindersAfterCommit } from "./reminders";
import { liveSendEnabled } from "@/lib/reminders/clients";

const TENANT = "22222222-2222-2222-2222-222222222222";
// In the FUTURE: since Q-K a past occurrence never carries the confirmation.
const T1 = new Date("2031-07-01T09:00:00.000Z");
const T2 = new Date("2031-07-08T09:00:00.000Z");
const PRAC = "therapist-1";
/** Q-N: the save's marker is a random v4 uuid, so it carries nothing about the visit. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.REMINDERS_LIVE_SEND;
  delete process.env.REMINDERS_LIVE_SEND; // dry-run default
  enqueue.mockReset();
  enqueue.mockResolvedValue(undefined);
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.REMINDERS_LIVE_SEND;
  else process.env.REMINDERS_LIVE_SEND = savedFlag;
  vi.restoreAllMocks();
});

describe("enqueueRemindersAfterCommit", () => {
  it("create: enqueues one schedule event per occurrence with tenant + startsAt", async () => {
    await enqueueRemindersAfterCommit(TENANT, [
      { appointmentId: "appt-1", startsAt: T1, practitionerId: PRAC },
      { appointmentId: "appt-2", startsAt: T2, practitionerId: PRAC }, // e.g. a recurring series
    ]);

    expect(enqueue).toHaveBeenCalledTimes(2);
    // Series burst guard: both occurrences schedule reminders, but only the
    // EARLIEST carries the confirmation. See reminders-burst.test.ts.
    expect(enqueue).toHaveBeenNthCalledWith(1, {
      appointmentId: "appt-1",
      tenantId: TENANT,
      startsAt: T1,
      practitionerId: PRAC,
      saveId: expect.stringMatching(UUID),
      confirmationEligible: true,
    });
    expect(enqueue).toHaveBeenNthCalledWith(2, {
      appointmentId: "appt-2",
      tenantId: TENANT,
      startsAt: T2,
      practitionerId: PRAC,
      saveId: expect.stringMatching(UUID),
      confirmationEligible: false,
    });
  });

  it("reschedule: re-enqueues with the NEW start instant (drives supersession)", async () => {
    // Reschedule passes the moved occurrence carrying its new startsAt; the new
    // appointment/scheduled event is what supersedes the prior sleeping run.
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: "appt-1", startsAt: T2, practitionerId: PRAC }]);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      appointmentId: "appt-1",
      tenantId: TENANT,
      startsAt: T2,
      practitionerId: PRAC,
      saveId: expect.stringMatching(UUID),
      confirmationEligible: true,
    });
  });

  it("Q-N: ONE save, ONE marker: every event of the call carries the same saveId", async () => {
    await enqueueRemindersAfterCommit(TENANT, [
      { appointmentId: "appt-1", startsAt: T1, practitionerId: PRAC },
      { appointmentId: "appt-2", startsAt: T2, practitionerId: PRAC },
    ]);
    const markers = enqueue.mock.calls.map((c) => (c[0] as { saveId: string }).saveId);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatch(UUID);
    expect(markers[1]).toBe(markers[0]);
  });

  it("Q-N: TWO saves of the same appointment, same start and therapist: two different markers", async () => {
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: "appt-1", startsAt: T1, practitionerId: PRAC }]);
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: "appt-1", startsAt: T1, practitionerId: PRAC }]);
    const [first, second] = enqueue.mock.calls.map((c) => (c[0] as { saveId: string }).saveId);
    expect(first).toMatch(UUID);
    expect(second).toMatch(UUID);
    expect(second).not.toBe(first);
  });

  it("no occurrences → no events", async () => {
    await enqueueRemindersAfterCommit(TENANT, []);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("best-effort: a failed enqueue is logged and swallowed, later targets still attempted", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    enqueue.mockRejectedValueOnce(new Error("inngest unreachable"));

    // Must not reject — the appointment is already committed.
    await expect(
      enqueueRemindersAfterCommit(TENANT, [
        { appointmentId: "appt-1", startsAt: T1, practitionerId: PRAC },
        { appointmentId: "appt-2", startsAt: T2, practitionerId: PRAC },
      ]),
    ).resolves.toBeUndefined();

    expect(enqueue).toHaveBeenCalledTimes(2); // second still attempted
    expect(err).toHaveBeenCalledTimes(1);
    // PII rule: log carries no payload, only a sanitized marker + error name.
    const logged = err.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("reminder enqueue failed");
    expect(logged).not.toContain("appt-1");
  });

  it("dry-run safe: enqueuing emits the event but does NOT enable live sends", async () => {
    expect(liveSendEnabled()).toBe(false); // flag off
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: "appt-1", startsAt: T1, practitionerId: PRAC }]);
    // The event is emitted; the real email/SMS stays sandbox-gated downstream, so
    // wiring this in does not send anything until REMINDERS_LIVE_SEND is flipped.
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(liveSendEnabled()).toBe(false);
  });
});

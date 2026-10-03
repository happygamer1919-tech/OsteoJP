/**
 * book-confirm-notice.test.ts - BOOK-CONFIRM, the approver's notice.
 *
 * "Paciente sem email: avise por telefone" is shown to the person who accepted
 * an online request when the booking-approved message applies to that patient
 * and the patient has no email on file.
 *
 * Two things are load-bearing and each has an arm that fails without it:
 *   1. the notice follows the SAME switch as the dispatch, so it appears for
 *      exactly the patients the new message applies to, and with the switch off
 *      the acceptance makes no extra read at all;
 *   2. the acceptance never fails because of the notice. It is asked after the
 *      commit, and a read that throws answers "no notice".
 *
 * Ids are made up. No name appears anywhere in this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("@osteojp/auth", () => ({
  assertCan: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("./conflict", () => ({
  findConflicts: vi.fn(async () => []),
  findConflictsForWindow: vi.fn(async () => []),
  blockingConflicts: (c: unknown[]) => c,
}));
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => {}),
  emitRescheduledNotification: vi.fn(async () => {}),
  emitCancelledNotification: vi.fn(async () => {}),
  emitCareTeamAddedNotifications: vi.fn(async () => {}),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@osteojp/auth";
import { confirmAppointmentRequest } from "./actions";
import { approvalNoticeAfterAccept, approvalNoticeFor } from "./book-confirm-notice";
import { enqueueRemindersAfterCommit } from "./reminders";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockEnqueue = vi.mocked(enqueueRemindersAfterCommit);

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

const LISTED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOT_LISTED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const APPT = "appt-1";

const ENV_KEYS = ["BOOK_CONFIRM_MODE", "BOOK_CONFIRM_CANARY_PATIENT_IDS"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockEnqueue.mockClear();
  mockCtx.mockResolvedValue(actor);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

/* ------------------------------ the decision ------------------------------ */

describe("approvalNoticeFor (pure)", () => {
  const on = { BOOK_CONFIRM_MODE: "on" };
  const canary = { BOOK_CONFIRM_MODE: "canary", BOOK_CONFIRM_CANARY_PATIENT_IDS: LISTED };

  it.each([
    ["off, no email", {}, LISTED, null, null],
    ["off, an email", {}, LISTED, "a@example.test", null],
    ["on, no email", on, NOT_LISTED, null, "patient_no_email"],
    ["on, a blank email", on, NOT_LISTED, "   ", "patient_no_email"],
    ["on, an email", on, NOT_LISTED, "a@example.test", null],
    ["canary, listed, no email", canary, LISTED, null, "patient_no_email"],
    ["canary, listed, an email", canary, LISTED, "a@example.test", null],
    ["canary, NOT listed, no email", canary, NOT_LISTED, null, null],
  ] as const)("%s", (_label, env, patientId, email, expected) => {
    expect(approvalNoticeFor([{ patientId, email }], env)).toBe(expected);
  });

  it("a patient the caller could not read is not in the rows, and unknown is not 'no email'", () => {
    expect(approvalNoticeFor([], on)).toBeNull();
  });

  it("one patient without an email among several is enough", () => {
    expect(
      approvalNoticeFor(
        [
          { patientId: LISTED, email: "a@example.test" },
          { patientId: NOT_LISTED, email: null },
        ],
        on,
      ),
    ).toBe("patient_no_email");
  });
});

/* ------------------------------ the read ------------------------------ */

describe("approvalNoticeAfterAccept", () => {
  it("switch off: no read at all", async () => {
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBeNull();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("no accepted appointment: no read at all, even with the switch on", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    expect(await approvalNoticeAfterAccept(actor, [])).toBeNull();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("switch on, the patient has no email: the notice", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockResolvedValueOnce([{ patientId: NOT_LISTED, email: null }] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBe("patient_no_email");
  });

  it("switch on, the patient has an email: nothing", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockResolvedValueOnce([{ patientId: NOT_LISTED, email: "a@example.test" }] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBeNull();
  });

  it("canary, the patient is not listed: nothing, though there is no email", async () => {
    process.env.BOOK_CONFIRM_MODE = "canary";
    process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS = LISTED;
    mockRunScoped.mockResolvedValueOnce([{ patientId: NOT_LISTED, email: null }] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBeNull();
  });

  it("NEVER throws: a failed read answers 'no notice' and logs the error name only", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRunScoped.mockRejectedValueOnce(new Error("row for someone@example.test unreadable"));
    await expect(approvalNoticeAfterAccept(actor, [APPT])).resolves.toBeNull();
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("book-confirm notice failed");
    expect(logged).toContain("Error");
    expect(logged).not.toContain("someone@example.test");
  });
});

/* ------------------- through the Pedidos queue's action ------------------- */

const PEDIDO = {
  id: APPT,
  startsAt: new Date("2031-05-14T13:30:00.000Z"),
  endsAt: new Date("2031-05-14T14:30:00.000Z"),
  practitionerId: "therapist-1",
  practitionerTwoId: null,
  patientId: NOT_LISTED,
  locationId: "loc-1",
  room: null,
  status: "scheduled",
};

function fakeTx() {
  return {
    execute: async () => [],
    select: () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        limit: async () => [PEDIDO],
      };
      return chain;
    },
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [{ id: APPT }] }) }),
    }),
  };
}

describe("confirmAppointmentRequest carries the notice, and never fails because of it", () => {
  /** First call is the acceptance's transaction; the second is the notice's read. */
  function accept(noticeRead: () => Promise<unknown>) {
    mockRunScoped
      .mockImplementationOnce((_actor, cb) => Promise.resolve(cb(fakeTx() as never)))
      .mockImplementationOnce(() => noticeRead() as never);
  }

  it("switch on, no email on file: ok, with the notice", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    accept(async () => [{ patientId: NOT_LISTED, email: null }]);
    expect(await confirmAppointmentRequest(APPT)).toEqual({
      ok: true,
      data: { id: APPT, notice: "patient_no_email" },
    });
  });

  it("switch on, an email on file: ok, and no notice key at all", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    accept(async () => [{ patientId: NOT_LISTED, email: "a@example.test" }]);
    expect(await confirmAppointmentRequest(APPT)).toEqual({ ok: true, data: { id: APPT } });
  });

  it("switch off: ok, no notice, and exactly ONE scoped call (the acceptance itself)", async () => {
    accept(async () => {
      throw new Error("the notice read must not run with the switch off");
    });
    expect(await confirmAppointmentRequest(APPT)).toEqual({ ok: true, data: { id: APPT } });
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
  });

  it("the notice read THROWS: the acceptance is still ok, and it still emitted", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    vi.spyOn(console, "error").mockImplementation(() => {});
    accept(async () => {
      throw new Error("connection reset");
    });
    expect(await confirmAppointmentRequest(APPT)).toEqual({ ok: true, data: { id: APPT } });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("the emit carries the acceptance marker", async () => {
    accept(async () => []);
    await confirmAppointmentRequest(APPT);
    expect(mockEnqueue).toHaveBeenCalledWith("tenant-A", [
      { appointmentId: APPT, startsAt: PEDIDO.startsAt, acceptedPedido: true },
    ]);
  });

  it("a REFUSED confirm asks for no notice", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockImplementationOnce(async () => ({ ok: false, error: "not_found" }) as never);
    expect(await confirmAppointmentRequest(APPT)).toEqual({ ok: false, error: "not_found" });
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
  });
});

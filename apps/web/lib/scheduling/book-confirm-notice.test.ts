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

/** A row the actor could read, reachable in every way unless overridden. */
const reachable = {
  patientEmail: "a@example.test" as string | null,
  patientPhone: "912 000 001" as string | null,
  tenantSmsEnabled: true,
  patientSmsEnabled: true,
  locationAddress: "Rua de Exemplo 1" as string | null,
  locationPhone: "+351 272 111 111" as string | null,
};
const MOBILE = "912 000 001";
const LANDLINE = "272 000 123";

describe("approvalNoticeFor (pure)", () => {
  const on = { BOOK_CONFIRM_MODE: "on" };
  const canary = { BOOK_CONFIRM_MODE: "canary", BOOK_CONFIRM_CANARY_PATIENT_IDS: LISTED };

  /**
   * THE RULE (lead's decision, 2026-10-04): the approver is told whenever the
   * new behaviour applies and NO message can go for a reason knowable now.
   * The predicates are the dispatch's own (book-confirm-plan.test.ts); what is
   * asserted here is the switch in front of them and which SENTENCE each
   * reason earns.
   */
  it.each([
    // label, env, patient, overrides, expected
    ["off, nothing on file", {}, LISTED, { patientEmail: null, patientPhone: null }, null],
    ["off, the location has no address", {}, LISTED, { locationAddress: null }, null],

    ["on, an email and a mobile", on, NOT_LISTED, {}, null],
    ["on, no email, a mobile: the SMS goes", on, NOT_LISTED, { patientEmail: null }, null],

    ["on, NEITHER an email nor a phone", on, NOT_LISTED, { patientEmail: null, patientPhone: null }, "patient_no_email"],
    ["on, no email, a LANDLINE", on, NOT_LISTED, { patientEmail: null, patientPhone: LANDLINE }, "patient_no_email"],
    ["on, no email, a mobile, the CLINIC has SMS off", on, NOT_LISTED, { patientEmail: null, tenantSmsEnabled: false }, "patient_no_email"],
    ["on, no email, a mobile, the PATIENT has SMS off", on, NOT_LISTED, { patientEmail: null, patientSmsEnabled: false }, "patient_no_email"],
    ["on, an email, SMS off: the email goes", on, NOT_LISTED, { tenantSmsEnabled: false, patientSmsEnabled: false }, null],

    ["on, an email, the location has NO ADDRESS", on, NOT_LISTED, { locationAddress: null }, "location_contact_missing"],
    ["on, an email, the location has NO PHONE", on, NOT_LISTED, { locationPhone: null }, "location_contact_missing"],
    ["on, no email, a mobile, the location has no address", on, NOT_LISTED, { patientEmail: null, locationAddress: " " }, "location_contact_missing"],
    ["on, nobody to reach AND no location contact: the patient's reason", on, NOT_LISTED, { patientEmail: null, patientPhone: null, locationPhone: null }, "patient_no_email"],

    ["canary, listed, neither", canary, LISTED, { patientEmail: null, patientPhone: null }, "patient_no_email"],
    ["canary, listed, location without a phone", canary, LISTED, { locationPhone: null }, "location_contact_missing"],
    ["canary, listed, a mobile", canary, LISTED, { patientEmail: null, patientPhone: MOBILE }, null],
    ["canary, NOT listed, neither", canary, NOT_LISTED, { patientEmail: null, patientPhone: null }, null],
    ["canary, NOT listed, location without an address", canary, NOT_LISTED, { locationAddress: null }, null],
  ] as const)("%s", (_label, env, patientId, over, expected) => {
    expect(approvalNoticeFor([{ patientId, ...reachable, ...over }], env)).toBe(expected);
  });

  it("an appointment the caller could not read is not in the rows, and unknown is never a notice", () => {
    expect(approvalNoticeFor([], on)).toBeNull();
  });

  it("several appointments: one unreachable patient is enough, and it outranks a location reason", () => {
    expect(
      approvalNoticeFor(
        [
          { patientId: LISTED, ...reachable, locationAddress: null },
          { patientId: NOT_LISTED, ...reachable, patientEmail: null, patientPhone: LANDLINE },
        ],
        on,
      ),
    ).toBe("patient_no_email");
    expect(
      approvalNoticeFor(
        [
          { patientId: LISTED, ...reachable },
          { patientId: NOT_LISTED, ...reachable, locationPhone: null },
        ],
        on,
      ),
    ).toBe("location_contact_missing");
  });
});

/* ------------------------------ the read ------------------------------ */

/** One row as the notice's own query returns it: the tenant's settings unparsed. */
const readRow = {
  patientEmail: "a@example.test" as string | null,
  patientPhone: "912 000 001" as string | null,
  patientSmsEnabled: true,
  locationAddress: "Rua de Exemplo 1" as string | null,
  locationPhone: "+351 272 111 111" as string | null,
  tenantSettings: { locale: "pt" } as unknown,
};

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

  it("switch on, the patient has neither an email nor a usable number: the notice", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockResolvedValueOnce([{ patientId: NOT_LISTED, ...readRow, patientEmail: null, patientPhone: null }] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBe("patient_no_email");
  });

  it("switch on, no email but a mobile: nothing, the SMS reaches them", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockResolvedValueOnce([
      { patientId: NOT_LISTED, ...readRow, patientEmail: null },
    ] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBeNull();
  });

  it("switch on, the patient has an email: nothing", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockResolvedValueOnce([
      { patientId: NOT_LISTED, ...readRow, patientPhone: null },
    ] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBeNull();
  });

  it("canary, the patient is not listed: nothing, though nothing can reach them", async () => {
    process.env.BOOK_CONFIRM_MODE = "canary";
    process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS = LISTED;
    mockRunScoped.mockResolvedValueOnce([{ patientId: NOT_LISTED, ...readRow, patientEmail: null, patientPhone: null }] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBeNull();
  });

  it("switch on, the location has no address: the SECOND notice", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockResolvedValueOnce([
      { patientId: NOT_LISTED, ...readRow, locationAddress: null },
    ] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBe("location_contact_missing");
  });

  it("switch on, a mobile and no email, but the CLINIC's settings have SMS off: the notice", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockResolvedValueOnce([
      {
        patientId: NOT_LISTED,
        ...readRow,
        patientEmail: null,
        // The settings column as stored; parsed by the same parser the dispatch uses.
        tenantSettings: { reminders: { emailEnabled: true, smsEnabled: false, leadTimeHours: [48, 24] } },
      },
    ] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBe("patient_no_email");
  });

  it("switch on, a mobile and no email, the PATIENT's SMS preference off: the notice", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    mockRunScoped.mockResolvedValueOnce([
      { patientId: NOT_LISTED, ...readRow, patientEmail: null, patientSmsEnabled: false },
    ] as never);
    expect(await approvalNoticeAfterAccept(actor, [APPT])).toBe("patient_no_email");
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
    accept(async () => [{ patientId: NOT_LISTED, ...readRow, patientEmail: null, patientPhone: null }]);
    expect(await confirmAppointmentRequest(APPT)).toEqual({
      ok: true,
      data: { id: APPT, notice: "patient_no_email" },
    });
  });

  it("switch on, an email on file: ok, and no notice key at all", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    accept(async () => [{ patientId: NOT_LISTED, ...readRow, patientPhone: null }]);
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

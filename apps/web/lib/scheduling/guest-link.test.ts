/**
 * guest-link.test.ts - BOOK-CONFIRM, the public-form path (S-1004-A, R40).
 *
 * `linkGuestRequestTx` decides whether the appointment reception just booked
 * answers a guest request. The request id comes from a URL, so every way it can
 * be wrong has an arm here, and each arm asserts the same two things: NOTHING
 * IS WRITTEN and NOTHING IS THROWN. The real statements, the real policies and
 * the real race are in guest-link.db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RequestContext } from "@osteojp/auth";
import {
  acceptedGuestRequestTarget,
  guestLinkOccurrence,
  linkGuestRequestTx,
} from "./guest-link";

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };
const REQUEST = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const APPT = "22222222-2222-4222-8222-222222222222";

type RequestRow = {
  id: string;
  status: string;
  convertedPatientId: string | null;
  convertedAppointmentId: string | null;
  locationId: string;
};

const open: RequestRow = {
  id: REQUEST,
  status: "pending",
  convertedPatientId: PATIENT,
  convertedAppointmentId: null,
  locationId: "loc-lv",
};

/** What the SELECT returns, what the UPDATE returns, and everything that was written. */
let selectRows: RequestRow[] = [];
let updateRows: { id: string }[] = [];
let sets: Record<string, unknown>[] = [];
let selects = 0;
let savepoints = 0;
let failIn: "select" | "update" | null = null;

function fakeTx() {
  const sp = {
    select: () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        limit: async () => {
          selects += 1;
          if (failIn === "select") throw new Error("lock timeout for request of 912 345 678");
          return selectRows;
        },
      };
      return chain;
    },
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (failIn === "update") throw new Error("constraint violated");
            sets.push(v);
            return updateRows;
          },
        }),
      }),
    }),
  };
  return {
    transaction: async (cb: (s: typeof sp) => Promise<unknown>) => {
      savepoints += 1;
      return cb(sp);
    },
  };
}

const link = (over: Partial<Parameters<typeof linkGuestRequestTx>[2]> = {}) =>
  linkGuestRequestTx(fakeTx() as never, actor, {
    guestRequestId: REQUEST,
    patientId: PATIENT,
    appointmentId: APPT,
    locationScope: null,
    ...over,
  });

beforeEach(() => {
  selectRows = [open];
  updateRows = [{ id: REQUEST }];
  sets = [];
  selects = 0;
  savepoints = 0;
  failIn = null;
});

describe("linkGuestRequestTx: the link is written", () => {
  it("an open request converted to this patient: linked, and the status becomes confirmed", async () => {
    expect(await link()).toBe(true);
    expect(sets).toEqual([{ convertedAppointmentId: APPT, status: "confirmed" }]);
  });

  it("inside a SAVEPOINT, so a failure here cannot abort the booking around it", async () => {
    await link();
    expect(savepoints).toBe(1);
  });

  it("a request inside the actor's location scope links", async () => {
    expect(await link({ locationScope: ["loc-lv", "loc-cb"] })).toBe(true);
  });

  it("the write never touches handled_at: a dismiss is not a condition and not a consequence", async () => {
    await link();
    expect(Object.keys(sets[0]!).sort()).toEqual(["convertedAppointmentId", "status"]);
  });
});

describe("linkGuestRequestTx: a forged or stale id changes nothing and throws nothing", () => {
  it.each([null, undefined, "", "   ", "not-a-uuid", "'; drop table guest_booking_requests; --", `${REQUEST}0`])(
    "%j is not a request id: no statement is even run",
    async (guestRequestId) => {
      expect(await link({ guestRequestId })).toBe(false);
      expect(savepoints).toBe(0);
      expect(selects).toBe(0);
      expect(sets).toEqual([]);
    },
  );

  it("no such request in this tenant (made up, or another tenant's): nothing", async () => {
    selectRows = [];
    expect(await link()).toBe(false);
    expect(sets).toEqual([]);
  });

  it.each(["confirmed", "declined"])("a request that is %s is not open: nothing", async (status) => {
    selectRows = [{ ...open, status }];
    expect(await link()).toBe(false);
    expect(sets).toEqual([]);
  });

  it("converted to a DIFFERENT patient: nothing, so no message can reach the wrong person", async () => {
    selectRows = [{ ...open, convertedPatientId: "44444444-4444-4444-8444-444444444444" }];
    expect(await link()).toBe(false);
    expect(sets).toEqual([]);
  });

  it("not converted at all: nothing", async () => {
    selectRows = [{ ...open, convertedPatientId: null }];
    expect(await link()).toBe(false);
    expect(sets).toEqual([]);
  });

  it("already linked to an appointment: nothing, the first link stands", async () => {
    selectRows = [{ ...open, convertedAppointmentId: "55555555-5555-4555-8555-555555555555" }];
    expect(await link()).toBe(false);
    expect(sets).toEqual([]);
  });

  it("the request's clinic is outside the actor's scope: nothing", async () => {
    expect(await link({ locationScope: ["loc-cb"] })).toBe(false);
    expect(sets).toEqual([]);
  });

  it("the conditional write updates ZERO rows (another booking linked it first): false", async () => {
    updateRows = [];
    expect(await link()).toBe(false);
  });

  it.each(["select", "update"] as const)(
    "the %s THROWS: false, never thrown into the booking, and the log carries the error name only",
    async (where) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      failIn = where;
      await expect(link()).resolves.toBe(false);
      const logged = spy.mock.calls.flat().join(" ");
      expect(logged).toContain("guest request link failed");
      expect(logged).toContain("Error");
      expect(logged).not.toContain("912 345 678");
      spy.mockRestore();
    },
  );
});

describe("the linked occurrence and its target", () => {
  const d = (iso: string) => new Date(iso);

  it("a single booking links itself", () => {
    const only = { id: "a", startsAt: d("2031-05-14T10:00:00Z") };
    expect(guestLinkOccurrence([only])).toBe(only);
  });

  it("a series links its EARLIEST occurrence, whatever order the list is in", () => {
    const first = { id: "first", startsAt: d("2031-05-14T10:00:00Z") };
    const list = [
      { id: "third", startsAt: d("2031-05-28T10:00:00Z") },
      first,
      { id: "second", startsAt: d("2031-05-21T10:00:00Z") },
    ];
    expect(guestLinkOccurrence(list)).toBe(first);
  });

  it("an empty list links nothing", () => {
    expect(guestLinkOccurrence([])).toBeNull();
  });

  it("the target carries the guest marker and not the pedido one", () => {
    const start = d("2031-05-14T10:00:00Z");
    expect(acceptedGuestRequestTarget(APPT, start)).toEqual({
      appointmentId: APPT,
      startsAt: start,
      acceptedGuestRequest: true,
    });
  });
});

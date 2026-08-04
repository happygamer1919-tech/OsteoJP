/**
 * B4: every patient-initiated change notifies reception and the assigned
 * therapist (JP, 2026-08-03).
 *
 * The notification CENTRE is a later loop. What is asserted here is the half
 * that must not be retrofitted: both patient write paths emit, with a fixed
 * contract, carrying identifiers only.
 *
 * The emit must also be UNABLE to break the write it follows. A patient whose
 * cancellation succeeded must not be told it failed because a staff notification
 * could not be delivered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { cancelAppointment, rescheduleAppointment } from "../appointments/booking";
import type { AppointmentsStore } from "../appointments/booking";
import {
  emitPatientChange,
  setPatientChangeConsumer,
  resetPatientChangeConsumer,
  stubConsumer,
  type PatientChangeEvent,
} from "./patient-change";

const NOW = new Date("2026-09-01T09:00:00Z");
const H = 60 * 60 * 1000;
const PRINCIPAL = { tenantId: "t1", patientId: "p1" } as never;

const APPT = {
  startsAt: new Date(NOW.getTime() + 5 * 24 * H),
  endsAt: new Date(NOW.getTime() + 5 * 24 * H + 45 * 60_000),
  status: "scheduled" as const,
  locationId: "loc-1",
  practitionerId: "prac-9",
};

function makeStore(over: Record<string, unknown> = {}) {
  const store = {
    getOwnMutable: vi.fn(async () => APPT),
    listOpenSlots: vi.fn(async () => []),
    hasWindowConflict: vi.fn(async () => false),
    cancelOwn: vi.fn(async () => {}),
    rescheduleOwn: vi.fn(async () => {}),
    getOwn: vi.fn(async () => ({ ...APPT, id: "a1" })),
    ...over,
  };
  return store as typeof store & AppointmentsStore;
}

let seen: PatientChangeEvent[] = [];

beforeEach(() => {
  seen = [];
  setPatientChangeConsumer(async (e) => {
    seen.push(e);
    return { delivered: true };
  });
});
afterEach(() => resetPatientChangeConsumer());

describe("both patient write paths emit", () => {
  it("cancel emits, addressed to reception AND the assigned therapist", async () => {
    await cancelAppointment(PRINCIPAL, "a1", makeStore(), NOW);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      kind: "cancelled",
      tenantId: "t1",
      appointmentId: "a1",
      patientId: "p1",
      audience: { reception: true, practitionerId: "prac-9" },
      occurredAt: NOW.toISOString(),
    });
  });

  it("a cancellation reports the start unchanged, since it does not move", async () => {
    await cancelAppointment(PRINCIPAL, "a1", makeStore(), NOW);

    expect(seen[0]!.previousStartsAt).toBe(APPT.startsAt.toISOString());
    expect(seen[0]!.newStartsAt).toBe(APPT.startsAt.toISOString());
  });

  it("reschedule emits BOTH instants, so the centre can render moved-from-to", async () => {
    const newStart = new Date(NOW.getTime() + 6 * 24 * H);

    await rescheduleAppointment(PRINCIPAL, "a1", { startsAt: newStart }, makeStore(), NOW);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "rescheduled", audience: { practitionerId: "prac-9" } });
    expect(seen[0]!.previousStartsAt).toBe(APPT.startsAt.toISOString());
    expect(seen[0]!.newStartsAt).toBe(newStart.toISOString());
  });

  it("emits only AFTER the write commits, never before", async () => {
    const order: string[] = [];
    const store = makeStore({ cancelOwn: vi.fn(async () => void order.push("write")) });
    setPatientChangeConsumer(async () => {
      order.push("notify");
      return { delivered: true };
    });

    await cancelAppointment(PRINCIPAL, "a1", store, NOW);
    expect(order).toEqual(["write", "notify"]);
  });

  it("does NOT emit when the write was refused", async () => {
    // Inside the cutoff: the cancel throws, so nothing happened to notify about.
    const soon = { ...APPT, startsAt: new Date(NOW.getTime() + 3 * H) };
    const store = makeStore({ getOwnMutable: vi.fn(async () => soon) });

    await expect(cancelAppointment(PRINCIPAL, "a1", store, NOW)).rejects.toThrow();
    expect(seen).toHaveLength(0);
  });
});

describe("the emit cannot break the write it follows", () => {
  it("a throwing consumer does not fail the patient's cancellation", async () => {
    setPatientChangeConsumer(async () => {
      throw new Error("centre unavailable");
    });
    const store = makeStore();

    // The important assertion: this resolves. The patient is told their
    // cancellation succeeded, because it did.
    await expect(cancelAppointment(PRINCIPAL, "a1", store, NOW)).resolves.toBeUndefined();
    expect(store.cancelOwn).toHaveBeenCalledOnce();
  });

  it("logs the failure at ERROR rather than swallowing it to a bare name", async () => {
    setPatientChangeConsumer(async () => {
      throw new Error("centre unavailable");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await emitPatientChange({
        kind: "cancelled",
        tenantId: "t1",
        appointmentId: "a1",
        patientId: "p1",
        audience: { reception: true, practitionerId: "prac-9" },
        previousStartsAt: NOW.toISOString(),
        newStartsAt: NOW.toISOString(),
        occurredAt: NOW.toISOString(),
      });

      const logged = err.mock.calls.flat().map(String).join(" ");
      expect(logged).toContain("patient-change emit FAILED");
      // The CAUSE, not just a name. A bare name is how the reminder pipeline
      // hid its own failure for weeks.
      expect(logged).toContain("centre unavailable");
    } finally {
      err.mockRestore();
    }
  });
});

describe("the stub is honest about being a stub", () => {
  it("reports delivered:false, so nothing can mistake it for a delivery", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const out = await stubConsumer({
        kind: "rescheduled",
        tenantId: "t1",
        appointmentId: "a1",
        patientId: "p1",
        audience: { reception: true, practitionerId: "prac-9" },
        previousStartsAt: NOW.toISOString(),
        newStartsAt: NOW.toISOString(),
        occurredAt: NOW.toISOString(),
      });

      expect(out.delivered).toBe(false);
      expect(info.mock.calls.flat().map(String).join(" ")).toContain("NOT DELIVERED");
    } finally {
      info.mockRestore();
    }
  });
});

describe("payload minimisation holds for staff notifications too", () => {
  const FORBIDDEN = ["phone", "email", "patientName", "fullName", "nif", "serviceName", "notes"];

  it("the emitted event carries identifiers and instants only", async () => {
    await rescheduleAppointment(
      PRINCIPAL,
      "a1",
      { startsAt: new Date(NOW.getTime() + 6 * 24 * H) },
      makeStore(),
      NOW,
    );

    const keys = Object.keys(seen[0]!).concat(Object.keys(seen[0]!.audience));
    for (const bad of FORBIDDEN) {
      expect(keys.some((k) => k.toLowerCase().includes(bad.toLowerCase()))).toBe(false);
    }
    // The therapist is addressed by ID, never by name.
    expect(seen[0]!.audience.practitionerId).toBe("prac-9");
  });
});

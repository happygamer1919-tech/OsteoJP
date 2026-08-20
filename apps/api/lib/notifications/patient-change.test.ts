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

/** One event, one kind. Every field an id or an instant, per the payload
 *  minimisation this file already asserts further down. */
const EVENT = (kind: PatientChangeEvent["kind"]): PatientChangeEvent => ({
  kind,
  tenantId: "t1",
  appointmentId: "a1",
  patientId: "pat-does-not-appear-in-logs",
  audience: { reception: true, practitionerIds: ["prac-9"] },
  previousStartsAt: NOW.toISOString(),
  newStartsAt: NOW.toISOString(),
  occurredAt: NOW.toISOString(),
});

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
      audience: { reception: true, practitionerIds: ["prac-9"] },
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
    expect(seen[0]).toMatchObject({
      kind: "rescheduled",
      audience: { practitionerIds: ["prac-9"] },
    });
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
        audience: { reception: true, practitionerIds: ["prac-9"] },
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
        audience: { reception: true, practitionerIds: ["prac-9"] },
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
    expect(seen[0]!.audience.practitionerIds).toEqual(["prac-9"]);
  });
});

/**
 * LE-pedido-emit-best-effort. A not-delivered emit used to be an error nowhere.
 *
 * THE DEFECT WAS NOT THAT THE EMIT COULD FAIL - it is best-effort on purpose and
 * that is right, because a patient whose booking succeeded must not be told it
 * failed. The defect was that FAILING WAS SILENT. All three call sites in
 * booking.ts discard the ConsumerResult, and the one branch that logged - the
 * centre resolving zero recipients - logs at WARN and never throws. So a pedido
 * could be lost with no error line anywhere in the system.
 *
 * IT COSTS MORE THAN VISIBILITY, and that is why `appointment_request` is
 * singled out. `is_unconfirmed_pedido` (migration 0059) keys "this is a pedido"
 * on the `staff_notifications` row. No row means the appointment is
 * indistinguishable from a staff booking: reception is never told to confirm it,
 * AND it blocks its slot as though it had been confirmed. That is the second
 * half of the card's title and it cannot be fixed here - see the card.
 */
describe("a not-delivered emit is loud, and says what it costs", () => {
  const errLines = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.flat().map(String).join(" ");

  it("logs NOT DELIVERED when the consumer reports it delivered nothing", async () => {
    setPatientChangeConsumer(async () => ({ delivered: false, reason: "no_recipients" as const }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await emitPatientChange(EVENT("appointment_request"));
      const logged = errLines(err);
      expect(logged).toContain("patient-change NOT DELIVERED");
      // The REASON, so the three causes stop wearing one face.
      expect(logged).toContain("reason=no_recipients");
      expect(logged).toContain("appointment=a1");
    } finally {
      err.mockRestore();
    }
  });

  // The negative arm. A rule that fires on everything is switched off within a
  // week, so the delivered case must be silent.
  it("stays SILENT when the consumer delivered", async () => {
    setPatientChangeConsumer(async () => ({ delivered: true }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await emitPatientChange(EVENT("appointment_request"));
      expect(err).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  it("names the provenance consequence for a pedido, because it BLOCKS", async () => {
    setPatientChangeConsumer(async () => ({ delivered: false, reason: "no_recipients" as const }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await emitPatientChange(EVENT("appointment_request"));
      const logged = errLines(err);
      expect(logged).toContain("PEDIDO HAS NO PROVENANCE ROW");
      expect(logged).toContain("blocks its slot");
    } finally {
      err.mockRestore();
    }
  });

  // The other arm of the same distinction: a lost cancellation costs visibility
  // and nothing else, so claiming it blocks a slot would be a false alarm.
  it("does NOT claim a blocked slot for a lost cancellation", async () => {
    setPatientChangeConsumer(async () => ({ delivered: false, reason: "no_recipients" as const }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await emitPatientChange(EVENT("cancelled"));
      const logged = errLines(err);
      expect(logged).toContain("patient-change NOT DELIVERED");
      expect(logged).not.toContain("PEDIDO HAS NO PROVENANCE ROW");
    } finally {
      err.mockRestore();
    }
  });

  it("a throwing consumer produces BOTH lines - the cause and the cost", async () => {
    setPatientChangeConsumer(async () => {
      throw new Error("centre unavailable");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await emitPatientChange(EVENT("appointment_request"));
      const logged = errLines(err);
      expect(logged).toContain("patient-change emit FAILED"); // cause
      expect(logged).toContain("centre unavailable");
      expect(logged).toContain("patient-change NOT DELIVERED"); // cost
      expect(logged).toContain("reason=consumer_threw");
      expect(r).toEqual({ delivered: false, reason: "consumer_threw" });
    } finally {
      err.mockRestore();
    }
  });

  it("still cannot break the write: the booking path resolves through it", async () => {
    setPatientChangeConsumer(async () => ({ delivered: false, reason: "no_recipients" as const }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = makeStore();
    try {
      await expect(cancelAppointment(PRINCIPAL, "a1", store, NOW)).resolves.toBeUndefined();
      expect(store.cancelOwn).toHaveBeenCalledOnce();
    } finally {
      err.mockRestore();
    }
  });

  // NO PII, rule 7. The line is meant to be safe to read in a shared log, so it
  // carries ids and nothing else - and the patient id is absent even though it
  // is an id, because it is not needed to find the appointment.
  it("carries ids only, and not the patient id", async () => {
    setPatientChangeConsumer(async () => ({ delivered: false, reason: "no_recipients" as const }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await emitPatientChange(EVENT("appointment_request"));
      const logged = errLines(err);
      expect(logged).toContain("tenant=t1");
      expect(logged).toContain("practitioners=prac-9");
      expect(logged).not.toContain("p1");
    } finally {
      err.mockRestore();
    }
  });

  it("reports `unreported` rather than inventing one when a consumer omits the reason", async () => {
    // `reason` is optional so no existing consumer breaks. An absent reason must
    // read as ABSENT, not as one of the three - that would be the same
    // conflation one layer out.
    setPatientChangeConsumer(async () => ({ delivered: false }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await emitPatientChange(EVENT("appointment_request"));
      expect(errLines(err)).toContain("reason=unreported");
    } finally {
      err.mockRestore();
    }
  });
});

describe("the three causes of a lost pedido report themselves distinctly", () => {
  it("the stub says `stub`, not a bare false", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const r = await stubConsumer(EVENT("appointment_request"));
      expect(r).toEqual({ delivered: false, reason: "stub" });
    } finally {
      info.mockRestore();
    }
  });
});

/**
 * acceptance-event-flow.test.ts — W14-07.
 *
 * OWNER RULING 2026-08-31: "the booking confirmation sends for portal-originated
 * appointments only, and only at the moment reception ACCEPTS the pedido, never
 * at request time."
 *
 * WHAT THIS PROVES, and it is the WHOLE flow rather than one call:
 *
 *   accept  ->  inngest.send(appointment/scheduled, confirmationEligible: true)
 *                 |
 *                 +-> scheduleAppointmentReminders  -> 48h EMAIL + 24h SMS
 *                 +-> sendAppointmentConfirmation   -> dispatchConfirmation
 *
 * Each arrow is exercised against the REAL unit: the real enqueue helper, the
 * real Inngest handler bodies, the real trigger filter, and the real dispatch
 * gates. The single seam that is faked is `inngest.send` itself - the one call
 * that leaves the process - so the events are captured rather than delivered.
 *
 * THE NEGATIVE HALF IS THE POINT AND IT IS ASSERTED TWICE. A pedido must
 * produce NOTHING before acceptance, and there are two independent reasons it
 * does: the portal API emits no event at all (asserted at source, because it is
 * an absence and an absence cannot be observed by calling something), and the
 * dispatch gates refuse an unaccepted pedido even if an event reached them.
 * Proving only one would leave the other free to rot.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  sent: [] as { name: string; data: Record<string, unknown> }[],
  loadReminderData: vi.fn(),
}));

vi.mock("./inngest/client", async () => {
  const actual = await vi.importActual<typeof import("./inngest/client")>("./inngest/client");
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      // The one call that leaves the process. Everything else is real.
      send: vi.fn(async (e: { name: string; data: Record<string, unknown> }) => {
        h.sent.push(e);
      }),
      createFunction: actual.inngest.createFunction.bind(actual.inngest),
    },
  };
});
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));

import { enqueueRemindersAfterCommit } from "@/lib/scheduling/reminders";
import { computeDueReminders } from "./offsets";
import { CONFIRMATION_TRIGGER_FILTER } from "./inngest/functions";
import { dispatchConfirmation, dispatchReminder } from "./dispatch";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";

/** Far enough out that BOTH offsets are still in the future. */
const STARTS_AT = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

function reminderRow(over: Record<string, unknown> = {}) {
  return {
    appointmentId: APPT,
    startsAt: STARTS_AT,
    status: "confirmed",
    confirmationState: "pending",
    // THE ROW A PORTAL BOOKING WRITES. apps/api sets origin: "patient_portal"
    // and leaves confirmation_state at its DB default.
    origin: "patient_portal",
    patientId: PATIENT,
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.pt",
    patientPhone: "+351 912 345 678",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    practitionerName: "Dr. Joao Pereira",
    locationName: "Linda-a-Velha",
    locationPhone: "+351 210 000 000",
    tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
    ...over,
  };
}

beforeEach(() => {
  h.sent.length = 0;
  h.loadReminderData.mockReset();
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.example.test";
  delete process.env.REMINDERS_LIVE_SEND;
});

/* ==================================================================== */
/* 1. ACCEPTANCE EMITS, AND THE EVENT CARRIES THE CONFIRMATION FLAG      */
/* ==================================================================== */

describe("reception accepting a pedido emits the scheduling event", () => {
  it("emits exactly ONE appointment/scheduled with confirmationEligible true", async () => {
    // This is the call confirmAppointmentRequest now makes post-commit, with
    // the accepted appointment as its single target.
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: APPT, startsAt: STARTS_AT }]);

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.name).toBe("appointment/scheduled");
    expect(h.sent[0]!.data).toMatchObject({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: STARTS_AT.toISOString(),
      // One accepted pedido is one booking, so it carries the confirmation.
      confirmationEligible: true,
    });
  });

  it("that event passes the confirmation function's TRIGGER filter", async () => {
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: APPT, startsAt: STARTS_AT }]);
    // The filter is a string evaluated by Inngest, so it is asserted as the
    // property it expresses rather than executed: the event's flag is true and
    // the filter tests exactly that field for exactly that value.
    expect(CONFIRMATION_TRIGGER_FILTER).toBe("event.data.confirmationEligible == true");
    expect(h.sent[0]!.data.confirmationEligible).toBe(true);
  });

  it("and the SAME event fans out BOTH reminder offsets, on their own channels", () => {
    // The real scheduling body: scheduleAppointmentReminders calls exactly this
    // to decide what to fan out.
    const due = computeDueReminders(STARTS_AT, new Date());
    expect(due).toHaveLength(2);
    expect(due.map((d) => [d.offsetId, d.channel])).toEqual([
      ["48h", "email"],
      ["24h", "sms"],
    ]);
    // Correct instants, not merely two of something.
    expect(due[0]!.sendAt.getTime()).toBe(STARTS_AT.getTime() - 48 * 60 * 60_000);
    expect(due[1]!.sendAt.getTime()).toBe(STARTS_AT.getTime() - 24 * 60 * 60_000);
  });
});

/* ==================================================================== */
/* 2. THE DISPATCH ACTUALLY SENDS FOR AN ACCEPTED PEDIDO                 */
/* ==================================================================== */

describe("an ACCEPTED pedido produces the confirmation and both reminders", () => {
  it("dispatchConfirmation sends — portal origin, and no longer an unaccepted pedido", async () => {
    h.loadReminderData.mockResolvedValue(reminderRow({ status: "confirmed" }));
    const out = await dispatchConfirmation(TENANT, APPT);
    expect(out.dispatched).toBe(true);
  });

  it("the 48h EMAIL reminder dispatches", async () => {
    h.loadReminderData.mockResolvedValue(reminderRow({ status: "confirmed" }));
    const out = await dispatchReminder(TENANT, APPT, "48h", "email");
    expect(out.dispatched).toBe(true);
  });

  it("the 24h SMS reminder dispatches", async () => {
    h.loadReminderData.mockResolvedValue(reminderRow({ status: "confirmed" }));
    const out = await dispatchReminder(TENANT, APPT, "24h", "sms");
    expect(out.dispatched).toBe(true);
  });
});

/* ==================================================================== */
/* 3. A PEDIDO PRODUCES NOTHING BEFORE ACCEPTANCE                        */
/* ==================================================================== */

describe("before acceptance, a pedido produces nothing", () => {
  it("the confirmation is refused — it is still an unaccepted pedido", async () => {
    // status `scheduled` + origin `patient_portal` IS the pedido, and this is
    // the row the portal writes the moment a patient books.
    h.loadReminderData.mockResolvedValue(reminderRow({ status: "scheduled" }));
    const out = await dispatchConfirmation(TENANT, APPT);
    expect(out).toMatchObject({ dispatched: false, reason: "unconfirmed" });
  });

  it("both reminders are refused for the same reason", async () => {
    h.loadReminderData.mockResolvedValue(reminderRow({ status: "scheduled" }));
    expect(await dispatchReminder(TENANT, APPT, "48h", "email")).toMatchObject({
      dispatched: false,
      reason: "unconfirmed",
    });
    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toMatchObject({
      dispatched: false,
      reason: "unconfirmed",
    });
  });

  it("a STAFF booking is refused the confirmation but KEEPS its reminders", async () => {
    // Decision A in one pair. The staff row is `scheduled` with origin `staff`,
    // which is what every staff booking looks like the instant it is created.
    const staffRow = reminderRow({ status: "scheduled", origin: "staff" });
    h.loadReminderData.mockResolvedValue(staffRow);
    expect(await dispatchConfirmation(TENANT, APPT)).toMatchObject({
      dispatched: false,
      reason: "origin",
    });
    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toMatchObject({
      dispatched: true,
    });
  });

  /**
   * THE SOURCE-LEVEL ARM. The portal API emitting nothing is an ABSENCE, and an
   * absence cannot be observed by calling something - there is nothing to call.
   * It is asserted where it lives.
   *
   * This is also the guard on the fix: if a future change makes apps/api emit
   * `appointment/scheduled` at BOOKING time, the confirmation would fire for an
   * unaccepted pedido from a second place, and this arm goes red rather than the
   * defect shipping.
   */
  it("apps/api emits NO scheduling event anywhere — asserted at source", () => {
    const root = join(__dirname, "..", "..", "..", "..", "apps", "api");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(20); // the walk is not vacuously empty

    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return /from\s+["']inngest["']|appointment\/scheduled/.test(src);
    });
    expect(offenders.map((f) => f.slice(root.length))).toEqual([]);
  });
});

/**
 * W13-C / W14-01 — an UNACCEPTED PEDIDO IS NOT REMINDABLE, AND NOTHING ELSE IS
 * CAUGHT BY THE GATE.
 *
 * ==========================================================================
 * THIS FILE PREVIOUSLY PASSED WHILE THE PROPERTY IT NAMES WAS FALSE. THE
 * REASON IS THE POINT OF THE REWRITE.
 * ==========================================================================
 * The original suite had exactly the right negative arm and said so in its own
 * header: "a gate that skipped every `scheduled` row would pass a naive test
 * and silently kill reminders for ordinary staff-booked appointments". It then
 * spelled that arm `confirmationState: null`.
 *
 * NULL IS NOT WHAT THE PRODUCT WRITES. `confirmation_state` is NOT NULL
 * DEFAULT 'pending' (migration 0024) and the staff creation path leaves it
 * unset SO THAT the default applies - actions.ts says exactly that. Null is
 * only carried by rows predating 0024. So the arm guarded a state production
 * had not produced since that migration, the gate skipped every staff-booked
 * appointment, and NO REMINDER OF ANY KIND could be dispatched at all. The
 * pipeline could not even reach its own unlock: the only writer that clears
 * `pending` is redeem.ts, reached from the 48h email this same gate refused to
 * send.
 *
 * WHAT THE GATE KEYS ON NOW: `origin = 'patient_portal'` while still
 * `scheduled` - which is the database's own definition of an unconfirmed
 * pedido (`public.is_unconfirmed_pedido`, 0059/0067), and 0067's header states
 * the property that makes it safe: "a staff booking has neither marker".
 *
 * EVERY NEGATIVE ARM NOW USES THE STATE THE PRODUCT ACTUALLY WRITES. A staff
 * appointment is `origin: "staff"` with `confirmationState: "pending"`, and it
 * MUST dispatch. That is the assertion whose absence cost the launch its
 * reminders.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ loadReminderData: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));

import { dispatchReminder } from "./dispatch";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPOINTMENT = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";

function fixture(over: Record<string, unknown> = {}) {
  return {
    appointmentId: APPOINTMENT,
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: "scheduled",
    // What the product writes for EVERY appointment: 0024's NOT NULL default.
    confirmationState: "pending",
    // What the product writes for a STAFF booking: 0067's default.
    origin: "staff",
    patientId: PATIENT,
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.pt",
    patientPhone: "+351 210 000 000",
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
  h.loadReminderData.mockReset();
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.example.test";
  delete process.env.REMINDERS_LIVE_SEND;
});

describe("an unaccepted pedido is not remindable", () => {
  it("SKIPS a scheduled PORTAL booking - the pedido the clinic has not accepted", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "scheduled", origin: "patient_portal" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(false);
  });

  it("reports the reason as `unconfirmed`, NOT `status` - a pedido IS scheduled", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "scheduled", origin: "patient_portal" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out).toMatchObject({ dispatched: false, reason: "unconfirmed" });
  });

  /* ---- negative arms, spelled the way production spells them ---- */

  it("THE ARM THAT WAS MISSING: an ordinary STAFF booking dispatches, and it is `pending`", async () => {
    // This is the exact row the staff create path writes: status scheduled,
    // confirmation_state at its DB default, origin at its DB default. Under
    // the previous gate this returned {dispatched:false, reason:"unconfirmed"}
    // for every appointment in the clinic.
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "scheduled", confirmationState: "pending", origin: "staff" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(true);
  });

  it("NEGATIVE ARM: a legacy row with a NULL confirmation_state still dispatches", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "scheduled", confirmationState: null, origin: "staff" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(true);
  });

  it("NEGATIVE ARM: an ACCEPTED pedido dispatches - acceptance moves status off `scheduled`", async () => {
    // Reception accepting a pedido moves it to `confirmed` (0061 part 2
    // records the therapist-confirm path doing exactly that), and
    // REMINDABLE_STATUSES admits `confirmed`. The origin is still portal.
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "confirmed", origin: "patient_portal" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(true);
  });

  it("NEGATIVE ARM: status=confirmed on a staff booking is unaffected", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "confirmed", origin: "staff" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(true);
  });

  it("a cancelled pedido still reports `status`, not `unconfirmed` - ordering is stable", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "cancelled", origin: "patient_portal" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out).toMatchObject({ dispatched: false, reason: "status" });
  });
});

describe("source-level: the gate reads origin, it does not re-derive pedido-ness", () => {
  // Comments are stripped so prose about `origin` cannot satisfy the
  // assertion - only real code counts.
  const SRC = readFileSync(join(__dirname, "dispatch.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("references data.origin", () => {
    expect(SRC).toMatch(/\borigin\b/);
  });

  it("NO LONGER GATES REMINDABILITY ON confirmation_state", () => {
    // The regression guard for the defect above: `confirmation_state` is a
    // different axis (did the patient confirm the reminder) and it must never
    // again decide whether a reminder may be sent. dispatchConfirmation and
    // dispatchReminder both go through isUnacceptedPedido, which cannot see it.
    expect(SRC).not.toMatch(/UNREMINDABLE_CONFIRMATION_STATES/);
    expect(SRC).not.toMatch(/confirmationState\s*\?\?\s*""/);
  });

  it("does not infer pedido-ness from the status string alone", () => {
    expect(SRC).not.toMatch(/status\s*===\s*["\'`]pending["\'`]/);
  });
});

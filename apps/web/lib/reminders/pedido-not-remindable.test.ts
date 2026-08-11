/**
 * W13-C — an UNCONFIRMED PEDIDO IS NOT REMINDABLE.
 *
 * THE DEFECT THIS PINS, stated as behaviour rather than as a line number. A
 * pedido de marcacao is `status = 'scheduled'` with `confirmation_state =
 * 'pending'`. `REMINDABLE_STATUSES` admits `scheduled`, so before this gate the
 * dispatcher treated an unconfirmed request as a live appointment and sent the
 * patient a reminder for something the clinic had not agreed to.
 *
 * WHY IT BECAME URGENT RATHER THAN COSMETIC. JP ruled on D1 that unconfirmed
 * pedidos stack on one slot with NO CAP (migration 0059's header). With no cap,
 * N patients hold a pending pedido on the same therapist and slot, and every one
 * of them would have been reminded that their appointment is tomorrow.
 * docs/rulings/R10-reminders-skip-unconfirmed-pedidos.md.
 *
 * THE NEGATIVE ARMS ARE THE POINT, and each names the wrong fix it refuses:
 *   - `confirmed` and `scheduled` with a null or non-pending state STILL send.
 *     A gate that skipped every `scheduled` row would pass a naive test and
 *     silently kill reminders for ordinary staff-booked appointments.
 *   - the skip reason is `unconfirmed`, NOT `status`. Collapsing them would hide
 *     which gate fired, and a pedido IS `scheduled`, so the log would say the
 *     status was wrong when it was not.
 *   - a SOURCE-LEVEL arm proves the check reads `confirmationState` rather than
 *     re-deriving pending-ness from `status`, which is the shortcut that would
 *     reintroduce the defect from the other direction.
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
    confirmationState: null,
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

describe("an unconfirmed pedido is not remindable", () => {
  it("SKIPS a scheduled appointment whose confirmation_state is pending", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "scheduled", confirmationState: "pending" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(false);
  });

  it("reports the reason as `unconfirmed`, NOT `status` - a pedido IS scheduled", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "scheduled", confirmationState: "pending" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out).toMatchObject({ dispatched: false, reason: "unconfirmed" });
  });

  // ---- negative arms: the gate must not swallow ordinary appointments ----

  it("NEGATIVE ARM: a scheduled appointment with a NULL state still dispatches", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "scheduled", confirmationState: null }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(true);
  });

  it("NEGATIVE ARM: a CONFIRMED pedido still dispatches", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "scheduled", confirmationState: "confirmed" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(true);
  });

  it("NEGATIVE ARM: status=confirmed is unaffected by the new gate", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "confirmed", confirmationState: null }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out.dispatched).toBe(true);
  });

  it("a cancelled pedido still reports `status`, not `unconfirmed` - ordering is stable", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ status: "cancelled", confirmationState: "pending" }),
    );
    const out = await dispatchReminder(TENANT, APPOINTMENT, "24h", "sms");
    expect(out).toMatchObject({ dispatched: false, reason: "status" });
  });
});

describe("source-level: the gate reads confirmationState, it does not re-derive it", () => {
  // Comments are stripped so prose about `confirmation_state` cannot satisfy the
  // assertion - only real code counts.
  const SRC = readFileSync(join(__dirname, "dispatch.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("references data.confirmationState", () => {
    expect(SRC).toMatch(/data\.confirmationState/);
  });

  it("does not infer pending-ness from the status string", () => {
    expect(SRC).not.toMatch(/status\s*===\s*["'`]pending["'`]/);
  });
});

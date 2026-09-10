/**
 * soft-delete-suppression.test.ts — SEC-reminder-path-ignores-soft-delete.
 *
 * ==========================================================================
 * THE DEFECT, AND WHY IT WAS URGENT RATHER THAN TIDY
 * ==========================================================================
 * `loadReminderData` did not SELECT `deleted_at`, and `dispatchReminder` gated
 * on status, pedido, channel, tenant config and the patient's own reminder
 * flags - never on deletion. So a soft delete did not stop a reminder.
 *
 * AND THE PIPELINE IS EVENT-SCHEDULED, NOT SCANNED. `scheduleAppointmentReminders`
 * fires at BOOKING time and sleeps until due, so every future appointment's
 * messages were already in flight; a later soft delete cancelled nothing and
 * re-checked nothing. With REMINDERS_LIVE_SEND true in production, the only
 * remaining gate was a query that did not look at the column.
 *
 * ==========================================================================
 * WHAT THIS FILE PROVES, AND THE SECOND HALF IS THE POINT
 * ==========================================================================
 * 1. THE SUPPRESSION HAPPENS - nothing is sent, on all four dispatch paths.
 * 2. THE SUPPRESSION IS OBSERVABLE - it carries its own outcome reason,
 *    `patient_deleted`, never folded into `not_found`, AND it writes a log line
 *    in the shape the reminder path already uses for its other skips.
 *
 * A suppression that cannot be told apart from a no-op is not a suppression
 * anybody can rely on. `not_found` is what RLS returns for an appointment in
 * another tenant - routine and uninteresting - and collapsing the two would
 * hide the one outcome that matters inside the one that never does.
 * LE-suppression-observation is open on exactly this: seeing a suppression
 * happen, rather than believing it did.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const h = vi.hoisted(() => ({ loadReminderData: vi.fn(), email: [] as unknown[], sms: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      h.email.push(m);
      return actual.sendEmail(m);
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.sms.push(m);
      return actual.sendSms(m);
    }),
  };
});

import {
  dispatchConfirmation,
  dispatchFollowUp,
  dispatchNoShow,
  dispatchReminder,
} from "./dispatch";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_ID = "33333333-3333-3333-3333-333333333333";
const STARTS_AT = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

/** A patient reachable on both channels, with every gate ahead of the delete
 *  check set to PASS. That is deliberate: if any other gate were closed the
 *  suppression would be untestable, because something else would stop the send
 *  and the test would pass for the wrong reason. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    appointmentId: APPOINTMENT_ID,
    startsAt: STARTS_AT,
    status: "confirmed",
    confirmationState: "confirmed",
    origin: "patient_portal",
    patientId: PATIENT_ID,
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.pt",
    patientPhone: "+351 912 345 678",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    practitionerName: "Dr. João Pereira",
    locationName: "Linda-a-Velha",
    locationPhone: "+351 210 000 000",
    tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
    patientHasAcceptedTerms: true,
    patientDeletedAt: null,
    ...overrides,
  };
}

const DELETED = new Date("2026-09-01T10:00:00.000Z");

beforeEach(() => {
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://osteojp.pt";
  h.loadReminderData.mockReset();
  h.email.length = 0;
  h.sms.length = 0;
});

describe("a soft-deleted patient gets no message, on any path", () => {
  /* ================================================================== */
  /* THE POSITIVE CONTROL FIRST. Without it every assertion below could  */
  /* pass over a fixture that was never going to send anything.          */
  /* ================================================================== */
  it("CONTROL: the SAME fixture, alive, DOES send", async () => {
    h.loadReminderData.mockResolvedValue(row());
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");
    expect(outcome.dispatched, "the control must send, or the suppression proves nothing").toBe(
      true,
    );
    expect(h.sms).toHaveLength(1);
  });

  const paths = [
    ["reminder", () => dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")],
    ["confirmation", () => dispatchConfirmation(TENANT_ID, APPOINTMENT_ID)],
    ["followup", () => dispatchFollowUp(TENANT_ID, APPOINTMENT_ID)],
    ["noshow", () => dispatchNoShow(TENANT_ID, APPOINTMENT_ID)],
  ] as const;

  for (const [kind, run] of paths) {
    it(`${kind}: suppressed, with reason patient_deleted and NOTHING sent`, async () => {
      // The status is set to whatever THAT path requires, so the delete check is
      // the only thing that can be stopping it.
      const status =
        kind === "followup" ? "completed" : kind === "noshow" ? "no_show" : "confirmed";
      h.loadReminderData.mockResolvedValue(row({ status, patientDeletedAt: DELETED }));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const outcome = await run();

        expect(outcome).toEqual({ dispatched: false, reason: "patient_deleted" });
        expect(h.sms, "a soft-deleted patient must receive no SMS").toHaveLength(0);
        expect(h.email, "a soft-deleted patient must receive no email").toHaveLength(0);

        // ============================================================== //
        // THE OBSERVABILITY HALF. A return value is not an observation.   //
        // ============================================================== //
        const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
        expect(logged, "the suppression wrote no log line - nobody can see it happen").toContain(
          "patient_deleted",
        );
        expect(logged).toContain("[reminders]");
        expect(logged).toContain(kind);
        expect(logged).toContain(`tenantId=${TENANT_ID}`);
        expect(logged).toContain(`appointmentId=${APPOINTMENT_ID}`);
        expect(logged).toContain(`patientId=${PATIENT_ID}`);

        // IDS ONLY. CLAUDE.md rule 7: this line goes to a log aggregator.
        expect(logged, "the log line leaked the patient name").not.toContain("Madalena");
        expect(logged, "the log line leaked the phone number").not.toContain("912");
        expect(logged, "the log line leaked the email").not.toContain("@example.pt");
      } finally {
        warn.mockRestore();
      }
    });
  }

  it("it is NOT folded into not_found, and the two stay distinguishable", async () => {
    // ==================================================================
    // THE RULING, ASSERTED. Filtering `deleted_at IS NULL` in the query
    // would have suppressed the send and reported `not_found` - the same
    // outcome RLS gives for another tenant's appointment. Both arms are
    // here so a future "simplification" that merges them reddens.
    // ==================================================================
    h.loadReminderData.mockResolvedValue(null); // what RLS returns out of tenant
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")).toEqual({
      dispatched: false,
      reason: "not_found",
    });

    h.loadReminderData.mockResolvedValue(row({ patientDeletedAt: DELETED }));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")).toEqual({
      dispatched: false,
      reason: "patient_deleted",
    });
  });

  it("the delete check runs BEFORE the status check, so a deleted patient never reports `status`", async () => {
    // Ordering matters for the log, not for the outcome. A cancelled appointment
    // belonging to a deleted patient is BOTH; reporting `status` would hide the
    // deletion, and the deletion is the fact somebody needs to see.
    h.loadReminderData.mockResolvedValue(row({ status: "cancelled", patientDeletedAt: DELETED }));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")).toEqual({
      dispatched: false,
      reason: "patient_deleted",
    });
  });
});

describe("the gate cannot be bypassed by a fifth dispatcher", () => {
  const SRC = path.join(__dirname, "dispatch.ts");
  const src = fs.readFileSync(SRC, "utf8");

  it("ONE call to loadReminderData in the whole file, and it is inside the shared door", () => {
    // ==================================================================
    // THE STRUCTURAL ASSERTION, AND IT IS THE ONE THAT LASTS
    // ==================================================================
    // The four behavioural tests above cover the four dispatchers that exist
    // today. They say nothing about the fifth, and the fifth is the one that
    // sends the message nobody expected. This says the gate is not something a
    // new dispatcher has to REMEMBER - it is the only way in.
    const calls = src.match(/loadReminderData\(/g) ?? [];
    // One import reference plus exactly one call site.
    expect(
      calls.length,
      "dispatch.ts calls loadReminderData more than once - a dispatcher is bypassing " +
        "loadDispatchable and therefore the soft-delete gate",
    ).toBe(1);

    const doorAt = src.indexOf("async function loadDispatchable(");
    const callAt = src.indexOf("loadReminderData(", src.indexOf("async function loadDispatchable("));
    expect(doorAt, "loadDispatchable is gone").toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(doorAt);
  });

  /**
   * AMENDED BY OBS-04, AND THE PROPERTY IS UNCHANGED.
   *
   * This case read the first 600 characters after each `export async function`
   * and required `loadDispatchable(` in them. `dispatchReminder` is now a thin
   * LEDGER WRAPPER that delegates to `dispatchReminderInner`, so the gate is one
   * function further down and the literal scan stopped finding it - correctly,
   * on its own terms: it cannot see through a delegation.
   *
   * WHAT IT IS REALLY GUARDING is that no exported dispatcher can reach a send
   * without passing the soft-delete door. So it now follows ONE level of
   * delegation, and only to a callee it can name and locate. A dispatcher that
   * neither gates nor delegates still fails, which is the fifth-dispatcher case
   * this exists for. A dispatcher that delegates to something that does not gate
   * fails too, because the callee is then checked by the same rule.
   */
  it("all four exported dispatchers go through it, directly or by one named delegation", () => {
    const gatedBody = (at: number): boolean => src.slice(at, at + 600).includes("loadDispatchable(");

    for (const fn of [
      "dispatchReminder",
      "dispatchConfirmation",
      "dispatchFollowUp",
      "dispatchNoShow",
    ]) {
      const at = src.indexOf(`export async function ${fn}(`);
      expect(at, `${fn} is gone`).toBeGreaterThan(-1);
      if (gatedBody(at)) continue;

      // Not gated directly: it must delegate to exactly one named inner function
      // in this same file, and THAT one must be gated.
      const body = src.slice(at, at + 600);
      const delegate = body.match(/await (\w*Inner)\(/)?.[1];
      expect(
        delegate,
        `${fn} neither calls loadDispatchable nor delegates to a *Inner function - ` +
          `it can send to a soft-deleted patient`,
      ).toBeTruthy();

      const innerAt = src.indexOf(`async function ${delegate}(`);
      expect(innerAt, `${fn} delegates to ${delegate}, which does not exist`).toBeGreaterThan(-1);
      expect(
        gatedBody(innerAt),
        `${fn} delegates to ${delegate}, which does not call loadDispatchable - ` +
          `it can send to a soft-deleted patient`,
      ).toBe(true);
    }
  });

  it("the query still SELECTS the column the gate reads", () => {
    // ==================================================================
    // THE ONE THE TRUTHY PREDICATE MAKES NECESSARY
    // ==================================================================
    // `if (data.patientDeletedAt)` treats a MISSING field as "alive", which is
    // what keeps a fixture from suppressing every send. The cost is that
    // dropping the column from the select would silently disarm the gate and no
    // behavioural test would notice - every fixture supplies the field itself.
    // So the select is asserted directly, at the source.
    const data = fs.readFileSync(path.join(__dirname, "data.ts"), "utf8");
    expect(
      data,
      "loadReminderData no longer selects patients.deletedAt - the soft-delete gate is now blind",
    ).toContain("patientDeletedAt: patients.deletedAt");
  });
});

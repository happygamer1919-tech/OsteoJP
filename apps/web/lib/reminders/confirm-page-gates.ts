import type { EnvSource } from "@osteojp/notify";
import { resolveApproved } from "@osteojp/notify";
import { FEE_NOTICE_FLAG, FEE_NOTICE_TEMPLATE_ID } from "./fee-notice";
import { webRegistry } from "./notification-registry";

// THE TWO GATES ON THE CONFIRM PAGE. Pure module — no DB, no `server-only`, so
// both arms are testable without a request.
//
// Each function returns an ANSWER. The page consumes answers and never the
// inputs, which is what keeps a second, drifting copy of either rule out of the
// JSX — the same discipline `SmsAdditions` enforces in templates.ts.

/**
 * ==========================================================================
 * GATE ONE - THE RESCHEDULE BUTTON. CLOSED AGAIN, 2026-09-04.
 * INC-CONFIRM-10-pedido-reached-nobody.
 * ==========================================================================
 * THE OWNER PRESSED IT ON A REAL LINK AND IT REACHED NOBODY. He was shown
 * "Pedido recebido"; neither reception nor the therapist received anything.
 *
 * WHAT THE PRESS ACTUALLY WRITES, read from `confirm-redeem.ts` rather than
 * inferred from the symptom. Exactly two things:
 *   1. `consumed_at` on the appointment_confirm_codes row; and
 *   2. one `audit_log` row, `appointment.reschedule_request.sms_code`.
 * It sets no `origin`, changes no `status`, writes no `staff_notifications`
 * row and calls no emitter. `audit_log` is not a screen.
 *
 * ==========================================================================
 * THE COMMENT THAT USED TO BE HERE WAS FALSE, AND IT IS WHY THIS WAS ARMED
 * ==========================================================================
 * It said reception's queue is derived from "`appointments.origin` - THE ROW
 * THE PATIENT'S PRESS WRITES - so the queue no longer depends on a
 * notification arriving. The condition the gate names is met, so the gate
 * opens."
 *
 * THE PRESS WRITES NO SUCH ROW. SR-31 and #1107 derived reception's queue from
 * `appointments.origin`, and that work was real and is untouched - but it
 * answers "which portal BOOKINGS is reception yet to accept". The gate was
 * opened as though it also covered RESCHEDULE REQUESTS against appointments
 * that already exist. It never did.
 *
 * AND THE STAFF-CREATED APPOINTMENT IS NOT THE REASON, though it is the first
 * thing the symptom suggests. `listPendingRequests` selects
 * `origin = 'patient_portal' AND status = 'scheduled'`, so a PORTAL-created
 * appointment would already have been in that queue before the patient pressed
 * anything, and pressing would have changed nothing about how it renders. The
 * failure is not a mis-set column. There is no row anywhere in the schema that
 * represents "this patient asked to move an existing appointment".
 *
 * ==========================================================================
 * WHAT REOPENING IT REQUIRES, so the next terminal does not flip it back on a
 * comment the way the last one did
 * ==========================================================================
 * THREE THINGS, and the third is not optional:
 *   1. a DURABLE row that represents the request itself, written in the
 *      patient's own transaction so it cannot be lost, and INDEPENDENT OF
 *      `origin` - a staff-created appointment must produce one too;
 *   2. that row rendered in reception's queue, and a staff notification to the
 *      TREATING THERAPIST; and
 *   3. the OWNER re-testing it on the deployed app. Not green CI: what failed
 *      here is a fact about which screens exist, and CI asserted the button
 *      worked while nothing displayed its output.
 *
 * A GATE CLOSED IN THE SAME COMMIT AS THE DIAGNOSIS, not after it. Hiding the
 * control is the smaller half; the constant gates the ACTION too, so anybody
 * holding the URL is refused as well.
 *
 * ==========================================================================
 * 2026-09-06: CONDITIONS 1 AND 2 ARE NOW MET. THIS IS STILL false, ON PURPOSE.
 * ==========================================================================
 * Migration 0080 created `appointment_reschedule_requests`, and
 * `confirm-redeem.ts` writes a row into it INSIDE THE PATIENT'S OWN
 * TRANSACTION — the same transaction as the audit row, so if it does not commit
 * the patient is not told the request was received. It is independent of
 * `origin`: a staff-created appointment produces one exactly like a portal
 * booking. `/notificacoes` renders the queue, and 0080's policy scopes it by
 * EXISTS against `appointments`, so reception sees their locations' requests
 * and BOTH practitioners see their own — the owner's 2026-09-04 ruling, true by
 * construction rather than by a fan-out that could half-fail.
 *
 * CONDITION 3 IS THE OWNER'S AND IT HAS NOT HAPPENED. He re-tests the control
 * on the deployed /c/<code> route. That is the whole of what is left, and it is
 * why flipping this to `true` is a SEPARATE, ONE-LINE CHANGE rather than part of
 * the commit that built the durable half.
 *
 * THE ORDERING IS AWKWARD AND IS NAMED RATHER THAN QUIETLY RESOLVED: this
 * constant gates the ACTION as well as the render, so he cannot exercise the
 * button while it is false. Flipping it is therefore what makes his test
 * possible, and his test is what justifies the flip. The safe order is: flip,
 * he presses, the row appears on /notificacoes — and if it does not, revert one
 * line. What must NOT happen is this flipping as a side effect of shipping the
 * durable half, which is exactly how it was armed on a false comment last time.
 */
export const PEDIDO_QUEUE_IS_DURABLE = false;

/** Whether the page may offer *Pedir remarcação*. */
export function rescheduleButtonEnabled(): boolean {
  return PEDIDO_QUEUE_IS_DURABLE;
}

/**
 * ==========================================================================
 * GATE TWO — THE FEE SLOT, WHICH RENDERS NOTHING TODAY
 * ==========================================================================
 * JP's option A: the fee sentence moved off the SMS (it does not fit beside the
 * link — 132 + LF + 53 is over one segment) and onto this page, where there is
 * room. It is still blocked on JP packet 5.2 AND counsel, and the owner's own
 * reasoning is the sharper half: presenting a charge term at the moment a
 * patient confirms is arguably a HARDER legal question than an SMS notice, not
 * an easier one.
 *
 * TWO LOCKS, AND THE SECOND IS NOT A FLAG. The flag arms the operator's
 * intention; `approved: true` in the notification registry is counsel's and
 * JP's. `FEE_NOTICE_TEMPLATE_ID` is registered `approved: false`, so this
 * answers false today whatever the flag says — and a slot that renders nothing
 * is the whole of what shipped.
 */
export function confirmPageFeeNotice(env: EnvSource = process.env): boolean {
  if (env[FEE_NOTICE_FLAG] !== "true") return false;
  return resolveApproved(webRegistry, FEE_NOTICE_TEMPLATE_ID, "sms") !== null;
}

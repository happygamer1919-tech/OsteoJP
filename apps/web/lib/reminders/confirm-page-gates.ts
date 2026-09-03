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
 * GATE ONE — THE RESCHEDULE BUTTON. ARMED IN THIS PR, WITH THE QUEUE.
 * ==========================================================================
 * *Pedir remarcação* emits a request into reception's queue. The gate existed
 * because that queue was derived from the NOTIFICATION rather than from the
 * appointment, and the notification emit is BEST-EFFORT: when it was lost, the
 * request existed, nobody was told, and the patient had already been shown
 * "pedido recebido".
 *
 * A patient in that state will not telephone — they believe they have asked —
 * so the request was lost in a way that is worse than the button not existing.
 * INC-06 is the precedent: portal pedidos reached a stub consumer in
 * production, invisible to reception AND blocking the slot.
 *
 * WHAT CHANGED IS THE DERIVATION, WHICH IS THE PREMISE THE GATE RESTED ON.
 * The other half of this same PR derives reception's pending-request queue from
 * `appointments.origin` — the row the patient's press writes — so the queue no
 * longer depends on a notification arriving. The condition the gate names is
 * met, so the gate opens.
 *
 * IT IS FLIPPED IN THE SAME COMMIT-RANGE AS THE DERIVATION, NOT AFTER IT, and
 * that is deliberate rather than convenient: shipping the queue first and the
 * button later leaves a window in which the durable queue exists and nothing
 * feeds it, and shipping the button first is exactly the defect above. One
 * merge moves both, so neither arm is ever live alone.
 *
 * THE CONSTANT STAYS. It is still the one control both the render and the
 * action read, and `confirm-page-gates.test.ts` still asserts both arms.
 */
export const PEDIDO_QUEUE_IS_DURABLE = true;

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

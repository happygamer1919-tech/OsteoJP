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
 * GATE ONE — THE RESCHEDULE BUTTON, HIDDEN UNTIL #1107 MERGES
 * ==========================================================================
 * *Pedir remarcação* emits a request into reception's queue. Until #1107, that
 * queue is derived from the NOTIFICATION rather than from the appointment, and
 * the notification emit is BEST-EFFORT: when it is lost, the request exists,
 * nobody is told, and the patient has already been shown "pedido recebido".
 *
 * A patient in that state will not telephone — they believe they have asked —
 * so the request is lost in a way that is worse than the button not existing.
 * INC-06 is the precedent: portal pedidos reached a stub consumer in
 * production, invisible to reception AND blocking the slot.
 *
 * SO THE BUTTON IS GATED IN CODE, NOT DESCRIBED IN A COMMENT. A comment saying
 * "do not ship this yet" is not a control; this constant is. Flip it in the
 * same commit that observes #1107 on main, and `confirm-page-gates.test.ts`
 * asserts BOTH arms so flipping it is a decision somebody makes rather than a
 * default nobody revisits.
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

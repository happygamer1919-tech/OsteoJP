"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  RULES,
  checkDurableRateLimit,
  clientKeyFromHeaders,
  createDurableRateLimitStore,
} from "@osteojp/rate-limit";
import { redeemConfirmCode, type ConfirmAction } from "@/lib/reminders/confirm-redeem";
import { rescheduleButtonEnabled } from "@/lib/reminders/confirm-page-gates";

// The two server actions behind /c/<code>.
//
// EXECUTION ONLY HAPPENS HERE. Opening the link renders a page and performs
// nothing — counsel section 7's one-tap-to-open, one-tap-to-act. A GET that
// mutated would be executed by any link prefetcher or mail scanner that touched
// the URL, and an SMS link is followed by more scanners than an email one.

const ACTIONS = new Set<ConfirmAction>(["confirm", "pedido"]);

/**
 * SR-06: the IP is captured SERVER-SIDE, from the proxy headers, and is never a
 * value the form could name. Null rather than a guess when no header is
 * present: an audit field that silently records the load balancer is worse than
 * one that honestly records nothing. Only the FIRST x-forwarded-for hop is the
 * client; the rest are appended by intermediaries.
 */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  return h.get("x-real-ip")?.trim() || null;
}

export async function confirmCodeAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  const raw = String(formData.get("action") ?? "");
  const action = raw as ConfirmAction;

  // Shape first, and it costs no budget. An attacker cannot exhaust a real
  // patient's allowance with garbage that never reaches a query — the ordering
  // apps/api's OTP route and /r/[token] both settled on.
  if (!code || !ACTIONS.has(action)) redirect(`/c/${encodeURIComponent(code)}?r=generic`);

  // THE BUTTON IS HIDDEN, AND THE ACTION IS REFUSED TOO. A gate that only hides
  // a control is a gate on the RENDER, not on the write: the form posts to a
  // public endpoint and hiding a button removes nothing from anybody holding
  // the URL. Both halves check, and they check the same constant.
  if (action === "pedido" && !rescheduleButtonEnabled()) {
    redirect(`/c/${encodeURIComponent(code)}?r=generic`);
  }

  const verdict = await checkDurableRateLimit(
    clientKeyFromHeaders(await headers(), "c-code"),
    RULES.tokenRedeem,
    createDurableRateLimitStore(),
  );
  if (!verdict.ok) {
    // NOT a 429, and this is SR-30 rather than a shortcut: a distinguishable
    // "you are rate limited" response is a new signal on the one surface built
    // to emit none, and it tells a prober their earlier attempts registered.
    // Same generic outcome as every other refusal.
    redirect(`/c/${encodeURIComponent(code)}?r=generic`);
  }

  const result = await redeemConfirmCode({
    code,
    action,
    now: new Date(),
    ip: await clientIp(),
  });

  // The outcome travels as a query flag rather than in a session, because there
  // is no session: a code is not a login and must not become one.
  redirect(`/c/${encodeURIComponent(code)}?r=${result.outcome}`);
}

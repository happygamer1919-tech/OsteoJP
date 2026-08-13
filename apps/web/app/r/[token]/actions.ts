"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  RULES,
  checkDurableRateLimit,
  clientKeyFromHeaders,
  createDurableRateLimitStore,
} from "@osteojp/rate-limit";
import { redeemActionToken, type RedeemAction } from "@/lib/reminders/redeem";

// The single server action behind the token landing page's confirmation screen.
//
// EXECUTION ONLY HAPPENS HERE. Opening a link renders a page and performs
// nothing; counsel section 7 requires one tap to open and one tap to confirm.
// This action is the second tap, and it is a POST - a GET that mutated would be
// executed by any link prefetcher or mail-scanner that touched the URL.

/** Actions the form may name. Anything else is not an action at all. */
const ACTIONS = new Set<RedeemAction>(["confirm", "cancel"]);

/**
 * Best-effort client IP for the audit row (counsel section 8).
 *
 * Null rather than a guess when no proxy header is present: an audit field that
 * silently records the load balancer, or an empty string, is worse than one that
 * honestly records nothing. Only the FIRST x-forwarded-for hop is read - the
 * rest are appended by intermediaries and are not the client.
 */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first;
  return h.get("x-real-ip")?.trim() || null;
}

export async function redeemAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const raw = String(formData.get("action") ?? "");

  if (!token || !ACTIONS.has(raw as RedeemAction)) {
    // Indistinguishable from every other refusal, per counsel section 3.
    redirect(`/r/${encodeURIComponent(token)}?r=refused`);
  }

  // ================================================================= //
  // THE FIRST RATE LIMIT IN apps/web. SEC-r-token-no-rate-limit.
  // ================================================================= //
  // Until 2026-08-13 there was NO limiter anywhere in this application - not a
  // route missing one, an entire app with no limiting concept - while this
  // action sat on the PUBLIC, UNAUTHENTICATED, patient-facing domain and hit the
  // database on every request.
  //
  // LIMITED AFTER THE SHAPE CHECK AND BEFORE THE DATABASE, deliberately. A
  // malformed submission is refused above without spending budget, so an
  // attacker cannot exhaust a real patient's allowance with garbage that never
  // reaches a query. This is the same ordering apps/api's OTP route settled on
  // for the same reason.
  //
  // WHAT IT DOES NOT CLAIM. The token is 128 bits and is not brute-forceable at
  // any rate; a GET performs nothing, because opening a link renders and only
  // this POST mutates. This is defence in depth and a cost control. The card is
  // explicit that it must not be read as plugging a live hole.
  const verdict = await checkDurableRateLimit(
    clientKeyFromHeaders(await headers(), "r-token"),
    RULES.tokenRedeem,
    createDurableRateLimitStore(),
  );
  if (!verdict.ok) {
    // NOT a 429, and that is the counsel-section-3 constraint rather than a
    // shortcut. This is a server action behind a form on a page that renders one
    // generic outcome for every refusal - bad token, expired, forged, unknown,
    // already spent. A distinguishable "you are rate limited" response would be
    // a new signal on the one surface designed to emit none, and it would tell a
    // prober that their previous attempts registered.
    //
    // So it takes the SAME `refused` path every other rejection takes. The
    // patient sees the same page; the attacker learns nothing; and the database
    // work is skipped, which is the point of the control.
    redirect(`/r/${encodeURIComponent(token)}?r=refused`);
  }

  const result = await redeemActionToken({
    token,
    action: raw as RedeemAction,
    now: new Date(),
    ip: await clientIp(),
  });

  // The outcome travels as a query flag rather than in the session, because
  // there is no session: a token is not a login and must not become one.
  const flag =
    result.outcome === "success"
      ? result.action === "confirm"
        ? "confirmed"
        : "cancelled"
      : result.outcome === "cutoff"
        ? "cutoff"
        : "refused";

  redirect(`/r/${encodeURIComponent(token)}?r=${flag}`);
}

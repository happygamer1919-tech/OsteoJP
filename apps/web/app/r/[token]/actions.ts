"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

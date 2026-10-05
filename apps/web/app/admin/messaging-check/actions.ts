"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  RULES,
  checkDurableRateLimit,
  clientKeyFromHeaders,
  createDurableRateLimitStore,
} from "@osteojp/rate-limit";
import { getRequestContext } from "@/lib/auth/context";
import { sendMessagingCheck } from "@/lib/reminders/messaging-check";
import { messagingCheckRedirect } from "./outcome";

// The owner's delivery test, as a server action.
//
// THREE GATES, IN THIS ORDER, AND THE ORDER IS THE POINT:
//   1. IDENTITY. Owner only, re-checked HERE and not merely at the route. A
//      server action is an endpoint: the page's gate hides a form, it does not
//      protect a POST.
//   2. RATE. Five a day. Checked before the send and after the identity check,
//      so an unauthorised caller cannot spend the owner's daily budget.
//   3. THE SEND, which costs money and lands on a real handset.
//
// WHY THE ROLE AND NOT A CAPABILITY. Every other owner-only surface in this app
// leans on a capability that happens to be owner-only (`patients:recover`).
// Reusing one here would say "whoever may recover a deleted patient may send an
// SMS", which is not a rule anybody decided. Adding a new capability is a change
// to the permission MODEL for one diagnostic page. The dispatch says "owner role
// only", so the check is the role, in one place, stated plainly.

export async function sendMessagingCheckAction(formData: FormData): Promise<void> {
  const actor = await getRequestContext();
  if (!actor) redirect("/login");
  if (actor.role !== "owner") redirect("/dashboard");

  const verdict = await checkDurableRateLimit(
    clientKeyFromHeaders(await headers(), "messaging-check"),
    RULES.messagingCheck,
    createDurableRateLimitStore(),
  );
  if (!verdict.ok) redirect("/admin/messaging-check?m=limited");

  const phone = String(formData.get("phone") ?? "").trim();
  const appointmentId = String(formData.get("appointmentId") ?? "").trim() || null;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip")?.trim() ?? null;

  const result = await sendMessagingCheck({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    phone,
    appointmentId,
    ip,
  });

  // ==========================================================================
  // THE WAY BACK CARRIES MARKERS, NEVER WORDS.
  // ==========================================================================
  // This used to put the provider's own error text on the URL as `&d=...`, so
  // the owner could read it on the page. Twilio writes the recipient into that
  // text, and a URL is the least private place in the system: browser history,
  // the platform's request logs, a pasted link. `messagingCheckRedirect` builds
  // the address from a closed set of values - a reason from the list, a
  // provider error code, a length, two flags - and the page turns them back
  // into sentences.
  redirect(messagingCheckRedirect(result));
}

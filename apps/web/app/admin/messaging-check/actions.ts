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

  if (!result.ok) {
    // The provider's reason travels back on the URL so the owner reads it on
    // the page rather than in a dashboard. Encoded, and capped, because it is
    // provider text rather than ours.
    const detail = result.detail ? `&d=${encodeURIComponent(result.detail.slice(0, 200))}` : "";
    redirect(`/admin/messaging-check?m=${result.reason}${detail}`);
  }
  // The outcome carries the two numbers worth reading on the way back: how long
  // the body was and whether the code was live.
  redirect(
    `/admin/messaging-check?m=sent&len=${result.length}&live=${result.codeWasLive ? "1" : "0"}`,
  );
}

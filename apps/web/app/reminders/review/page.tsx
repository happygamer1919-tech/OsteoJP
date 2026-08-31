import { EmptyState } from "@osteojp/ui";
import { MailWarning } from "lucide-react";

import { assertCan, ForbiddenError } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { remindersInboundEnabled } from "@/lib/reminders/inbound-config";
import {
  listReviewQueue,
  resolveReviewItem,
  type ResolveOutcome,
  type ReviewResolution,
} from "@/lib/reminders/inbound-store";

import { InboundReviewList } from "./inbound-review-list";

export const metadata = { title: s["remindersReview.title"] };

/**
 * Reception review list for inbound patient SMS replies (W14-06).
 *
 * ==========================================================================
 * THE PERMISSION CHANGED AND IT IS THE POINT OF THIS FILE'S REVIEW.
 * ==========================================================================
 * It was `appointments:read`, which EVERY role holds because every role works
 * the calendar - so the check passed for a therapist and gated nothing. That is
 * not a hypothetical failure mode: `guest_requests:read` exists in this repo
 * because exactly that mistake showed a therapist the whole tenant's guest
 * queue on deployed production. This page lists other patients' message text,
 * so it gets its own capability, `sms_replies:read`, and the resolve action
 * gets `sms_replies:resolve`.
 *
 * THE CAPABILITY IS THE FIRST GATE, NOT THE ONLY ONE. 0069's policies carry the
 * same role set, so a future page that forgets the check reads an empty queue
 * rather than someone else's correspondence.
 *
 * Still gated behind REMINDERS_INBOUND, which is OFF: the webhook that fills
 * this table is not armed and no Twilio number points at it yet.
 */
export default async function InboundReviewPage() {
  const actor = await requireRequestContext();

  try {
    assertCan(actor.role, "sms_replies:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return (
        <main className="min-h-dvh p-8">
          <p className="text-sm text-error">{s["errors.forbidden"]}</p>
        </main>
      );
    }
    throw e;
  }

  const header = (
    <header className="mb-6 flex flex-col gap-1">
      <h1 className="text-lg font-semibold text-v2-text-primary">
        {s["remindersReview.title"]}
      </h1>
      <p className="text-sm text-v2-text-secondary">{s["remindersReview.subtitle"]}</p>
    </header>
  );

  if (!remindersInboundEnabled()) {
    return (
      <main className="min-h-dvh p-8">
        {header}
        <EmptyState
          icon={MailWarning}
          title={s["remindersReview.disabledTitle"]}
          description={s["remindersReview.disabledHelp"]}
        />
      </main>
    );
  }

  const items = await listReviewQueue(actor);

  async function onResolve(
    itemId: string,
    resolution: ReviewResolution,
  ): Promise<ResolveOutcome> {
    "use server";
    // Re-verify server-side. The context is re-derived from the session and
    // never taken from the client, so a caller cannot supply a tenant or a
    // role — and the RESOLVE capability is checked separately from the read,
    // because moving a real appointment is a different act from seeing a list.
    const a = await requireRequestContext();
    assertCan(a.role, "sms_replies:resolve");
    return resolveReviewItem({ ctx: a, itemId, resolution });
  }

  return (
    <main className="min-h-dvh p-8">
      {header}
      <InboundReviewList items={items} onResolve={onResolve} />
    </main>
  );
}

import { EmptyState } from "@osteojp/ui";
import { MailWarning } from "lucide-react";

import { assertCan, ForbiddenError } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { remindersInboundEnabled } from "@/lib/reminders/inbound-config";
import {
  listReviewQueue,
  resolveReviewItem,
  type ReviewResolution,
} from "@/lib/reminders/inbound-store";

import { InboundReviewList } from "./inbound-review-list";

export const metadata = { title: s["remindersReview.title"] };

/**
 * Reception review list for inbound-SMS replies flagged "resposta por rever"
 * (R11 unmatched tier). Gated behind REMINDERS_INBOUND (OFF by default): the
 * inbound store + the review flag require a migration that is DEFERRED, so with
 * the flag OFF this shows a disabled state, and even with it ON the store is an
 * empty stub. The UI + the resolve actions are fully built for when the
 * migration lands.
 */
export default async function InboundReviewPage() {
  // OSTEOJP-WEB-8: the guard redirects on its own now, so the wrapper is
  // gone. It was not merely redundant - a bare `catch {}` here swallowed
  // NEXT_REDIRECT AND would have turned a real Auth outage into a silent
  // bounce to /login, reporting our failure as this person's logout.
  const actor = await requireRequestContext();

  try {
    assertCan(actor.role, "appointments:read");
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

  const items = await listReviewQueue(actor.tenantId);

  async function onResolve(itemId: string, resolution: ReviewResolution) {
    "use server";
    // Re-verify the actor server-side; never trust a client-supplied tenant.
    const a = await requireRequestContext();
    assertCan(a.role, "appointments:write");
    await resolveReviewItem({ tenantId: a.tenantId, itemId, resolution });
  }

  return (
    <main className="min-h-dvh p-8">
      {header}
      <InboundReviewList items={items} onResolve={onResolve} />
    </main>
  );
}

"use client";

import { Button, EmptyState, GlassCard } from "@osteojp/ui";
import { Ban, Check, Inbox, MailWarning } from "lucide-react";
import { useTransition } from "react";

import { s } from "@/lib/i18n";
import type {
  InboundReviewItem,
  ReviewResolution,
} from "@/lib/reminders/inbound-store";

// Reception review list for inbound replies flagged "resposta por rever" (R11
// unmatched tier). Presentation-only: it receives the queue + an onResolve
// callback (a server action, when mounted by the page). Storage is stubbed until
// the inbound-store migration, so in production the queue is empty and this
// renders its empty state — but the list + the three actions are fully built.

function formatReceivedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  }).format(new Date(iso));
}

export function InboundReviewList({
  items,
  onResolve,
}: {
  items: InboundReviewItem[];
  /** Resolve a review item. A server action when mounted by the page. */
  onResolve?: (itemId: string, resolution: ReviewResolution) => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={s["remindersReview.emptyTitle"]}
        description={s["remindersReview.emptyHelp"]}
      />
    );
  }

  function resolve(itemId: string, resolution: ReviewResolution) {
    if (!onResolve) return;
    startTransition(() => {
      void onResolve(itemId, resolution);
    });
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="inbound-review-list">
      {items.map((item) => (
        <li key={item.id}>
          <GlassCard>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                  <MailWarning size={14} strokeWidth={1.75} aria-hidden="true" />
                  {s["remindersReview.flag"]}
                </span>
                <span className="text-sm font-medium text-v2-text-primary">
                  {item.patientName ?? s["remindersReview.noPatient"]}
                </span>
                <span className="text-xs text-v2-text-secondary">
                  {s["remindersReview.receivedAt"]} {formatReceivedAt(item.receivedAt)}
                </span>
              </div>

              <p className="whitespace-pre-line rounded-v2 border border-v2-border bg-surface-muted px-3 py-2 text-sm text-v2-text-primary">
                {item.body}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={Check}
                  disabled={pending}
                  onClick={() => resolve(item.id, "confirmed")}
                >
                  {s["remindersReview.markConfirmed"]}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  iconLeft={Ban}
                  disabled={pending}
                  onClick={() => resolve(item.id, "cancelled")}
                >
                  {s["remindersReview.markCancelled"]}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => resolve(item.id, "read")}
                >
                  {s["remindersReview.markRead"]}
                </Button>
              </div>
            </div>
          </GlassCard>
        </li>
      ))}
    </ul>
  );
}

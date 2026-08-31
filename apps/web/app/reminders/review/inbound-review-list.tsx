"use client";

import { Button, EmptyState, GlassCard } from "@osteojp/ui";
import { Ban, Check, Inbox, MailWarning } from "lucide-react";
import { useState, useTransition } from "react";

import { s } from "@/lib/i18n";
import type {
  InboundReviewItem,
  ResolveOutcome,
  ReviewResolution,
} from "@/lib/reminders/inbound-store";

// Reception review list for inbound patient SMS replies (W14-06).
//
// A CLIENT COMPONENT ONLY FOR THE PENDING STATE AND THE PER-ROW FAILURE, the
// same shape the pedido queue uses (app/notificacoes/pending-requests.tsx). It
// holds no queue data: the list is a server prop re-derived from the database on
// every render, and a successful resolve calls revalidate so the row leaves
// because the DATA changed, not because this component removed it. A
// client-held copy of server state is a copy a reload disagrees with.
//
// THE FAILURE IS PER ROW, NOT PER PAGE. Confirming CAN fail on one reply - the
// 0061 exclusion constraint refuses a second confirmed overlap - while every
// other reply in the queue is still resolvable, so the message renders inside
// the row it belongs to and the rest of the list stays usable.

function stamp(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Lisbon",
  }).format(new Date(iso));
}

type RowState = "double_booked" | "not_found" | "no_appointment" | null;

export function InboundReviewList({
  items,
  onResolve,
}: {
  items: InboundReviewItem[];
  /** Resolve a review item. A server action when mounted by the page. */
  onResolve?: (
    itemId: string,
    resolution: ReviewResolution,
  ) => void | Promise<void | ResolveOutcome>;
}) {
  const [pending, startTransition] = useTransition();
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

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
    setRowState((prev) => ({ ...prev, [itemId]: null }));
    startTransition(async () => {
      const outcome = await onResolve(itemId, resolution);
      if (!outcome) return;
      if (!outcome.ok) {
        setRowState((prev) => ({ ...prev, [itemId]: outcome.reason }));
        return;
      }
      // RESOLVED BUT NOTHING MOVED. The reply matched no appointment, or the
      // one it matched is no longer `scheduled`. The row leaves the queue
      // either way, so this is said BEFORE it goes rather than swallowed:
      // "confirmada" that confirmed nothing is exactly the outcome a person
      // needs to know about.
      if (resolution !== "read" && !outcome.applied) {
        setRowState((prev) => ({ ...prev, [itemId]: "no_appointment" }));
      }
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
                  {s["remindersReview.receivedAt"]} {stamp(item.receivedAt)}
                </span>
              </div>

              {/* The appointment the reply was matched to, when there is one.
                  Reception cannot decide "confirmada" without knowing WHICH
                  appointment they are confirming. */}
              {item.appointmentStartsAt ? (
                <p className="text-xs text-v2-text-secondary">
                  {s["remindersReview.appointment"]} {stamp(item.appointmentStartsAt)}
                  {item.appointmentStatus ? ` · ${item.appointmentStatus}` : ""}
                </p>
              ) : (
                <p className="text-xs text-v2-text-secondary">
                  {s["remindersReview.noAppointment"]}
                </p>
              )}

              <p className="whitespace-pre-line rounded-v2 border border-v2-border bg-surface-muted px-3 py-2 text-sm text-v2-text-primary">
                {item.body}
              </p>

              {rowState[item.id] === "double_booked" && (
                <p role="status" className="text-xs text-error">
                  {s["remindersReview.doubleBooked"]}
                </p>
              )}
              {rowState[item.id] === "no_appointment" && (
                <p role="status" className="text-xs text-warning">
                  {s["remindersReview.nothingApplied"]}
                </p>
              )}
              {rowState[item.id] === "not_found" && (
                <p role="status" className="text-xs text-warning">
                  {s["remindersReview.alreadyResolved"]}
                </p>
              )}

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

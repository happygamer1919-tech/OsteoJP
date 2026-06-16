import { can } from "@osteojp/auth";
import {
  GlassCard,
  GlassStatusChip,
  SkeletonTable,
  type GlassStatusTone,
} from "@osteojp/ui";
import { CheckCircle, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { listReviewQueue, type ReviewQueueItem } from "@/lib/clinical/review";
import { claimAction } from "./actions";

// Ghost action that submits the claim/open form (claim → edit → finalize flow
// unchanged). The whole row is NOT a link because claiming is a state change.
const actionButton =
  "inline-flex items-center gap-1 rounded text-sm font-medium text-v2-blue-700 transition-colors duration-fast ease-standard hover:text-v2-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

// ai_review_state → chip tone. The two clinical state axes stay separate: this
// maps ONLY the review axis (presentation), never the record_status lifecycle.
// The active queue only ever holds pending_review / in_review, but the full
// placeholder enum is mapped so a terminal value never renders untoned.
const STATE_TONE: Record<ReviewQueueItem["state"], GlassStatusTone> = {
  pending_review: "warning",
  in_review: "info",
  approved: "success",
  rejected: "error",
};

const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function sourceLabel(source: ReviewQueueItem["source"]): string {
  return source === "ai" ? s["review.sourceAi"] : s["review.sourcePatient"];
}
function stateLabel(state: ReviewQueueItem["state"]): string {
  switch (state) {
    case "in_review":
      return s["review.stateInReview"];
    case "approved":
      return s["review.stateApproved"];
    case "rejected":
      return s["review.stateRejected"];
    case "pending_review":
    default:
      return s["review.statePending"];
  }
}

function StatusCell({ item }: { item: ReviewQueueItem }) {
  return (
    <GlassStatusChip tone={STATE_TONE[item.state]} dot>
      {stateLabel(item.state)}
    </GlassStatusChip>
  );
}

function ClaimAction({ item }: { item: ReviewQueueItem }) {
  return (
    <form action={claimAction}>
      <input type="hidden" name="source" value={item.source} />
      <input type="hidden" name="id" value={item.id} />
      <button type="submit" className={actionButton}>
        {item.state === "in_review" ? s["review.open"] : s["review.claim"]}
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </form>
  );
}

/**
 * Review queue (SPEC-v2-review): the staff queue for AI drafts and patient
 * submissions (ai_review_state). v2 glass restyle only — the claim → edit →
 * finalize behavior and the clinical_records:review gating are unchanged, and the
 * record_status / ai_review_state axes stay separate (presentation only).
 *
 * Heritage is owned by the AppShell content frame (SPEC-v2-foundation §6/§7),
 * not this screen; the editor route is the one hard-forbidden heritage surface.
 *
 * Loading uses a local Suspense, not a segment loading.tsx, so the
 * /clinical/review/[recordId] editor route is not wrapped in a queue-level
 * Suspense boundary.
 */
export default async function ReviewQueuePage() {
  const ctx = await requireRequestContext();
  // Reviewing/finalizing is a clinician action (therapist/owner). Admin can read
  // clinical records but cannot review — bounce it back rather than render a
  // queue it can't act on.
  if (!can(ctx.role, "clinical_records:review")) redirect("/clinical");

  return (
    <section className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl text-v2-text-primary">{s["review.heading"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["review.subtitle"]}</p>
      </div>

      <Suspense
        fallback={
          <div className="glass-card p-4">
            <SkeletonTable rows={6} cols={6} />
          </div>
        }
      >
        <ReviewResults />
      </Suspense>
    </section>
  );
}

async function ReviewResults() {
  const ctx = await requireRequestContext();
  const items = await listReviewQueue(ctx);

  if (items.length === 0) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-v2-green-100">
            <CheckCircle
              size={24}
              strokeWidth={1.75}
              aria-hidden="true"
              className="text-v2-green-700"
            />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl text-v2-text-primary">
              {s["review.emptyTitle"]}
            </h2>
            <p className="text-sm text-v2-text-secondary">
              {s["review.emptyHelp"]}
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      {/* Desktop: glass table (≥640px). */}
      <div className="glass-card hidden overflow-hidden sm:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">{s["review.tableCaption"]}</caption>
          <thead>
            <tr className="border-b border-v2-border text-left">
              <th
                scope="col"
                className="px-6 py-3 text-xs font-medium text-v2-text-secondary"
              >
                {s["review.colPatient"]}
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-medium text-v2-text-secondary"
              >
                {s["review.colSource"]}
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-medium text-v2-text-secondary"
              >
                {s["review.colItem"]}
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-medium text-v2-text-secondary"
              >
                {s["review.colState"]}
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-medium text-v2-text-secondary"
              >
                {s["review.colUpdated"]}
              </th>
              <th scope="col" className="px-6 py-3 text-right">
                <span className="sr-only">{s["review.open"]}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr
                key={`${i.source}:${i.id}`}
                className="border-b border-v2-border last:border-b-0"
              >
                <td className="px-6 py-3 align-middle text-sm font-medium text-v2-text-primary">
                  {i.patientName}
                </td>
                <td className="px-6 py-3 align-middle text-sm text-v2-text-secondary">
                  {sourceLabel(i.source)}
                </td>
                <td className="px-6 py-3 align-middle text-sm text-v2-text-secondary">
                  {i.label}
                </td>
                <td className="px-6 py-3 align-middle">
                  <StatusCell item={i} />
                </td>
                <td className="px-6 py-3 align-middle text-sm text-v2-text-secondary">
                  {dateFmt.format(new Date(i.updatedAt))}
                </td>
                <td className="px-6 py-3 text-right align-middle">
                  <ClaimAction item={i} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked glass cards (<640px). */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {items.map((i) => (
          <li key={`${i.source}:${i.id}`} className="glass-card p-4">
            <dl className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-v2-text-secondary">
                  {s["review.colPatient"]}
                </dt>
                <dd className="text-sm font-medium text-v2-text-primary">
                  {i.patientName}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-v2-text-secondary">
                  {s["review.colSource"]}
                </dt>
                <dd className="text-sm text-v2-text-primary">
                  {sourceLabel(i.source)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-v2-text-secondary">
                  {s["review.colItem"]}
                </dt>
                <dd className="text-sm text-v2-text-primary">{i.label}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm text-v2-text-secondary">
                  {s["review.colState"]}
                </dt>
                <dd>
                  <StatusCell item={i} />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-v2-text-secondary">
                  {s["review.colUpdated"]}
                </dt>
                <dd className="text-sm text-v2-text-primary">
                  {dateFmt.format(new Date(i.updatedAt))}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex justify-end border-t border-v2-border pt-3">
              <ClaimAction item={i} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

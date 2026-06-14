import { can } from "@osteojp/auth";
import {
  EmptyState,
  SkeletonTable,
  StatusChip,
  Table,
  TableCardRow,
  type StatusTone,
  type TableColumn,
} from "@osteojp/ui";
import { Check, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { listReviewQueue, type ReviewQueueItem } from "@/lib/clinical/review";
import { claimAction } from "./actions";

// Ghost action that submits the claim/open form (claim → edit → finalize flow
// unchanged). The whole row is NOT a link because claiming is a state change.
const actionButton =
  "inline-flex items-center gap-1 text-sm font-medium text-accent-2-700 transition-colors duration-fast ease-standard hover:text-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 rounded";

// The queue only ever holds pending_review / in_review, but the item type is
// the full ai_review_state enum; map those two and fall back defensively.
const STATE_TONE: Partial<Record<ReviewQueueItem["state"], StatusTone>> = {
  pending_review: "warning",
  in_review: "info",
};
const toneFor = (state: ReviewQueueItem["state"]): StatusTone =>
  STATE_TONE[state] ?? "neutral";

const dateFmt = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon" });

function sourceLabel(source: ReviewQueueItem["source"]): string {
  return source === "ai" ? s["review.sourceAi"] : s["review.sourcePatient"];
}
function stateLabel(state: ReviewQueueItem["state"]): string {
  return state === "in_review"
    ? s["review.stateInReview"]
    : s["review.statePending"];
}

function ClaimAction({ item }: { item: ReviewQueueItem }) {
  return (
    <form action={claimAction}>
      <input type="hidden" name="source" value={item.source} />
      <input type="hidden" name="id" value={item.id} />
      <button type="submit" className={actionButton}>
        {item.state === "in_review" ? s["review.open"] : s["review.claim"]}
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </form>
  );
}

/**
 * Review queue (SPEC-staff-screens §11.3): the staff queue for AI drafts and
 * patient submissions (ai_review_state). Restyle only — the claim → edit →
 * finalize behavior and the clinical_records:review gating are unchanged.
 * Heritage stays off the queue (calm empty queue reads better without it, §11.3).
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
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl text-text-primary">{s["review.heading"]}</h1>
        <p className="text-sm text-text-secondary">{s["review.subtitle"]}</p>
      </div>

      <Suspense
        fallback={
          <div className="rounded-lg border border-border bg-surface p-4">
            <SkeletonTable rows={6} cols={5} />
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
      <EmptyState
        icon={Check}
        title={s["review.emptyTitle"]}
        description={s["review.emptyHelp"]}
      />
    );
  }

  const columns: Array<TableColumn<ReviewQueueItem>> = [
    {
      key: "patient",
      header: s["review.colPatient"],
      cell: (i) => (
        <span className="font-medium text-text-primary">{i.patientName}</span>
      ),
    },
    {
      key: "source",
      header: s["review.colSource"],
      cell: (i) => (
        <span className="text-text-secondary">{sourceLabel(i.source)}</span>
      ),
    },
    {
      key: "received",
      header: s["review.colReceived"],
      cell: (i) => (
        <span className="text-text-secondary">
          {dateFmt.format(new Date(i.updatedAt))}
        </span>
      ),
    },
    {
      key: "state",
      header: s["review.colState"],
      cell: (i) => (
        <StatusChip tone={toneFor(i.state)} dot>
          {stateLabel(i.state)}
        </StatusChip>
      ),
    },
    {
      key: "action",
      header: <span className="sr-only">{s["review.open"]}</span>,
      align: "right",
      cell: (i) => <ClaimAction item={i} />,
    },
  ];

  return (
    <>
      <div className="hidden sm:block">
        <Table
          caption={s["review.tableCaption"]}
          columns={columns}
          data={items}
          rowKey={(i) => `${i.source}:${i.id}`}
        />
      </div>

      <ul className="flex flex-col gap-3 sm:hidden">
        {items.map((i) => (
          <li key={`${i.source}:${i.id}`}>
            <TableCardRow
              items={[
                { label: s["review.colPatient"], value: i.patientName },
                { label: s["review.colSource"], value: sourceLabel(i.source) },
                {
                  label: s["review.colReceived"],
                  value: dateFmt.format(new Date(i.updatedAt)),
                },
                {
                  label: s["review.colState"],
                  value: (
                    <StatusChip tone={toneFor(i.state)} dot>
                      {stateLabel(i.state)}
                    </StatusChip>
                  ),
                },
                { label: "", value: <ClaimAction item={i} /> },
              ]}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

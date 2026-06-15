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
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { requireRequestContext } from "@/lib/auth/context";
import { s, locale } from "@/lib/i18n";
import {
  listRecords,
  type AiReviewState,
  type RecordListItem,
  type RecordStatus,
} from "@/lib/clinical/records";

// Filled-teal primary action (accent-2-700), matching the other staff screens.
const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded bg-accent-2-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

// record_status axis (§6 Registos clínicos).
const RECORD_TONE: Record<RecordStatus, StatusTone> = {
  draft: "neutral",
  locked: "info",
  signed: "success",
};
const RECORD_KEY: Record<RecordStatus, string> = {
  draft: "clinical.statusDraft",
  locked: "clinical.statusLocked",
  signed: "clinical.statusSigned",
};

// ai_review_state axis — the SECOND chip, shown only when not approved (§11.2).
const AI_TONE: Partial<Record<AiReviewState, StatusTone>> = {
  pending_review: "warning",
  in_review: "info",
  rejected: "error",
};
const AI_KEY: Partial<Record<AiReviewState, string>> = {
  pending_review: "review.statePending",
  in_review: "review.stateInReview",
  rejected: "review.stateRejected",
};

const dateFmt = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon" });

function StatusCell({ record }: { record: RecordListItem }) {
  const aiTone = record.aiReviewState
    ? AI_TONE[record.aiReviewState]
    : undefined;
  const aiKey = record.aiReviewState ? AI_KEY[record.aiReviewState] : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusChip tone={RECORD_TONE[record.status]} dot>
        {s[RECORD_KEY[record.status] as keyof typeof s]}
      </StatusChip>
      {aiTone && aiKey ? (
        <StatusChip tone={aiTone} dot>
          {s[aiKey as keyof typeof s]}
        </StatusChip>
      ) : null}
    </div>
  );
}

/**
 * Clinical fichas list (SPEC-staff-screens §11.2): the cross-patient list of
 * clinical records. Presentation only — the role-scoped listRecords query and
 * the clinical_records:read/author permissions are unchanged. The list
 * projection now also reads the existing ai_review_state column so the Estado
 * cell can render the two separate status axes (§6 / §11.2); no filtering,
 * scope, or permission change.
 *
 * The §11.2 filters row (Estado/Terapeuta/date) and the Terapeuta column are
 * not rendered: the list query exposes no therapist field and no filter params,
 * and §11.6 forbids query changes on these restyle screens, so they would be
 * dead controls. Deferred to when the data layer provides them.
 *
 * Loading uses a LOCAL Suspense around the data fetch rather than a segment
 * loading.tsx: a loading.tsx here would wrap /clinical/[id] in a Suspense
 * boundary and turn its notFound() 404 into a streamed 200.
 */
export default async function ClinicalListPage() {
  const ctx = await requireRequestContext();
  // BUG-06: only authors (owner/therapist) can create a record; gate the button
  // on the same capability the /clinical/new flow enforces.
  const canAuthor = can(ctx.role, "clinical_records:author");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl text-text-primary">{s["clinical.title"]}</h1>
        {canAuthor && (
          <Link href="/clinical/new" className={primaryLink}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            {s["clinical.new"]}
          </Link>
        )}
      </div>

      <Suspense
        fallback={
          <div className="rounded-lg border border-border bg-surface p-4">
            <SkeletonTable rows={8} cols={4} />
          </div>
        }
      >
        <ClinicalResults canAuthor={canAuthor} />
      </Suspense>
    </section>
  );
}

async function ClinicalResults({ canAuthor }: { canAuthor: boolean }) {
  const ctx = await requireRequestContext();
  const records = await listRecords(ctx);

  const templateName = (r: RecordListItem): string =>
    r.templateTitle?.[locale] ?? "—";

  const columns: Array<TableColumn<RecordListItem>> = [
    {
      key: "date",
      header: s["clinical.colDate"],
      cell: (r) => (
        <span className="text-text-secondary">
          {dateFmt.format(new Date(r.updatedAt))}
        </span>
      ),
    },
    {
      key: "patient",
      header: s["clinical.colPatient"],
      cell: (r) => (
        <span className="font-medium text-text-primary">{r.patientName}</span>
      ),
    },
    {
      key: "template",
      header: s["clinical.colTemplate"],
      cell: (r) => (
        <span className="text-text-secondary">{templateName(r)}</span>
      ),
    },
    {
      key: "status",
      header: s["clinical.colStatus"],
      cell: (r) => <StatusCell record={r} />,
    },
  ];

  if (records.length === 0) {
    return (
      <EmptyState
        heritage
        icon={FileText}
        title={s["clinical.emptyTitle"]}
        description={s["clinical.emptyHelp"]}
        action={
          canAuthor ? (
            <Link href="/clinical/new" className={primaryLink}>
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
              {s["clinical.new"]}
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {/* Desktop: dense table; row click opens the clinical record editor. */}
      <div className="hidden sm:block">
        <Table
          caption={s["clinical.tableCaption"]}
          columns={columns}
          data={records}
          rowKey={(r) => r.id}
          getRowHref={(r) => `/clinical/${r.id}`}
          getRowLabel={(r) => `${s["clinical.openLabel"]}: ${r.patientName}`}
        />
      </div>

      {/* Mobile: stacked card rows. */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {records.map((r) => (
          <li key={r.id}>
            <TableCardRow
              href={`/clinical/${r.id}`}
              aria-label={`${s["clinical.openLabel"]}: ${r.patientName}`}
              items={[
                {
                  label: s["clinical.colDate"],
                  value: dateFmt.format(new Date(r.updatedAt)),
                },
                { label: s["clinical.colPatient"], value: r.patientName },
                { label: s["clinical.colTemplate"], value: templateName(r) },
                {
                  label: s["clinical.colStatus"],
                  value: <StatusCell record={r} />,
                },
              ]}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

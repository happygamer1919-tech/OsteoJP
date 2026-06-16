import { can } from "@osteojp/auth";
import {
  EmptyState,
  GlassPanel,
  GlassStatusChip,
  Table,
  TableCardRow,
  type GlassStatusTone,
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

// SPEC-v2-fichas §1.2: primary action is a filled Wellness Green button.
// green-700 (#4E7D6B) under white text clears AA (~4.7:1, foundation §3.4);
// hover darkens to green-800. rounded-v2 matches the v2 button radius.
const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-v2-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

// record_status axis (SPEC-v2-fichas §2.1): draft → locked → signed.
const RECORD_TONE: Record<RecordStatus, GlassStatusTone> = {
  draft: "neutral",
  locked: "info",
  signed: "success",
};
const RECORD_KEY: Record<RecordStatus, string> = {
  draft: "clinical.statusDraft",
  locked: "clinical.statusLocked",
  signed: "clinical.statusSigned",
};

// ai_review_state axis — the SECOND chip, shown only when not approved (§2.1).
// The chip never merges the two axes into one ambiguous label.
const AI_TONE: Partial<Record<AiReviewState, GlassStatusTone>> = {
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

const templateName = (r: RecordListItem): string =>
  r.templateTitle?.[locale] ?? "—";

function StatusCell({ record }: { record: RecordListItem }) {
  const aiTone = record.aiReviewState
    ? AI_TONE[record.aiReviewState]
    : undefined;
  const aiKey = record.aiReviewState ? AI_KEY[record.aiReviewState] : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GlassStatusChip tone={RECORD_TONE[record.status]} dot>
        {s[RECORD_KEY[record.status] as keyof typeof s]}
      </GlassStatusChip>
      {aiTone && aiKey ? (
        <GlassStatusChip tone={aiTone} dot>
          {s[aiKey as keyof typeof s]}
        </GlassStatusChip>
      ) : null}
    </div>
  );
}

// SPEC-v2-fichas §2: columns Data, Paciente, Modelo, Estado. Hoisted so the
// loading fallback and the ready table share one definition (and the same
// column count for the skeleton).
const columns: Array<TableColumn<RecordListItem>> = [
  {
    key: "date",
    header: s["clinical.colDate"],
    cell: (r) => (
      <span className="text-v2-text-secondary">
        {dateFmt.format(new Date(r.updatedAt))}
      </span>
    ),
  },
  {
    key: "patient",
    header: s["clinical.colPatient"],
    cell: (r) => (
      <span className="font-medium text-v2-text-primary">{r.patientName}</span>
    ),
  },
  {
    key: "template",
    header: s["clinical.colTemplate"],
    // Modelo: the stored model title, rendered as-is. No dashes introduced
    // (the W4-09 sweep replaced em dashes with colons; honored here).
    cell: (r) => (
      <span className="text-v2-text-secondary">{templateName(r)}</span>
    ),
  },
  {
    key: "status",
    header: s["clinical.colStatus"],
    cell: (r) => <StatusCell record={r} />,
  },
];

// The Table primitive draws its own opaque bordered frame; inside a GlassPanel
// that frame is stripped (Tailwind v4 important) so the rows sit directly on
// the glass — one glass table container, not a card-in-card (SPEC-v2-fichas §2).
const framelessTable = "rounded-none! border-0! bg-transparent!";

/**
 * Clinical fichas list (SPEC-v2-fichas): the cross-patient list of clinical
 * records, restyled onto the v2 glass system. Presentation only — the
 * role-scoped listRecords query and the clinical_records:read/author
 * permissions are unchanged, and the two orthogonal status axes (record_status,
 * ai_review_state) are preserved exactly.
 *
 * HeritageFrame is NOT mounted here: the shell (StaffShellClient) already mounts
 * one behind the whole content area at density="restrained", pathname-guarded so
 * the editor stays frame-free (foundation §6.2 / §7.4). The fichas list is an
 * allowed data surface; it inherits that single frame.
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
    <section className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl text-v2-text-primary">
            {s["clinical.title"]}
          </h1>
          <p className="text-sm text-v2-text-secondary">
            {s["clinical.subtitle"]}
          </p>
        </div>
        {canAuthor && (
          <Link href="/clinical/new" className={primaryLink}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            {s["clinical.new"]}
          </Link>
        )}
      </div>

      <Suspense
        fallback={
          <GlassPanel>
            <Table
              caption={s["clinical.tableCaption"]}
              columns={columns}
              data={[]}
              rowKey={() => ""}
              state="loading"
              loadingRows={8}
              className={framelessTable}
            />
          </GlassPanel>
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

  if (records.length === 0) {
    // Empty state inside the glass container (SPEC-v2-fichas §3). Heritage is
    // owned by the shell frame, so no per-state heritage band here.
    return (
      <GlassPanel>
        <EmptyState
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
      </GlassPanel>
    );
  }

  return (
    <>
      {/* Desktop: dense glass table; row click opens the clinical record. */}
      <div className="hidden sm:block">
        <GlassPanel>
          <Table
            caption={s["clinical.tableCaption"]}
            columns={columns}
            data={records}
            rowKey={(r) => r.id}
            getRowHref={(r) => `/clinical/${r.id}`}
            getRowLabel={(r) => `${s["clinical.openLabel"]}: ${r.patientName}`}
            className={framelessTable}
          />
        </GlassPanel>
      </div>

      {/* Mobile: stacked card rows (single tab stop each). */}
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

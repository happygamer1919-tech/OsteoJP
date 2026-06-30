import { can } from "@osteojp/auth";
import { Banner, Button, StatusChip, type StatusTone } from "@osteojp/ui";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRequestContext } from "@/lib/auth/context";
import { parseTemplateSchema, labelOf, topLevelFields } from "@/lib/clinical/form-template";
import { getRecordDetail, type RecordStatus } from "@/lib/clinical/records";
import { s, locale } from "@/lib/i18n";

import { Attachments } from "./Attachments";
import { DownloadReportButton } from "./DownloadReportButton";
import { fieldAnchorId } from "./anchors";
import { RecordForm } from "./RecordForm";
import { canDownloadReport, statusLabel } from "./record-status";
import { SectionRail } from "./section-rail";
import { saveRecordAction, signRecordAction, versionRecordAction } from "./actions";

// Always render dynamically: this page reflects live record_status (draft →
// locked → signed) and must serve a fresh render after signing (BUG-15).
export const dynamic = "force-dynamic";

const RECORD_TONE: Record<RecordStatus, StatusTone> = {
  draft: "neutral",
  locked: "info",
  signed: "success",
};

export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const ctx = await requireRequestContext();
  const { id } = await params;
  const { m } = await searchParams;

  const record = await getRecordDetail(ctx, id);
  if (!record) notFound();

  const schema = record.template ? parseTemplateSchema(record.template.schema) : null;
  const readOnly = record.status !== "draft" || !can(ctx.role, "clinical_records:author");
  const canSign = record.status === "draft" && can(ctx.role, "clinical_records:sign");
  const canVersion = readOnly && can(ctx.role, "clinical_records:author");

  const anchors = schema
    ? topLevelFields(schema).map(([key, field]) => ({ id: fieldAnchorId(key), label: labelOf(field, locale, key) }))
    : [];

  const statusChip = (
    <StatusChip tone={RECORD_TONE[record.status]} dot>
      {statusLabel(record.status)}
    </StatusChip>
  );

  const extraActions = (
    <>
      {canDownloadReport(record.status) && <DownloadReportButton recordId={id} />}
      {canVersion && (
        <form action={versionRecordAction.bind(null, id)}>
          <Button type="submit" variant="secondary">{s["clinical.newVersion"]}</Button>
        </form>
      )}
      {canSign && (
        <form action={signRecordAction.bind(null, id)}>
          <Button type="submit">{s["clinical.signLock"]}</Button>
        </form>
      )}
    </>
  );

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl text-text-primary">
            {record.patientName}
            {record.episodeTitle ? ` · ${record.episodeTitle}` : ""}
          </h1>
          <p className="text-sm text-text-secondary">
            {record.template?.title?.[locale] ?? "—"} · {s["clinical.version"]} {record.version}
          </p>
        </div>
        <Link
          href="/clinical"
          className="inline-flex items-center rounded-md px-2 py-1 text-sm font-medium text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {s["clinical.title"]}
        </Link>
      </div>

      {m === "err:finalized" && <p role="alert" className="mb-4 text-sm text-error">{s["clinical.finalized"]}</p>}
      {m === "signed" && <p className="mb-4 text-sm text-success">{s["clinical.statusSigned"]}</p>}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {anchors.length > 0 && (
          <aside className="lg:sticky lg:top-20 lg:w-60 lg:shrink-0 lg:self-start">
            <SectionRail anchors={anchors} label={s["clinical.title"]} />
          </aside>
        )}

        <div className="min-w-0 flex-1 lg:max-w-180">
          {/* Finalized records: a single info Banner stating immutability (the
              ai_review_state review banner is deferred — not in the query). */}
          {readOnly && (
            <Banner tone="info" className="mb-6 rounded-md">
              <span className="flex flex-col gap-1">
                <span>{s["clinical.lockedNotice"]}</span>
                {record.signedByName && (
                  <span className="text-text-secondary">
                    {s["clinical.signedBy"]}: {record.signedByName}
                    {record.signedAt ? ` · ${s["clinical.signedAt"]}: ${new Date(record.signedAt).toLocaleString("pt-PT")}` : ""}
                  </span>
                )}
              </span>
            </Banner>
          )}

          {schema ? (
            <RecordForm
              schema={schema}
              initialData={record.data}
              readOnly={readOnly}
              saveAction={saveRecordAction.bind(null, id)}
              statusChip={statusChip}
              extraActions={extraActions}
              patientSex={record.patientSex}
            />
          ) : (
            <p className="text-sm text-text-secondary">—</p>
          )}

          <div className="mt-6">
            <Attachments recordId={id} items={record.attachments} readOnly={readOnly} />
          </div>
        </div>
      </div>
    </main>
  );
}

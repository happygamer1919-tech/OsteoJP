import { notFound } from "next/navigation";
import Link from "next/link";
import { can } from "@osteojp/auth";
import { s, locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getRecordDetail } from "@/lib/clinical/records";
import { parseTemplateSchema } from "@/lib/clinical/form-template";
import { RecordForm } from "./RecordForm";
import { Attachments } from "./Attachments";
import { DownloadReportButton } from "./DownloadReportButton";
import { statusLabel, canDownloadReport } from "./record-status";
import { saveRecordAction, signRecordAction, versionRecordAction } from "./actions";

// Always render dynamically: this page reflects live record_status (draft →
// locked → signed). Without this, the post-sign redirect could serve a cached
// render where the header subtitle still read "Rascunho" while the record was
// already signed (BUG-15). Matches the sibling clinical/episodes/[id] route.
export const dynamic = "force-dynamic";

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
  const readOnly = record.status !== "draft";
  const canSign = record.status === "draft" && can(ctx.role, "clinical_records:sign");
  const canVersion = readOnly && can(ctx.role, "clinical_records:author");

  return (
    <section className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            {record.patientName}
            {record.episodeTitle ? ` · ${record.episodeTitle}` : ""}
          </h2>
          <p className="text-xs text-text-secondary">
            {record.template?.title?.[locale] ?? "-"} · {s["clinical.version"]} {record.version} ·{" "}
            {statusLabel(record.status)}
          </p>
        </div>
        <Link href="/clinical" className="text-sm underline">
          {s["clinical.title"]}
        </Link>
      </div>

      {m === "err:finalized" && <p className="text-sm text-error">{s["clinical.finalized"]}</p>}
      {m === "signed" && <p className="text-sm text-success">{s["clinical.statusSigned"]}</p>}

      {readOnly && (
        <div className="rounded border border-warning bg-warning-bg p-3 text-sm text-text-primary">
          <p>{s["clinical.lockedNotice"]}</p>
          {record.signedByName && (
            <p className="mt-1 text-xs text-text-secondary">
              {s["clinical.signedBy"]}: {record.signedByName}
              {record.signedAt
                ? ` · ${s["clinical.signedAt"]}: ${new Date(record.signedAt).toLocaleString("pt-PT")}`
                : ""}
            </p>
          )}
        </div>
      )}

      {schema ? (
        <RecordForm
          schema={schema}
          initialData={record.data}
          readOnly={readOnly}
          saveAction={saveRecordAction.bind(null, id)}
        />
      ) : (
        <p className="text-sm text-text-secondary">-</p>
      )}

      <Attachments recordId={id} items={record.attachments} readOnly={readOnly} />

      <div className="flex flex-wrap items-start gap-2 border-t pt-4">
        {canDownloadReport(record.status) && <DownloadReportButton recordId={id} />}
        {canSign && (
          <form action={signRecordAction.bind(null, id)}>
            <button type="submit" className="rounded border px-3 py-2 text-sm font-medium">
              {s["clinical.signLock"]}
            </button>
          </form>
        )}
        {canVersion && (
          <form action={versionRecordAction.bind(null, id)}>
            <button type="submit" className="rounded border px-3 py-2 text-sm font-medium">
              {s["clinical.newVersion"]}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

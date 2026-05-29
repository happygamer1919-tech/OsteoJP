import { notFound } from "next/navigation";
import Link from "next/link";
import { can } from "@osteojp/auth";
import { s, locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getRecordDetail, type RecordStatus } from "@/lib/clinical/records";
import { parseTemplateSchema } from "@/lib/clinical/form-template";
import { RecordForm } from "./RecordForm";
import { Attachments } from "./Attachments";
import { saveRecordAction, signRecordAction, versionRecordAction } from "./actions";

function statusLabel(status: RecordStatus): string {
  return status === "signed" ? s["clinical.statusSigned"]
    : status === "locked" ? s["clinical.statusLocked"]
    : s["clinical.statusDraft"];
}

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
          <p className="text-xs text-neutral-500">
            {record.template?.title?.[locale] ?? "—"} · {s["clinical.version"]} {record.version} ·{" "}
            {statusLabel(record.status)}
          </p>
        </div>
        <Link href="/clinical" className="text-sm underline">
          {s["clinical.title"]}
        </Link>
      </div>

      {m === "err:finalized" && <p className="text-sm text-red-700">{s["clinical.finalized"]}</p>}
      {m === "signed" && <p className="text-sm text-green-700">{s["clinical.statusSigned"]}</p>}

      {readOnly && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>{s["clinical.lockedNotice"]}</p>
          {record.signedByName && (
            <p className="mt-1 text-xs text-neutral-600">
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
        <p className="text-sm text-neutral-500">—</p>
      )}

      <Attachments recordId={id} items={record.attachments} readOnly={readOnly} />

      <div className="flex gap-2 border-t pt-4">
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

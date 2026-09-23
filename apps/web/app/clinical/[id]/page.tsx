import { can } from "@osteojp/auth";
import { Banner, Button, StatusChip, type StatusTone } from "@osteojp/ui";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRequestContext } from "@/lib/auth/context";
import { parseTemplateSchema, topLevelFields } from "@/lib/clinical/form-template";
import { getRecordDetail, type RecordStatus } from "@/lib/clinical/records";
import { isImporterSourcedRecord } from "@/lib/clinical/record-origin";
import { getLatestTermsAcceptance } from "@/lib/clinical/terms-acceptance";
import { s, locale } from "@/lib/i18n";
import { listImportedPatientDocuments } from "@/lib/patients/documents";

import { AiRecordingDraft } from "./ai-recording-draft";
import { Attachments } from "./Attachments";
import { ImportedPatientDocuments } from "./ImportedPatientDocuments";
import { ImportedRecordPreview } from "./imported-record-preview";
import { chooseRecordView } from "./record-view";
import { StoredRecordContent } from "./stored-record-content";
import { DownloadReportButton } from "./DownloadReportButton";
import { fieldAnchorId } from "./anchors";
import { HIDDEN_FIELD_KEYS, sectionLabel } from "./field-display";
import { PatientHeaderStrip } from "./PatientHeaderStrip";
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

  // W13-05: DISPLAY ONLY. Shown as context so staff are not pushed to re-capture
  // an acceptance already on file. It never seeds the checkbox — RecordForm
  // initialises that to false unconditionally, on create and on update alike.
  const existingTermsAcceptance = await getLatestTermsAcceptance(ctx, record.patientId);

  const schema = record.template ? parseTemplateSchema(record.template.schema) : null;
  // FICHA-IMPORTED-VIEW: a missing template is NOT evidence of an import. An AI
  // ingestion draft and a patient submission have none either. So a record with
  // no schema asks the importer's ledger (one read, in this request's context)
  // and the body is chosen from that answer and the record's source. A record
  // with a schema never spends the read.
  const importerSourced = schema ? false : await isImporterSourcedRecord(ctx, id);
  const view = chooseRecordView({ hasSchema: schema !== null, importerSourced, source: record.source });
  // G-D: only an imported registo lists the patient's imported originals. Read
  // under the same patients:read gate the Documentos tab and its download
  // action use.
  const importedDocuments =
    view === "imported" && can(ctx.role, "patients:read")
      ? await listImportedPatientDocuments(ctx, record.patientId, id)
      : [];
  const readOnly = record.status !== "draft" || !can(ctx.role, "clinical_records:author");
  const canSign = record.status === "draft" && can(ctx.role, "clinical_records:sign");
  const canVersion = readOnly && can(ctx.role, "clinical_records:author");

  const anchors = schema
    ? topLevelFields(schema)
        .filter(([key]) => !HIDDEN_FIELD_KEYS.has(key))
        .map(([key, field]) => ({ id: fieldAnchorId(key), label: sectionLabel(field, locale, key) }))
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
          <aside className="lg:sticky lg:top-20 lg:w-60 lg:shrink-0 lg:self-start lg:overflow-hidden">
            <SectionRail anchors={anchors} label={s["clinical.title"]} />
          </aside>
        )}

        <div className="min-w-0 flex-1 lg:max-w-180">
          {/* SPEC-ficha-medica.md sec 3 / 5.0: read-only patient header strip.
              Display-only demographics pulled from the patient record + the
              record's auto-stamped creation instant (sec 4). NO-DUPLICATION:
              no ficha input re-requests a profile field. */}
          <PatientHeaderStrip
            name={record.patientName}
            patientNumber={record.patientNumber}
            dateOfBirth={record.patientDateOfBirth}
            sex={record.patientSex}
            profession={record.patientProfession}
            createdAt={record.createdAt}
          />

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

          {view === "form" && schema ? (
            <RecordForm
              schema={schema}
              initialData={record.data}
              readOnly={readOnly}
              saveAction={saveRecordAction.bind(null, id)}
              statusChip={statusChip}
              extraActions={extraActions}
              patientSex={record.patientSex}
              patientId={record.patientId}
              recordId={id}
              existingTermsAcceptance={existingTermsAcceptance}
            />
          ) : view === "imported" ? (
            /* B1 — NO TEMPLATE, SO NO FORM. Until now this branch drew a single
               em-dash, and every IMPORTED Fisiozero registo clínico lands in it:
               `clinicalRecordValues` never sets `form_template_id`, so
               `getRecordDetail` returns `template: null` and there is no schema
               to draw fields from. The content was in `clinical_records.data`
               the whole time; nothing rendered it.

               The preview is READ-ONLY BY CONSTRUCTION - it takes no action and
               renders no input - so a `locked` record stays immutable and no
               edit path is added. The status chip and the version/sign actions
               that belong to the form are NOT reproduced here for the same
               reason: `extraActions` carries "Nova versão" and "Assinar", and a
               record with no schema has no form for either to act on.

               NOT SCOPED TO `locked`. `MigrationClinicalRecord.status` is
               'draft' | 'locked', so an imported record can be a draft, and a
               status-gated preview would leave those blank - the same defect
               with a smaller population.

               G-D (2026-09-13): below the content, the patient's imported
               originals, read-only. Every Fisiozero document landed at patient
               level, so without this the ficha could not open its source. */
            <>
              <ImportedRecordPreview data={record.data} />
              <ImportedPatientDocuments items={importedDocuments} />
            </>
          ) : view === "ai_recording" ? (
            /* FICHA-IMPORTED-VIEW: an AI ingestion draft that has not been
               claimed for review. It has no template because store.ts keeps
               only the raw payload, and until this card it was drawn above as
               imported content. It is a draft from a consultation recording,
               waiting for review, and it says so; the way on is the review
               screen, where AI drafts are edited and finalized (rule 4). No
               form, no sign action, read-only. */
            <AiRecordingDraft
              recordId={id}
              data={record.data}
              status={record.status}
              aiReviewState={record.aiReviewState}
              canReview={can(ctx.role, "clinical_records:review")}
            />
          ) : (
            /* FICHA-IMPORTED-VIEW: any other record without a template that
               the importer did not write (a patient submission draft, a manual
               record). The stored content, under the same rules as the
               imported preview, with a heading that claims no origin. */
            <StoredRecordContent
              data={record.data}
              title={s["clinical.recordContentTitle"]}
              help={s["clinical.recordContentHelp"]}
              emptyText={s["clinical.recordNoContent"]}
              testId="record-content"
              emptyTestId="record-content-empty"
            />
          )}

          <div className="mt-6">
            <Attachments recordId={id} items={record.attachments} readOnly={readOnly} />
          </div>
        </div>
      </div>
    </main>
  );
}

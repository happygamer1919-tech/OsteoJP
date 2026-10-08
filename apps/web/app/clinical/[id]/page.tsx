import { can } from "@osteojp/auth";
import { Banner, Button, StatusChip, type StatusTone } from "@osteojp/ui";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRequestContext } from "@/lib/auth/context";
import { summariseAiRecordingDraft } from "@/lib/clinical/ai-recording-draft";
import { parseTemplateSchema, topLevelFields } from "@/lib/clinical/form-template";
import {
  canWriteRecord,
  getFichaMedicaTemplate,
  getRecordDetail,
  mayFileRegistoFor,
  type RecordStatus,
} from "@/lib/clinical/records";
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

/**
 * The message for a sign that did not happen (`signRecordAction` redirects with
 * `?m=err:<code>`), or a new version that was refused (`versionRecordAction`,
 * the same way). Only `err:finalized` had a message before; every other code
 * showed nothing, so a refused sign looked like a page that did not react.
 * `err:not_author`: the draft has another author (zeroRowRefusal, records.ts).
 */
function signErrorText(m: string | undefined): string | null {
  if (!m || !m.startsWith("err")) return null;
  if (m === "err:finalized") return s["clinical.finalized"];
  if (m === "err:stale") return s["clinical.signStale"];
  if (m === "err:not_author") return s["clinical.notAuthor"];
  return s["clinical.error"];
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
  const view = chooseRecordView({
    hasSchema: schema !== null,
    importerSourced,
    source: record.source,
    status: record.status,
  });
  // G-D: only an imported registo lists the patient's imported originals. Read
  // under the same patients:read gate the Documentos tab and its download
  // action use.
  const importedDocuments =
    view === "imported" && can(ctx.role, "patients:read")
      ? await listImportedPatientDocuments(ctx, record.patientId, id)
      : [];
  // FICHA-IMPORTED-VIEW: an AI recording draft lists what the recording filled
  // under the Ficha Medica template's own field labels. The draft has no
  // template of its own until it is claimed, so the CURRENT Ficha Medica (the
  // one the claim binds, review.ts) is read, and only when there is a filled
  // field to label: an empty extraction spends no read.
  const aiSummary = view === "ai_recording" ? summariseAiRecordingDraft(record.data) : null;
  const aiFichaTemplate =
    aiSummary && aiSummary.filled.length > 0 ? await getFichaMedicaTemplate(ctx) : null;
  const aiFichaSchema = aiFichaTemplate ? parseTemplateSchema(aiFichaTemplate.schema) : null;
  // Two different facts, kept apart. `readOnly` is whether THIS viewer may edit
  // (a draft is read-only to a role that cannot author, such as admin);
  // `finalized` is whether the RECORD is closed. The immutability banner states
  // the second, so it follows `finalized`: a draft is never announced as
  // "finalizada e imutavel", whoever is looking at it.
  const finalized = record.status !== "draft";
  // CARE-02a: a therapist on the care team READS a colleague's registo (0096)
  // and writes to it nowhere; every registo writer refuses outside the pre-0096
  // write reach. `canWrite` is that same test, so no control that would refuse
  // is offered. Always true for a role the therapist scope does not narrow.
  //
  // The permission matrix ("Edit clinical records: own, until locked"), which
  // 0097's write policies enforce once applied: a therapist saves and signs
  // only a draft they authored, for a patient they treat or created (0097's
  // UPDATE policy), and files a new version only for a patient they treat or
  // created (0097's INSERT policy). The page asks the same, so after 0097 a
  // therapist is never offered a Save, a Sign or a Nova versao the database
  // would refuse. BEFORE 0097 THE APP IS THE NARROWER OF THE TWO: 0045's
  // UPDATE admits a therapist on a draft they authored OR on any draft of a
  // patient they treat or created, so on merge a therapist loses Save and Sign
  // on a draft they did not author (every claimed AI draft among them, since a
  // claim writes no author until 0097), and on their own draft of a patient
  // they no longer treat and did not create. The owner writes every registo of
  // the tenant, and
  // `mayFileRegistoFor` answers yes for anyone but a therapist without a read.
  // Both tests are ANDed, so neither narrows the other away.
  //
  // The attachments keep main's gate exactly (`attachmentsReadOnly`: finalized,
  // a role that cannot author, or outside CARE-02a's pre-0096 write reach), so
  // a care-team reader is never offered "Adicionar anexo" or the camera, which
  // createAttachmentUploadUrl and confirmAttachment refuse. 0097 changes no
  // attachment rule, so neither the authorship test nor the patient test is
  // asked of them.
  const canWrite = await canWriteRecord(ctx, id);
  const mayFile = await mayFileRegistoFor(ctx, record.patientId);
  const writesThis = canWrite && mayFile && (ctx.role !== "therapist" || record.practitionerId === ctx.userId);
  const canAuthor = can(ctx.role, "clinical_records:author");
  const readOnly = finalized || !canAuthor || !writesThis;
  const canSign = record.status === "draft" && can(ctx.role, "clinical_records:sign") && writesThis;
  const canVersion = finalized && canAuthor && canWrite && mayFile;
  const attachmentsReadOnly = finalized || !canAuthor || !canWrite;

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

  // EXPORT-01: "Transferir PDF" is shown where the export answers: a finalized
  // record that is not under AI review (the engine's own gate), for a viewer
  // this page opened the record for (downloadReportUrlAction reads it the same
  // way). A draft never shows it.
  const canExport = canDownloadReport(record.status, record.aiReviewState);
  // A record drawn without a form has no form toolbar to carry the button, so
  // the same button sits above its stored content. The PDF prints that content
  // as this page lists it: the same field names, the same read-only notice.
  const storedContentExport = canExport ? (
    <div className="mb-4 flex justify-end" data-testid="record-export">
      <DownloadReportButton recordId={id} />
    </div>
  ) : null;

  const extraActions = (
    <>
      {canExport && <DownloadReportButton recordId={id} />}
      {canVersion && (
        <form action={versionRecordAction.bind(null, id)}>
          <Button type="submit" variant="secondary">{s["clinical.newVersion"]}</Button>
        </form>
      )}
    </>
  );

  // SIGN-CONFIRM-AND-SAVE-FIRST: "Assinar e bloquear" is no longer a form of its
  // own that signs on one press. RecordForm draws it behind a confirmation and
  // saves unsaved edits first; the sign names the stored content's fingerprint.
  const sign = canSign
    ? {
        action: signRecordAction.bind(null, id),
        label: s["clinical.signLock"],
        message: s["clinical.signLockConfirm"],
        dataHash: record.dataHash,
      }
    : undefined;

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

      {signErrorText(m) && (
        <p role="alert" className="mb-4 text-sm text-error">{signErrorText(m)}</p>
      )}
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
          {/* Gated on the record's status, not on `readOnly`: an admin reading
              a draft cannot edit it, but it is not finalized. */}
          {finalized && (
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
              sign={sign}
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
              {storedContentExport}
              <ImportedRecordPreview data={record.data} />
              <ImportedPatientDocuments items={importedDocuments} />
            </>
          ) : view === "ai_recording" && aiSummary ? (
            /* FICHA-IMPORTED-VIEW: an AI ingestion DRAFT with no template
               (not yet claimed, or claimed when no Ficha Medica template
               existed). It has no template because store.ts keeps only the raw
               payload, and until this card it was drawn above as imported
               content. It is a draft from a consultation recording, waiting
               for review, and it says so; the way on is the review screen,
               where AI drafts are edited and finalized (rule 4). No form, no
               sign action, read-only. A FINALIZED template-less AI record is
               not a draft and goes to the neutral view below. */
            <AiRecordingDraft
              recordId={id}
              summary={aiSummary}
              fichaSchema={aiFichaSchema}
              status={record.status}
              aiReviewState={record.aiReviewState}
              canReview={can(ctx.role, "clinical_records:review") && canWrite}
            />
          ) : (
            /* FICHA-IMPORTED-VIEW: any other record without a template that
               the importer did not write (a patient submission draft, a manual
               record, an AI record finalized with no template). The stored
               content, under the same rules as the imported preview, with a
               heading that claims no origin. */
            <>
              {storedContentExport}
              <StoredRecordContent
                data={record.data}
                title={s["clinical.recordContentTitle"]}
                help={s["clinical.recordContentHelp"]}
                emptyText={s["clinical.recordNoContent"]}
                testId="record-content"
                emptyTestId="record-content-empty"
              />
            </>
          )}

          <div className="mt-6">
            <Attachments recordId={id} items={record.attachments} readOnly={attachmentsReadOnly} />
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";
import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Dialog, EmptyState } from "@osteojp/ui";
import { FileText } from "lucide-react";
import { s } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_DELETE_REASON_MAX,
  normalizeDeleteReason,
  validateDocumentUpload,
} from "@/lib/patients/document-validation";
import {
  isDocumentPreviewable,
  type DocumentPreviewKind,
} from "@/lib/patients/document-preview";
import {
  confirmDocumentAction,
  createDocumentUploadUrlAction,
  deleteDocumentAction,
  documentDownloadUrlAction,
  documentPreviewUrlAction,
  type DeleteDocumentActionError,
} from "./document-actions";

// Must match storage.ts ATTACHMENTS_BUCKET (that module is server-only).
const BUCKET = "clinical-attachments";

export type PatientDocument = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  createdAt: string;
};

const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** SR-62 PU-4: each refusal the dialog can word; anything else is the generic line. */
export const DELETE_ERROR_TEXT: Record<DeleteDocumentActionError, string> = {
  reason_required: s["patients.documentDeleteReasonLabel"],
  reason_too_long: s["patients.documentDeleteReasonTooLong"],
  already_deleted: s["patients.documentDeleteAlreadyDeleted"],
  not_found: s["patients.documentDeleteError"],
  forbidden: s["patients.documentDeleteError"],
  error: s["patients.documentDeleteError"],
};

/**
 * Staff Documentos tab: upload administrative documents to a patient and open
 * them via short-lived signed URLs. The 3-step signed-URL flow (mint → direct
 * PUT to Storage → confirm+audit) mirrors the clinical Attachments component
 * (W4-05); bytes never pass through Next. Upload is gated server-side on
 * patients:write; the input is only shown when `canUpload`.
 *
 * SR-62 PU-4: each row also carries Eliminar when `canDelete`. It opens a
 * confirm dialog with a REQUIRED reason; the confirm button stays disabled
 * until the reason has a non-blank character. The delete is SOFT (row and file
 * kept, audit row written) and every rule is re-enforced on the server.
 */
export function PatientDocuments({
  patientId,
  items,
  canUpload,
  canDelete = false,
}: {
  patientId: string;
  items: PatientDocument[];
  canUpload: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<PatientDocument | null>(null);
  const [reason, setReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  async function onSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    // Client-side type/size pre-flight (UX only — the server re-validates).
    const bad = validateDocumentUpload({
      mimeType: file.type || null,
      sizeBytes: file.size,
    });
    if (bad === "type") {
      setError(s["patients.documentInvalidType"]);
      return;
    }
    if (bad === "size") {
      setError(s["patients.documentTooLarge"]);
      return;
    }

    const slot = await createDocumentUploadUrlAction(patientId, file.name);
    if (!slot.ok) {
      setError(s["patients.documentUploadError"]);
      return;
    }
    const up = await createSupabaseBrowserClient()
      .storage.from(BUCKET)
      .uploadToSignedUrl(slot.path, slot.token, file);
    if (up.error) {
      setError(s["patients.documentUploadError"]);
      return;
    }
    const res = await confirmDocumentAction({
      patientId,
      path: slot.path,
      fileName: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
    });
    if (!res.ok) {
      setError(s["patients.documentUploadError"]);
      return;
    }
    start(() => router.refresh());
  }

  async function download(documentId: string) {
    const { url } = await documentDownloadUrlAction(documentId);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  /**
   * The open preview, if any. One at a time, keyed by document id.
   *
   * THE URL IS HELD IN STATE AND DELIBERATELY NOT REFRESHED. It is a
   * 60-second signed token: it is minted when the panel opens and it is allowed
   * to expire where it sits. Closing and reopening mints a new one. Nothing
   * here retries, caches it anywhere, or hands it to another component - the
   * preview is not a longer-lived handle on the bytes than "Abrir" already is.
   */
  const [preview, setPreview] = useState<
    { id: string; url: string; kind: DocumentPreviewKind; fileName: string } | null
  >(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function togglePreview(documentId: string) {
    setPreviewError(null);
    // Second click on the open one closes it, which is what the button says.
    if (preview?.id === documentId) {
      setPreview(null);
      return;
    }
    setPreview(null);
    const res = await documentPreviewUrlAction(patientId, documentId);
    if (!res.ok) {
      // One message for every refusal, matching the server: not this patient's,
      // not previewable, not there. The fallback is the affordance that already
      // worked.
      setPreviewError(s["patients.documentPreviewError"]);
      return;
    }
    setPreview({ id: documentId, url: res.url, kind: res.kind, fileName: res.fileName });
  }

  function openDelete(d: PatientDocument) {
    setTarget(d);
    setReason("");
    setDeleteError(null);
  }

  function closeDelete() {
    if (deleting) return;
    setTarget(null);
    setReason("");
    setDeleteError(null);
  }

  const reasonCheck = normalizeDeleteReason(reason);

  function confirmDelete() {
    if (!target || !reasonCheck.ok) return;
    const documentId = target.id;
    const reasonText = reasonCheck.reason;
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteDocumentAction(documentId, reasonText);
      if (result.ok) {
        setTarget(null);
        setReason("");
        router.refresh();
        return;
      }
      setDeleteError(DELETE_ERROR_TEXT[result.error]);
    });
  }

  return (
    <div className="space-y-4">
      {/* W7-03: section header - a purple (accent-1-700) left rule + a count, so
          the tab announces what it holds before it lists it. Registos uses the
          same pattern, so the two tabs read as one system. */}
      <div className="flex items-center gap-3 border-l-2 border-accent-1-700 pl-3">
        <h2 className="text-lg text-text-primary">{s["patients.tabDocuments"]}</h2>
        <span className="text-sm tabular-nums text-text-secondary">{items.length}</span>
      </div>

      {canUpload && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-v2 border border-v2-border bg-v2-surface px-3 py-1.5 text-sm font-medium text-v2-text-primary transition-colors duration-fast ease-standard hover:bg-v2-surface-hover has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring has-[:focus-visible]:ring-offset-2">
            {pending ? s["patients.documentUploading"] : s["patients.documentUpload"]}
            <input
              type="file"
              className="hidden"
              accept={DOCUMENT_ACCEPT}
              onChange={onSelect}
              disabled={pending}
            />
          </label>
          <span className="text-xs text-text-secondary">{s["patients.documentUploadHelp"]}</span>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {previewError && (
        <p role="alert" className="text-sm text-error">
          {previewError}
        </p>
      )}

      {/* W7-03: Card rows with a contained accent-1 icon badge as the row anchor
          (the W6-06b bare grey glyph left every row reading as undifferentiated
          grey text), a name/meta hierarchy, and a clean empty state with no
          motif band above the icon. */}
      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={s["patients.documentsEmptyTitle"]}
          description={s["patients.documentsEmpty"]}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((d) => (
            // Card forwards no data-* props, so the row id sits on a wrapper.
            <div key={d.id} data-document-id={d.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-1-50">
                      <FileText
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className="text-accent-1-700"
                      />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-text-primary">{d.fileName}</span>
                      <span className="text-sm tabular-nums text-text-secondary">
                        {formatSize(d.sizeBytes)} · {dateFmt.format(new Date(d.createdAt))}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Only for the types a browser really renders. Everything
                        else keeps Abrir alone rather than offering a panel that
                        would come up empty. */}
                    {isDocumentPreviewable(d.mimeType) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-expanded={preview?.id === d.id}
                        onClick={() => togglePreview(d.id)}
                      >
                        {preview?.id === d.id
                          ? s["patients.documentPreviewClose"]
                          : s["patients.documentPreview"]}
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => download(d.id)}>
                      {s["patients.documentOpen"]}
                    </Button>
                    {canDelete && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => openDelete(d)}>
                        {s["patients.documentDelete"]}
                      </Button>
                    )}
                  </div>
                </div>

                {preview?.id === d.id && (
                  <div className="mt-3 border-t border-v2-border pt-3">
                    {preview.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a 60s
                      // signed Storage URL, not a build-time asset: next/image would
                      // route a private, expiring object through the optimizer.
                      <img
                        src={preview.url}
                        alt={preview.fileName}
                        className="max-h-[70vh] w-full object-contain"
                      />
                    ) : (
                      <object
                        data={preview.url}
                        type="application/pdf"
                        aria-label={preview.fileName}
                        className="h-[70vh] w-full"
                      >
                        {/* Shown when the browser has no PDF viewer at all. */}
                        <p className="text-sm text-text-secondary">
                          {s["patients.documentPreviewError"]}
                        </p>
                      </object>
                    )}
                  </div>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}

      {canDelete && (
        <Dialog
          open={target !== null}
          onClose={closeDelete}
          title={s["patients.documentDeleteTitle"]}
          message={s["patients.documentDeleteMessage"]}
          confirmVariant="destructive"
          confirmLabel={s["patients.documentDeleteConfirm"]}
          onConfirm={confirmDelete}
          confirmLoading={deleting}
          confirmDisabled={!reasonCheck.ok || deleting}
          cancelLabel={s["common.cancel"]}
        >
          <div className="mt-3 flex flex-col gap-2" data-testid="document-delete-form">
            {target && (
              <p className="truncate text-sm font-medium text-text-primary">{target.fileName}</p>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{s["patients.documentDeleteReasonLabel"]}</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
                maxLength={DOCUMENT_DELETE_REASON_MAX}
                className="rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                data-testid="document-delete-reason"
              />
              <span className="text-xs text-text-secondary">
                {s["patients.documentDeleteReasonHelp"]}
              </span>
            </label>
            {deleteError && (
              <p role="alert" className="text-sm text-error">
                {deleteError}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

"use client";
import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState } from "@osteojp/ui";
import { FileText } from "lucide-react";
import { s } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DOCUMENT_ACCEPT,
  validateDocumentUpload,
} from "@/lib/patients/document-validation";
import {
  confirmDocumentAction,
  createDocumentUploadUrlAction,
  documentDownloadUrlAction,
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

/**
 * Staff Documentos tab: upload administrative documents to a patient and open
 * them via short-lived signed URLs. The 3-step signed-URL flow (mint → direct
 * PUT to Storage → confirm+audit) mirrors the clinical Attachments component
 * (W4-05); bytes never pass through Next. Upload is gated server-side on
 * patients:write; the input is only shown when `canUpload`.
 */
export function PatientDocuments({
  patientId,
  items,
  canUpload,
}: {
  patientId: string;
  items: PatientDocument[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  async function download(path: string) {
    const { url } = await documentDownloadUrlAction(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
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
            <Card key={d.id}>
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
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => download(d.storagePath)}
                >
                  {s["patients.documentOpen"]}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

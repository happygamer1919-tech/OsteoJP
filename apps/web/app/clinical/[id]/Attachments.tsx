"use client";
import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  uploadAttachmentBlob,
  type AttachmentUploadDeps,
} from "@/lib/clinical/attachment-upload";
import { CAPTURE_MIME, captureFileName } from "@/lib/clinical/camera-capture";
import { CameraCapture } from "./CameraCapture";
import {
  confirmAttachmentAction,
  createUploadUrlAction,
  downloadUrlAction,
} from "./actions";

// Must match storage.ts ATTACHMENTS_BUCKET (that module is server-only).
const BUCKET = "clinical-attachments";

export type AttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  createdAt: string;
};

export function Attachments({
  recordId,
  items,
  readOnly,
}: {
  recordId: string;
  items: AttachmentItem[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // The 3-step signed-URL flow, wired to the real server actions + browser
  // Storage client. Shared by the file picker and the camera (W4-05).
  const uploadDeps: AttachmentUploadDeps = {
    createUploadUrl: createUploadUrlAction,
    uploadToStorage: (path, token, blob) =>
      createSupabaseBrowserClient().storage
        .from(BUCKET)
        .uploadToSignedUrl(path, token, blob),
    confirmAttachment: confirmAttachmentAction,
  };

  async function runUpload(
    blob: Blob,
    fileName: string,
    mimeType: string | null,
  ): Promise<boolean> {
    setError(false);
    const outcome = await uploadAttachmentBlob(recordId, blob, fileName, mimeType, uploadDeps);
    if (!outcome.ok) {
      setError(true);
      return false;
    }
    start(() => router.refresh());
    return true;
  }

  async function onSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await runUpload(file, file.name, file.type || null);
  }

  async function download(path: string) {
    const { url } = await downloadUrlAction(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{s["clinical.attachments"]}</h3>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-block cursor-pointer rounded border px-3 py-1.5 text-sm has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring has-[:focus-visible]:ring-offset-2">
            {pending ? s["clinical.attachmentUploading"] : s["clinical.attachmentAdd"]}
            <input type="file" className="hidden" onChange={onSelect} disabled={pending} />
          </label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShowCamera((v) => !v)}
            aria-expanded={showCamera}
          >
            {s["clinical.attachmentTakePhoto"]}
          </Button>
        </div>
      )}

      {!readOnly && showCamera && (
        <CameraCapture
          onAttach={(blob) => runUpload(blob, captureFileName(), CAPTURE_MIME)}
          onClose={() => setShowCamera(false)}
        />
      )}

      {error && <p role="alert" className="text-xs text-error">{s["clinical.error"]}</p>}

      <ul className="space-y-1 text-sm">
        {items.length === 0 && (
          <li className="text-xs text-text-secondary">{s["clinical.attachmentEmpty"]}</li>
        )}
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <span>{a.fileName}</span>
            <Button
              type="button"
              onClick={() => download(a.storagePath)}
              variant="secondary"
              size="sm"
            >
              {s["clinical.attachmentDownload"]}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

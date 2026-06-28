"use client";
import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { s } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

  async function onSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(false);

    // 1) server issues a one-time signed upload URL (path is tenant-prefixed)
    const slot = await createUploadUrlAction(recordId, file.name);
    if (!slot.ok) return setError(true);

    // 2) upload bytes DIRECTLY to Supabase Storage — never through Next
    const supabase = createSupabaseBrowserClient();
    const up = await supabase.storage.from(BUCKET).uploadToSignedUrl(slot.path, slot.token, file);
    if (up.error) return setError(true);

    // 3) record the row + audit
    const res = await confirmAttachmentAction({
      recordId,
      path: slot.path,
      fileName: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
    });
    if (!res.ok) return setError(true);
    start(() => router.refresh());
  }

  async function download(path: string) {
    const { url } = await downloadUrlAction(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{s["clinical.attachments"]}</h3>

      {!readOnly && (
        <label className="inline-block cursor-pointer rounded border px-3 py-1.5 text-sm has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring has-[:focus-visible]:ring-offset-2">
          {pending ? s["clinical.attachmentUploading"] : s["clinical.attachmentAdd"]}
          <input type="file" className="hidden" onChange={onSelect} disabled={pending} />
        </label>
      )}
      {error && <p role="alert" className="text-xs text-error">{s["clinical.error"]}</p>}

      <ul className="space-y-1 text-sm">
        {items.length === 0 && (
          <li className="text-xs text-text-secondary">{s["clinical.attachmentEmpty"]}</li>
        )}
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <span>{a.fileName}</span>
            <button
              type="button"
              onClick={() => download(a.storagePath)}
              className="rounded border px-2 py-0.5 text-xs transition-transform motion-safe:active:scale-[0.97]"
            >
              {s["clinical.attachmentDownload"]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

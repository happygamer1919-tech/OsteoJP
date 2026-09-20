'use client'

import { Eye, FileText, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { getPreviewUrlAction } from './actions'
import { DownloadButton } from './DownloadButton'
import { isDocumentPreviewable } from '@/lib/document-preview'
import type { DocumentPreviewKind } from '@/lib/api/client'
import { s } from '@/lib/i18n'

// One document row, with the preview panel that opens under it.
//
// The row is a client component only so the panel can open in place; the date
// and type line is still formatted on the server and arrives as `meta`.
//
// THE URL IS MINTED ON CLICK AND NEVER ON RENDER. It is a 60-second signed
// token: a list of twenty documents must not mint twenty URLs nobody asked to
// see. It is held in state, allowed to expire where it sits, and re-minted if
// the panel is closed and opened again.

export function DocumentRow({
  id,
  fileName,
  meta,
  mimeType,
}: {
  id: string
  fileName: string
  meta: string
  mimeType: string | null
}) {
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<{ url: string; kind: DocumentPreviewKind } | null>(null)
  const [error, setError] = useState(false)
  const offered = isDocumentPreviewable(mimeType)

  function toggle() {
    setError(false)
    if (preview) {
      setPreview(null)
      return
    }
    start(async () => {
      const result = await getPreviewUrlAction(id)
      if ('url' in result) {
        setPreview({ url: result.url, kind: result.kind })
      } else {
        setError(true)
      }
    })
  }

  return (
    <div className="flex flex-col px-4 py-3">
      <div className="flex items-center gap-3">
        <FileText
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
          className="shrink-0 text-text-secondary"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{fileName}</p>
          <p className="text-xs text-text-secondary">{meta}</p>
        </div>

        {offered && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-expanded={preview !== null}
            aria-label={`${preview ? s.documents.preview_close : s.documents.preview} ${fileName}`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-accent-2-700 transition motion-safe:active:scale-[0.97] hover:bg-surface-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {pending ? (
              <Loader2 size={20} strokeWidth={1.75} aria-hidden="true" className="animate-spin" />
            ) : (
              <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        )}

        <DownloadButton id={id} fileName={fileName} />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-error">
          {s.documents.preview_error}
        </p>
      )}

      {preview && (
        <div className="mt-3 border-t border-border pt-3">
          {preview.kind === 'image' ? (
            // A 60s signed Storage URL, not a build-time asset: next/image would
            // route a private, expiring object through the optimizer. The directive
            // is LAST so that it is the line directly above the element.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={fileName}
              className="max-h-[70vh] w-full object-contain"
            />
          ) : (
            <object
              data={preview.url}
              type="application/pdf"
              aria-label={fileName}
              className="h-[70vh] w-full"
            >
              {/* Shown when the browser has no PDF viewer of its own. */}
              <p className="text-xs text-text-secondary">{s.documents.preview_error}</p>
            </object>
          )}
        </div>
      )}
    </div>
  )
}

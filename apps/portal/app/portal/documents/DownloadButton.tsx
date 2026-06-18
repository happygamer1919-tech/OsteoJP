'use client'

import { Download, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { getDownloadUrlAction } from './actions'

// Downloads go through a short-lived signed URL (never proxied); the bytes open
// in a new tab. 44px tap target with an accessible name (SPEC-portal §9).
export function DownloadButton({ id, fileName }: { id: string; fileName: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)

  function handleClick() {
    setError(false)
    start(async () => {
      const result = await getDownloadUrlAction(id)
      if ('url' in result) {
        window.open(result.url, '_blank', 'noopener,noreferrer')
      } else {
        setError(true)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={
          error
            ? `Erro ao descarregar ${fileName}. Tentar novamente`
            : `Descarregar ${fileName}`
        }
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-accent-2-700 transition-colors hover:bg-surface-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {pending ? (
          <Loader2 size={20} strokeWidth={1.75} aria-hidden="true" className="animate-spin" />
        ) : (
          <Download size={20} strokeWidth={1.75} aria-hidden="true" className={error ? 'text-error' : undefined} />
        )}
      </button>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {error ? `Erro ao descarregar ${fileName}. Tentar novamente.` : ''}
      </span>
    </>
  )
}

'use client'

import { ErrorState } from '@osteojp/ui'
import { s } from '@/lib/i18n'

export default function DocumentsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title={s.errors.load_documents}
      description={s.errors.load_documents_desc}
      retryLabel={s.common.retry}
      onRetry={reset}
    />
  )
}

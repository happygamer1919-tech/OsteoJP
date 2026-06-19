'use client'

import { ErrorState } from '@osteojp/ui'
import { s } from '@/lib/i18n'

export default function FormsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title={s.errors.load_forms}
      description={s.errors.load_forms_desc}
      retryLabel={s.common.retry}
      onRetry={reset}
    />
  )
}

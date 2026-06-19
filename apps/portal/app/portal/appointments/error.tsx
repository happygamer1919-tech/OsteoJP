'use client'

import { ErrorState } from '@osteojp/ui'
import { s } from '@/lib/i18n'

// Route-level error boundary for the appointments list + detail (SPEC-portal §6).
export default function AppointmentsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title={s.errors.load_appointments}
      description={s.errors.load_appointments_desc}
      retryLabel={s.common.retry}
      onRetry={reset}
    />
  )
}

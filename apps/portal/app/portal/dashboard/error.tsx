'use client'

import { ErrorState } from '@osteojp/ui'
import { s } from '@/lib/i18n'

// Route-level error boundary for the dashboard (SPEC-portal §5 ErrorState + retry).
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title={s.errors.load_dashboard}
      description={s.errors.load_dashboard_desc}
      retryLabel={s.common.retry}
      onRetry={reset}
    />
  )
}

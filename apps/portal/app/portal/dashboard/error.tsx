'use client'

import { ErrorState } from '@osteojp/ui'

// Route-level error boundary for the dashboard (SPEC-portal §5 ErrorState + retry).
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Não foi possível carregar o início"
      description="Ocorreu um erro ao carregar a sua informação. Tente novamente."
      retryLabel="Tentar novamente"
      onRetry={reset}
    />
  )
}

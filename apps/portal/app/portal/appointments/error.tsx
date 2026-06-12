'use client'

import { ErrorState } from '@osteojp/ui'

// Route-level error boundary for the appointments list + detail (SPEC-portal §6).
export default function AppointmentsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Não foi possível carregar as consultas"
      description="Ocorreu um erro ao carregar as suas marcações. Tente novamente."
      retryLabel="Tentar novamente"
      onRetry={reset}
    />
  )
}

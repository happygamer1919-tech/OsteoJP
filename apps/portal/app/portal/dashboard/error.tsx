'use client'

import { ErrorState } from '@osteojp/ui'

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

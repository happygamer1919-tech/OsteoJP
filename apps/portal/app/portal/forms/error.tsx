'use client'

import { ErrorState } from '@osteojp/ui'

export default function FormsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Não foi possível carregar as fichas"
      description="Ocorreu um erro ao carregar as suas fichas. Tente novamente."
      retryLabel="Tentar novamente"
      onRetry={reset}
    />
  )
}

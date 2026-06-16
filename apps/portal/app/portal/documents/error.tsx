'use client'

import { ErrorState } from '@osteojp/ui'

export default function DocumentsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Não foi possível carregar os documentos"
      description="Ocorreu um erro ao carregar os seus documentos. Tente novamente."
      retryLabel="Tentar novamente"
      onRetry={reset}
    />
  )
}

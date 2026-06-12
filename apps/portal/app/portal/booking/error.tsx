'use client'

import { ErrorState } from '@osteojp/ui'

export default function BookingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Não foi possível abrir as marcações"
      description="Ocorreu um erro ao carregar a oferta de marcação. Tente novamente."
      retryLabel="Tentar novamente"
      onRetry={reset}
    />
  )
}

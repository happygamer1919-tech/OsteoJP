'use client'

import { ErrorState } from '@osteojp/ui'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Erro"
      description={`digest:${error.digest ?? 'none'} msg:${error.message?.slice(0, 100) ?? 'none'}`}
      retryLabel="Tentar novamente"
      onRetry={reset}
    />
  )
}

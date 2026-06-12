import { Calendar } from 'lucide-react'
import Link from 'next/link'

export default async function BookingPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  return (
    <div className="text-center py-8">
      {/* Icon */}
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-accent-2-100">
        <Calendar size={24} strokeWidth={1.75} aria-hidden="true" className="text-accent-2-700" />
      </div>

      <h2 className="text-lg font-medium text-text-primary mb-2">
        Marcação recebida
      </h2>
      <p className="text-sm text-text-secondary leading-relaxed mb-8 max-w-xs mx-auto">
        A sua marcação está a aguardar confirmação pela receção. Receberá um SMS quando for confirmada.
      </p>

      {id && (
        <div className="inline-block rounded-lg px-3 py-1 text-xs font-mono text-text-secondary mb-8 bg-surface-muted">
          Ref: {id.slice(0, 8).toUpperCase()}
        </div>
      )}

      <div className="space-y-3">
        <Link
          href="/portal/appointments"
          className="block w-full py-3 rounded-xl text-text-inverse font-medium text-sm text-center bg-accent-2-700"
        >
          Ver as minhas consultas
        </Link>
        <Link
          href="/portal/dashboard"
          className="block w-full py-3 rounded-xl text-text-primary font-medium text-sm text-center bg-surface border border-border"
        >
          Ir para o início
        </Link>
      </div>
    </div>
  )
}

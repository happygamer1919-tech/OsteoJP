import { Check } from 'lucide-react'
import Link from 'next/link'

const SECONDARY =
  'flex min-h-11 w-full items-center justify-center rounded-lg border border-border-strong bg-surface text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'
const GHOST =
  'flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

export default async function BookingPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success-bg">
        <Check size={24} strokeWidth={1.75} aria-hidden="true" className="text-success" />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-primary">Marcação recebida</h2>
        <p className="mx-auto max-w-xs text-sm text-text-secondary">
          A sua marcação está a aguardar confirmação da clínica. Receberá uma notificação quando
          for confirmada.
        </p>
      </div>

      {id && (
        <p className="rounded-lg bg-surface-muted px-3 py-1 font-mono text-xs text-text-secondary">
          Ref: {id.slice(0, 8).toUpperCase()}
        </p>
      )}

      <div className="mt-2 flex w-full flex-col gap-3">
        <Link href="/portal/appointments" className={SECONDARY}>
          Ver as minhas marcações
        </Link>
        <Link href="/portal/dashboard" className={GHOST}>
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}

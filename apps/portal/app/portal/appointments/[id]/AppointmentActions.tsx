'use client'

import { AlertTriangle } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Dialog } from '@osteojp/ui'
import type { AppointmentStatus } from '@/lib/api/client'
import { cancelAppointmentAction } from '../actions'

const CUTOFF_MS = 24 * 60 * 60 * 1000

/**
 * Detail actions (SPEC-portal §6.4). Cancel is offered only for an upcoming
 * appointment and only outside the 24h cutoff (a destructive-confirm Dialog);
 * inside the cutoff the button is disabled with the 24h rule stated. Reschedule
 * is email-link only — never an in-portal action, never an SMS promise (§0.6).
 */
export function AppointmentActions({
  id,
  startsAt,
  status,
}: {
  id: string
  startsAt: string
  status: AppointmentStatus
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Capture "now" once at mount: reading current time during render is impure
  // (and risks hydration mismatch).
  const [now] = useState(() => Date.now())

  const startsAtMs = new Date(startsAt).getTime()
  const upcoming = (status === 'scheduled' || status === 'confirmed') && startsAtMs > now
  if (!upcoming) return null

  const outsideCutoff = startsAtMs - now > CUTOFF_MS

  function confirmCancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelAppointmentAction(id)
      if (result?.error) {
        setError(result.error)
        setOpen(false)
      } else {
        router.push('/portal/appointments')
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-secondary">
        Para remarcar, utilize a ligação no email de confirmação da marcação.
      </p>

      <Button
        variant="destructive"
        className="min-h-11 w-full"
        disabled={!outsideCutoff}
        onClick={outsideCutoff ? () => setOpen(true) : undefined}
      >
        Cancelar consulta
      </Button>

      {!outsideCutoff && (
        <p className="text-xs text-text-secondary">
          Não é possível cancelar com menos de 24 horas de antecedência. Por favor ligue para a
          clínica.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancelar consulta?"
        message="Esta ação não pode ser anulada."
        icon={AlertTriangle}
        iconTone="error"
        confirmVariant="destructive"
        confirmLabel="Sim, cancelar"
        cancelLabel="Manter"
        confirmLoading={pending}
        onConfirm={confirmCancel}
      />
    </div>
  )
}

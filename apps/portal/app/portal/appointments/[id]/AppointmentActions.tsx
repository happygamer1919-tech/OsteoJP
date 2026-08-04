'use client'

import { AlertTriangle } from 'lucide-react'
import { RescheduleDialog } from './RescheduleDialog'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Dialog } from '@osteojp/ui'
import type { AppointmentStatus } from '@/lib/api/client'
import { cancelAppointmentAction } from '../actions'
import { s } from '@/lib/i18n'

const CUTOFF_MS = 24 * 60 * 60 * 1000

/**
 * Detail actions (SPEC-portal §6.4). Cancel and reschedule are both offered for
 * an upcoming appointment and only outside the 24h cutoff; inside it, both are
 * disabled with the 24h rule stated and the patient is pointed at the phone.
 *
 * Reschedule is no longer phone-only (PL-33). It is a TIME PICKER: the endpoint
 * takes only a new start and preserves therapist, location and duration.
 *
 * The client-side cutoff check below is a COURTESY, not a control. The server
 * re-enforces the cutoff on the stored start, and the 24h minimum notice on the
 * new slot, at action time — a disabled button stops an honest patient, not a
 * forged request.
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
  const [rescheduling, setRescheduling] = useState(false)
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
        {s.appointments.action_reschedule_hint}
      </p>

      <Button
        variant="secondary"
        className="min-h-11 w-full"
        aria-disabled={!outsideCutoff}
        aria-expanded={rescheduling}
        onClick={() => { if (!outsideCutoff) return; setRescheduling((v) => !v) }}
      >
        {s.appointments.reschedule_open}
      </Button>

      {rescheduling && outsideCutoff && (
        <RescheduleDialog id={id} open onClose={() => setRescheduling(false)} />
      )}

      <Button
        variant="destructive"
        className="min-h-11 w-full"
        aria-disabled={!outsideCutoff}
        onClick={() => { if (!outsideCutoff) return; setOpen(true) }}
      >
        {s.appointments.cancel_title}
      </Button>

      {!outsideCutoff && (
        <p className="text-xs text-text-secondary">
          {s.appointments.cancel_too_late}
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
        title={s.appointments.cancel_title}
        message={s.appointments.cancel_body}
        icon={AlertTriangle}
        iconTone="error"
        confirmVariant="destructive"
        confirmLabel={s.appointments.cancel_confirm}
        cancelLabel={s.common.cancel}
        confirmLoading={pending}
        onConfirm={confirmCancel}
      />
    </div>
  )
}

'use client'

import { CalendarClock } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Dialog } from '@osteojp/ui'
import { getRescheduleOptionsAction, rescheduleAppointmentAction } from '../actions'
import { s } from '@/lib/i18n'

/**
 * Reschedule as a TIME PICKER, not a rebooking flow.
 *
 * The endpoint takes only `{ startsAt }`: therapist, location and duration are
 * preserved server-side. So this offers exactly one decision — when — and says
 * so ("mantém o mesmo terapeuta, local e duração"). Offering service or location
 * choice here would imply a control the API does not provide.
 *
 * Slots come from the server and are never computed here. The portal does not
 * hold a service or location id and does not need one.
 *
 * Two taps to act, matching the cancel dialog: choose a slot, then confirm. The
 * confirmation step is not decoration — it is the same one-tap-to-open,
 * one-tap-to-confirm shape counsel required of the token landing page, and a
 * patient tapping a time in a list should never have moved their appointment by
 * that tap alone.
 */
export function RescheduleDialog({
  id,
  open,
  onClose,
}: {
  id: string
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [slots, setSlots] = useState<string[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // No synchronous setState here: the parent mounts this component fresh each
  // time the patient opens it, so the initial state IS the reset. Resetting
  // inside the effect only re-triggered renders (and tripped
  // react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getRescheduleOptionsAction(id).then((result) => {
      if (cancelled) return
      if ('error' in result) setLoadError(result.error)
      else setSlots(result.slots)
    })
    return () => {
      cancelled = true
    }
  }, [id, open])

  function confirm() {
    if (!chosen) return
    setActionError(null)
    startTransition(async () => {
      const result = await rescheduleAppointmentAction(id, chosen)
      if (result?.error) {
        setActionError(result.error)
        // The slot may have gone while they were deciding. Re-fetch so the list
        // they are looking at is the list the server would accept.
        const fresh = await getRescheduleOptionsAction(id)
        setSlots('error' in fresh ? [] : fresh.slots)
        setChosen(null)
      } else {
        onClose()
        router.refresh()
      }
    })
  }

  if (!open) return null

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{s.appointments.reschedule_choose}</h2>
      <p className="text-xs text-text-secondary">{s.appointments.reschedule_keeps}</p>

      {slots === null && !loadError && (
        <p className="text-xs text-text-secondary" role="status">
          {s.appointments.reschedule_loading}
        </p>
      )}

      {loadError && (
        <p role="alert" className="text-xs text-error">
          {loadError}
        </p>
      )}

      {slots !== null && slots.length === 0 && !loadError && (
        <p className="text-xs text-text-secondary">{s.appointments.reschedule_none}</p>
      )}

      {slots !== null && slots.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={s.appointments.reschedule_choose}>
          {slots.map((iso) => (
            <li key={iso}>
              <Button
                variant={chosen === iso ? 'primary' : 'secondary'}
                className="min-h-11 w-full justify-start"
                aria-pressed={chosen === iso}
                onClick={() => setChosen(iso)}
              >
                {formatSlot(iso)}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-error">
          {actionError}
        </p>
      )}

      <Dialog
        open={chosen !== null}
        onClose={() => setChosen(null)}
        title={s.appointments.reschedule_title}
        message={`${formatSlot(chosen ?? '')} — ${s.appointments.reschedule_confirm_body}`}
        icon={CalendarClock}
        confirmLabel={s.appointments.reschedule_confirm}
        cancelLabel={s.common.cancel}
        confirmLoading={pending}
        onConfirm={confirm}
      />
    </div>
  )
}

/**
 * Lisbon wall-clock, 24h, pt-PT. The server sends UTC; the patient thinks in
 * clinic time, and a reminder that says 14:30 must match a picker that says
 * 14:30.
 */
function formatSlot(iso: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(new Date(iso))
}

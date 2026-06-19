import type { StatusTone } from '@osteojp/ui'
import type { AppointmentStatus } from '@/lib/api/client'
import { s } from '@/lib/i18n'

// PT labels + semantic StatusChip tones for appointment states (SPEC-foundation
// §4.5 canonical mapping). Shared by the list rows and the detail summary.
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: s.appointments.status_pending,
  confirmed: s.appointments.status_confirmed,
  completed: s.appointments.status_completed,
  cancelled: s.appointments.status_cancelled,
  no_show: s.appointments.status_no_show,
}

export const STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  scheduled: 'warning',
  confirmed: 'success',
  completed: 'info',
  cancelled: 'neutral',
  no_show: 'error',
}

export function isUpcoming(startsAt: string, status: AppointmentStatus): boolean {
  return (
    status !== 'cancelled' &&
    status !== 'completed' &&
    status !== 'no_show' &&
    new Date(startsAt) > new Date()
  )
}

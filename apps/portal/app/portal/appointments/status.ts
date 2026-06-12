import type { StatusTone } from '@osteojp/ui'
import type { AppointmentStatus } from '@/lib/api/client'

// PT labels + semantic StatusChip tones for appointment states (SPEC-foundation
// §4.5 canonical mapping). Shared by the list rows and the detail summary.
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Aguarda confirmação',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
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

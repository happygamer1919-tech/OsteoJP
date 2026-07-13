'use server'

import { cancelAppointment, ApiError } from '@/lib/api/client'
import { s } from '@/lib/i18n'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function cancelAppointmentAction(
  id: string,
): Promise<{ error: string } | void> {
  try {
    await cancelAppointment(id)
    revalidatePath('/portal/appointments')
    revalidatePath('/portal/dashboard')
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/auth/login')
      // The 24h cutoff rejection gets its own message so the patient knows to
      // phone the clinic; every other failure gets a distinct generic one.
      if (err.isCutoffError()) {
        return { error: s.appointments.cancel_too_late }
      }
      return { error: s.appointments.cancel_error }
    }
    throw err
  }
}

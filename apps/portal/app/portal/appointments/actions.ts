'use server'

import { cancelAppointment, getRescheduleOptions, rescheduleAppointment, ApiError } from '@/lib/api/client'
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

export async function getRescheduleOptionsAction(
  id: string,
): Promise<{ slots: string[] } | { error: string }> {
  try {
    return { slots: await getRescheduleOptions(id) }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/auth/login')
      // 409 covers `cutoff` and `not_reschedulable`: there is nothing to offer,
      // and the patient needs the phone, not an empty list.
      if (err.status === 409) return { error: s.appointments.reschedule_too_late }
      return { error: s.appointments.reschedule_error }
    }
    throw err
  }
}

export async function rescheduleAppointmentAction(
  id: string,
  startsAt: string,
): Promise<{ error: string } | void> {
  try {
    await rescheduleAppointment(id, startsAt)
    revalidatePath('/portal/appointments')
    revalidatePath('/portal/dashboard')
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/auth/login')
      // The slot went while the patient was choosing. Common and not an error on
      // their part, so it gets its own copy telling them to pick another.
      if (err.code === 'no_slot') return { error: s.appointments.reschedule_slot_taken }
      if (err.isCutoffError()) return { error: s.appointments.reschedule_too_late }
      if (err.code === 'min_notice') return { error: s.appointments.reschedule_min_notice }
      return { error: s.appointments.reschedule_error }
    }
    throw err
  }
}

'use server'

import { bookAppointment, ApiError } from '@/lib/api/client'
import { redirect } from 'next/navigation'

type BookingInput = {
  serviceId: string
  locationId: string
  startsAt: string
}

export async function submitBooking(
  input: BookingInput,
): Promise<{ error: string; slotTaken?: boolean } | void> {
  try {
    const appointment = await bookAppointment(input)
    redirect(`/portal/booking/pending?id=${appointment.id}`)
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        return {
          error: 'Este horário já não está disponível. Por favor escolha outro.',
          slotTaken: true,
        }
      }
      if (err.status === 401) {
        redirect('/auth/login')
      }
      return {
        error: 'Não foi possível submeter a marcação. Tente novamente ou ligue para a clínica.',
      }
    }
    // redirect() throws NEXT_REDIRECT — rethrow it
    throw err
  }
}

'use server'

import {
  bookAppointment,
  getBookableTherapists,
  getOpenSlots,
  ApiError,
  type BookableTherapist,
} from '@/lib/api/client'
import { redirect } from 'next/navigation'

type BookingInput = {
  serviceId: string
  locationId: string
  startsAt: string
  /** A2: null means "choose for me", which is the pre-A2 behaviour. */
  practitionerId?: string | null
}

export type BookingRejection = {
  error: string
  /** The offered list is stale — the UI must refetch slots before retrying. */
  slotTaken?: boolean
}

export async function submitBooking(
  input: BookingInput,
): Promise<BookingRejection | void> {
  try {
    const appointment = await bookAppointment(input)
    redirect(`/portal/booking/pending?id=${appointment.id}`)
  } catch (err) {
    if (err instanceof ApiError) {
      // Honest wording per API code. `no_therapist` = nobody works that window
      // (schedule gap); `no_slot` = a real race on a slot that WAS free. Both
      // invalidate the offered list, so both set slotTaken to force a refetch.
      if (err.code === 'no_therapist') {
        return {
          error: 'Não há terapeutas disponíveis neste horário. Escolha outro horário disponível.',
          slotTaken: true,
        }
      }
      if (err.status === 409) {
        return {
          error: 'Este horário já não está disponível. Escolha outro horário ou contacte a clínica.',
          slotTaken: true,
        }
      }
      if (err.status === 401) {
        redirect('/auth/login')
      }
      return {
        error: 'Não foi possível enviar a marcação. Tente novamente ou ligue para a clínica.',
      }
    }
    // redirect() throws NEXT_REDIRECT — rethrow it
    throw err
  }
}

export type SlotsResult = { slots: string[] } | { error: string }

/**
 * Step-3 slot list, from the API's availability endpoint (the same source the
 * booking confirm validates against). Called on entry to step 3 and again
 * after any rejected confirm, so the patient never re-picks a dead slot.
 */
export async function loadSlots(
  serviceId: string,
  locationId: string,
  practitionerId?: string | null,
): Promise<SlotsResult> {
  try {
    const slots = await getOpenSlots(serviceId, locationId, practitionerId)
    return { slots }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/auth/login')
    }
    return {
      error: 'Não foi possível carregar os horários. Tente novamente ou ligue para a clínica.',
    }
  }
}

export type TherapistsResult = { therapists: BookableTherapist[] } | { error: string }

/**
 * A2 step-3 roster: who could see this patient at this clinic.
 *
 * NOT an availability call. It runs before a date is chosen, so it answers
 * roster membership only; free/busy is decided by loadSlots afterwards.
 */
export async function loadTherapists(
  serviceId: string,
  locationId: string,
): Promise<TherapistsResult> {
  try {
    const therapists = await getBookableTherapists(serviceId, locationId)
    return { therapists }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/auth/login')
    }
    return {
      error: 'Não foi possível carregar os terapeutas. Tente novamente ou ligue para a clínica.',
    }
  }
}

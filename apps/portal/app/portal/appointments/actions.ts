'use server'

import { cancelAppointment, ApiError } from '@/lib/api/client'
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
      if (err.isCutoffError()) {
        return {
          error:
            'Não é possível cancelar com menos de 24 horas de antecedência. Por favor ligue para a clínica.',
        }
      }
      return { error: 'Não foi possível cancelar. Tente novamente.' }
    }
    throw err
  }
}

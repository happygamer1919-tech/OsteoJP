'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'

type Patch = {
  phone?: string
  address?: string
  postalCode?: string
  city?: string
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? ''
}

export async function updateProfileAction(
  patch: Patch,
): Promise<{ error: string } | void> {
  // Strip empty strings to null so the API clears them
  const body: Record<string, string | null> = {}
  if (patch.phone !== undefined) body.phone = patch.phone.trim() || null
  if (patch.address !== undefined) body.address = patch.address.trim() || null
  if (patch.postalCode !== undefined) body.postalCode = patch.postalCode.trim() || null
  if (patch.city !== undefined) body.city = patch.city.trim() || null

  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ')

  try {
    const res = await fetch(`${apiBase()}/api/v1/patient/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      if (err.error === 'invalid_phone') {
        return { error: 'Número de telemóvel inválido. Use o formato +351 912 345 678.' }
      }
      return { error: 'Não foi possível actualizar os dados. Tente novamente.' }
    }

    // Read the updated profile from the response and sync fullName to auth
    // user_metadata. Best-effort: profile save is the critical path; a metadata
    // sync failure must not surface as an error to the patient.
    try {
      const data = await res.json() as { profile?: { fullName?: string } }
      const fullName = data.profile?.fullName ?? ''
      if (fullName) {
        const spaceIdx = fullName.indexOf(' ')
        const first_name = spaceIdx === -1 ? fullName : fullName.slice(0, spaceIdx)
        const last_name = spaceIdx === -1 ? '' : fullName.slice(spaceIdx + 1)
        const supabase = await createServerClient()
        const { error: metaError } = await supabase.auth.updateUser({
          data: { first_name, last_name },
        })
        if (metaError) {
          console.error('[updateProfileAction] metadata sync failed:', metaError.message)
        }
      }
    } catch (metaErr) {
      console.error('[updateProfileAction] metadata sync error:', metaErr)
    }

    revalidatePath('/portal/account')
  } catch {
    return { error: 'Erro de ligação. Verifique a sua internet e tente novamente.' }
  }
}

export async function updateReminderPrefsAction(prefs: {
  smsEnabled: boolean
  emailEnabled: boolean
}): Promise<{ error: string } | void> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ')

  try {
    const res = await fetch(`${apiBase()}/api/v1/patient/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        reminderSmsEnabled: prefs.smsEnabled,
        reminderEmailEnabled: prefs.emailEnabled,
      }),
    })

    if (!res.ok) {
      return { error: 'Não foi possível guardar as preferências. Tente novamente.' }
    }

    revalidatePath('/portal/account')
  } catch {
    return { error: 'Erro de ligação. Verifique a sua internet e tente novamente.' }
  }
}

'use server'

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

// Build the Authorization header from the portal's own server-side Supabase
// session. The session is read from the incoming browser request's cookies by
// createServerClient — no cross-app cookie forwarding needed. This is more
// reliable than building a Cookie string by hand (which is sensitive to value
// encoding, SameSite, and cookie-path scoping across ports).
async function apiAuthHeader(): Promise<Record<string, string>> {
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    console.error('[portal/actions] apiAuthHeader: getSession() returned no session — portal→API calls will be unauthenticated')
    return {}
  }
  return { Authorization: `Bearer ${session.access_token}` }
}

export async function updateProfileAction(
  patch: Patch,
): Promise<{ error: string } | void> {
  const body: Record<string, string | null> = {}
  if (patch.phone !== undefined) body.phone = patch.phone.trim() || null
  if (patch.address !== undefined) body.address = patch.address.trim() || null
  if (patch.postalCode !== undefined) body.postalCode = patch.postalCode.trim() || null
  if (patch.city !== undefined) body.city = patch.city.trim() || null

  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  try {
    const res = await fetch(`${apiBase()}/api/v1/patient/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
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

    // Sync fullName to auth user_metadata. Best-effort: a sync failure must
    // not surface as an error to the patient.
    try {
      const data = await res.json() as { profile?: { fullName?: string } }
      const fullName = data.profile?.fullName ?? ''
      if (fullName) {
        const spaceIdx = fullName.indexOf(' ')
        const first_name = spaceIdx === -1 ? fullName : fullName.slice(0, spaceIdx)
        const last_name = spaceIdx === -1 ? '' : fullName.slice(spaceIdx + 1)
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
  const authHeader = await apiAuthHeader()

  try {
    const res = await fetch(`${apiBase()}/api/v1/patient/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
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

'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

type Patch = {
  phone?: string
  address?: string
  postalCode?: string
  city?: string
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? ''
}

// Read the Supabase access_token directly from the session cookie.
// The browser client (@supabase/ssr createBrowserClient) stores the session
// as JSON (base64url-encoded, prefixed with "base64-") in a cookie named
// sb-{hostname[0]}-auth-token. We parse it here instead of going through
// createServerClient().auth.getSession() to avoid the @supabase/ssr lock
// contention that can occur when multiple server actions run in parallel.
async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  let storageKey: string
  try {
    const url = new URL(supabaseUrl)
    storageKey = `sb-${url.hostname.split('.')[0]}-auth-token`
  } catch {
    return null
  }

  const allCookies = cookieStore.getAll()
  const sessionCookie =
    allCookies.find(c => c.name === storageKey) ??
    allCookies.find(c => c.name === `${storageKey}.0`)
  if (!sessionCookie?.value) return null

  let jsonStr = sessionCookie.value
  if (jsonStr.startsWith('base64-')) {
    try {
      jsonStr = Buffer.from(jsonStr.slice(7), 'base64url').toString('utf-8')
    } catch {
      return null
    }
  }
  try {
    const session = JSON.parse(jsonStr) as { access_token?: string }
    return session.access_token ?? null
  } catch {
    return null
  }
}

async function apiAuthHeader(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export async function updateProfileAction(
  patch: Patch,
): Promise<{ error: string } | void> {
  const body: Record<string, string | null> = {}
  if (patch.phone !== undefined) body.phone = patch.phone.trim() || null
  if (patch.address !== undefined) body.address = patch.address.trim() || null
  if (patch.postalCode !== undefined) body.postalCode = patch.postalCode.trim() || null
  if (patch.city !== undefined) body.city = patch.city.trim() || null

  const authHeader = await apiAuthHeader()

  try {
    const res = await fetch(`${apiBase()}/api/v1/patient/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
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
        const { createServerClient } = await import('@/lib/supabase/server')
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

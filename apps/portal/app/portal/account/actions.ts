'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { clearDeviceToken } from '@/lib/auth/device'
import { clearPortalSession, readPortalSession } from '@/lib/auth/session'

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
  // W13-03: THE PATIENT SESSION FIRST, matching lib/api/client.ts. An
  // OTP-authenticated patient has no Supabase cookie at all — Decision D mints
  // no Supabase session for a patient — so without this line every profile edit
  // went out with NO Authorization header and came back 401, and the account
  // screen's "editar dados" was broken for everyone who logged in the new way.
  const portalSession = await readPortalSession()
  if (portalSession) return { Authorization: `Bearer ${portalSession}` }

  const token = await getAccessToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * W13-03 — end the session, on this device.
 *
 * IT DROPS THE TRUSTED DEVICE TOO, and that is the whole point of the action
 * existing. "Terminar sessão" that left a 30-day credential in the browser would
 * hand the next person at a shared handset a login with no code, which is
 * precisely the case a patient signs out to prevent.
 *
 * WHAT IT CANNOT DO, stated so nobody reads more into it: revoke the device ROW.
 * The token is gone from this browser and unrecoverable, so this device can
 * never present it again — but the row lives out its 30 days server-side. A
 * revoke endpoint is API work and is carded, not silently assumed here.
 */
export async function signOutAction(): Promise<void> {
  await clearPortalSession()
  await clearDeviceToken()
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

    // LE-portal-supabase-residue, 2026-08-07: the auth user_metadata sync is
    // GONE. It split the name into first_name/last_name and wrote them to a
    // Supabase auth user that an OTP patient does not have, so updateUser had no
    // subject and the whole block was a no-op wrapped in a best-effort try that
    // guaranteed nobody would ever notice.
    //
    // Nothing read those fields either: the account screen renders
    // profile.fullName from the API, which is what the PATCH above already
    // updated. Removing it deletes a write with no writer and no reader.

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

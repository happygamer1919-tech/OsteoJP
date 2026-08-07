'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { clearDeviceToken, readDeviceToken } from '@/lib/auth/device'
import { PORTAL_DEVICE_COOKIE } from '@/lib/auth/cookie-names'
import { clearPortalSession, readPortalSession } from '@/lib/auth/session'
import { apiBase } from '@/lib/api/base'

type Patch = {
  phone?: string
  address?: string
  postalCode?: string
  city?: string
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
/**
 * Sign out: drop both cookies AND revoke the device row server-side.
 *
 * LE-trusted-device-revoke. Clearing the cookies was already correct and already
 * sufficient for every practical case - the token exists in exactly one browser,
 * so dropping it there makes it unpresentable. What was missing is the SERVER
 * side: `patient_trusted_devices.revoked_at` stayed null for the full 30 days,
 * so a token captured before sign-out remained live, and "we cannot revoke" was
 * the answer available when a patient reported a lost phone.
 *
 * ORDER MATTERS AND IS DELIBERATE. The revoke call needs the device token, so it
 * runs BEFORE clearDeviceToken. Reversing them would silently turn this back
 * into a cookie-only sign-out - the exact bug being fixed, reintroduced by a
 * tidy-looking reorder.
 *
 * BEST-EFFORT, AND THAT IS A CHOICE RATHER THAN AN OVERSIGHT. If the API is
 * unreachable the cookies are still cleared and the patient IS signed out of
 * this browser. Failing the sign-out because a revocation could not be recorded
 * would leave them signed IN, which is strictly worse than a row that keeps a
 * null `revoked_at` for a token nobody holds any more.
 */
export async function signOutAction(): Promise<void> {
  const deviceToken = await readDeviceToken()
  if (deviceToken) {
    try {
      await fetch(`${apiBase()}/api/v1/auth/otp/revoke`, {
        method: 'POST',
        // The route authenticates on the device cookie and takes no body, so the
        // cookie is all that is forwarded. Same shape as /otp/trusted.
        headers: { Cookie: `${PORTAL_DEVICE_COOKIE}=${deviceToken}` },
        cache: 'no-store',
      })
    } catch {
      // See the header: a failed revoke must not block the sign-out.
    }
  }
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

import 'server-only'

import { apiBase } from '@/lib/api/base'
import { tenantId } from '@/lib/tenant'

/**
 * GUEST-04 — the portal's server-side half of the public booking form.
 *
 * SERVER-TO-SERVER, exactly as `lib/auth/otp.ts` is, and for the same two
 * reasons. The browser never learns the tenant id, and the browser never talks
 * to the API directly, so the only shape a caller on this origin can send is the
 * one the server action below builds.
 *
 * THE CALLER IS ANONYMOUS AND STAYS ANONYMOUS. Nothing here reads a cookie,
 * mints a session or touches the patient table. A guest is somebody the clinic
 * has no record of; the whole flow ends with a row in `guest_booking_requests`
 * that a human converts.
 */

/** Names only, never values, and never the name or the number (PII rule #7). */
function logUnavailable(where: string, e: unknown): void {
  console.error(`[guest] ${where}: ${e instanceof Error ? e.message : 'unavailable'}`)
}

export type PublicService = { id: string; name: string; locationIds: string[] }
export type PublicLocation = { id: string; name: string }
export type PublicCatalog = { locations: PublicLocation[]; services: PublicService[] }

/**
 * What can be booked, and where. The ONE unauthenticated read Option A allows.
 *
 * REVALIDATE 300, AND WHAT THAT IS AND IS NOT. The intent is that a flood of
 * anonymous page loads does not become one database read each. It is NOT
 * asserted as a guarantee: the page is `force-dynamic` (see page.tsx for why -
 * static prerendering baked an error screen), and `force-dynamic` sets the
 * segment's default fetch policy to no-store, so whether this explicit
 * `revalidate` still populates the data cache depends on how Next resolves the
 * two. Nothing here proves it, so nothing here claims it.
 *
 * WHAT ACTUALLY BOUNDS THE READ IS THE ENDPOINT. `RULES.guestCatalogIp` caps a
 * source at 30/minute and 200/hour on the durable store, which is the control
 * designed for this and the one that holds whichever way the cache resolves. A
 * per-IP limit on the PAGE was considered and rejected: it would turn a burst of
 * genuine interest in a public booking form into a closed door.
 *
 * RETURNS null ON FAILURE, and the caller renders an explicit error state.
 * Empty lists are NOT used to signal failure: "the clinic offers nothing" and
 * "we could not ask" would render identically, which is the silent-empty defect
 * `app/portal/no-silent-empty.test.ts` exists to prevent.
 */
export async function fetchPublicCatalog(): Promise<PublicCatalog | null> {
  let url: string
  try {
    url = `${apiBase()}/api/v1/booking/guest/catalog?tenantId=${encodeURIComponent(tenantId())}`
  } catch (e) {
    logUnavailable('catalog', e)
    return null
  }

  try {
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) {
      logUnavailable('catalog', new Error(`api answered ${res.status}`))
      return null
    }
    return (await res.json()) as PublicCatalog
  } catch (e) {
    logUnavailable('catalog', e)
    return null
  }
}

export type GuestRequestInput = {
  fullName: string
  phone: string
  serviceId: string
  locationId: string
  /** YYYY-MM-DD, Europe/Lisbon. */
  preferredDate: string
  /** 'manha' | 'tarde'. Validated by the API against its own union. */
  preferredPeriod: string
}

export type GuestSubmitOutcome = 'received' | 'invalid' | 'rate_limited' | 'unavailable'

/**
 * POST the request. The API answers 202 for every accepted call, identically
 * whether or not the number belongs to an existing patient - that is the
 * no-oracle property, and this function must not develop a second outcome that
 * would rebuild it on this origin.
 */
export async function submitGuestRequest(
  input: GuestRequestInput,
): Promise<GuestSubmitOutcome> {
  let body: string
  try {
    body = JSON.stringify({ ...input, tenantId: tenantId() })
  } catch (e) {
    logUnavailable('submit', e)
    return 'unavailable'
  }

  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/v1/booking/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    })
  } catch (e) {
    logUnavailable('submit', e)
    return 'unavailable'
  }

  if (res.status === 202) return 'received'
  if (res.status === 400) return 'invalid'
  if (res.status === 429) return 'rate_limited'
  logUnavailable('submit', new Error(`api answered ${res.status}`))
  return 'unavailable'
}

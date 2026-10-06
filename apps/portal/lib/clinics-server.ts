import 'server-only'

import { apiBase } from '@/lib/api/base'
import { tenantId } from '@/lib/tenant'

import { clinicCardsFor, type ClinicCard, type ClinicLocation } from './clinics'

/**
 * R45 (strategy, 2026-10-06) - THE CLINICS A PATIENT IS SHOWN, READ FROM THE
 * ACTIVE LOCATIONS.
 *
 * ==========================================================================
 * WHERE THE LIST COMES FROM
 * ==========================================================================
 * `GET /api/v1/booking/guest/catalog`, the one read the API answers without a
 * session. Two of the screens that need this list (the login screen and the
 * public form) run before any sign-in, and the third (Clínicas) is public by
 * design, so it cannot come from an authenticated read. The route lists a
 * location only when it is active AND somebody bookable has hours there, which
 * is the rule strategy's gate G1 states for every patient-facing surface: a
 * clinic that has not opened yet is not on any of them.
 *
 * ==========================================================================
 * IT IS REMEMBERED, IN THIS PROCESS, AND THAT IS NOT A NICETY
 * ==========================================================================
 * The login screen is the portal's only way in. Before this it rendered from
 * constants and waited on nothing. So:
 *
 *   - A GOOD ANSWER IS KEPT FOR FIVE MINUTES. Which clinics exist changes a few
 *     times a year; a read per page view would be waste.
 *   - TWO SECONDS, THEN GIVE UP. A slow API must not hold the login screen. The
 *     caller falls back to the published list (`lib/clinics.ts`).
 *   - A FAILURE IS REMEMBERED TOO, FOR THIRTY SECONDS. Without that, every page
 *     view during an outage would wait out its own two seconds to learn what
 *     the previous one just learned.
 *   - ONE READ AT A TIME. Callers that arrive while a read is in flight share
 *     it.
 *   - THE LAST GOOD ANSWER OUTLIVES ITS FIVE MINUTES WHEN THE NEXT READ FAILS.
 *     A list that is an hour old names the right clinics almost always; no list
 *     names none.
 *
 * The memo is a module variable on purpose. Next's own fetch cache is switched
 * off by `force-dynamic`, which the Clínicas page sets, and whether an explicit
 * `revalidate` survives that is the question `lib/guest/api.ts` declines to
 * answer. A variable has no such question.
 *
 * ==========================================================================
 * NULL MEANS "COULD NOT ASK", AND SO DOES AN EMPTY LIST
 * ==========================================================================
 * `null` is returned when the list could not be read and nothing is remembered.
 * A successful read that lists NO clinic is treated the same way, and that is
 * a decision: every caller uses this list to tell a patient what to telephone,
 * and "the clinic has no clinics" is never the true reading of an empty answer
 * here. It is a wrong tenant variable or a database with no schedules in it,
 * and the published list is the better thing to show for either.
 */

const REMEMBER_MS = 5 * 60 * 1000
const REMEMBER_FAILURE_MS = 30 * 1000
export const GIVE_UP_MS = 2000

let remembered: { at: number; cards: ClinicCard[] } | null = null
let failedAt: number | null = null
let inFlight: Promise<ClinicCard[] | null> | null = null

/** Tests only: forget what was read, so a test can ask again. */
export function resetClinicCardsMemo(): void {
  remembered = null
  failedAt = null
  inFlight = null
}

/** Names only, never values (PII rule #7): the failure, not the answer. */
function logUnavailable(e: unknown): void {
  console.error(`[clinics] directory: ${e instanceof Error ? e.message : 'unavailable'}`)
}

function isLocation(value: unknown): value is ClinicLocation {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const text = (x: unknown) => x === undefined || x === null || typeof x === 'string'
  return typeof v.id === 'string' && typeof v.name === 'string' && text(v.address) && text(v.phone)
}

async function readClinicCards(): Promise<ClinicCard[] | null> {
  let url: string
  try {
    url = `${apiBase()}/api/v1/booking/guest/catalog?tenantId=${encodeURIComponent(tenantId())}`
  } catch (e) {
    logUnavailable(e)
    return null
  }

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(GIVE_UP_MS) })
    if (!res.ok) {
      logUnavailable(new Error(`api answered ${res.status}`))
      return null
    }
    // The body is read apart from the rest so that a body that is not JSON is
    // logged as that, and the parser's own message, which quotes the first
    // characters of what it read, never reaches the log.
    let body: { locations?: unknown }
    try {
      body = (await res.json()) as { locations?: unknown }
    } catch (e) {
      if (e instanceof SyntaxError) {
        logUnavailable(new Error('api answered a body that is not JSON'))
        return null
      }
      throw e
    }
    if (!Array.isArray(body.locations) || !body.locations.every(isLocation)) {
      logUnavailable(new Error('api answered an unexpected shape'))
      return null
    }
    if (body.locations.length === 0) {
      logUnavailable(new Error('api listed no clinic'))
      return null
    }
    return clinicCardsFor(body.locations)
  } catch (e) {
    logUnavailable(e)
    return null
  }
}

/**
 * The clinics to show a patient, or null when they cannot be read. Callers fall
 * back to `PUBLISHED_CLINIC_CARDS` / `PUBLISHED_CLINIC_PHONES`.
 */
export async function loadClinicCards(now: number = Date.now()): Promise<ClinicCard[] | null> {
  if (remembered && now - remembered.at < REMEMBER_MS) return remembered.cards
  // A read failed a moment ago: answer with what is in hand, without asking.
  if (failedAt !== null && now - failedAt < REMEMBER_FAILURE_MS) return remembered?.cards ?? null

  inFlight ??= readClinicCards().finally(() => {
    inFlight = null
  })
  const fresh = await inFlight
  if (fresh) {
    remembered = { at: now, cards: fresh }
    return fresh
  }
  failedAt = now
  return remembered?.cards ?? null
}

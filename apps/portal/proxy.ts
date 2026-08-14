import { NextResponse, type NextRequest } from 'next/server'

import { PORTAL_SESSION_COOKIE } from '@/lib/auth/cookie-names'

/**
 * W13-03 — who may see a portal page.
 *
 * IT ASKS THE PORTAL SESSION COOKIE AND NOTHING ELSE. Before this it asked
 * Supabase, and after Decision D that question has no answer for a patient: an
 * OTP-authenticated patient has no Supabase session by construction — WF-07
 * refuses to link a patient row that already belongs to an auth user — so every
 * patient who logged in through the new screens was redirected straight back to
 * the login screen. A login that cannot be used is not a login.
 *
 * PRESENCE, NOT VALIDITY, AND THAT IS DELIBERATE. This middleware checks that a
 * cookie is there; it does not and must not check that the token inside it is
 * good. The signing secret lives in the API project and nowhere else, so this
 * app could not verify honestly even if it tried, and a middleware that
 * "checked" a token it cannot verify would be reading the caller's own claims
 * and believing them — the SEC-W1-patient-jwt-verify defect exactly.
 *
 * THE REAL GATE IS EVERY API CALL. A forged or expired cookie gets a patient
 * past this line and then fails at the first request for data, because the API
 * verifies the token on every route and answers 401. So the worst a bad cookie
 * buys is an error screen, never a record. `session-opacity.test.ts` asserts no
 * verification symbol is reachable in this app at all.
 */

/**
 * Reachable without a session. `/auth/login` is the only entry point left:
 * `/auth/activate`, `/auth/reset-password` and `/auth/callback` were deleted
 * with the password login, so listing them here would keep a door open in the
 * one file most likely to be read as the door list.
 *
 * `/marcacao` IS PUBLIC BY DESIGN (GUEST-04). It is the booking form for people
 * who are NOT patients: they have no record, no account and nothing to log in
 * with, so requiring a session would refuse every legitimate visitor. It is the
 * only entry here that is not part of the patient's own portal, and it sits
 * outside the `/portal` prefix for exactly that reason — everything under that
 * prefix belongs to a signed-in person, and this page belongs to a stranger.
 * What it may reach is bounded at the API, not here: one public catalog read and
 * one write to `guest_booking_requests`, both rate limited, neither touching a
 * clinical table. See docs/recon/W13-06-exposure-matrix.md rows 20 and 21.
 */
const PUBLIC_PATHS = ['/auth/login', '/portal/clinics', '/marcacao']

export async function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(PORTAL_SESSION_COOKIE)?.value)
  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  if (hasSession && pathname.startsWith('/auth/login')) {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url))
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

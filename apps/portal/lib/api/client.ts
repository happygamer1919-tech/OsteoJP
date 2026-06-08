/**
 * Portal API client — wraps apps/api (api.osteojp.pt) endpoints.
 *
 * All requests are made server-side (Next.js Server Components / Server Actions)
 * using the session cookie forwarded from the portal request. The patient never
 * touches apps/api directly — every call goes through these helpers.
 *
 * Base URL comes from NEXT_PUBLIC_API_URL (set per Vercel environment).
 * Fallback to relative /api for local dev when portal and api run on the same
 * host (unlikely, but safe).
 */

import { cookies } from 'next/headers'

// ─── Types (mirrored from apps/api/lib/appointments/booking.ts) ──────────────

export type BookableLocation = {
  id: string
  name: string
}

export type BookableService = {
  id: string
  name: string
  durationMin: number
  priceCents: number | null
  currency: string
  locationIds: string[]
}

export type BookableCatalog = {
  locations: BookableLocation[]
  services: BookableService[]
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export type AppointmentView = {
  id: string
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  serviceName: string | null
  locationName: string | null
  practitionerName: string | null
  room: string | null
}

export type BookingInput = {
  serviceId: string
  locationId: string
  startsAt: string // ISO 8601 UTC
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? ''
}

/**
 * Forward the portal session cookie to apps/api so the patient's JWT is
 * validated server-side by getPatientPrincipal().
 */
async function apiHeaders(): Promise<HeadersInit> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ')
  return {
    'Content-Type': 'application/json',
    Cookie: cookieHeader,
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

/** GET /api/v1/booking/catalog — bookable services + locations for the patient's tenant */
export async function getBookableCatalog(): Promise<BookableCatalog> {
  const res = await fetch(`${apiBase()}/api/v1/booking/catalog`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`)
  return res.json() as Promise<BookableCatalog>
}

/** GET /api/v1/appointments — patient's own appointments */
export async function getMyAppointments(): Promise<AppointmentView[]> {
  const res = await fetch(`${apiBase()}/api/v1/appointments`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`appointments fetch failed: ${res.status}`)
  const data = await res.json() as { appointments: AppointmentView[] }
  return data.appointments
}

/** POST /api/v1/appointments — book a slot */
export async function bookAppointment(input: BookingInput): Promise<AppointmentView> {
  const res = await fetch(`${apiBase()}/api/v1/appointments`, {
    method: 'POST',
    headers: await apiHeaders(),
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: string; message?: string }
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? 'Booking failed')
  }
  const data = await res.json() as { appointment: AppointmentView }
  return data.appointment
}

/** PATCH /api/v1/appointments/:id/cancel — cancel an appointment */
export async function cancelAppointment(id: string): Promise<void> {
  const res = await fetch(`${apiBase()}/api/v1/appointments/${id}/cancel`, {
    method: 'PATCH',
    headers: await apiHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: string; message?: string }
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? 'Cancel failed')
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** True when the cancel failed because the 24h cutoff passed. */
  isCutoffError(): boolean {
    return this.code === 'CANCELLATION_CUTOFF'
  }
}

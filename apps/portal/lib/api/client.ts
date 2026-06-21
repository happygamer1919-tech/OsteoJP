/**
 * Portal API client — wraps apps/api (api.osteojp.pt) endpoints.
 */

import { createServerClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  startsAt: string
}

export type PatientProfile = {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  address: string | null
  postalCode: string | null
  city: string | null
  reminderSmsEnabled: boolean
  reminderEmailEnabled: boolean
}

export type PatientProfilePatch = {
  phone?: string | null
  address?: string | null
  postalCode?: string | null
  city?: string | null
}

export type PatientDocument = {
  id: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
}

export type PatientFormSubmission = {
  id: string
  formKey: string
  therapy: string | null
  source: string
  reviewState: string
  submittedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? ''
}

// Use the portal's own Supabase session to build an Authorization: Bearer
// header for server-to-server calls to apps/api. This avoids the fragility of
// manually forwarding the Cookie header string (encoding edge cases, SameSite
// restrictions, cookie-path scoping). The portal server can always read its
// own session from the incoming browser request via createServerClient, so
// extracting the access_token here is safe even without network round-trips.
async function apiHeaders(): Promise<HeadersInit> {
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  return headers
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

  isCutoffError(): boolean {
    return this.code === 'CANCELLATION_CUTOFF'
  }
}

// ─── Booking catalog ──────────────────────────────────────────────────────────

export async function getBookableCatalog(): Promise<BookableCatalog> {
  const res = await fetch(`${apiBase()}/api/v1/booking/catalog`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`)
  return res.json() as Promise<BookableCatalog>
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export async function getMyAppointments(): Promise<AppointmentView[]> {
  const res = await fetch(`${apiBase()}/api/v1/appointments`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`appointments fetch failed: ${res.status}`)
  const data = await res.json() as { appointments: AppointmentView[] }
  return data.appointments
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function getMyDocuments(): Promise<PatientDocument[]> {
  const res = await fetch(`${apiBase()}/api/v1/patient/documents`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`documents fetch failed: ${res.status}`)
  const data = await res.json() as { documents: PatientDocument[] }
  return data.documents
}

/** Short-lived signed URL for one of the patient's own documents. */
export async function getDocumentDownloadUrl(id: string): Promise<string> {
  const res = await fetch(`${apiBase()}/api/v1/patient/documents/${id}/download`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Document download failed')
  }
  const data = await res.json() as { url: string }
  return data.url
}

// ─── Forms (intake submissions) ────────────────────────────────────────────────

export async function getMyForms(): Promise<PatientFormSubmission[]> {
  const res = await fetch(`${apiBase()}/api/v1/me/forms`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`forms fetch failed: ${res.status}`)
  const data = await res.json() as { submissions: PatientFormSubmission[] }
  return data.submissions
}

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

// ─── Patient profile ──────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<PatientProfile> {
  const res = await fetch(`${apiBase()}/api/v1/patient/profile`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`)
  const data = await res.json() as { profile: PatientProfile }
  return data.profile
}

export async function updateMyProfile(patch: PatientProfilePatch): Promise<PatientProfile> {
  const res = await fetch(`${apiBase()}/api/v1/patient/profile`, {
    method: 'PATCH',
    headers: await apiHeaders(),
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, err.error ?? 'UNKNOWN', 'Profile update failed')
  }
  const data = await res.json() as { profile: PatientProfile }
  return data.profile
}

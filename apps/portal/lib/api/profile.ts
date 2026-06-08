// Appended to lib/api/client.ts — profile endpoints

export type PatientProfile = {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  address: string | null
  postalCode: string | null
  city: string | null
}

export type PatientProfilePatch = {
  phone?: string | null
  address?: string | null
  postalCode?: string | null
  city?: string | null
}

/** GET /api/v1/patient/profile */
export async function getMyProfile(): Promise<PatientProfile> {
  const res = await fetch(`${apiBase()}/api/v1/patient/profile`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`)
  const data = await res.json() as { profile: PatientProfile }
  return data.profile
}

/** PATCH /api/v1/patient/profile */
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

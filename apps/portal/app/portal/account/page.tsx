import { getMyProfile } from '@/lib/api/client'
import type { PatientProfile } from '@/lib/api/client'
import { AccountView } from './AccountView'

export default async function AccountPage() {
  // LE-portal-supabase-residue, 2026-08-07: the supabase.auth.getUser() fallback
  // for name and email is GONE. It could never fire. Decision D routes every
  // patient through OTP, and WF-07 REFUSES to link a patient row that already has
  // an auth user - so `user` was structurally always null and the `??` branches
  // after it were unreachable.
  //
  // Removed rather than left because a dead branch that reads as live is exactly
  // what WF-08 was ruled on: sendPatientActivation sat inert in this tree for two
  // waves looking like a working feature. The profile from the API is now the
  // only source, which is what actually rendered anyway.

  // No try/catch. A failed profile fetch used to degrade silently to whatever
  // the auth user object happened to carry, so the account screen rendered with
  // a blank or stale name and email and looked like it had loaded. That is the
  // same class of lie the dashboard told about appointments. It now propagates
  // to error.tsx in this directory, which renders an explicit could-not-load
  // with a retry.
  const profile: PatientProfile = await getMyProfile()

  const fullName = profile?.fullName ?? ''
  const email = profile?.email ?? ''

  return <AccountView profile={profile} fullName={fullName} email={email} />
}

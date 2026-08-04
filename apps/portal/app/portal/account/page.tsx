import { createServerClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/api/client'
import type { PatientProfile } from '@/lib/api/client'
import { AccountView } from './AccountView'

export default async function AccountPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No try/catch. A failed profile fetch used to degrade silently to whatever
  // the auth user object happened to carry, so the account screen rendered with
  // a blank or stale name and email and looked like it had loaded. That is the
  // same class of lie the dashboard told about appointments. It now propagates
  // to error.tsx in this directory, which renders an explicit could-not-load
  // with a retry.
  const profile: PatientProfile = await getMyProfile()

  const fullName =
    profile?.fullName ?? (user?.user_metadata?.full_name as string | undefined) ?? ''
  const email = profile?.email ?? user?.email ?? ''

  return <AccountView profile={profile} fullName={fullName} email={email} />
}

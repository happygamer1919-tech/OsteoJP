import { createServerClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/api/client'
import type { PatientProfile } from '@/lib/api/client'
import { AccountView } from './AccountView'

export default async function AccountPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: PatientProfile | null = null
  try {
    profile = await getMyProfile()
  } catch {
    // non-fatal — degrade to auth user data
  }

  const fullName =
    profile?.fullName ?? (user?.user_metadata?.full_name as string | undefined) ?? ''
  const email = profile?.email ?? user?.email ?? ''

  return <AccountView profile={profile} fullName={fullName} email={email} />
}

import { redirect } from 'next/navigation'

import { readPortalSession } from '@/lib/auth/session'

/**
 * The root path is a fork, not a page.
 *
 * It asks the same question `proxy.ts` asks, and for the same reason it now asks
 * it of the PORTAL session rather than of Supabase: an OTP-authenticated patient
 * has no Supabase session, so this file used to send every logged-in patient
 * back to the login screen from the one URL they are most likely to type.
 */
export default async function RootPage() {
  const session = await readPortalSession()
  redirect(session ? '/portal/dashboard' : '/auth/login')
}

import { getMyProfile } from '@/lib/api/client'
import type { PatientProfile } from '@/lib/api/client'
import { resolvePortalLocale } from '@/lib/locale-server'
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

  /**
   * LANG-02 — the Idioma row's value, RESOLVED rather than hardcoded.
   *
   * It printed `s.account.language_pt`, a literal, for everybody. That was
   * inert while Portuguese was the only thing the portal rendered, and it
   * becomes a FALSE STATEMENT the moment it is not: a screen telling an English
   * patient, in English, that their language is Portuguese.
   *
   * IT IS THE RESOLVED LOCALE AND NOT A STORED PREFERENCE, and the difference
   * is worth stating because the row sits under "Preferências" beside fields
   * that ARE stored. Today it says which language this page is being rendered
   * in, which is true on every render and is the strongest claim available: the
   * patient language COLUMN is BLUE's and does not exist yet.
   *
   * WHAT THAT MEANS IN PRACTICE, said plainly rather than implied: an
   * authenticated patient reaches this page without `?lang=`, so this resolves
   * to `pt` and the row prints exactly what it printed before. The change is
   * real and currently invisible. It stops being invisible on the day the row
   * becomes a CONTROL over BLUE's column, and the point of doing it now is that
   * the false literal is gone before anything can render around it.
   */
  const locale = await resolvePortalLocale()

  return (
    <AccountView profile={profile} fullName={fullName} email={email} locale={locale} />
  )
}

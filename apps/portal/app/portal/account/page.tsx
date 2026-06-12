import { ChevronRight } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/api/client'
import type { PatientProfile } from '@/lib/api/client'
import AccountEditForm from '@/components/account/AccountEditForm'
import ReminderToggles from '@/components/account/ReminderToggles'
import Link from 'next/link'

export default async function AccountPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile: PatientProfile | null = null
  try {
    profile = await getMyProfile()
  } catch {
    // non-fatal — degrade to auth user data
  }

  const fullName = profile?.fullName ?? (user?.user_metadata?.full_name as string | undefined) ?? 'Paciente'
  const email = profile?.email ?? user?.email ?? ''
  const initials = fullName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div>
      <h2 className="text-lg font-medium text-text-primary mb-5">A minha conta</h2>

      {/* Avatar + name */}
      <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center font-medium flex-shrink-0 bg-accent-2-100 text-accent-2-800">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary truncate">{fullName}</p>
          <p className="text-sm text-text-secondary truncate">{email}</p>
        </div>
      </div>

      {/* Editable fields */}
      <div className="mb-4">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Dados de contacto
        </p>
        <AccountEditForm profile={profile} />
      </div>

      {/* Reminder preferences */}
      <div className="mb-4">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Lembretes de consulta
        </p>
        <ReminderToggles />
      </div>

      {/* Security */}
      <div className="mb-6">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Segurança
        </p>
        <div className="bg-surface rounded-xl border border-border divide-y divide-border">
          <Link
            href="/auth/reset-password"
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="text-sm text-text-primary">Alterar palavra-passe</span>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="text-text-muted" />
          </Link>
        </div>
      </div>

      {/* Language */}
      <div className="mb-6">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Idioma
        </p>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-sm text-text-secondary">Português (PT) · English coming soon</p>
        </div>
      </div>
    </div>
  )
}

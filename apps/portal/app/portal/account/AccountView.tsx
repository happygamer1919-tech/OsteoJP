'use client'

import { ChevronRight, LogOut } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Dialog, Drawer, Field, Input } from '@osteojp/ui'
import type { PatientProfile } from '@/lib/api/client'
import { createBrowserClient } from '@/lib/supabase/client'
import ReminderToggles from '@/components/account/ReminderToggles'
import { updateProfileAction } from './actions'
import { s } from '@/lib/i18n'

const APP_VERSION = '0.1.0'

function Row({
  label,
  value,
  onClick,
}: {
  label: string
  value: string
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block text-xs text-text-secondary">{label}</span>
        <span className="block truncate text-sm text-text-primary">{value}</span>
      </span>
      {onClick && (
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
      )}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {body}
      </button>
    )
  }
  return <div className="flex items-center justify-between gap-3 px-4 py-3">{body}</div>
}

export function AccountView({
  profile,
  fullName,
  email,
}: {
  profile: PatientProfile | null
  fullName: string
  email: string
}) {
  const router = useRouter()
  const supabase = createBrowserClient()

  const [editOpen, setEditOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [saving, startSave] = useTransition()
  const [loggingOut, startLogout] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [address, setAddress] = useState(profile?.address ?? '')
  const [postalCode, setPostalCode] = useState(profile?.postalCode ?? '')
  const [city, setCity] = useState(profile?.city ?? '')

  const dirty =
    phone !== (profile?.phone ?? '') ||
    address !== (profile?.address ?? '') ||
    postalCode !== (profile?.postalCode ?? '') ||
    city !== (profile?.city ?? '')

  const initials =
    fullName
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '—'

  function openEdit() {
    setPhone(profile?.phone ?? '')
    setAddress(profile?.address ?? '')
    setPostalCode(profile?.postalCode ?? '')
    setCity(profile?.city ?? '')
    setError(null)
    setEditOpen(true)
  }

  function save() {
    setError(null)
    startSave(async () => {
      const result = await updateProfileAction({ phone, address, postalCode, city })
      if (result?.error) {
        setError(result.error)
      } else {
        setEditOpen(false)
        router.refresh()
      }
    })
  }

  function logout() {
    startLogout(async () => {
      await supabase.auth.signOut()
      router.push('/auth/login')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Identity */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-2-100 font-medium text-accent-2-800">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text-primary">{fullName}</span>
          <span className="block truncate text-sm text-text-secondary">{email}</span>
        </span>
      </div>

      {/* Group 1 — Dados pessoais (editable rows open the edit drawer) */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-text-secondary">{s.account.section_personal}</h3>
        <div className="divide-y divide-border rounded-lg border border-border bg-surface">
          <Row label={s.account.field_name} value={fullName} />
          <Row label={s.account.field_email} value={email || '—'} />
          <Row label={s.account.field_phone} value={profile?.phone || '—'} onClick={openEdit} />
          <Row label={s.account.field_address} value={profile?.address || '—'} onClick={openEdit} />
          <Row
            label={s.account.field_postal_city}
            value={[profile?.postalCode, profile?.city].filter(Boolean).join(' ') || '—'}
            onClick={openEdit}
          />
          <Link
            href="/auth/reset-password"
            className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <span className="text-sm text-text-primary">{s.account.change_password}</span>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
          </Link>
        </div>
      </section>

      {/* Group 2 — Preferências */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-text-secondary">{s.account.section_preferences}</h3>
        <div className="divide-y divide-border rounded-lg border border-border bg-surface">
          {/* Language: PT only until per-patient locale selection lands. */}
          <Row label={s.account.field_language} value={s.account.language_pt} />
        </div>
        <ReminderToggles />
      </section>

      {/* Group 3 — Terminar sessão */}
      <section>
        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-error transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
          {s.auth.logout}
        </button>
      </section>

      <p className="text-center text-xs text-text-secondary">Versão {APP_VERSION}</p>

      {/* Edit drawer */}
      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        dirty={dirty}
        discard={{
          title: s.account.discard_title,
          message: s.account.discard_message,
          confirmLabel: s.account.discard_confirm,
          cancelLabel: s.account.discard_keep,
        }}
        title={s.account.edit_title}
        cancelLabel={s.common.cancel}
        confirmLabel={s.common.save}
        confirmLoading={saving}
        onConfirm={save}
        closeLabel={s.common.close}
      >
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <Field label={s.account.field_phone}>
            <Input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+351 912 345 678"
            />
          </Field>
          <Field label={s.account.field_address}>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número…"
            />
          </Field>
          <Field label={s.account.field_postal_code}>
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="0000-000"
            />
          </Field>
          <Field label={s.account.field_city}>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={s.account.field_city} />
          </Field>
        </div>
      </Drawer>

      {/* Sign-out confirm */}
      <Dialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title={s.account.logout_confirm_title}
        message={s.account.logout_confirm_message}
        icon={LogOut}
        iconTone="warning"
        confirmVariant="destructive"
        confirmLabel={s.auth.logout}
        cancelLabel={s.common.cancel}
        confirmLoading={loggingOut}
        onConfirm={logout}
      />
    </div>
  )
}

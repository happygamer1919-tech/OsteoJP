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
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-muted" />
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
        <h3 className="text-xs font-medium text-text-secondary">Dados pessoais</h3>
        <div className="divide-y divide-border rounded-lg border border-border bg-surface">
          <Row label="Nome" value={fullName} />
          <Row label="Email" value={email || '—'} />
          <Row label="Telemóvel" value={profile?.phone || '—'} onClick={openEdit} />
          <Row label="Morada" value={profile?.address || '—'} onClick={openEdit} />
          <Row
            label="Código postal / Localidade"
            value={[profile?.postalCode, profile?.city].filter(Boolean).join(' ') || '—'}
            onClick={openEdit}
          />
          <Link
            href="/auth/reset-password"
            className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <span className="text-sm text-text-primary">Alterar palavra-passe</span>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-muted" />
          </Link>
        </div>
      </section>

      {/* Group 2 — Preferências */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-text-secondary">Preferências</h3>
        <div className="divide-y divide-border rounded-lg border border-border bg-surface">
          {/* Idioma: PT only until the portal i18n layer + EN strings land. */}
          <Row label="Idioma" value="Português (PT)" />
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
          Terminar sessão
        </button>
      </section>

      <p className="text-center text-xs text-text-secondary">Versão {APP_VERSION}</p>

      {/* Edit drawer */}
      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        dirty={dirty}
        discard={{
          title: 'Descartar alterações?',
          message: 'As alterações não guardadas serão perdidas.',
          confirmLabel: 'Descartar',
          cancelLabel: 'Continuar a editar',
        }}
        title="Dados de contacto"
        cancelLabel="Cancelar"
        confirmLabel="Guardar"
        confirmLoading={saving}
        onConfirm={save}
        closeLabel="Fechar"
      >
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <Field label="Telemóvel">
            <Input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+351 912 345 678"
            />
          </Field>
          <Field label="Morada">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número…"
            />
          </Field>
          <Field label="Código postal">
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="0000-000"
            />
          </Field>
          <Field label="Localidade">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Localidade" />
          </Field>
        </div>
      </Drawer>

      {/* Sign-out confirm */}
      <Dialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Terminar sessão?"
        message="Terá de iniciar sessão novamente para aceder ao portal."
        icon={LogOut}
        iconTone="warning"
        confirmVariant="destructive"
        confirmLabel="Terminar sessão"
        cancelLabel="Cancelar"
        confirmLoading={loggingOut}
        onConfirm={logout}
      />
    </div>
  )
}

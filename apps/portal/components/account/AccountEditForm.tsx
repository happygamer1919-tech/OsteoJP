'use client'

import { useState, useTransition } from 'react'
import type { PatientProfile } from '@/lib/api/client'
import { updateProfileAction } from '@/app/portal/account/actions'

type Props = {
  profile: PatientProfile | null
}

export default function AccountEditForm({ profile }: Props) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [address, setAddress] = useState(profile?.address ?? '')
  const [postalCode, setPostalCode] = useState(profile?.postalCode ?? '')
  const [city, setCity] = useState(profile?.city ?? '')

  function handleSave() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await updateProfileAction({ phone, address, postalCode, city })
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setEditing(false)
        setTimeout(() => setSuccess(false), 3000)
      }
    })
  }

  function handleCancel() {
    setPhone(profile?.phone ?? '')
    setAddress(profile?.address ?? '')
    setPostalCode(profile?.postalCode ?? '')
    setCity(profile?.city ?? '')
    setError(null)
    setEditing(false)
  }

  return (
    <div className="bg-surface rounded-xl border border-border divide-y divide-border">
      {/* Phone */}
      <div className="px-4 py-3">
        <p className="text-xs text-text-secondary mb-1">Telemóvel</p>
        {editing ? (
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+351 912 345 678"
            className="w-full text-sm bg-surface border border-border-strong rounded-lg px-3 py-2 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
        ) : (
          <p className="text-sm text-text-primary">{phone || '—'}</p>
        )}
      </div>

      {/* Address */}
      <div className="px-4 py-3">
        <p className="text-xs text-text-secondary mb-1">Morada</p>
        {editing ? (
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, número..."
            className="w-full text-sm bg-surface border border-border-strong rounded-lg px-3 py-2 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
        ) : (
          <p className="text-sm text-text-primary">{address || '—'}</p>
        )}
      </div>

      {/* Postal + City */}
      <div className="px-4 py-3">
        <p className="text-xs text-text-secondary mb-1">Código postal / Localidade</p>
        {editing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="0000-000"
              className="w-28 text-sm bg-surface border border-border-strong rounded-lg px-3 py-2 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            />
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Localidade"
              className="flex-1 text-sm bg-surface border border-border-strong rounded-lg px-3 py-2 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            />
          </div>
        ) : (
          <p className="text-sm text-text-primary">
            {[postalCode, city].filter(Boolean).join(' ') || '—'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3">
        {error && (
          <p role="alert" className="text-error text-xs mb-2">{error}</p>
        )}
        {success && (
          <p role="status" className="text-xs mb-2 text-success-700">
            Dados actualizados.
          </p>
        )}
        {editing ? (
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="inline-flex items-center min-h-11 text-sm text-text-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="inline-flex items-center min-h-11 text-sm font-medium disabled:opacity-50 text-accent-2-700"
            >
              {isPending ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center min-h-11 text-sm font-medium text-accent-2-700"
          >
            Editar dados
          </button>
        )}
      </div>
    </div>
  )
}

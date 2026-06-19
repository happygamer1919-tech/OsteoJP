'use client'

import { Check, Circle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, ErrorState, Field, Input, useToast } from '@osteojp/ui'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { s } from '@/lib/i18n'

type TokenState = 'checking' | 'valid' | 'invalid'

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${met ? 'text-success-700' : 'text-text-secondary'}`}>
      {met ? (
        <Check size={16} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Circle size={16} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="sr-only">{met ? s.auth.activate_req_done : s.auth.activate_req_pending}</span>
      {children}
    </li>
  )
}

export default function ActivatePage() {
  const router = useRouter()
  const toast = useToast()
  const supabase = createBrowserClient()

  const [tokenState, setTokenState] = useState<TokenState>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The activation link establishes a Supabase session; if none is present the
  // link is invalid or expired (SPEC-portal §4.4).
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return
      setTokenState(data.user && !error ? 'valid' : 'invalid')
    })
    return () => {
      active = false
    }
  }, [supabase])

  const longEnough = password.length >= 8
  const matches = confirm.length > 0 && password === confirm
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = longEnough && matches && !loading

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(s.common.error_generic)
      setLoading(false)
      return
    }

    toast({ tone: 'success', message: s.auth.activate_success })
    // Let the success toast register before the existing flow routes onward.
    setTimeout(() => router.push('/portal/dashboard'), 900)
  }

  if (tokenState === 'checking') {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-text-secondary">{s.common.loading}</p>
      </div>
    )
  }

  if (tokenState === 'invalid') {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <ErrorState
          title={s.auth.activate_invalid_title}
          description={s.auth.activate_invalid_desc}
          retryLabel={s.auth.login_forgot_password}
          onRetry={() => router.push('/auth/reset-password')}
        />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">{s.auth.activate_title}</h2>
      <p className="mb-6 text-sm text-text-secondary">
        {s.auth.activate_subtitle}
      </p>

      <form onSubmit={handleActivate} className="flex flex-col gap-4">
        <Field label={s.auth.activate_password}>
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Field
          label={s.auth.activate_password_confirm}
          error={mismatch ? s.auth.activate_password_mismatch : undefined}
        >
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        <ul aria-live="polite" className="flex flex-col gap-1 text-xs">
          <Requirement met={longEnough}>{s.auth.activate_req_length}</Requirement>
          <Requirement met={matches}>{s.auth.activate_req_match}</Requirement>
        </ul>

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" loading={loading} disabled={!canSubmit} className="w-full">
          {s.auth.activate_submit}
        </Button>
      </form>
    </div>
  )
}

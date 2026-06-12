'use client'

import { Check, Circle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, ErrorState, Field, Input, useToast } from '@osteojp/ui'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type TokenState = 'checking' | 'valid' | 'invalid'

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${met ? 'text-success-700' : 'text-text-secondary'}`}>
      {met ? (
        <Check size={16} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Circle size={16} strokeWidth={1.75} aria-hidden="true" />
      )}
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
      setError('Não foi possível ativar a conta. Tente novamente.')
      setLoading(false)
      return
    }

    toast({ tone: 'success', message: 'Conta ativada. A entrar…' })
    // Let the success toast register before the existing flow routes onward.
    setTimeout(() => router.push('/portal/dashboard'), 900)
  }

  if (tokenState === 'checking') {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-text-secondary">A verificar a ligação…</p>
      </div>
    )
  }

  if (tokenState === 'invalid') {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <ErrorState
          title="Ligação inválida ou expirada"
          description="O link de ativação já não é válido. Peça um novo acesso para continuar."
          retryLabel="Recuperar acesso"
          onRetry={() => router.push('/auth/reset-password')}
        />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">Ativar conta</h2>
      <p className="mb-5 text-sm text-text-secondary">
        Defina a sua palavra-passe para começar a usar o portal.
      </p>

      <form onSubmit={handleActivate} className="flex flex-col gap-4">
        <Field label="Escolha uma palavra-passe">
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Field
          label="Confirme a palavra-passe"
          error={mismatch ? 'As palavras-passe não coincidem.' : undefined}
        >
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        <ul className="flex flex-col gap-1 text-xs">
          <Requirement met={longEnough}>Pelo menos 8 caracteres</Requirement>
          <Requirement met={matches}>As palavras-passe coincidem</Requirement>
        </ul>

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" loading={loading} disabled={!canSubmit} className="w-full">
          Ativar conta
        </Button>
      </form>
    </div>
  )
}

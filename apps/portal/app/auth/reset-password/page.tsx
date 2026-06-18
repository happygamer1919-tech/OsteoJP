'use client'

import { Mail } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Banner, Button, Field, Input } from '@osteojp/ui'
import { createBrowserClient } from '@/lib/supabase/client'

const SECONDARY_LINK =
  'inline-flex min-h-11 items-center justify-center rounded px-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

export default function ResetPasswordPage() {
  const supabase = createBrowserClient()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })

    if (error) {
      setError('Não foi possível enviar o link. Tente novamente.')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <>
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <Mail
            size={24}
            strokeWidth={1.75}
            aria-hidden="true"
            className="mx-auto mb-3 text-accent-2-700"
          />
          <h2 className="mb-2 text-xl font-semibold text-text-primary">Verifique o seu email</h2>
          <p className="text-sm text-text-secondary">
            Enviámos um link para <strong>{email}</strong>. Verifique a sua caixa de entrada.
          </p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link href="/auth/login" className={SECONDARY_LINK}>
            Ir para o início de sessão
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-1 text-xl font-semibold text-text-primary">Repor palavra-passe</h2>
        <p className="mb-6 text-sm text-text-secondary">
          Introduza o seu email para receber um link de reposição.
        </p>

        {error && (
          <div className="mb-4 overflow-hidden rounded-lg">
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="o.seu@email.pt"
            />
          </Field>

          <Button type="submit" variant="primary" loading={loading} className="w-full">
            Enviar link
          </Button>
        </form>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Link href="/auth/login" className={SECONDARY_LINK}>
          Ir para o início de sessão
        </Link>
      </div>

      <p className="mt-8 text-center text-xs text-text-secondary">
        OsteoJP · Linda-a-Velha · Castelo Branco · Montemor-o-Novo
      </p>
    </>
  )
}

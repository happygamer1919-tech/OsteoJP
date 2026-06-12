'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ActivatePage() {
  const router = useRouter()
  const supabase = createBrowserClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('As palavras-passe não coincidem.')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('Não foi possível ativar a conta. Tente novamente.')
      setLoading(false)
      return
    }

    router.push('/portal/dashboard')
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-6">
      <h2 className="font-medium text-text-primary mb-1">Ativar conta</h2>
      <p className="text-sm text-text-secondary mb-5">
        Defina a sua palavra-passe para continuar.
      </p>

      {error && (
        <div role="alert" className="bg-error-bg text-error text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleActivate}>
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-1.5" htmlFor="password">
            Escolha uma palavra-passe
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="mb-5">
          <label className="block text-sm text-text-secondary mb-1.5" htmlFor="confirm">
            Confirme a palavra-passe
          </label>
          <input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent-2-700 text-text-inverse font-medium rounded-lg py-2.5 text-sm disabled:opacity-60"
        >
          {loading ? 'A ativar...' : 'Ativar conta'}
        </button>
      </form>
    </div>
  )
}

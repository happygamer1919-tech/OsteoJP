'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createBrowserClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'password' | 'magic'>('password')

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou palavra-passe incorretos.')
      setLoading(false)
      return
    }

    router.push('/portal/dashboard')
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError('Não foi possível enviar o link. Tente novamente.')
      setLoading(false)
      return
    }

    setMagicLinkSent(true)
    setLoading(false)
  }

  if (magicLinkSent) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="text-2xl mb-3">✉️</div>
        <h2 className="font-medium text-gray-900 mb-2">Verifique o seu email</h2>
        <p className="text-sm text-gray-500">
          Enviámos um link para <strong>{email}</strong>. Clique no link para entrar.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-medium text-gray-900 mb-5">Entrar</h2>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink}>
        <div className="mb-4">
          <label className="block text-sm text-gray-600 mb-1.5" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="o.seu@email.pt"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>

        {mode === 'password' && (
          <div className="mb-5">
            <label className="block text-sm text-gray-600 mb-1.5" htmlFor="password">
              Palavra-passe
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <div className="text-right mt-1.5">
              <a href="/auth/reset-password" className="text-xs text-teal-600 hover:underline">
                Esqueceu a palavra-passe?
              </a>
            </div>
          </div>
        )}

        {mode === 'magic' && (
          <div className="mb-5" />
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full text-white font-medium rounded-lg py-2.5 text-sm transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#45B9A7' }}
        >
          {loading ? 'A carregar...' : mode === 'password' ? 'Entrar' : 'Enviar link'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setError(null) }}
          className="text-sm text-teal-600 hover:underline"
        >
          {mode === 'password' ? 'Entrar com link por email' : 'Entrar com palavra-passe'}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center mt-5">
        Ainda não tem conta? A sua clínica irá enviar-lhe um convite por SMS.
      </p>
    </div>
  )
}

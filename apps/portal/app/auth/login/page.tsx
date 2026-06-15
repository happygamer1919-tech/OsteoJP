'use client'

import { Eye, EyeOff, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Banner, Button, Field, Input } from '@osteojp/ui'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Ghost-styled secondary text link/button, 44px tap target (SPEC-portal §3.3).
const SECONDARY_LINK =
  'inline-flex min-h-11 items-center justify-center rounded px-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createBrowserClient()

  // Handle magic link hash token delivered via URL fragment (#access_token=...).
  // Hash fragments never reach the server so /auth/callback cannot intercept
  // them. @supabase/ssr createBrowserClient uses cookies and does not
  // auto-process hash fragments — onAuthStateChange never fires for them.
  // We extract the tokens manually and call setSession() to establish the
  // cookie-backed session, then redirect. Hash is cleared from browser
  // history so tokens are not exposed after exchange.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('access_token')) return
    const params = new URLSearchParams(hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken || !refreshToken) return
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data: { session }, error }) => {
        if (session && !error) {
          window.history.replaceState(null, '', window.location.pathname)
          router.replace('/portal/dashboard')
        }
      })
  }, [router, supabase])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <Mail size={24} strokeWidth={1.75} aria-hidden="true" className="mx-auto mb-3 text-accent-2-700" />
        <h2 className="mb-2 text-xl font-semibold text-text-primary">Verifique o seu email</h2>
        <p className="text-sm text-text-secondary">
          Enviámos um link para <strong>{email}</strong>. Clique no link para entrar.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-6 text-xl font-semibold text-text-primary">Entrar</h2>

        {error && (
          <div className="mb-4 overflow-hidden rounded-lg">
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        <form
          onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink}
          className="flex flex-col gap-4"
        >
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

          {mode === 'password' && (
            <Field label="Palavra-passe">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                    className="flex size-11 items-center justify-center rounded text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                }
              />
            </Field>
          )}

          <Button type="submit" variant="primary" loading={loading} className="w-full">
            {mode === 'password' ? 'Entrar' : 'Enviar link'}
          </Button>
        </form>
      </div>

      {/* Secondary links (SPEC §3.3): ghost text, stacked, centered. */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'password' ? 'magic' : 'password')
            setError(null)
          }}
          className={SECONDARY_LINK}
        >
          {mode === 'password' ? 'Entrar com link por email' : 'Entrar com palavra-passe'}
        </button>
        <a href="/auth/reset-password" className={SECONDARY_LINK}>
          Recuperar acesso
        </a>
        <a href="/auth/activate" className={SECONDARY_LINK}>
          Ativar conta
        </a>
      </div>

      {/* Footer identity (SPEC §3.5). The PT|EN language switcher is omitted until
          the portal i18n layer lands — see the PR notes. */}
      <p className="mt-8 text-center text-xs text-text-secondary">
        OsteoJP · Linda-a-Velha · Castelo Branco · Montemor-o-Novo
      </p>
    </>
  )
}

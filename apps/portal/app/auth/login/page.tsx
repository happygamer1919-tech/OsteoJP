'use client'

import { Eye, EyeOff, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Banner, Button, Field, Input } from '@osteojp/ui'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { s } from '@/lib/i18n'


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
      setError(s.auth.login_error ?? s.common.error_generic)
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
      setError(s.auth.reset_password_error)
      setLoading(false)
      return
    }

    setMagicLinkSent(true)
    setLoading(false)
  }

  if (magicLinkSent) {
    const [before, after] = s.auth.login_magic_link_sent.split('{{email}}')
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <Mail size={24} strokeWidth={1.75} aria-hidden="true" className="mx-auto mb-3 text-accent-2-700" />
        <h2 className="mb-2 text-xl font-semibold text-text-primary">{s.auth.reset_password_check_inbox}</h2>
        <p className="text-sm text-text-secondary">
          {before}
          <strong>{email}</strong>
          {after}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-6 text-xl font-semibold text-text-primary">{s.auth.login_title}</h2>

        {error && (
          <div className="mb-4 overflow-hidden rounded-lg">
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        <form
          onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink}
          className="flex flex-col gap-4"
        >
          <Field label={s.auth.login_email}>
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={s.auth.login_email_placeholder}
            />
          </Field>

          {mode === 'password' && (
            <Field label={s.auth.login_password}>
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
                    aria-label={showPassword ? s.auth.hide_password : s.auth.show_password}
                    className="flex size-11 items-center justify-center rounded text-text-secondary transition motion-safe:active:scale-[0.97] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
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
            {mode === 'password' ? s.auth.login_submit : s.auth.reset_password_submit}
          </Button>
        </form>
      </div>

      {/* Secondary links (SPEC §3.3): ghost text, stacked, centered. */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setMode(mode === 'password' ? 'magic' : 'password')
            setError(null)
          }}
        >
          {mode === 'password' ? s.auth.login_magic_link : s.auth.login_submit}
        </Button>
        <a href="/auth/reset-password" className="inline-flex min-h-11 items-center justify-center rounded px-2 text-sm text-text-secondary transition hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
          {s.auth.login_forgot_password}
        </a>
        <a href="/auth/activate" className="inline-flex min-h-11 items-center justify-center rounded px-2 text-sm text-text-secondary transition hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
          {s.auth.activate_title}
        </a>
      </div>

      {/* Footer identity (SPEC §3.5). The PT|EN language switcher is omitted until
          the portal i18n layer lands — see the PR notes. */}
      <p className="mt-8 text-center text-xs text-text-secondary">
        {s.common.app_name} · {s.common.footer_locations}
      </p>
    </>
  )
}

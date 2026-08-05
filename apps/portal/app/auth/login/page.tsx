'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Banner, Button, Field, Input } from '@osteojp/ui'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { s } from '@/lib/i18n'


export default function LoginPage() {
  const router = useRouter()
  const supabase = createBrowserClient()

  // W13/SEC-portal-magic-link (2026-08-05): the magic-link hash handler was
  // REMOVED with the magic-link login mode. It existed only to honour
  // `#access_token=` fragments from a sign-in link, and Decision D permits no
  // session from anything but a verified SMS OTP. Removing the button alone
  // would have left the honouring code in place, so a link already sitting in
  // an inbox — or one issued from the Supabase dashboard — would still have
  // minted a session here.
  //
  // Password RECOVERY is unaffected: it redirects to /auth/callback, which
  // exchanges a `?code=` query param server-side and never used this fragment
  // path. Verified before removal (reset-password/page.tsx redirectTo).

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-6 text-xl font-semibold text-text-primary">{s.auth.login_title}</h2>

        {error && (
          <div className="mb-4 overflow-hidden rounded-lg">
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
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

          <Button type="submit" variant="primary" loading={loading} className="w-full">
            {s.auth.login_submit}
          </Button>
        </form>
      </div>

      {/* Secondary links (SPEC §3.3): ghost text, stacked, centered. */}
      <div className="mt-6 flex flex-col items-center gap-3">
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

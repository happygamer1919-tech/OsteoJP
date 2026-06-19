import Link from 'next/link'
import { s } from '@/lib/i18n'

// Custom 404 page for the patient portal.
// Replaces the Next.js framework default (English, unstyled) with a
// branded PT page consistent with the portal auth shell (SPEC-portal §3).
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-5xl font-semibold text-text-primary">404</span>
        <h1 className="text-xl font-semibold text-text-primary">
          {s.errors['404_title']}
        </h1>
        <p className="max-w-xs text-sm text-text-secondary">
          {s.errors['404_body']}
        </p>
      </div>
      <Link
        href="/portal/dashboard"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-2-700 px-6 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {s.errors['404_cta']}
      </Link>
      <p className="text-xs text-text-secondary">
        {s.common.app_name} · Linda-a-Velha · Castelo Branco · Montemor-o-Novo
      </p>
    </div>
  )
}

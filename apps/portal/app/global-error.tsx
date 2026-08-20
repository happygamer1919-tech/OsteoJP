'use client'

import { htmlLang } from '@osteojp/i18n'
import { s } from '@/lib/i18n'

/**
 * The portal's ROOT error boundary — the one it did not have.
 *
 * ==========================================================================
 * WHAT WAS THERE BEFORE, AND WHY IT MATTERED.
 * ==========================================================================
 * Every ROUTE had an `error.tsx` (dashboard, appointments, documents, forms,
 * booking, account), each with pt-PT copy and the clinic's telephone. **The
 * root had nothing.** A crash in the root layout, in a provider, or before a
 * route boundary mounts falls past all of them to Next's framework default:
 * an unstyled English page, on a patient-facing product that is pt-PT only.
 *
 * `errors.500_title` and `errors.500_body` were written for exactly this and
 * were referenced by NOTHING — two of the 163 dead keys
 * `LE-dead-i18n-keys-imply-screens` counted. **A string with no screen behind it
 * reads as coverage**: somebody asking "does the portal handle a crash well?"
 * found sensible Portuguese and concluded it did.
 *
 * Owner ruling 2026-08-20 on `Q-PORTAL-DEAD-I18N-1`: **500 and offline are real
 * browser states, so wire them up rather than delete them.** This is the 500
 * half.
 *
 * ==========================================================================
 * IT RENDERS ITS OWN <html>, WHICH IS NOT OPTIONAL HERE.
 * ==========================================================================
 * `global-error.tsx` REPLACES the root layout when it fires — the layout is
 * what crashed, so it cannot be relied on. That means no shell, no fonts, and
 * no `lang` attribute unless this file supplies them. `htmlLang()` is the same
 * source the root layout uses, so a screen reader is not handed English markup
 * describing Portuguese text.
 *
 * ==========================================================================
 * NO TELEPHONE COMPONENT, AND THAT IS DELIBERATE.
 * ==========================================================================
 * Every other error surface here renders `<ClinicPhones />`. This one does not
 * import it: that component reads the clinic list, and a boundary that catches
 * "the app failed to render" must not depend on more of the app rendering. The
 * numbers are inlined instead — the same two clinics, as static text, which is
 * the one form that cannot fail for the reason that got us here.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang={htmlLang()}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#ffffff',
          color: '#1a1a1a',
        }}
      >
        {/* INLINE STYLES, for the same reason as the missing telephone
            component: the stylesheet is loaded by the layout this file
            replaces. A boundary that needs CSS to be legible is a boundary that
            renders unstyled exactly when it is needed. */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            {s.errors['500_title']}
          </h1>
          <p style={{ fontSize: '0.875rem', lineHeight: 1.6, margin: 0, color: '#4a4a4a' }}>
            {s.errors['500_body']}
          </p>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>
            <a href="tel:+351969472111" style={{ color: '#1a6b5f' }}>969 472 111</a>
            {' · '}
            <a href="tel:+351969877553" style={{ color: '#1a6b5f' }}>969 877 553</a>
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: '2.75rem',
              padding: '0 1.5rem',
              borderRadius: '0.5rem',
              border: 0,
              background: '#1a6b5f',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {s.common.retry}
          </button>
        </main>
      </body>
    </html>
  )
}

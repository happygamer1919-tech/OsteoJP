import type { MetadataRoute } from 'next'

// Patient-portal PWA manifest (v1: installability only — no service worker /
// offline / push). App Router serves this at /manifest.webmanifest and Next
// injects the <link rel="manifest"> automatically; do not hand-add a link.
//
// Icons are generated from the canonical brand mark
// (packages/ui/src/assets/brand/logo-mark.svg) by scripts/generate-pwa-icons.mjs
// and committed under apps/portal/public/. The iOS apple-touch-icon comes from
// the app/apple-icon.png file convention, not this manifest.
//
// Manifest strings are PT-only by design (patient default is pt-PT and a
// webmanifest is not runtime-i18n'd), so they live inline here.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OsteoJP',
    short_name: 'OsteoJP',
    description: 'Portal do paciente OsteoJP — marcações e consultas.',
    lang: 'pt',
    // Logged-in landing route (RootPage redirects an authenticated session to
    // /portal/dashboard).
    start_url: '/portal/dashboard',
    display: 'standalone',
    // Brand teal (docs/brand-tokens.md); background matches the portal page
    // background token --color-bg (#F7F9FB).
    theme_color: '#45B9A7',
    background_color: '#F7F9FB',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

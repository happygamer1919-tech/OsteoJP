import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { htmlLang } from '@osteojp/i18n'
import { resolvePortalStrings } from '@/lib/locale-server'
import './globals.css'

// Inter is the OsteoJP default sans (docs/brand-tokens.md §2). latin-ext is
// required for pt-PT diacritics (ã õ á à â é ê í ó ô ú ç). Exposed as
// --font-inter and consumed by the --font-sans token in @osteojp/ui/theme.css.
// Same wiring pattern as apps/web.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
})

/**
 * LANG-01 — `generateMetadata`, NOT a `metadata` constant.
 *
 * The constant was evaluated ONCE at module load, off the frozen `pt`
 * dictionary, so the browser tab said the same thing whatever language the page
 * was rendered in. A function runs per request and can read the resolved locale.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { s } = await resolvePortalStrings()
  return { title: s.meta.title, description: s.meta.description }
}

// PWA installability: themeColor tints the browser/standalone UI (brand teal,
// matching manifest theme_color); viewport-fit=cover lets the standalone window
// paint under iOS safe areas. Next serves the manifest from app/manifest.ts.
export const viewport: Viewport = {
  themeColor: '#45B9A7',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /**
   * LANG-01 — THE DOCUMENT LANGUAGE IS THE RESOLVED ONE, not a constant.
   *
   * `htmlLang` maps pt -> pt-PT and en -> en-GB, and its own comment records
   * why: it drives screen-reader pronunciation, hyphenation, and the format of
   * a NATIVE date picker in Firefox and Safari. The guest booking form has one
   * of those, deliberately left native by SCHED-07 so it posts without
   * JavaScript.
   *
   * ON THE DATE PICKER SPECIFICALLY, SAID PLAINLY SO NOBODY OVERCLAIMS: en-GB
   * and pt-PT both format dd/mm/yyyy, so for THIS pair of locales the picker
   * looks the same either way. en-GB was chosen over en-US precisely to make
   * that true. What actually changes here is the screen-reader voice and the
   * hyphenation, which is reason enough - an English page announced in
   * Portuguese is unusable to the person it was translated for.
   *
   * THIS IS WHAT MAKES THE LAYOUT DYNAMIC. See `lib/locale-server.ts` for the
   * measured cost: two routes that were prerendered are not any more.
   */
  const { locale } = await resolvePortalStrings()
  return (
    <html lang={htmlLang(locale)} className={`${inter.variable} antialiased`}>
      <body className="bg-background text-foreground">{children}</body>
    </html>
  )
}

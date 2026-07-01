import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { htmlLang } from '@osteojp/i18n'
import { s } from '@/lib/i18n'
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

export const metadata: Metadata = {
  title: s.meta.title,
  description: s.meta.description,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // lang via @osteojp/i18n (DEFAULT_LOCALE -> "pt-PT"): drives native date-picker
  // format, screen-reader pronunciation and hyphenation. Matches apps/web.
  return (
    <html lang={htmlLang()} className={`${inter.variable} antialiased`}>
      <body className="bg-background text-foreground">{children}</body>
    </html>
  )
}

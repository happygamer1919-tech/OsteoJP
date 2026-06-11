import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { htmlLang } from "@osteojp/i18n";
import "./globals.css";

// Inter is the OsteoJP default sans (docs/brand-tokens.md §2). latin-ext is
// required for pt-PT diacritics (ã õ á à â é ê í ó ô ú ç). Exposed as
// --font-inter and consumed by the --font-sans token in @osteojp/ui/theme.css.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OsteoJP",
    template: "%s | OsteoJP",
  },
  description: "Plataforma clínica OsteoJP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Document language drives native date-picker format (dd/mm/aaaa) in
  // Firefox/Safari, screen-reader pronunciation, number formatting and
  // hyphenation. Sourced from @osteojp/i18n (DEFAULT_LOCALE -> "pt-PT"); pass a
  // resolved locale to htmlLang() here once per-tenant/per-request locale lands.
  return (
    <html
      lang={htmlLang()}
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

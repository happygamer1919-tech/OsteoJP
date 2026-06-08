import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { htmlLang } from "@osteojp/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { htmlLang } from "@osteojp/i18n";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "OsteoJP — Plataforma", template: "%s | OsteoJP Plataforma" },
  description: "Administração da plataforma OsteoJP",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={htmlLang()}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

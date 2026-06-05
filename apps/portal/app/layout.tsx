import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OsteoJP — Portal do Paciente',
  description: 'Gerencie as suas consultas, fichas e documentos.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt">
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}

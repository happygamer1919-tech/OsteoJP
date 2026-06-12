import { ChevronLeft, FileText } from 'lucide-react'
import Link from 'next/link'

export default function DocumentsPage() {
  return (
    <div>
      <h2 className="text-lg font-medium text-text-primary mb-5">Documentos</h2>

      <div className="bg-surface rounded-xl border border-border p-6 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-surface-muted"
          aria-hidden="true"
        >
          <FileText size={24} strokeWidth={1.75} className="text-text-secondary" />
        </div>
        <p className="font-medium text-text-primary mb-1">Em breve</p>
        <p className="text-sm text-text-secondary leading-relaxed">
          Os seus documentos clínicos e faturas estarão disponíveis aqui em breve.
        </p>
      </div>

      <div className="mt-4">
        <Link
          href="/portal/dashboard"
          className="inline-flex w-full items-center justify-center gap-1 text-center py-3 rounded-xl text-sm font-medium text-accent-2-700"
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}

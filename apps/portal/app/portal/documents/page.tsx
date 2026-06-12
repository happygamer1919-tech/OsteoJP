import { FileText } from 'lucide-react'
import { EmptyState } from '@osteojp/ui'
import { getMyDocuments } from '@/lib/api/client'
import type { PatientDocument } from '@/lib/api/client'
import { DownloadButton } from './DownloadButton'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatType(mime: string | null): string {
  if (!mime) return 'Documento'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return 'Imagem'
  return 'Documento'
}

export default async function DocumentsPage() {
  // A hard fetch failure surfaces error.tsx; an empty list is the empty state.
  const documents = await getMyDocuments()

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Sem documentos disponíveis"
        description="Os seus documentos e declarações aparecerão aqui."
      />
    )
  }

  // Group by year, newest first; the year heading only shows when the list spans
  // more than one year (SPEC-portal §9).
  const byYear = new Map<number, PatientDocument[]>()
  for (const doc of documents) {
    const year = new Date(doc.createdAt).getFullYear()
    const list = byYear.get(year) ?? []
    list.push(doc)
    byYear.set(year, list)
  }
  const years = [...byYear.keys()].sort((a, b) => b - a)
  const multiYear = years.length > 1

  return (
    <div className="flex flex-col gap-6">
      {years.map((year) => (
        <section key={year} className="flex flex-col gap-2">
          {multiYear && <h3 className="text-xs font-medium text-text-secondary">{year}</h3>}
          <div className="divide-y divide-border rounded-lg border border-border bg-surface">
            {byYear.get(year)!.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                <FileText size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{doc.fileName}</p>
                  <p className="text-xs text-text-secondary">
                    {formatDate(doc.createdAt)} · {formatType(doc.mimeType)}
                  </p>
                </div>
                <DownloadButton id={doc.id} fileName={doc.fileName} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

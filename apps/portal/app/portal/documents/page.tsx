import { FileText } from 'lucide-react'
import { EmptyState } from '@osteojp/ui'
import { getMyDocuments } from '@/lib/api/client'
import type { PatientDocument } from '@/lib/api/client'
import { DocumentRow } from './DocumentRow'
import { s } from '@/lib/i18n'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' })
}

function formatType(mime: string | null): string {
  if (!mime) return s.documents.type_document
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return s.documents.type_image
  return s.documents.type_document
}

export default async function DocumentsPage() {
  // A hard fetch failure surfaces error.tsx; an empty list is the empty state.
  const documents = await getMyDocuments()

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={s.documents.empty_title}
        description={s.documents.empty_description}
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
              // The row is a client component so a preview can open under it;
              // the date and type line is still formatted here, on the server.
              <DocumentRow
                key={doc.id}
                id={doc.id}
                fileName={doc.fileName}
                meta={`${formatDate(doc.createdAt)} · ${formatType(doc.mimeType)}`}
                mimeType={doc.mimeType}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default function DocumentsPage() {
  return (
    <div>
      <h1 className="font-medium text-gray-900 text-lg mb-4">Documentos</h1>
      <div
        className="rounded-lg px-4 py-3 text-sm mb-4"
        style={{ backgroundColor: '#E6F1FB', color: '#185FA5' }}
      >
        As faturas estarão disponíveis brevemente.
      </div>
      <p className="text-sm text-gray-400">A carregar documentos...</p>
      {/* TODO: Phase E — wire GET /documents?patient_id=me */}
    </div>
  )
}

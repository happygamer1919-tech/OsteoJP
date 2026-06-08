import Link from 'next/link'

export default function DocumentsPage() {
  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Documentos</h1>

      <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: '#F3F4F6' }}
          aria-hidden="true"
        >
          <span className="text-xl">📁</span>
        </div>
        <p className="font-medium text-gray-900 mb-1">Em breve</p>
        <p className="text-sm text-gray-500 leading-relaxed">
          Os seus documentos clínicos e faturas estarão disponíveis aqui em breve.
        </p>
      </div>

      <div className="mt-4">
        <Link
          href="/portal/dashboard"
          className="block w-full text-center py-3 rounded-xl text-sm font-medium"
          style={{ color: '#45B9A7' }}
        >
          ← Voltar ao início
        </Link>
      </div>
    </div>
  )
}

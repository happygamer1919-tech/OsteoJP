import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const firstName = user?.user_metadata?.first_name ?? 'Paciente'

  return (
    <div>
      {/* Greeting */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
          style={{ backgroundColor: '#E1F5EE', color: '#0F6E56' }}
        >
          {firstName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900">Olá, {firstName}</p>
          <p className="text-xs text-gray-500">Bem-vindo de volta</p>
        </div>
      </div>

      {/* Form pending banner — shown when patient has incomplete intake form */}
      {/* TODO: wire to /api/portal/forms?status=pending once API is ready */}
      <div
        className="rounded-lg px-4 py-3 mb-5 flex items-start gap-3"
        style={{ backgroundColor: '#FAEEDA' }}
      >
        <span className="text-sm mt-0.5">⚠️</span>
        <div>
          <p className="text-sm font-medium" style={{ color: '#633806' }}>
            Tem uma ficha por preencher antes da sua consulta.
          </p>
          <Link href="/portal/forms" className="text-xs underline" style={{ color: '#633806' }}>
            Preencher agora
          </Link>
        </div>
      </div>

      {/* Next appointment */}
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
        Próxima consulta
      </p>
      {/* TODO: replace with real data from GET /appointments?patient_id=me&upcoming=true */}
      <div
        className="rounded-xl border-l-4 bg-white border border-gray-100 p-4 mb-5"
        style={{ borderLeftColor: '#45B9A7' }}
      >
        <p className="font-medium text-gray-900">A carregar...</p>
        <p className="text-sm text-gray-500 mt-0.5">
          Sem consultas marcadas.{' '}
          <Link href="/portal/booking" className="text-teal-600 underline">
            Marcar consulta
          </Link>
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Link
          href="/portal/booking"
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-4 text-sm font-medium text-white"
          style={{ backgroundColor: '#45B9A7' }}
        >
          <span className="text-xl">📅</span>
          Marcar consulta
        </Link>
        <Link
          href="/portal/documents"
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-4 text-sm font-medium text-gray-700 bg-white border border-gray-100"
        >
          <span className="text-xl">📁</span>
          Documentos
        </Link>
      </div>

      {/* Recent visits */}
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
        Visitas recentes
      </p>
      {/* TODO: replace with real data from GET /appointments?patient_id=me&past=true&limit=3 */}
      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        <div className="px-4 py-3 text-sm text-gray-400">
          Sem visitas anteriores.
        </div>
      </div>
    </div>
  )
}

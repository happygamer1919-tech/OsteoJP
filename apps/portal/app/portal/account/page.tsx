import { createServerClient } from '@/lib/supabase/server'

export default async function AccountPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const name = user?.user_metadata?.full_name ?? 'Paciente'
  const email = user?.email ?? ''

  return (
    <div>
      <h1 className="font-medium text-gray-900 text-lg mb-4">A minha conta</h1>

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-medium flex-shrink-0"
          style={{ backgroundColor: '#E1F5EE', color: '#0F6E56' }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900">{name}</p>
          <p className="text-sm text-gray-500">{email}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">NIF</p>
            <p className="text-sm text-gray-700">—</p>
          </div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Telemóvel</p>
            <p className="text-sm text-gray-700">—</p>
          </div>
        </div>
      </div>
      {/* TODO: Phase C — PATCH /patients/me, reminder toggles, password change */}
    </div>
  )
}

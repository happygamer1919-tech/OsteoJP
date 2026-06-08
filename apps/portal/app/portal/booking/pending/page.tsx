import Link from 'next/link'

export default async function BookingPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  return (
    <div className="text-center py-8">
      {/* Icon */}
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ backgroundColor: '#E1F5EE' }}
      >
        <span className="text-2xl">📅</span>
      </div>

      <h1 className="text-lg font-medium text-gray-900 mb-2">
        Marcação recebida
      </h1>
      <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-xs mx-auto">
        A sua marcação está a aguardar confirmação pela receção. Receberá um SMS quando for confirmada.
      </p>

      {id && (
        <div
          className="inline-block rounded-lg px-3 py-1.5 text-xs font-mono text-gray-400 mb-8"
          style={{ backgroundColor: '#F9FAFB' }}
        >
          Ref: {id.slice(0, 8).toUpperCase()}
        </div>
      )}

      <div className="space-y-3">
        <Link
          href="/portal/appointments"
          className="block w-full py-3 rounded-xl text-white font-medium text-sm text-center"
          style={{ backgroundColor: '#45B9A7' }}
        >
          Ver as minhas consultas
        </Link>
        <Link
          href="/portal/dashboard"
          className="block w-full py-3 rounded-xl text-gray-700 font-medium text-sm text-center bg-white border border-gray-100"
        >
          Ir para o início
        </Link>
      </div>
    </div>
  )
}

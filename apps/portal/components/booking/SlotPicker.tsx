'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BookableService, BookableLocation } from '@/lib/api/client'

type Props = {
  service: BookableService
  location: BookableLocation
  slots: string[] // ISO UTC strings
}

export default function SlotPicker({ service, location, slots }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)

  // Group slots by date
  const byDate = slots.reduce<Record<string, string[]>>((acc, iso) => {
    const date = new Date(iso)
    const key = date.toLocaleDateString('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    if (!acc[key]) acc[key] = []
    acc[key].push(iso)
    return acc
  }, {})

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('pt-PT', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  function handleContinue() {
    if (!selected) return
    const params = new URLSearchParams({
      location: location.id,
      service: service.id,
      startsAt: selected,
    })
    router.push(`/portal/booking/confirm?${params}`)
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-5">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className="flex-1 h-1 rounded-full"
            style={{ backgroundColor: s <= 3 ? '#45B9A7' : '#E5E7EB' }}
          />
        ))}
      </div>

      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
        Passo 3 de 4
      </p>
      <h1 className="text-lg font-medium text-gray-900 mb-1">
        Escolha a data e hora
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        {service.name} · {location.name}
      </p>

      {slots.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
          <p className="text-gray-500 text-sm mb-3">
            Não há horários disponíveis nos próximos dias.
          </p>
          <p className="text-sm text-gray-400">
            Por favor ligue para a clínica para marcar directamente.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(byDate).map(([date, dateSlots]) => (
            <div key={date}>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 capitalize">
                {date}
              </p>
              <div className="flex flex-wrap gap-2">
                {dateSlots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setSelected(slot)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={
                      selected === slot
                        ? {
                            backgroundColor: '#45B9A7',
                            color: '#fff',
                            borderColor: '#45B9A7',
                          }
                        : {
                            backgroundColor: '#fff',
                            color: '#374151',
                            borderColor: '#E5E7EB',
                          }
                    }
                  >
                    {formatTime(slot)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-6">
          <button
            onClick={handleContinue}
            className="w-full py-3 rounded-xl text-white font-medium text-sm"
            style={{ backgroundColor: '#45B9A7' }}
          >
            Continuar →
          </button>
        </div>
      )}
    </div>
  )
}

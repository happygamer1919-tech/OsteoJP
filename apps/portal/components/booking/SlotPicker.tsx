'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
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
            className={`flex-1 h-1 rounded-full ${s <= 3 ? 'bg-accent-2-700' : 'bg-neutral-200'}`}
          />
        ))}
      </div>

      <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
        Passo 3 de 4
      </p>
      <h2 className="text-lg font-medium text-text-primary mb-1">
        Escolha a data e hora
      </h2>
      <p className="text-sm text-text-secondary mb-5">
        {service.name} · {location.name}
      </p>

      {slots.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-6 text-center">
          <p className="text-text-secondary text-sm mb-3">
            Não há horários disponíveis nos próximos dias.
          </p>
          <p className="text-sm text-text-muted">
            Por favor ligue para a clínica para marcar directamente.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(byDate).map(([date, dateSlots]) => (
            <div key={date}>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2 capitalize">
                {date}
              </p>
              <div className="flex flex-wrap gap-2">
                {dateSlots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setSelected(slot)}
                    aria-pressed={selected === slot}
                    className={`inline-flex min-h-11 items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
                      selected === slot
                        ? 'bg-accent-2-700 text-text-inverse border-accent-2-700'
                        : 'bg-surface text-text-primary border-border-strong'
                    }`}
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
            className="inline-flex w-full items-center justify-center gap-1 py-3 rounded-xl text-text-inverse font-medium text-sm bg-accent-2-700"
          >
            Continuar
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { submitBooking } from '@/app/portal/booking/confirm/actions'

type Props = {
  serviceId: string
  locationId: string
  startsAt: string
}

export default function BookingConfirmForm({ serviceId, locationId, startsAt }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await submitBooking({ serviceId, locationId, startsAt })
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div>
      {error && (
        <div role="alert" className="bg-error-bg text-error text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full py-3 rounded-xl text-text-inverse font-medium text-sm disabled:opacity-60 transition-opacity bg-accent-2-700"
      >
        {isPending ? 'A submeter...' : 'Confirmar marcação'}
      </button>
    </div>
  )
}

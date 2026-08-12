'use client'

import { ErrorState } from '@osteojp/ui'
import { ClinicPhones } from '@/components/ClinicPhones'
import { s } from '@/lib/i18n'

export default function BookingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title={s.booking.load_error_title}
      description={
        <>
          {s.booking.load_error_description}
          <ClinicPhones />
        </>
      }
      retryLabel={s.common.retry}
      onRetry={reset}
    />
  )
}

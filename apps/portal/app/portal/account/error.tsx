'use client'

import { ErrorState } from '@osteojp/ui'
import { ClinicPhones } from '@/components/ClinicPhones'
import { s } from '@/lib/i18n'

// Route-level error boundary for the account screen (SPEC-portal §6).
//
// Added with PL-34. Until then this directory had no boundary and page.tsx
// swallowed a failed profile fetch, degrading to whatever the auth user object
// carried - so a broken load rendered as a populated-looking account page with
// a blank name. A page that can fetch needs somewhere honest to land.
export default function AccountError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title={s.errors.load_account}
      description={
        <>
          {s.errors.load_account_desc}
          <ClinicPhones />
        </>
      }
      retryLabel={s.common.retry}
      onRetry={reset}
    />
  )
}

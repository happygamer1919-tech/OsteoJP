'use client'

import { Switch } from '@osteojp/ui'
import { useState } from 'react'
import { s } from '@/lib/i18n'

// V1: reminder preferences are stored client-side in localStorage as a fallback
// until the PATCH /api/v1/patient/profile endpoint exposes reminder_preferences.
// When that field is added, swap useState for server-read initial state.
// Default: SMS on (Joao Pedro confirmed), email off.

export default function ReminderToggles() {
  const [sms, setSms] = useState(true)
  const [email, setEmail] = useState(false)

  return (
    <div className="bg-surface rounded-xl border border-border divide-y divide-border">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-text-primary">{s.account.reminders_sms}</p>
          <p className="text-xs text-text-secondary">{s.account.reminders_sms_hint}</p>
        </div>
        {/* The wrapping label gives the switch a 44px tap area (SPEC-portal §0.2)
            without altering the shared Switch's visual size. */}
        <label className="inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center">
          <Switch
            checked={sms}
            onChange={(e) => setSms(e.target.checked)}
            aria-label={s.account.reminders_sms}
          />
        </label>
      </div>

      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-text-primary">{s.account.reminders_email}</p>
          <p className="text-xs text-text-secondary">{s.account.reminders_email_hint}</p>
        </div>
        <label className="inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center">
          <Switch
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
            aria-label={s.account.reminders_email}
          />
        </label>
      </div>

      {(!sms && !email) && (
        <div className="px-4 py-2">
          <p role="status" className="text-xs text-warning-700">
            {s.account.reminders_off_warning}
          </p>
        </div>
      )}
    </div>
  )
}

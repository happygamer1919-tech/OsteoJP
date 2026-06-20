'use client'

import { Switch } from '@osteojp/ui'
import { useState, useTransition } from 'react'
import { updateReminderPrefsAction } from '@/app/portal/account/actions'
import { s } from '@/lib/i18n'

export default function ReminderToggles({
  initialSms,
  initialEmail,
}: {
  initialSms: boolean
  initialEmail: boolean
}) {
  const [sms, setSms] = useState(initialSms)
  const [email, setEmail] = useState(initialEmail)
  const [, startTransition] = useTransition()

  function toggle(field: 'sms' | 'email', checked: boolean) {
    const next = field === 'sms'
      ? { smsEnabled: checked, emailEnabled: email }
      : { smsEnabled: sms, emailEnabled: checked }

    // Optimistic update — apply immediately, rollback on server error.
    if (field === 'sms') setSms(checked)
    else setEmail(checked)

    startTransition(async () => {
      const result = await updateReminderPrefsAction(next)
      if (result?.error) {
        // Revert on failure
        if (field === 'sms') setSms(!checked)
        else setEmail(!checked)
      }
    })
  }

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
            onChange={(e) => toggle('sms', e.target.checked)}
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
            onChange={(e) => toggle('email', e.target.checked)}
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

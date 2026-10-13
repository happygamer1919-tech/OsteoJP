'use client'

import { Switch } from '@osteojp/ui'
import { useState, useTransition } from 'react'
import { updateSurveyPrefAction } from '@/app/portal/account/actions'
import { s } from '@/lib/i18n'

// SAT-01 (S8): the patient's own survey switch, on "A minha conta".
//
// IT IS DRAWN ONLY WHEN THE PROFILE CARRIES THE VALUE. AccountView renders this
// component when `profile.surveyEnabled` is a boolean, and the API puts that key
// in the profile only for a patient the survey applies to: never while the
// survey is switched off, and under canary only for a listed patient. So there
// is no variable to read here and no default to fall back on: no key, no
// section, no title.
//
// ONLY THE SURVEY SWITCH TRAVELS. The action sends `surveyEnabled` and nothing
// else, so pressing it cannot move either reminder switch.
//
// The four texts are the approved ones (docs/design/SAT-01-copy-pt.md, 32 to
// 35). There is no approved text for a failed save, so a failure puts the
// switch back where it was, as the reminder switches do, and says nothing.
export default function SurveyToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [, startTransition] = useTransition()

  function toggle(checked: boolean) {
    // Optimistic update, rolled back when the server refuses.
    setEnabled(checked)
    startTransition(async () => {
      const result = await updateSurveyPrefAction(checked)
      if (!result.ok) setEnabled(!checked)
    })
  }

  return (
    <section className="flex flex-col gap-2" data-testid="survey-toggle">
      <h3 className="text-xs font-medium text-text-secondary">{s.account.survey_title}</h3>
      <div className="bg-surface rounded-xl border border-border divide-y divide-border">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-text-primary">{s.account.survey_switch}</p>
            <p className="text-xs text-text-secondary">{s.account.survey_hint}</p>
          </div>
          {/* The wrapping label gives the switch a 44px tap area (SPEC-portal 0.2),
              as on the reminder switches. */}
          <label className="inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center">
            <Switch
              checked={enabled}
              onChange={(e) => toggle(e.target.checked)}
              aria-label={s.account.survey_switch}
            />
          </label>
        </div>

        {!enabled && (
          <div className="px-4 py-2">
            <p role="status" className="text-xs text-text-secondary">
              {s.account.survey_off_note}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

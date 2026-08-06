'use client'

import { useActionState, useEffect, useState } from 'react'
import { Banner, Button, Field, Input } from '@osteojp/ui'

import { s } from '@/lib/i18n'

import { loginAction, trustedDeviceAction } from './actions'
import { INITIAL_LOGIN_STATE } from './state'

/**
 * W13-03 — the patient login screens. Decision D, and the whole of it: a phone
 * number, a 6-digit code, and a device this browser can be trusted as for 30
 * days. No password field, no email field, no link.
 *
 * THREE STATES, ONE COMPONENT: checking a trusted device, asking for the phone,
 * asking for the code. They are one component because they are one flow and the
 * phone number has to survive between them; splitting them across routes would
 * put a patient's phone number in a URL.
 *
 * NOTHING HERE TALKS TO THE API. The forms post to a server action on this
 * origin (`actions.ts`), which calls the API server-to-server and takes custody
 * of both credentials in `httpOnly` cookies. No token, code or number is ever
 * readable by script on this page.
 */
export function LoginOtp({ deviceKnown }: { deviceKnown: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_LOGIN_STATE)

  /**
   * The trusted-device check, on load.
   *
   * ONLY WHEN THE BROWSER ACTUALLY HOLDS A DEVICE COOKIE — `deviceKnown` is read
   * server-side in `page.tsx`. A patient logging in for the first time pays no
   * round trip to be told what this app already knows, and sees the phone form
   * immediately rather than a spinner.
   *
   * The action REDIRECTS on success, so the ordinary success path never resolves
   * here; `finally` exists for the refusal and for a network fault, either of
   * which drops through to the phone form.
   */
  const [checkingDevice, setCheckingDevice] = useState(deviceKnown)
  useEffect(() => {
    if (!deviceKnown) return
    let cancelled = false
    void trustedDeviceAction().finally(() => {
      if (!cancelled) setCheckingDevice(false)
    })
    return () => {
      cancelled = true
    }
  }, [deviceKnown])

  if (checkingDevice) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-2 text-xl font-semibold text-text-primary">{s.auth.otp_title}</h2>
        <p role="status" className="text-sm text-text-secondary">
          {s.auth.otp_trusted_checking}
        </p>
      </div>
    )
  }

  const onCodeStep = state.step === 'code'

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-6 text-xl font-semibold text-text-primary">{s.auth.otp_title}</h2>

        {state.sent && (
          <div className="mb-4 overflow-hidden rounded-lg">
            <Banner tone="info">{s.auth.otp_sent}</Banner>
          </div>
        )}

        {state.error && (
          <div className="mb-4 overflow-hidden rounded-lg">
            <Banner tone="error">{s.auth[state.error]}</Banner>
          </div>
        )}

        <form action={formAction} className="flex flex-col gap-4">
          {/* The step is carried in the form, not in a client variable, so the
              flow behaves identically with and without JavaScript. */}
          <input type="hidden" name="intent" value={onCodeStep ? 'verify' : 'send'} />

          {onCodeStep ? (
            <>
              {/* Carried in the form so the verify step needs no client state,
                  and SHOWN below it because the patient must be able to see
                  which number the code went to before typing six digits. */}
              <input type="hidden" name="phone" value={state.phone} />
              <p className="text-sm text-text-secondary">{state.phone}</p>

              <Field label={s.auth.otp_code_label}>
                <Input
                  name="code"
                  // `one-time-code` is what lets iOS and Android offer the code
                  // straight from the SMS. `numeric` raises the digit keypad;
                  // `type="text"` and not `number`, which renders a spinner and
                  // strips leading zeros — a 6-digit code can start with one.
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoFocus
                  required
                />
              </Field>

              <Button type="submit" variant="primary" loading={pending} className="w-full">
                {s.auth.otp_verify}
              </Button>
            </>
          ) : (
            <>
              <Field label={s.auth.otp_phone_label}>
                <Input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  defaultValue={state.phone}
                  autoFocus
                  required
                />
              </Field>

              <Button type="submit" variant="primary" loading={pending} className="w-full">
                {s.auth.otp_send}
              </Button>
            </>
          )}
        </form>
      </div>

      {/*
        THE THREE DEGRADATION CASES (LOOP 3 step 8), rendered as STANDING
        GUIDANCE on the code screen rather than as a diagnosis.

        This is the only honest place to put them. The API answers ONE 401 for
        all six ways a verification can fail — including "no patient has this
        number", "the number is on two records" and every wrong-code case —
        because a response that differed would turn this screen into a
        patient-list oracle. So the portal CANNOT know which of the three applies
        and must not pretend to. Listing all three, always, tells the patient who
        has no mobile on record exactly what to do, without the server having
        confirmed anything about anyone.
      */}
      {onCodeStep && (
        <section className="mt-6 rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-medium text-text-primary">{s.auth.otp_help_title}</h3>
          <ul className="flex flex-col gap-2 text-sm text-text-secondary">
            <li>{s.auth.otp_no_phone}</li>
            <li>{s.auth.otp_landline}</li>
            <li>{s.auth.otp_shared_number}</li>
          </ul>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-text-secondary">
        {s.common.app_name} · {s.common.footer_locations}
      </p>
    </>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'
import { Banner, Button, Field, Input } from '@osteojp/ui'

import { s } from '@/lib/i18n'
import { ALL_CLINIC_PHONES } from '@/lib/clinics'

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
   * THE NAVIGATION HAPPENS HERE, not in the action. An action invoked from an
   * effect rather than a form submission would have to rely on the dispatcher
   * processing a `redirect()` response, and there is no reason to depend on that
   * when the client already knows what `true` means. Anything else — a refused
   * device, an expired one, a network fault — falls through to the phone form,
   * which is the correct screen for all three.
   */
  const router = useRouter()
  const [checkingDevice, setCheckingDevice] = useState(deviceKnown)
  useEffect(() => {
    if (!deviceKnown) return
    let cancelled = false
    void trustedDeviceAction()
      .then((ok) => {
        if (cancelled) return
        // `replace`, not `push`: the login screen must not sit in the back
        // stack of a patient who never had to interact with it.
        if (ok) router.replace('/portal/dashboard')
        else setCheckingDevice(false)
      })
      .catch(() => {
        if (!cancelled) setCheckingDevice(false)
      })
    return () => {
      cancelled = true
    }
  }, [deviceKnown, router])

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

          {/* PG9. ALL THREE LINES ABOVE END IN "Contacte a clínica" AND NONE OF
              THEM COULD BE ACTED ON. A patient with no mobile on record, a
              landline, or a number shared with a relative is locked out of the
              portal by design - Decision D has no other door - and the copy told
              them to call without saying what to call. The numbers were in the
              app the whole time, hardcoded inside the Clínicas screen.

              NO NEW SENTENCE IS WRITTEN HERE. The heading is the existing
              `clinics.phone_label` and the numbers are data. `tel:` makes them
              one tap on the device this screen is designed for.

              EVERY CLINIC'S NUMBER, DELIBERATELY. This screen runs BEFORE
              authentication, so it does not know which clinic the patient
              belongs to and must not appear to - narrowing the list would leak
              exactly the membership the OTP endpoint refuses to disclose. The
              numbers are published on osteojp.pt, so showing all of them
              discloses nothing. */}
          <p className="mt-3 text-sm font-medium text-text-primary">{s.clinics.phone_label}</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {ALL_CLINIC_PHONES.map((p) => (
              <li key={p.number}>
                <a
                  href={`tel:${p.number}`}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-accent-2-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  {p.display}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-text-secondary">
        {s.common.app_name} · {s.common.footer_locations}
      </p>
    </>
  )
}

'use client'

import { useActionState } from 'react'
import { Banner, Button, Field, Input } from '@osteojp/ui'

import { s } from '@/lib/i18n'
import { CLINIC_CONTACTS } from '@/lib/clinics'
import type { PublicCatalog } from '@/lib/guest/api'

import { guestBookingAction } from './actions'
import {
  GUEST_TOTAL_STEPS,
  INITIAL_GUEST_STATE,
  servicesForClinic,
  type GuestValues,
} from './state'

/**
 * GUEST-04 — the public booking form. Option A, ratified 2026-08-14.
 *
 * WHAT IT COLLECTS, AND THE LIST IS CLOSED: a clinic, a service, a preferred
 * date, a preferred period, a name and a mobile number. Nothing else. No NIF
 * (PL-20), nothing clinical, nothing about health, no account.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, and this is the ruling rather than a
 * shortcut: it shows NO availability. No therapist list, no slot grid, no
 * "09:30 is free". An anonymous visitor therefore cannot learn who works at a
 * clinic or when the building is empty (MUST-NEVER rows MN-27 and MN-28), and
 * nothing on this screen can be read as a time that has been held for them.
 * Reception resolves the real slot when they call, which is R-GUEST-1: a guest
 * booking is always a request, never a confirmed appointment.
 *
 * EVERY VALUE IS CARRIED IN THE FORM. The four steps are one `<form>` posting to
 * one server action, with the earlier answers as hidden fields, so the flow
 * works identically with and without JavaScript and the server validates each
 * step whether or not the browser did. Same shape as the login screen.
 *
 * THE CONFIRMATION IS A STATE, NOT A URL, and that is SEC-pending-screen-asserts-
 * nothing applied one flow over. The portal's booking pending screen used to say
 * "Pedido recebido" to anyone who navigated to it, including after a FAILED
 * submit. A guest has no id and no token to verify a request by - and giving
 * them one would create a lookup surface on a public form - so the only honest
 * way to say "received" is to say it exclusively in the render that follows an
 * accepted submit in this browser. There is no address anybody can visit to be
 * told their request arrived.
 */

export type GuestBookingFormProps = {
  catalog: PublicCatalog
  /** YYYY-MM-DD bounds, computed in Lisbon ON THE SERVER. A browser in another
   *  time zone would compute a different "today" and could offer yesterday. */
  minDate: string
  maxDate: string
  /** clinical.consent.rgpd.label / .body, VERBATIM. Passed in rather than read
   *  here so the staff dictionary does not enter the public page's bundle. */
  rgpdLabel: string
  rgpdBody: string
  /** null when JP's commitment copy is not written yet. */
  confirmationCopy: { title: string; body: string } | null
}

const CHOICE_ROW =
  'flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left text-text-primary transition duration-fast ease-standard hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

const CHOICE_ROW_SELECTED = `${CHOICE_ROW} border-accent-2-700`

function hidden(values: GuestValues, except: (keyof GuestValues)[] = []) {
  return (Object.keys(values) as (keyof GuestValues)[])
    .filter((k) => !except.includes(k))
    .map((k) => <input key={k} type="hidden" name={k} value={values[k]} />)
}

export function GuestBookingForm({
  catalog,
  minDate,
  maxDate,
  rgpdLabel,
  rgpdBody,
  confirmationCopy,
}: GuestBookingFormProps) {
  const [state, formAction, pending] = useActionState(
    guestBookingAction,
    INITIAL_GUEST_STATE,
  )

  const { values, step } = state
  const location = catalog.locations.find((l) => l.id === values.locationId) ?? null
  const service = catalog.services.find((sv) => sv.id === values.serviceId) ?? null
  // EMPTY locationIds MEANS EVERY CLINIC; this used to read it as NONE. See
  // servicesForClinic in state.ts, where the rule now lives and is tested.
  const servicesHere = servicesForClinic(catalog.services, values.locationId)

  /* ---------------------------------------------------------------- */
  /* THE CONFIRMATION. Reached only by an accepted submit.             */
  /* ---------------------------------------------------------------- */
  if (state.received) {
    // UNREACHABLE BY CONSTRUCTION - the action refuses to submit at all while
    // the copy is unwritten - and handled anyway, VISIBLY. A blank confirmation
    // is the one outcome this screen must never produce: the person has given
    // the clinic their telephone number and would leave with nothing on screen
    // to say so. Rendering the unavailable banner is wrong in a way somebody
    // reports; rendering nothing is wrong in a way nobody does.
    if (!confirmationCopy) {
      return (
        <div className="overflow-hidden rounded-lg">
          <Banner tone="error">{s.guest.error_unavailable}</Banner>
        </div>
      )
    }
    return (
      <div
        data-testid="guest-confirmation"
        role="status"
        className="rounded-xl border border-border bg-surface p-6"
      >
        <h2 className="mb-2 text-xl font-semibold text-text-primary">
          {confirmationCopy.title}
        </h2>
        <p className="text-sm text-text-secondary">{confirmationCopy.body}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-6 flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-text-primary">{s.guest.title}</h2>
        <p className="text-sm text-text-secondary">{s.guest.subtitle}</p>
        <p className="text-xs text-text-secondary">
          {s.guest.step_label
            .replace('{{current}}', String(step))
            .replace('{{total}}', String(GUEST_TOTAL_STEPS))}
        </p>
      </div>

      {state.error && (
        <div className="mb-4 overflow-hidden rounded-lg">
          <Banner tone="error">
            {state.error === 'consent_required'
              ? s.guest.consent_required
              : state.error === 'rate_limited'
                ? s.guest.error_rate_limited
                : state.error === 'unavailable'
                  ? s.guest.error_unavailable
                  : s.guest.error_invalid}
          </Banner>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="step" value={step} />

        {/* ---- 1. CLINIC ------------------------------------------------ */}
        {step === 1 && (
          <>
            {hidden(values, ['locationId'])}
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium text-text-primary">
                {s.guest.step_clinic}
              </legend>
              {catalog.locations.map((l) => (
                <label
                  key={l.id}
                  className={values.locationId === l.id ? CHOICE_ROW_SELECTED : CHOICE_ROW}
                >
                  <input
                    type="radio"
                    name="locationId"
                    value={l.id}
                    defaultChecked={values.locationId === l.id}
                    className="size-4 accent-accent-2-700"
                  />
                  <span>{l.name}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {/* ---- 2. SERVICE ----------------------------------------------- */}
        {step === 2 && (
          <>
            {hidden(values, ['serviceId'])}
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium text-text-primary">
                {s.guest.step_service}
              </legend>
              {/* NAME ONLY. No price and no duration reach this screen, because
                  neither reaches the public catalog endpoint. */}
              {servicesHere.map((sv) => (
                <label
                  key={sv.id}
                  className={values.serviceId === sv.id ? CHOICE_ROW_SELECTED : CHOICE_ROW}
                >
                  <input
                    type="radio"
                    name="serviceId"
                    value={sv.id}
                    defaultChecked={values.serviceId === sv.id}
                    className="size-4 accent-accent-2-700"
                  />
                  <span>{sv.name}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {/* ---- 3. WHEN -------------------------------------------------- */}
        {step === 3 && (
          <>
            {hidden(values, ['preferredDate', 'preferredPeriod'])}
            <Field label={s.guest.date_label} required>
              {/* NATIVE date input, not the UI DatePicker, for two reasons: it
                  posts without JavaScript, and on a phone - which is where a
                  public booking form is read - it opens the operating system's
                  own picker. min/max come from the server so the bounds are
                  Lisbon's, not the device's. */}
              <Input
                type="date"
                name="preferredDate"
                min={minDate}
                max={maxDate}
                required
                defaultValue={values.preferredDate}
              />
            </Field>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium text-text-primary">
                {s.guest.period_label}
              </legend>
              {(
                [
                  ['manha', s.guest.period_manha, s.guest.period_manha_hint],
                  ['tarde', s.guest.period_tarde, s.guest.period_tarde_hint],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={
                    values.preferredPeriod === value ? CHOICE_ROW_SELECTED : CHOICE_ROW
                  }
                >
                  <input
                    type="radio"
                    name="preferredPeriod"
                    value={value}
                    defaultChecked={values.preferredPeriod === value}
                    required
                    className="size-4 accent-accent-2-700"
                  />
                  <span className="flex flex-col">
                    <span>{label}</span>
                    {/* The hours the period covers. A statement about the
                        clinic's published opening hours, NOT about whether
                        anything in that range is free. */}
                    <span className="text-xs text-text-secondary">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {/* ---- 4. DETAILS + RGPD ---------------------------------------- */}
        {step === 4 && (
          <>
            {hidden(values, ['fullName', 'phone'])}

            <dl className="flex flex-col gap-1 rounded-lg border border-border p-4 text-sm">
              <div className="flex gap-2">
                <dt className="text-text-secondary">{s.guest.review_clinic}:</dt>
                <dd className="text-text-primary">{location?.name ?? ''}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-secondary">{s.guest.review_service}:</dt>
                <dd className="text-text-primary">{service?.name ?? ''}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-secondary">{s.guest.review_when}:</dt>
                <dd className="text-text-primary">
                  {values.preferredDate}
                  {values.preferredPeriod === 'manha'
                    ? ` · ${s.guest.period_manha}`
                    : values.preferredPeriod === 'tarde'
                      ? ` · ${s.guest.period_tarde}`
                      : ''}
                </dd>
              </div>
            </dl>

            <Field label={s.guest.name_label} required>
              <Input
                name="fullName"
                maxLength={120}
                autoComplete="name"
                required
                defaultValue={values.fullName}
              />
            </Field>

            <Field label={s.guest.phone_label} required helperText={s.guest.phone_hint}>
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                defaultValue={values.phone}
              />
            </Field>

            {/* ---- RGPD, VERBATIM ----------------------------------------
                THE TEXT IS NOT AUTHORED HERE AND MUST NOT BE. Both strings are
                the ratified `clinical.consent.rgpd` keys, rendered unchanged -
                the same wording a patient signs on the ficha. The
                acknowledgement is REQUIRED and sits immediately above the
                submit, which is the ratified placement, and the server checks
                it independently of the `required` attribute: consent has to be
                provable, and an attribute is a hint to a browser. */}
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-text-primary">{rgpdLabel}</p>
              <p className="text-xs leading-relaxed text-text-secondary">{rgpdBody}</p>
              <label className="flex items-start gap-3 text-sm text-text-primary">
                <input
                  type="checkbox"
                  name="consent"
                  required
                  defaultChecked={state.consent}
                  className="mt-0.5 size-4 accent-accent-2-700"
                />
                <span>{rgpdLabel}</span>
              </label>
            </div>
          </>
        )}

        <div className="mt-2 flex items-center gap-3">
          {step > 1 && (
            <Button type="submit" name="intent" value="back" variant="secondary">
              {s.common.back}
            </Button>
          )}
          {step < GUEST_TOTAL_STEPS ? (
            <Button type="submit" name="intent" value="next" disabled={pending}>
              {s.common.continue}
            </Button>
          ) : (
            <Button type="submit" name="intent" value="submit" disabled={pending}>
              {s.guest.submit}
            </Button>
          )}
        </div>
      </form>

      {/* PG9: a patient-facing screen that can dead-end carries the clinic's
          telephone. EVERY clinic's, because this visitor has not told us which
          one is theirs and the form must not appear to know.

          GROUPED BY CLINIC, AND THE GROUPING IS THE POINT (owner ruling,
          2026-08-19). This rendered as a bare row of four green numbers: every
          number the clinic owns, side by side, attributed to nobody. A visitor
          who wants to ring Castelo Branco could not tell which two of the four
          reach it, so the affordance that exists precisely for the moment
          somebody gives up on the form was unusable at that moment.

          NO SENTENCE IS AUTHORED HERE. The heading is `clinics.phone_label`,
          which already existed; the clinic names and the numbers are both data
          from lib/clinics.ts. Structuring data that was already on the screen
          is presentation, not copy - the same reasoning ClinicPhones records.

          WHY NOT THE SHARED ClinicPhones COMPONENT: it renders the deliberately
          FLAT list on the login screen and on every error boundary, where the
          surface has no identity to attach numbers to and narrowing would leak
          which clinic a patient belongs to. This screen is a form the visitor
          is actively filling in, so naming the clinics helps rather than
          discloses. Changing the shared component would have changed seven
          screens to fix one. */}
      <div className="mt-6 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">{s.clinics.phone_label}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {CLINIC_CONTACTS.map((clinic) => (
            <li key={clinic.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium text-text-primary">{clinic.name}</span>
              <span className="flex flex-wrap items-center gap-x-3">
                {clinic.phone.map((p) => (
                  <a
                    key={p.number}
                    href={`tel:${p.number}`}
                    /* min-h-11 is 44px, the target size PG9 audits for. It is on
                       the LINK rather than the row so the tap target is the
                       number itself, not the whitespace beside it. */
                    className="inline-flex min-h-11 items-center font-medium text-accent-2-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    {p.display}
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

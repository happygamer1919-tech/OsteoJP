'use client'

import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Banner, Button, Card, DatePicker, SlotPicker } from '@osteojp/ui'
import type { BookableLocation, BookableService, BookableTherapist } from '@/lib/api/client'
import { loadSlots, loadTherapists, submitBooking } from './actions'
import { formatPrice, formatTime, localDateKey } from './slots'
import { locationDisplayName } from '@/lib/locationLabel'
import { s } from '@/lib/i18n'

/**
 * A2 inserted the THERAPIST step at 3, so date/time moved to 4 and confirm to 5.
 * The counter and the progress bar below both read from TOTAL_STEPS rather than
 * a literal, so the next insertion changes one constant instead of three places.
 */
type Step = 1 | 2 | 3 | 4 | 5
const TOTAL_STEPS = 5

const ROW =
  'flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

export function BookingFlow({
  locations,
  services,
  preselectedServiceId,
  preselectedLocationId,
}: {
  locations: BookableLocation[]
  services: BookableService[]
  /** Decision C: the patient's usual service. Marks and lifts one row; never
   *  hides another and never skips the step. */
  preselectedServiceId?: string | null
  /** A1, Decision C: the patient's home clinic. Skips the step FORWARD; never
   *  removes it and never hides the other clinic. See `homeClinic` below. */
  preselectedLocationId?: string | null
}) {
  const router = useRouter()
  const singleClinic = locations.length === 1

  // A1 — WHY A HOME CLINIC MAY SKIP THE STEP WHEN A USUAL SERVICE MAY NOT, since
  // both are Decision C preselections and they are treated differently one screen
  // apart.
  //
  // The service step is a list of DISTINCT things: every row is a different
  // appointment, so advancing on the patient's behalf would remove the choice
  // rather than preselect within it. The clinic step is a list of the SAME thing
  // in two places, the patient goes to one of them, and the value is already on
  // their record. Advancing there removes a tap, not a decision.
  //
  // AND IT IS ONLY DEFENSIBLE BECAUSE THE STEP STAYS REACHABLE. The switch
  // control below is rendered on EVERY step, so the other clinic is one tap away
  // from anywhere in the flow. Preselection that could not be undone in one
  // interaction would be restriction, which Decision C forbids.
  //
  // NULL IS THE ONLY VALUE IN PRODUCTION TODAY (LE-primary-location-backfill), so
  // the branch that matters right now is the one that does NOT skip.
  const homeClinic =
    preselectedLocationId && locations.some((l) => l.id === preselectedLocationId)
      ? preselectedLocationId
      : null
  const startsPreselected = singleClinic || homeClinic !== null

  const [step, setStep] = useState<Step>(startsPreselected ? 2 : 1)
  const [locationId, setLocationId] = useState<string | null>(
    singleClinic ? locations[0]!.id : homeClinic,
  )
  const [serviceId, setServiceId] = useState<string | null>(null)
  // A2 — null means "let us choose for you", which is the pre-A2 behaviour and
  // is a REAL choice the patient makes, not merely the absence of one. It is
  // therefore paired with `therapistChosen` rather than inferred from null, so
  // the flow can tell "has not decided yet" from "decided to let us choose".
  const [practitionerId, setPractitionerId] = useState<string | null>(null)
  const [therapistChosen, setTherapistChosen] = useState(false)
  const [therapistsState, setTherapistsState] = useState<{
    key: string
    therapists?: BookableTherapist[]
    error?: string
  } | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [slotIso, setSlotIso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slotTaken, setSlotTaken] = useState(false)
  const [pending, startTransition] = useTransition()
  // Step-3 slots come from the API's availability endpoint — the SAME source
  // the booking confirm validates against. The result is tagged with the key
  // it was fetched for; a key mismatch means loading. slotsVersion is bumped
  // after any rejected confirm so the list is refetched, never reused.
  const [slotsState, setSlotsState] = useState<{
    key: string
    slots?: string[]
    error?: string
  } | null>(null)
  const [slotsVersion, setSlotsVersion] = useState(0)

  const location = locations.find((l) => l.id === locationId) ?? null
  const service = services.find((s) => s.id === serviceId) ?? null
  const availableServices = services.filter(
    (s) => s.locationIds.length === 0 || (locationId != null && s.locationIds.includes(locationId)),
  )

  // DECISION C — PRESELECTION, NEVER RESTRICTION (WAVE-13.md:230-232, :809).
  //
  // The usual service is MARKED and LIFTED TO THE TOP. It is not auto-selected
  // and the step is not skipped, and that is the reading of "preselect" this UI
  // can honour honestly: in a list-of-buttons wizard every row IS the choice, so
  // advancing on the patient's behalf would remove the step rather than
  // preselect within it - a restriction wearing a preselection's name.
  //
  // A SORT, NEVER A FILTER. The array below has the same members as
  // availableServices, in a different order. Nothing is hidden, so a patient
  // whose history preselects X can still book every other bookable service, and
  // the only way to break that is to change this to a filter - which is what
  // preselection.test.ts asserts against.
  const orderedServices = useMemo(() => {
    if (!preselectedServiceId) return availableServices
    const idx = availableServices.findIndex((svc) => svc.id === preselectedServiceId)
    if (idx <= 0) return availableServices
    const copy = [...availableServices]
    const [usual] = copy.splice(idx, 1)
    return [usual!, ...copy]
    // availableServices is derived from props + locationId; both are in the deps
    // of everything that produces it, and it is rebuilt on every render, so it
    // is keyed on the two inputs rather than on the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, locationId, preselectedServiceId])

  // A2: the chosen therapist is PART OF THE KEY. Without it, switching therapist
  // would reuse the previous therapist's slot list - the same staleness the
  // version counter was added to prevent, arriving from a new direction.
  const slotsKey =
    serviceId && locationId
      ? `${serviceId}|${locationId}|${practitionerId ?? 'any'}|${slotsVersion}`
      : null

  const therapistsKey = serviceId && locationId ? `${serviceId}|${locationId}` : null

  useEffect(() => {
    if (!therapistsKey || !serviceId || !locationId) return
    let stale = false
    loadTherapists(serviceId, locationId).then((result) => {
      if (stale) return
      setTherapistsState(
        'error' in result
          ? { key: therapistsKey, error: result.error }
          : { key: therapistsKey, therapists: result.therapists },
      )
    })
    return () => {
      stale = true
    }
  }, [therapistsKey, serviceId, locationId])

  useEffect(() => {
    if (!slotsKey || !serviceId || !locationId) return
    let stale = false
    loadSlots(serviceId, locationId, practitionerId).then((result) => {
      if (stale) return
      setSlotsState(
        'error' in result
          ? { key: slotsKey, error: result.error }
          : { key: slotsKey, slots: result.slots },
      )
    })
    return () => {
      stale = true
    }
  }, [slotsKey, serviceId, locationId, practitionerId])

  // Stale-keyed state reads as loading — never as the previous list.
  const currentSlots = slotsState && slotsState.key === slotsKey ? slotsState : null
  const slots = currentSlots?.slots ?? null
  const slotsError = currentSlots?.error ?? null

  const currentTherapists =
    therapistsState && therapistsState.key === therapistsKey ? therapistsState : null
  const therapists = currentTherapists?.therapists ?? null
  const therapistsError = currentTherapists?.error ?? null
  const therapist = therapists?.find((t) => t.id === practitionerId) ?? null

  const byDate = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const iso of slots ?? []) {
      const key = localDateKey(iso)
      ;(map[key] ??= []).push(iso)
    }
    return map
  }, [slots])

  const availableDates = useMemo(() => Object.keys(byDate).sort(), [byDate])
  const daySlots = date ? (byDate[date] ?? []).map((iso) => ({ value: iso, label: formatTime(iso) })) : []

  function back() {
    setError(null)
    if (step === 1) return router.push('/portal/dashboard')
    // A preselected start has no step 1 behind it, so Back from step 2 leaves the
    // flow rather than landing on a step the patient never saw. The clinic is
    // still changeable from the switch control, which is always on screen.
    if (step === 2) return startsPreselected ? router.push('/portal/dashboard') : setStep(1)
    if (step === 3) return setStep(2)
    if (step === 4) return setStep(3)
    return setStep(4)
  }

  /**
   * A1 — the always-visible escape hatch, and the reason preselection here is
   * not restriction.
   *
   * Returns the patient to the clinic list from ANY step in ONE interaction.
   * Everything downstream of the clinic is cleared, because a service, a date and
   * a slot chosen at one location do not carry to the other: the service may not
   * be offered there and the slot certainly is not.
   */
  function switchClinic() {
    setError(null)
    setSlotTaken(false)
    setLocationId(null)
    setServiceId(null)
    // A2: the therapist roster is per-CLINIC, so a therapist chosen at one
    // location is meaningless at the other and must not survive the switch.
    setPractitionerId(null)
    setTherapistChosen(false)
    setDate(null)
    setSlotIso(null)
    setStep(1)
  }

  function selectLocation(id: string) {
    setLocationId(id)
    setServiceId(null)
    setDate(null)
    setSlotIso(null)
    setStep(2)
  }

  function selectService(id: string) {
    setServiceId(id)
    setPractitionerId(null)
    setTherapistChosen(false)
    setDate(null)
    setSlotIso(null)
    setStep(3)
  }

  /**
   * A2 — record the therapist choice and advance to date/time.
   *
   * `id === null` is the explicit "Escolham por mim" option. It is a DECISION,
   * not a skipped step, which is why `therapistChosen` is set in both branches:
   * the patient chose to let the clinic choose, and the confirm screen says so.
   */
  function selectTherapist(id: string | null) {
    setPractitionerId(id)
    setTherapistChosen(true)
    setDate(null)
    setSlotIso(null)
    setStep(4)
  }

  function confirm() {
    // A2 adds `therapistChosen` to this guard, and it is not redundant with the
    // step order. `practitionerId === null` is a VALID booking ("choose for
    // me"), so null alone cannot tell a made decision from an unmade one. If a
    // future edit ever lets the flow reach confirm without passing step 3, this
    // refuses rather than silently submitting an auto-assignment the patient
    // never agreed to.
    if (!serviceId || !locationId || !slotIso || !therapistChosen) return
    setError(null)
    startTransition(async () => {
      const result = await submitBooking({
        serviceId,
        locationId,
        startsAt: slotIso,
        // null is "choose for me" and the API treats it as the pre-A2 path.
        practitionerId,
      })
      if (result) {
        setError(result.error)
        setSlotTaken(Boolean(result.slotTaken))
        if (result.slotTaken) {
          // The offered list is stale (taken slot or schedule gap) — drop the
          // dead selection and refetch before the patient picks again.
          setSlotIso(null)
          setSlotsVersion((v) => v + 1)
        }
      }
    })
  }

  function chooseAnotherTime() {
    setError(null)
    setSlotTaken(false)
    setSlotIso(null)
    setStep(4)
  }

  function retrySlots() {
    setSlotsVersion((v) => v + 1)
  }

  const summaryDate = slotIso
    ? `${new Date(slotIso).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' })} · ${formatTime(slotIso)}`
    : ''

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button type="button" onClick={back} variant="ghost" iconLeft={ChevronLeft}>
          {s.common.back}
        </Button>

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-secondary">
            {s.booking.step_label
              .replace('{{current}}', String(step))
              .replace('{{total}}', String(TOTAL_STEPS))}
          </p>
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-accent-2-700 transition-all duration-base ease-standard"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {/*
          A1 — DECISION C's "preselection is never restriction", rendered.

          Shown on every step from 2 onward whenever a clinic is chosen AND there
          is more than one to choose from. It is the single interaction that takes
          the patient to the other location from anywhere in the flow, which is
          what makes skipping step 1 legitimate rather than a removed choice.

          NOT hidden once the patient is deep in the flow, deliberately: a patient
          who realises at the confirm screen that they picked the wrong city must
          not have to abandon the booking to fix it.

          It names the CURRENT clinic rather than saying only "change", so the
          preselection is visible instead of silent - a patient who was advanced
          past step 1 can see which clinic they were advanced onto.
        */}
        {step > 1 && location && !singleClinic && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-xs text-text-secondary">
              <MapPin size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
              <span className="truncate">
                {s.booking.clinic_current.replace(
                  '{{name}}',
                  locationDisplayName(location.name) ?? '',
                )}
              </span>
            </span>
            <button
              type="button"
              onClick={switchClinic}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded text-sm font-semibold text-accent-2-700 transition-transform motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {s.booking.clinic_switch}
            </button>
          </div>
        )}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-text-primary">{s.booking.step_location}</h2>
          {locations.map((loc) => (
            <button key={loc.id} type="button" onClick={() => selectLocation(loc.id)} className={ROW}>
              <MapPin size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-accent-2-700" />
              <span className="flex-1 text-sm font-medium text-text-primary">{locationDisplayName(loc.name)}</span>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-text-primary">{s.booking.step_service}</h2>
          {orderedServices.map((svc) => (
            <button key={svc.id} type="button" onClick={() => selectService(svc.id)} className={ROW}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-primary">{svc.name}</span>
                {svc.id === preselectedServiceId && (
                  <span className="mt-1 inline-block rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                    {s.booking.usual_service}
                  </span>
                )}
                <span className="block text-xs text-text-secondary">
                  {svc.durationMin} min
                  {svc.priceCents !== null ? ` · ${formatPrice(svc.priceCents, svc.currency)}` : ''}
                </span>
              </span>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
            </button>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-text-primary">{s.booking.step_therapist}</h2>

          {/*
            A2 — "Escolham por mim" IS FIRST, and that ordering is deliberate
            rather than cosmetic. It is the option that preserves the clinic's
            existing behaviour, it is the right answer for a patient with no
            preference, and putting it last would read as an afterthought for
            what is in fact the default path.

            IT IS A REAL BUTTON, not an absence. A patient who skips this step
            has made no choice; a patient who presses this has chosen to let the
            clinic assign, and the confirm screen tells them so.
          */}
          <button type="button" onClick={() => selectTherapist(null)} className={ROW}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-text-primary">
                {s.booking.therapist_any}
              </span>
              <span className="block text-xs text-text-secondary">
                {s.booking.therapist_any_hint}
              </span>
            </span>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
          </button>

          {therapistsError ? (
            <Banner tone="error">{therapistsError}</Banner>
          ) : therapists === null ? (
            <p className="text-sm text-text-secondary">{s.booking.slots_loading}</p>
          ) : therapists.length === 0 ? (
            // Not an error: the roster can legitimately be empty at a clinic with
            // no active templates. "Escolham por mim" above still works, and the
            // API will report no_therapist honestly if nobody can take the slot.
            <p className="text-sm text-text-secondary">{s.booking.no_therapists}</p>
          ) : (
            therapists.map((t) => (
              <button key={t.id} type="button" onClick={() => selectTherapist(t.id)} className={ROW}>
                <span className="min-w-0 flex-1 text-sm font-medium text-text-primary">{t.name}</span>
                <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
              </button>
            ))
          )}
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-text-primary">{s.booking.step_datetime}</h2>
          <DatePicker
            value={date}
            onChange={(d) => {
              setDate(d)
              setSlotIso(null)
            }}
            min={availableDates[0]}
            max={availableDates[availableDates.length - 1]}
            placeholder={s.booking.choose_date_placeholder}
            triggerLabel={s.booking.choose_date_placeholder}
          />
          {slotsError ? (
            <Banner
              tone="error"
              action={
                <button
                  type="button"
                  onClick={retrySlots}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded text-sm font-semibold text-accent-2-700 transition-transform motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  {s.booking.slots_retry}
                </button>
              }
            >
              {slotsError}
            </Banner>
          ) : slots === null ? (
            <p className="text-sm text-text-secondary">{s.booking.slots_loading}</p>
          ) : date ? (
            daySlots.length > 0 ? (
              <SlotPicker aria-label={s.booking.slot_available} value={slotIso} onChange={setSlotIso} slots={daySlots} />
            ) : (
              <p className="text-sm text-text-secondary">{s.booking.no_slots_day}</p>
            )
          ) : (
            <p className="text-sm text-text-secondary">{s.booking.choose_date_prompt}</p>
          )}
          <Button
            variant="primary"
            className="min-h-11 w-full"
            disabled={!slotIso}
            onClick={() => slotIso && setStep(5)}
          >
            {s.common.continue}
          </Button>
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-text-primary">{s.booking.step_confirm}</h2>
          <Card>
            <dl className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-text-secondary">{s.booking.confirm_location}</dt>
                <dd className="text-sm text-text-primary">{locationDisplayName(location?.name) ?? '—'}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-text-secondary">{s.booking.confirm_service}</dt>
                <dd className="text-sm text-text-primary">{service?.name ?? '—'}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-text-secondary">{s.booking.confirm_therapist}</dt>
                <dd className="text-sm text-text-primary">
                  {/* The chosen name, or the words the patient actually pressed.
                      Never a guess at who will be assigned - that is decided at
                      confirm and telling them a name now would be a promise the
                      server has not made. */}
                  {therapist?.name ?? s.booking.therapist_any}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-text-secondary">{s.booking.confirm_datetime}</dt>
                <dd className="text-sm text-text-primary first-letter:uppercase">{summaryDate}</dd>
              </div>
            </dl>
          </Card>

          <p className="text-xs text-text-secondary">
            {s.booking.step_info_pending}
          </p>

          {error && (
            <Banner
              tone="error"
              action={
                slotTaken ? (
                  <button
                    type="button"
                    onClick={chooseAnotherTime}
                    className="inline-flex min-h-11 items-center whitespace-nowrap rounded text-sm font-semibold text-accent-2-700 transition-transform motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    {s.booking.choose_another_time}
                  </button>
                ) : undefined
              }
            >
              {error}
            </Banner>
          )}

          <Button variant="primary" className="min-h-11 w-full" loading={pending} onClick={confirm}>
            {s.booking.confirm_submit}
          </Button>
        </div>
      )}
    </div>
  )
}

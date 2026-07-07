'use client'

import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Banner, Button, Card, DatePicker, SlotPicker } from '@osteojp/ui'
import type { BookableLocation, BookableService } from '@/lib/api/client'
import { loadSlots, submitBooking } from './actions'
import { formatPrice, formatTime, localDateKey } from './slots'
import { s } from '@/lib/i18n'

type Step = 1 | 2 | 3 | 4

const ROW =
  'flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

export function BookingFlow({
  locations,
  services,
}: {
  locations: BookableLocation[]
  services: BookableService[]
}) {
  const router = useRouter()
  const singleClinic = locations.length === 1

  const [step, setStep] = useState<Step>(singleClinic ? 2 : 1)
  const [locationId, setLocationId] = useState<string | null>(singleClinic ? locations[0]!.id : null)
  const [serviceId, setServiceId] = useState<string | null>(null)
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

  const slotsKey =
    serviceId && locationId ? `${serviceId}|${locationId}|${slotsVersion}` : null

  useEffect(() => {
    if (!slotsKey || !serviceId || !locationId) return
    let stale = false
    loadSlots(serviceId, locationId).then((result) => {
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
  }, [slotsKey, serviceId, locationId])

  // Stale-keyed state reads as loading — never as the previous list.
  const currentSlots = slotsState && slotsState.key === slotsKey ? slotsState : null
  const slots = currentSlots?.slots ?? null
  const slotsError = currentSlots?.error ?? null

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
    if (step === 2) return singleClinic ? router.push('/portal/dashboard') : setStep(1)
    if (step === 3) return setStep(2)
    return setStep(3)
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
    setDate(null)
    setSlotIso(null)
    setStep(3)
  }

  function confirm() {
    if (!serviceId || !locationId || !slotIso) return
    setError(null)
    startTransition(async () => {
      const result = await submitBooking({ serviceId, locationId, startsAt: slotIso })
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
    setStep(3)
  }

  function retrySlots() {
    setSlotsVersion((v) => v + 1)
  }

  const summaryDate = slotIso
    ? `${new Date(slotIso).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatTime(slotIso)}`
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
              .replace('{{total}}', '4')}
          </p>
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-accent-2-700 transition-all duration-base ease-standard"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-text-primary">{s.booking.step_location}</h2>
          {locations.map((loc) => (
            <button key={loc.id} type="button" onClick={() => selectLocation(loc.id)} className={ROW}>
              <MapPin size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-accent-2-700" />
              <span className="flex-1 text-sm font-medium text-text-primary">{loc.name}</span>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-text-primary">{s.booking.step_service}</h2>
          {availableServices.map((svc) => (
            <button key={svc.id} type="button" onClick={() => selectService(svc.id)} className={ROW}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-primary">{svc.name}</span>
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
            onClick={() => slotIso && setStep(4)}
          >
            {s.common.continue}
          </Button>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-text-primary">{s.booking.step_confirm}</h2>
          <Card>
            <dl className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-text-secondary">{s.booking.confirm_location}</dt>
                <dd className="text-sm text-text-primary">{location?.name ?? '—'}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-text-secondary">{s.booking.confirm_service}</dt>
                <dd className="text-sm text-text-primary">{service?.name ?? '—'}</dd>
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

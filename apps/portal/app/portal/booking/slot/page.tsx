import { ChevronLeft } from 'lucide-react'
import { getBookableCatalog } from '@/lib/api/client'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SlotPicker from '@/components/booking/SlotPicker'

/**
 * Generate available slots for the next 14 days.
 * In V1 the portal does not have a real availability endpoint — slots are
 * generated from the clinic's default opening hours until the scheduling
 * API exposes a public endpoint. Staff can reject/reschedule in the staff app.
 *
 * Hours: Mon–Fri 09:00–19:00 (last slot), 30-min intervals.
 * This matches the OsteoJP clinic hours from osteojp.pt.
 */
function generateSlots(durationMin: number): string[] {
  const slots: string[] = []
  const now = new Date()
  const slotInterval = Math.max(durationMin, 30)

  for (let day = 1; day <= 14; day++) {
    const date = new Date(now)
    date.setDate(date.getDate() + day)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue // skip weekends

    // 09:00 – 19:00 in Europe/Lisbon (UTC+1 in summer, UTC in winter)
    // We generate in local wall time and convert; for now emit UTC offsets
    // as if Lisbon is UTC+1 (WEST). The booking API stores in UTC.
    for (let hour = 9; hour < 19; hour++) {
      for (let min = 0; min < 60; min += slotInterval) {
        if (hour === 18 && min > 0) break
        const slot = new Date(date)
        slot.setHours(hour - 1, min, 0, 0) // -1 for UTC (Lisbon is UTC+1 in summer)
        slots.push(slot.toISOString())
      }
    }
  }
  return slots
}

export default async function BookingSlotPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; service?: string }>
}) {
  const { location: locationId, service: serviceId } = await searchParams
  if (!locationId || !serviceId) redirect('/portal/booking')

  let catalog
  try {
    catalog = await getBookableCatalog()
  } catch {
    redirect('/portal/dashboard')
  }

  const location = catalog.locations.find((l) => l.id === locationId)
  const service = catalog.services.find((s) => s.id === serviceId)
  if (!location || !service) redirect('/portal/booking')

  const slots = generateSlots(service.durationMin)

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link
          href={`/portal/booking/service?location=${locationId}`}
          className="inline-flex min-h-11 items-center gap-1 text-text-secondary hover:text-text-primary text-sm"
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Voltar
        </Link>
      </div>
      <SlotPicker service={service} location={location} slots={slots} />
    </div>
  )
}

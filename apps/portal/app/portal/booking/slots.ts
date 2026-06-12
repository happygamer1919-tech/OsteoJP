/**
 * Slot generation for the booking flow. The portal has no public availability
 * endpoint yet, so slots come from the clinic's default opening hours
 * (Mon–Fri 09:00–19:00, 30-min minimum interval — osteojp.pt). Pure given
 * `nowMs` so it can run inside a client useMemo without reading the clock during
 * render. Returns UTC ISO datetimes; the UI groups + labels them in local time.
 */
export function generateSlots(durationMin: number, nowMs: number): string[] {
  const slots: string[] = []
  const now = new Date(nowMs)
  const slotInterval = Math.max(durationMin, 30)

  for (let day = 1; day <= 14; day++) {
    const date = new Date(now)
    date.setDate(date.getDate() + day)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue // skip weekends

    for (let hour = 9; hour < 19; hour++) {
      for (let min = 0; min < 60; min += slotInterval) {
        if (hour === 18 && min > 0) break
        const slot = new Date(date)
        slot.setHours(hour - 1, min, 0, 0) // -1: Lisbon is UTC+1 (WEST); API stores UTC
        slots.push(slot.toISOString())
      }
    }
  }
  return slots
}

/** YYYY-MM-DD in the viewer's local time (matches the DatePicker value format). */
export function localDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA')
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatPrice(priceCents: number | null, currency: string): string {
  if (priceCents === null) return ''
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
  }).format(priceCents / 100)
}

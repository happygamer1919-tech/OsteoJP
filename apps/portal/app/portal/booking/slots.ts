// Display helpers for the booking flow. Slot AVAILABILITY is never computed
// here: the list comes from GET /api/v1/booking/slots (see actions.loadSlots),
// the same availability + conflict source the booking confirm validates
// against. The client only groups and formats what the API returns.

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

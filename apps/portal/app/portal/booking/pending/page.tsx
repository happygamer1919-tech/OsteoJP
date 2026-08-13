import { Check, HelpCircle } from 'lucide-react'
import Link from 'next/link'
import { getMyAppointments } from '@/lib/api/client'
import { ClinicPhones } from '@/components/ClinicPhones'
import { s } from '@/lib/i18n'

const SECONDARY =
  'flex min-h-11 w-full items-center justify-center rounded-lg border border-border-strong bg-surface text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'
const GHOST =
  'flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

/**
 * The booking confirmation screen. SEC-pending-screen-asserts-nothing.
 *
 * ============================================================================
 * IT USED TO SAY "PEDIDO RECEBIDO" TO ANYONE WHO NAVIGATED HERE
 * ============================================================================
 * It took an `id`, used it to print a decorative reference, and **read no row**.
 * So a patient could:
 *
 *   - press BACK after leaving, and be told again that a request was received;
 *   - REFRESH after a submit that FAILED, and be told it succeeded;
 *   - open a STALE LINK or a bookmark, and be told a booking they never made was
 *     received.
 *
 * In every case the clinic learns nothing, because nothing was written. The
 * patient believes they have a pedido, reception has no row, the appointment does
 * not happen, and nobody finds out until the patient does not arrive.
 *
 * **It is section 1.3's pattern with the verdict at the patient**: an unhandled
 * case falling back to the benign-looking outcome. The other four instances were
 * in this project's instruments. This one was in the product.
 *
 * ============================================================================
 * IT NOW FAILS CLOSED, AND THE READ IS THE PATIENT'S OWN
 * ============================================================================
 * `getMyAppointments()` is RLS self-scoped, so a wrong or invented id returns
 * **nothing** rather than somebody else's row. That property is why this is the
 * right read: the screen can be made truthful without becoming a way to probe
 * whether an arbitrary appointment id exists.
 *
 * **No new endpoint was added.** Reading the patient's own list and looking for
 * the id costs one call the portal already makes elsewhere, and adds no surface
 * to an authenticated patient-facing route.
 *
 * ============================================================================
 * WHY A MISSING ROW IS NOT A RACE, WHICH IS THE OBVIOUS OBJECTION
 * ============================================================================
 * `bookAppointment` returns the created appointment BEFORE this redirect happens
 * (`booking/actions.ts:29-30`), so the row is committed by the time this page
 * runs — this is a fresh server request reading committed data through the same
 * primary, with no read replica in the path.
 *
 * It is worth stating rather than assuming, because the failure mode would be
 * ugly: a patient who booked successfully being told we cannot find their
 * request. **If a replica is ever introduced between the API and its database,
 * this page is one of the places that breaks**, and it should be revisited then
 * rather than hedged with a retry now.
 */
export default async function BookingPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  // NO ID MEANS NO CLAIM. A bookmark, a back button or a hand-typed URL reaches
  // here with nothing, and the honest answer is that we cannot confirm anything
  // — not a success message.
  const appointment = id
    ? (await getMyAppointments()).find((a) => a.id === id)
    : undefined

  if (!appointment) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted">
          <HelpCircle size={24} strokeWidth={1.75} aria-hidden="true" className="text-text-secondary" />
        </span>

        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-text-primary">
            {s.booking.pending_unverified_title}
          </h2>
          <p className="mx-auto max-w-xs text-sm text-text-secondary">
            {s.booking.pending_unverified_body}
          </p>
        </div>

        {/* The telephone, because "contacte a clínica" without a number is the
            dead end PG9 spent a loop removing. */}
        <ClinicPhones />

        <div className="mt-2 flex w-full flex-col gap-3">
          <Link href="/portal/appointments" className={SECONDARY}>
            {s.booking.pending_cta}
          </Link>
          <Link href="/portal/dashboard" className={GHOST}>
            {s.booking.pending_home_cta}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success-bg">
        <Check size={24} strokeWidth={1.75} aria-hidden="true" className="text-success" />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-primary">{s.booking.pending_title}</h2>
        <p className="mx-auto max-w-xs text-sm text-text-secondary">
          {s.booking.pending_body}
        </p>
      </div>

      {/* The reference is now backed by a row that was read, not by a string
          taken from the URL. */}
      <p className="rounded-lg bg-surface-muted px-3 py-1 font-mono text-xs text-text-secondary">
        Ref: {appointment.id.slice(0, 8).toUpperCase()}
      </p>

      <div className="mt-2 flex w-full flex-col gap-3">
        <Link href="/portal/appointments" className={SECONDARY}>
          {s.booking.pending_cta}
        </Link>
        <Link href="/portal/dashboard" className={GHOST}>
          {s.booking.pending_home_cta}
        </Link>
      </div>
    </div>
  )
}

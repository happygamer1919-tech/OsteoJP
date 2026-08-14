import { DEFAULT_LOCALE, getStrings } from '@osteojp/i18n'
import { formatCalendarDate, lisbonToday } from '@osteojp/db'

import { s } from '@/lib/i18n'
import { fetchPublicCatalog } from '@/lib/guest/api'
import {
  guestConfirmationCopy,
  isGuestConfirmationCopyReady,
} from '@/lib/guest/commitment-copy'

import { GuestBookingForm } from './GuestBookingForm'
import { GUEST_FORM_HORIZON_DAYS } from './state'

/**
 * GUEST-04 — /marcacao, the public booking request form.
 *
 * PUBLIC, AND THE ONLY PUBLIC WRITE SURFACE THE PROJECT HAS. It is listed in
 * `proxy.ts` PUBLIC_PATHS beside `/auth/login` and `/portal/clinics`; it sits
 * OUTSIDE `/portal` deliberately, because everything under that prefix is a
 * signed-in patient's own record and this page belongs to somebody who has none.
 *
 * NOT LINKED FROM ANYWHERE YET. The address works, so the owner can walk it on
 * the deployed build for WF-03, but nothing on the portal, the clinic's site or
 * any navigation points at it. It does not go public until JP's confirmation
 * copy lands and WF-03 passes — see lib/guest/commitment-copy.ts and the board
 * card GUEST-05-confirmation-copy.
 *
 * NO RATE LIMITER ON THIS PAGE ROUTE, and it is a decision rather than an
 * omission. The ruling asks for one where the page is server-rendered with data.
 * It is — see `dynamic` below — and the limiter still belongs one layer down, on
 * `booking/guest/catalog`, which is the thing that touches the database and
 * which already carries per-IP limits on the durable store. A limiter on the
 * PAGE would refuse a real person reading a public booking form, and it would
 * protect nothing the endpoint's limits do not already protect. Recorded here
 * because the ruling's condition is met and the answer is still "no".
 */

/**
 * NOINDEX, AND IT MUST BE REMOVED WHEN THE LINK IS PUBLISHED.
 *
 * "Not published" has to mean something stronger than "not linked". This page
 * deploys to production the moment the PR merges, and a crawler that finds it -
 * through a referrer, a shared address, a browser extension - would put the
 * clinic's booking form in a search index months before anybody decided it was
 * ready, with a confirmation screen that cannot render yet.
 *
 * THE REMOVAL IS A CLOSE CONDITION ON GUEST-05, not a follow-up to remember.
 * Publishing the link while this line survives is the mirror failure: the clinic
 * announces a form that search engines are instructed to ignore, and nothing
 * reports it because the page works perfectly for anyone who has the address.
 */
export const metadata = {
  title: s.guest.title,
  robots: { index: false, follow: false },
}

/**
 * DYNAMIC, AND IT WAS STATIC UNTIL THE BUILD SHOWED IT.
 *
 * Without this the route prerenders at BUILD time, and the catalog fetch runs in
 * an environment with no API to reach. It does not fail the build - the fetch
 * returns null and the page renders its "could not load the services" state -
 * so the deployed artefact would be a permanently baked error screen on the
 * clinic's public booking form, self-healing only after a revalidation window
 * that a page nobody has visited never enters. A build-time failure rendered as
 * a runtime error state is exactly the silent degradation PG7 exists for, and
 * `next build` printing `○ /marcacao` is the only place it was visible.
 *
 * WHAT THIS COSTS AND WHAT STILL BOUNDS IT. `force-dynamic` sets the default
 * fetch policy for the segment to no-store, so the explicit `revalidate` on the
 * catalog fetch may or may not still populate the data cache depending on how
 * this Next version resolves the two - and that is not asserted here, because
 * nothing in this repo proves it. What DOES bound the read is the endpoint's own
 * per-IP limits (30/minute, 200/hour, durable store), which are the protection
 * that was designed for it. The worst case is one small indexed query per view
 * of a page that is not linked from anywhere yet.
 */
export const dynamic = 'force-dynamic'

export default async function GuestBookingPage() {
  const catalog = await fetchPublicCatalog()

  // LOADED-AND-FAILED GETS ITS OWN WORDS (INC-05). `fetchPublicCatalog` returns
  // null for a failure and never an empty list, so "the clinic offers nothing"
  // and "we could not ask" cannot render as the same screen.
  if (!catalog) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="mb-2 text-xl font-semibold text-text-primary">
            {s.guest.catalog_error_title}
          </h1>
          <p className="text-sm text-text-secondary">{s.guest.catalog_error_body}</p>
        </div>
      </main>
    )
  }

  // THE DATE BOUNDS ARE LISBON'S, computed here rather than in the browser. A
  // device set to another zone would compute a different "today" and could offer
  // a date the API then refuses, which reads to the person as the form breaking.
  const today = lisbonToday(new Date())
  const horizon = new Date(
    Date.UTC(today.year, today.month - 1, today.day + GUEST_FORM_HORIZON_DAYS),
  )

  // VERBATIM, from the staff dictionary, and resolved on the SERVER so the
  // public bundle does not carry the whole flat string table. These are the same
  // two strings a patient signs on the ficha; nothing about them is adapted for
  // this screen.
  const staff = getStrings(DEFAULT_LOCALE)

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <GuestBookingForm
        catalog={catalog}
        minDate={formatCalendarDate(today)}
        maxDate={formatCalendarDate({
          year: horizon.getUTCFullYear(),
          month: horizon.getUTCMonth() + 1,
          day: horizon.getUTCDate(),
        })}
        rgpdLabel={staff['clinical.consent.rgpd.label']}
        rgpdBody={staff['clinical.consent.rgpd.body']}
        // null while the commitment copy is unwritten. The submit is refused
        // before that matters (actions.ts), so this is the second of two guards
        // rather than the only one.
        confirmationCopy={isGuestConfirmationCopyReady() ? guestConfirmationCopy() : null}
      />
    </main>
  )
}

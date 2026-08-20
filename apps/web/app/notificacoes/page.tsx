import { redirect } from "next/navigation";
import Link from "next/link";
import { can } from "@osteojp/auth";

import { getRequestContext } from "@/lib/auth/context";
import { formatGuestPreferredWhen } from "@/lib/scheduling/guest-preferred-when";
import {
  listNotifications,
  listPendingRequests,
  type CentreEntry,
  type StaffNotificationKind,
} from "@/lib/notifications/centre";
import { s } from "@/lib/i18n";

import { MarkAllReadButton } from "./mark-all-read";
import { PendingRequests, type PendingRequestView } from "./pending-requests";
import { GuestRequestsQueue, type GuestRequestRow } from "./guest-requests-queue";
import { listPendingGuestRequests } from "@/lib/scheduling/guest-requests";
import { StuckConsultations, type StuckConsultationRow } from "./stuck-consultations";
import { listStuckConsultations } from "@/lib/consultation/stuck-consultations";
import { UnreachablePatients, type UnreachablePatientRow } from "./unreachable-patients";
import { listPatientsUnreachableBySms } from "@/lib/reminders/unreachable-by-sms";

export const metadata = { title: s["notifications.title"] };

/**
 * W13-02 (Wave 13 LOOP 2) — the in-app notification centre. PG4.
 *
 * WHO SEES WHAT. There is no capability gate on the ROUTE, deliberately, and
 * that is not a hole: RLS (migration 0055) confines every row to
 * `recipient_user_id = auth.uid()`, so an authenticated staff user reaching this
 * page sees their own entries and nothing else. A role check here would be a
 * second, weaker copy of a rule the database already enforces — and the rule is
 * not "which role", it is "which person".
 *
 * ==========================================================================
 * SEC-01, 2026-08-18: THAT REASONING IS SOUND AND IT DOES NOT COVER THE GUEST
 * QUEUE. THE PARAGRAPH ABOVE IS WHY THIS DEFECT SHIPPED.
 * ==========================================================================
 * Everything on this page WAS per-recipient, and "the rule is not which role, it
 * is which person" was true of all of it. Then GUEST-04 added a section fed by
 * `guest_booking_requests` — a TENANT-WIDE table with no recipient column and no
 * per-person rule to enforce. The route's stated reason for having no role gate
 * silently became false for one section, and nothing re-read it.
 *
 * So `guest_requests:read` gates THAT SECTION, and only that section. Owner,
 * admin and reception; a therapist gets no data and no heading. The notification
 * log and the pedido queue keep the per-person rule described above, unchanged,
 * because for them it is still the right rule.
 *
 * THE LESSON IS ABOUT THE COMMENT AS MUCH AS THE CODE: a justification for an
 * ABSENT check has to be re-read every time the thing it justifies grows. This
 * one described the page as it was and was quoted, in place, over a page it no
 * longer described.
 *
 * IN-APP ONLY. This page is the whole delivery mechanism for PG4. No email, no
 * SMS, no push, not behind a flag.
 *
 * NO CLINICAL CONTENT AND NO SERVICE NAME. An entry says what happened, to whose
 * appointment, and when. Notes are never patient-facing and a notification is
 * not a note viewer; a service name is excluded because several of them identify
 * a treatment type.
 */

/**
 * INC-09. EXHAUSTIVE OVER THE KIND UNION, WITH NO STRING FALLBACK.
 *
 * WHAT SHIPPED BEFORE THIS. The map carried four kinds and the render did
 * `KIND_LABEL[e.kind] ?? e.kind`. Migration 0061 widened the set to FIVE by
 * adding `confirmed` — the record that a therapist accepted a pedido, which
 * exists precisely so reception is not blind — and nothing here was updated. So
 * every confirmation notification rendered the RAW DATABASE ENUM `confirmed`,
 * in English, on a Portuguese staff screen.
 *
 * THE FALLBACK IS WHY IT SHIPPED SILENTLY, and removing it is most of the fix.
 * `?? e.kind` turned an unhandled case into plausible-looking output instead of
 * a failure — the same collapse as `string | null` and `empty-calendar`
 * elsewhere in this repo. A sixth kind must now be a TYPE ERROR at the point it
 * is added, not a screen showing English to the clinic.
 *
 * `Record<StaffNotificationKind, string>` is what enforces that: add a member to the
 * union and this object stops compiling until it has a label.
 */
const KIND_LABEL: Record<StaffNotificationKind, string> = {
  booked: s["notifications.kind.booked"],
  cancelled: s["notifications.kind.cancelled"],
  rescheduled: s["notifications.kind.rescheduled"],
  appointment_request: s["notifications.kind.appointment_request"],
  confirmed: s["notifications.kind.confirmed"],
};

/**
 * A kind the database produced that this build does not know. It cannot happen
 * while the map is exhaustive and the migration set matches the union — but the
 * feed is typed `string`, so the possibility exists at the boundary.
 *
 * IT SAYS SOMETHING TRUE AND USELESS RATHER THAN SOMETHING FALSE AND SPECIFIC.
 * "Alteração na marcação" is accurate for any member of this set. The old
 * behaviour printed the enum; the failure mode that matters is a staff member
 * reading a CONFIDENT WRONG DESCRIPTION of a clinical event.
 */
function labelFor(kind: string): string {
  return KIND_LABEL[kind as StaffNotificationKind] ?? s["notifications.kind.unknown"];
}

// Europe/Lisbon, 24h. W12-31 made 24h the format across the product; the clinic
// is in Lisbon and staff read these against the agenda, so a UTC instant
// rendered in the browser's zone would be actively misleading.
const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Lisbon",
};
const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Lisbon",
};

function stamp(d: Date): string {
  return `${d.toLocaleDateString("pt-PT", DATE_FMT)} ${d.toLocaleTimeString("pt-PT", TIME_FMT)}`;
}

/** A reschedule moved the appointment; everything else did not. The contract
 * sets previousStartsAt === newStartsAt for booked and cancelled. */
function moved(e: CentreEntry): boolean {
  return e.previousStartsAt.getTime() !== e.newStartsAt.getTime();
}

export default async function NotificacoesPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  // SEC-01, owner ruling 2026-08-18. THE GUEST QUEUE IS NOT FETCHED AT ALL FOR
  // A ROLE THAT MAY NOT READ IT.
  //
  // A therapist on deployed production saw the whole tenant's guest queue here:
  // names, phone numbers, convert buttons. The ruling is that they get NO
  // section, no data, and nothing hidden client-side.
  //
  // SO THE CALL IS SKIPPED RATHER THAN THE OUTPUT FILTERED. Fetching the rows
  // and rendering none of them would leave stranger's contact details in the
  // RSC payload of a page a therapist opens, where "not rendered" is a CSS-level
  // distinction rather than a security one. `listPendingGuestRequests` also
  // throws for this role, so the skip is the courtesy and the throw is the
  // boundary - the page cannot be the only thing standing between a therapist
  // and the data.
  const canReadGuestQueue = can(ctx.role, "guest_requests:read");

  const [entries, requests, guestRequests, stuck, unreachable] = await Promise.all([
    listNotifications(ctx),
    listPendingRequests(ctx),
    canReadGuestQueue ? listPendingGuestRequests(ctx) : Promise.resolve([]),
    // AI-04. NO ROLE BRANCH HERE, and that is not the SEC-01 lapse repeated.
    // The guest queue is skipped for a therapist because there is no
    // therapist-shaped subset of it - a guest request has no patient to scope
    // by. Every consultation HAS a patient, so `listStuckConsultations` applies
    // this repo's two ratified patient scopes INSIDE the query and returns the
    // subset each role is already entitled to. There is nothing to hide at this
    // layer, because nothing arrives here that the caller may not see.
    listStuckConsultations(ctx),
    // Q-LE-REMINDERS-LANDLINE-1. Same scoping story as the stuck list above: a
    // row is about a PATIENT, so the two ratified patient scopes apply inside
    // the query and there is nothing to hide at this layer.
    listPatientsUnreachableBySms(ctx),
  ]);
  const unread = entries.filter((e) => e.readAt === null).length;

  // Preformatted server-side, in Europe/Lisbon, so the queue and the log below
  // it read the same instant the same way. A client-side format would use the
  // browser's zone and quietly disagree with the agenda.
  const requestViews: PendingRequestView[] = requests.map((r) => ({
    notificationId: r.notificationId,
    appointmentId: r.appointmentId,
    patientName: r.patientName,
    when: stamp(r.startsAt),
    requestedAt: stamp(r.requestedAt),
  }));

  // Same server-side Lisbon formatting as the pedido queue, for the same
  // reason: a client-side format would use the browser's zone and quietly
  // disagree with the agenda.
  //
  // A GUEST ASKED FOR A DATE AND A PERIOD, NOT A TIME (GUEST-04, Option A), so
  // this row must not be formatted like the pedido row above it. `stamp()` on
  // the window's start renders "20/08/2026 09:00" — a precise time, in the place
  // reception reads precise times, for somebody who was never shown one and
  // never chose one. Reception would ring them to confirm nine o'clock.
  //
  // `decodeGuestPreferredWindow` returns a UNION and never a fallback: a window
  // that does not encode a period is reported as `exact` and rendered as the
  // timestamp it actually is. Nothing in the shipped product can write such a
  // row — the public form always encodes a period — so that arm is here so a
  // hand-written or future row cannot be read as a preference nobody stated.
  const guestRows: GuestRequestRow[] = guestRequests.map((g) => ({
    id: g.id,
    fullName: g.fullName,
    phone: g.phone,
    locationName: g.locationName,
    when: formatGuestPreferredWhen(g.requestedStartsAt, g.requestedEndsAt),
    requestedAt: stamp(g.createdAt),
    possiblePatientMatches: g.possiblePatientMatches,
  }));

  // Same server-side Lisbon formatting as both queues above, for the same
  // reason. `stamp` on the CONSULTATION instant, not on the failure instant: a
  // clinician recognises the appointment by when it happened, and the note they
  // now have to write by hand is a note about that appointment.
  const stuckRows: StuckConsultationRow[] = stuck.map((c) => ({
    id: c.id,
    patientName: c.patientName,
    clinicianName: c.clinicianName,
    when: stamp(c.consultationStartedAt),
    lastAttempt: c.lastAttemptAt === null ? null : stamp(c.lastAttemptAt),
    attemptCount: c.attemptCount,
    lastError: c.lastError,
  }));

  const unreachableRows: UnreachablePatientRow[] = unreachable.map((u) => ({
    patientId: u.patientId,
    fullName: u.fullName,
    phone: u.phone,
    nextAppointment: stamp(u.nextAppointmentAt),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {/* AI-04 - ABOVE THE PEDIDO QUEUE, and the ordering is the argument.
          The comment below says the pedido queue comes first because it is the
          only part of this page carrying WORK. That was true when it was
          written and it is not the rule; the rule it was expressing is that
          what is IRREVERSIBLE outranks what is merely undone.

          A pedido that waits an hour is a patient who waits an hour. A stuck
          consultation is a clinical record that will never exist, whose audio
          is already deleted, and whose only remaining path to a note is a
          therapist's memory of an appointment that gets fainter every day.
          Nothing else on this page has a deadline that runs out.

          IT IS ALSO ALWAYS RENDERED, empty or not. See the empty state in
          `stuck-consultations.tsx`: a section that vanishes when the list is
          empty makes "nothing is lost" and "nobody is looking" the same
          screen. */}
      <section className="mb-10" aria-labelledby="stuck-consultations-heading">
        <h2
          id="stuck-consultations-heading"
          className="text-xl font-semibold text-v2-text-primary"
        >
          {s["consultations.stuck.title"]}
        </h2>
        <p className="mt-1 mb-4 text-sm text-v2-text-secondary">
          {s["consultations.stuck.subtitle"]}
        </p>
        <StuckConsultations rows={stuckRows} />
      </section>

      {/* THE QUEUE COMES FIRST because it is the only part of this page that
          carries WORK. Everything below it is a log of what already happened;
          a pedido is a decision nobody else will make. */}
      <section className="mb-10" aria-labelledby="pedidos-heading">
        <h2
          id="pedidos-heading"
          className="text-xl font-semibold text-v2-text-primary"
        >
          {s["requests.title"]}
        </h2>
        <p className="mt-1 mb-4 text-sm text-v2-text-secondary">
          {s["requests.subtitle"]} {s["requests.slotNotHeld"]}
        </p>
        <PendingRequests items={requestViews} />
      </section>

      {/* SEC-01: the whole section is absent for a role without
          `guest_requests:read` - not empty, ABSENT. An empty "Pedidos de novos
          clientes" heading would tell a therapist that a queue exists, how it is
          named, and that they are being kept out of it, which is a smaller leak
          than the rows but is still one. The ruling said no section.

          ITEM 6 - GUEST requests, in their OWN section beneath the pedidos.
          Separate because the ACTION is different: a pedido is an existing
          patient's appointment changing state, a guest request has no patient
          and no appointment behind it and confirming one CREATES both. One list
          would put two different actions behind one word.

          BELOW the pedidos because a pedido is a patient already waiting on a
          slot, where a guest has not been promised anything yet - the copy they
          saw says the time is not reserved. */}
      {canReadGuestQueue && (
        <section className="mb-10" aria-labelledby="guest-requests-heading">
          <h2
            id="guest-requests-heading"
            className="text-xl font-semibold text-v2-text-primary"
          >
            {s["guest.queueTitle"]}
          </h2>
          <div className="mt-4">
            <GuestRequestsQueue rows={guestRows} />
          </div>
        </section>
      )}

      {/* Q-LE-REMINDERS-LANDLINE-1, ruled 2026-08-20: the reminder path now
          SKIPS a landline, and this is the other half of that ruling. Skipping
          alone stops the clinic paying for a message nobody receives and leaves
          the patient with no reminder either way; only this section does
          anything for the patient.

          BELOW the two request queues and ABOVE the log, because it carries
          work but not urgency: nobody is waiting on an answer, and the
          appointment is still days away - which is the whole point of showing it
          before the reminder is due rather than after. */}
      <section className="mb-10" aria-labelledby="unreachable-heading">
        <h2 id="unreachable-heading" className="text-xl font-semibold text-v2-text-primary">
          {s["reminders.unreachable.title"]}
        </h2>
        <p className="mt-1 mb-4 text-sm text-v2-text-secondary">
          {s["reminders.unreachable.subtitle"]}
        </p>
        <UnreachablePatients rows={unreachableRows} />
      </section>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-v2-text-primary">
          {s["notifications.title"]}
        </h1>
        {unread > 0 && <MarkAllReadButton label={s["notifications.markAllRead"]} />}
      </div>

      {entries.length === 0 ? (
        /* EMPTY IS NOT AN ERROR, and it says which it is. INC-05 was a broken
           deployment rendering "you have no appointments" for a failed fetch;
           the owner found it by opening the app because no gate could see it.
           Loaded-and-empty gets its own words here for that reason. */
        <div className="rounded-v2 border border-v2-border bg-surface-muted p-8 text-center">
          <p className="text-sm font-medium text-v2-text-primary">
            {s["notifications.empty"]}
          </p>
          <p className="mt-1 text-sm text-v2-text-secondary">
            {s["notifications.emptyHint"]}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className={[
                "rounded-v2 border p-4",
                e.readAt === null
                  ? "border-v2-green-700 bg-surface-base"
                  : "border-v2-border bg-surface-muted",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-v2-text-primary">
                  {labelFor(e.kind)}
                </span>
                {e.readAt === null && (
                  <span className="rounded-full bg-v2-green-700 px-2 py-0.5 text-[11px] font-medium text-text-inverse">
                    {s["notifications.unreadBadge"]}
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-v2-text-primary">
                {e.patientName ?? s["notifications.noPatient"]}
              </p>

              <p className="mt-1 text-sm text-v2-text-secondary">
                {moved(e) ? (
                  <>
                    {s["notifications.movedFrom"]} {stamp(e.previousStartsAt)}
                    {" · "}
                    {s["notifications.movedTo"]} {stamp(e.newStartsAt)}
                  </>
                ) : (
                  stamp(e.newStartsAt)
                )}
              </p>

              <div className="mt-2 flex items-center justify-between gap-3">
                <time
                  className="text-xs text-v2-text-secondary"
                  dateTime={e.occurredAt.toISOString()}
                >
                  {stamp(e.occurredAt)}
                </time>
                <Link
                  href={`/marcacoes?appointment=${e.appointmentId}`}
                  className="text-sm font-medium text-v2-green-800 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  {s["notifications.openAppointment"]}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

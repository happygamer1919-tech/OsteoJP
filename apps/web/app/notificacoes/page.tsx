import { redirect } from "next/navigation";
import Link from "next/link";

import { getRequestContext } from "@/lib/auth/context";
import {
  listNotifications,
  listPendingRequests,
  type CentreEntry,
  type StaffNotificationKind,
} from "@/lib/notifications/centre";
import { s } from "@/lib/i18n";

import { MarkAllReadButton } from "./mark-all-read";
import { PendingRequests, type PendingRequestView } from "./pending-requests";

export const metadata = { title: s["notifications.title"] };

/**
 * W13-02 (Wave 13 LOOP 2) — the in-app notification centre. PG4.
 *
 * WHO SEES WHAT. There is no capability gate on this route, deliberately, and
 * that is not a hole: RLS (migration 0055) confines every row to
 * `recipient_user_id = auth.uid()`, so an authenticated staff user reaching this
 * page sees their own entries and nothing else. A role check here would be a
 * second, weaker copy of a rule the database already enforces — and the rule is
 * not "which role", it is "which person".
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

  const [entries, requests] = await Promise.all([
    listNotifications(ctx),
    listPendingRequests(ctx),
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
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

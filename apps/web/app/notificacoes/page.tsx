import { redirect } from "next/navigation";
import Link from "next/link";

import { getRequestContext } from "@/lib/auth/context";
import { listNotifications, type CentreEntry } from "@/lib/notifications/centre";
import { s } from "@/lib/i18n";

import { MarkAllReadButton } from "./mark-all-read";

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

const KIND_LABEL: Record<string, string> = {
  booked: s["notifications.kind.booked"],
  cancelled: s["notifications.kind.cancelled"],
  rescheduled: s["notifications.kind.rescheduled"],
  appointment_request: s["notifications.kind.appointment_request"],
};

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

  const entries = await listNotifications(ctx);
  const unread = entries.filter((e) => e.readAt === null).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
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
                  {KIND_LABEL[e.kind] ?? e.kind}
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

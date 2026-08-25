import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { isSmsCapablePT } from "@osteojp/notify";

import { getRequestContext } from "@/lib/auth/context";
import { normalizePhonePT } from "@osteojp/notify";
import { listFollowupCandidates, listActivePostponements } from "@/lib/followup/queries";
import { s } from "@/lib/i18n";

import { FollowupList, type FollowupRow } from "./followup-list";
import { Postponed, type PostponedRow } from "./postponed";

export const metadata = { title: s["followup.title"] };

/**
 * RB-01 — RECUPERACAO DE UTENTES. Owner ruling 2026-08-20.
 *
 * ==========================================================================
 * THE ROUTE IS GATED, NOT JUST THE SECTIONS. `followup:read`.
 * ==========================================================================
 * `/notificacoes` deliberately has no route gate, because everything on it was
 * per-recipient and the rule there is "which person", not "which role". **That
 * reasoning does not transfer here and the difference is the whole point**: this
 * page is one tenant-wide list of patients with their telephone numbers, with no
 * recipient column and no per-person rule for RLS to enforce. A therapist
 * reaching it would see the front desk's whole call list.
 *
 * So the check is at the top of the route, `listFollowupCandidates` throws
 * independently for a role that may not read it, and the two are not the same
 * check written twice: the redirect is the courtesy, the throw is the boundary.
 * SEC-01 is the card that paid for that distinction, one section over.
 *
 * A REDIRECT AND NOT A 403, matching every other gated route here. A staff
 * member who follows a stale link lands somewhere useful instead of on an error
 * page telling them about a feature they cannot use.
 *
 * ==========================================================================
 * FORMATTING HAPPENS HERE, ON THE SERVER, IN Europe/Lisbon
 * ==========================================================================
 * The client components receive strings, never `Date`s. A `Date` rendered in
 * the browser renders in the BROWSER's timezone, which for a clinic in Lisbon
 * read on a laptop still set to another zone is wrong by an hour twice a year
 * and wrong by a day at the edges — and it is wrong silently, because a date is
 * always plausible.
 */

const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Lisbon",
};

/**
 * INC 2026-08-21 — THIS THREW, AND THE GUARD IS NOT THE FIX.
 *
 * The subquery behind `lastAttendanceAt` was correlating a column to itself and
 * returned NULL for every row; this function then called `toLocaleDateString`
 * on it inside a Server Component. The real fix is in the query, and it is
 * done - `followupLastAttendanceSql` names the outer column now.
 *
 * THE GUARD STAYS ANYWAY, AND IT MUST NOT BE READ AS DEFENSIVE PADDING. A null
 * IS reachable honestly: a patient with no completed attendance yields one, and
 * a future change to the selection rule could return such a row. What matters is
 * that it renders a VISIBLE placeholder rather than a plausible-looking date -
 * "-" tells reception the date is missing, whereas any fallback date would be a
 * clinical claim nobody made. Section 1.3: an unknown case must not be dressed
 * as a known one.
 */
function day(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("pt-PT", DATE_FMT);
}

const DATETIME_FMT: Intl.DateTimeFormatOptions = {
  ...DATE_FMT,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

function stamp(d: Date | null): string {
  // Same reasoning as day(). A contact with no timestamp is not a contact that
  // happened at an unknown moment; it is a row that should not exist.
  if (!d) return "—";
  return d.toLocaleString("pt-PT", DATETIME_FMT);
}

export default async function RecuperacaoPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "followup:read")) redirect("/");

  const [candidates, postponements] = await Promise.all([
    listFollowupCandidates(ctx),
    listActivePostponements(ctx),
  ]);

  const rows: FollowupRow[] = candidates.map((c) => {
    /**
     * NORMALISED ONCE, ON THE SERVER, AND THE RESULT IS CARRIED AS DATA.
     * The deep link needs E.164 and the screen needs the number as stored, so
     * both travel. Normalising in the component would put the PT phone rules in
     * a second place, and `normalizePhonePT` is the file that already carries
     * the reasoning about `00351`, `+351` and bare subscriber numbers.
     */
    const e164 = c.phone ? normalizePhonePT(c.phone) : null;
    return {
      patientId: c.patientId,
      fullName: c.fullName,
      phone: c.phone,
      phoneE164: e164,
      /**
       * A LANDLINE GETS NO WhatsApp AND NO SMS BUTTON, reusing the same
       * predicate the reminder dispatcher uses rather than a second copy. A
       * Portuguese geographic line is a perfectly good number that cannot
       * receive these channels — the same distinction
       * `LE-reminders-landline-dispatch` drew between "invalid" and "cannot
       * receive THIS channel", and reception acts on them differently.
       */
      smsCapable: e164 !== null && isSmsCapablePT(e164),
      email: c.email,
      lastAttendance: day(c.lastAttendanceAt),
      practitionerName: c.practitionerName,
      contacts: c.contacts.map((m) => ({
        channel: m.channel,
        when: stamp(m.contactedAt),
        who: m.contactedByName,
      })),
    };
  });

  const postponedRows: PostponedRow[] = postponements.map((p) => ({
    id: p.id,
    patientId: p.patientId,
    fullName: p.fullName,
    until: day(p.postponedUntil),
    byName: p.createdByName,
  }));

  return (
    <div className="flex flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold text-v2-text-primary">{s["followup.title"]}</h1>
          <p className="mt-1 max-w-3xl text-sm text-v2-text-secondary">
            {s["followup.subtitle"]}
          </p>
          <p className="mt-1 max-w-3xl text-xs text-v2-text-secondary">
            {s["followup.messageHint"]}
          </p>
        </div>
        <FollowupList rows={rows} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold text-v2-text-primary">
            {s["followup.postponed.title"]}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-v2-text-secondary">
            {s["followup.postponed.subtitle"]}
          </p>
        </div>
        <Postponed rows={postponedRows} />
      </section>
    </div>
  );
}

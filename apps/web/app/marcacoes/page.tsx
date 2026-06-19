import { redirect } from "next/navigation";
import { assertCan, ForbiddenError, type RequestContext } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { getAgendaOptions, listAppointments } from "@/lib/scheduling/data";
import {
  addDays,
  lisbonMidnightUtc,
  todayInLisbon,
  viewDates,
} from "@/lib/scheduling/time";
import { s } from "@/lib/i18n";

import { MarcacoesView, type MarcacoesFilters } from "./marcacoes-view";

export const metadata = { title: "Marcações" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Audit: the fetch is always date-windowed, but the URL-param range was
// uncapped. 92 days (~3 months) is enough for any booking list use-case
// while preventing accidental table-wide scans via crafted URLs.
const MAX_WINDOW_DAYS = 92;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Marcações — bookings list view (V2-W7, SPEC-v2-marcacoes).
 *
 * The same scheduling data the Agenda renders as a grid, rendered instead as a
 * chronological, filterable list grouped by Lisbon day. Reuses the Agenda fetch
 * (`listAppointments` over a date-range window + `getAgendaOptions`), the same
 * role scope (therapist locked to own calendar) and the same `appointments:read`
 * gate. Presentation only — no schema, API, RLS, scheduling-logic, auth, or
 * permission change, and no new data model.
 *
 * Date-range, location and therapist are server query params the fetch already
 * supports. Status and Serviço (SPEC-v2-marcacoes §1.2) are NOT query fields the
 * Agenda fetch supports, so they are applied client-side over the fetched window
 * (no new query field). HeritageFrame is inherited from the SidebarAppShell at
 * density="restrained"; the page mounts no second frame.
 */
export default async function MarcacoesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  let actor: RequestContext;
  try {
    actor = await requireRequestContext();
  } catch {
    redirect("/login");
  }

  try {
    assertCan(actor.role, "appointments:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return (
        <main className="min-h-dvh p-8">
          <p className="text-sm text-error">{s["errors.forbidden"]}</p>
        </main>
      );
    }
    throw e;
  }

  const sp = await searchParams;

  // Date range — defaults to the existing Agenda default window (the current
  // Mon–Fri week). Both ends inclusive; the fetch range is [from 00:00, to+1 00:00).
  const today = todayInLisbon();
  const defWeek = viewDates("week", today);
  const fromParam = firstParam(sp.from);
  const toParam = firstParam(sp.to);
  const rawFrom = fromParam && DATE_RE.test(fromParam) ? fromParam : defWeek[0]!;
  const rawTo =
    toParam && DATE_RE.test(toParam) ? toParam : defWeek[defWeek.length - 1]!;
  const [sortedFrom, sortedTo] =
    rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom];
  const from = sortedFrom;
  const to =
    sortedTo <= addDays(sortedFrom, MAX_WINDOW_DAYS - 1)
      ? sortedTo
      : addDays(sortedFrom, MAX_WINDOW_DAYS - 1);

  // Therapists default to their own calendar (carry the agenda scoping forward);
  // scope never widens beyond the existing query.
  const lockTherapist = actor.role === "therapist";
  let practitionerId = firstParam(sp.therapist);
  if (lockTherapist) practitionerId = actor.userId;
  const locationId = firstParam(sp.location);

  // Presentation-only filters (client-side over the fetched window).
  const status = firstParam(sp.status);
  const service = firstParam(sp.service);

  const startUtc = lisbonMidnightUtc(from);
  const endUtc = lisbonMidnightUtc(addDays(to, 1));

  const [options, appointments] = await Promise.all([
    getAgendaOptions(actor),
    listAppointments(actor, {
      startUtc,
      endUtc,
      practitionerId,
      locationId,
    }),
  ]);

  const filters: MarcacoesFilters = {
    from,
    to,
    practitionerId,
    locationId,
    status,
    service,
  };

  return (
    <MarcacoesView
      filters={filters}
      lockTherapist={lockTherapist}
      options={options}
      appointments={appointments}
    />
  );
}

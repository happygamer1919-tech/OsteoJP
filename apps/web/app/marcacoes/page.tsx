import { assertCan, can, ForbiddenError } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { listServices } from "@/lib/admin/services";
import { scopedLocationId } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { getAgendaOptions, getAppointment, listAppointments } from "@/lib/scheduling/data";
import {
  addDays,
  lisbonMidnightUtc,
  lisbonParts,
  todayInLisbon,
  viewDates,
} from "@/lib/scheduling/time";
import { deepLinkWindow } from "@/lib/scheduling/deep-link-window";
import { s } from "@/lib/i18n";

import { MarcacoesView, type MarcacoesFilters } from "./marcacoes-view";

export const metadata = { title: s["marcacoes.title"] };

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
  // OSTEOJP-WEB-8: the guard redirects on its own now, so the wrapper is
  // gone. It was not merely redundant - a bare `catch {}` here swallowed
  // NEXT_REDIRECT AND would have turned a real Auth outage into a silent
  // bounce to /login, reporting our failure as this person's logout.
  const actor = await requireRequestContext();

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
  // W10-04 isolation: therapist loses the location switch; ignore any location
  // param for them (they are practitioner-locked to their own marcacoes).
  // PL-14: for everyone else a single-clinic viewer has their clinic PINNED and
  // an out-of-scope ?location= dropped, so the toolbar can drop the control.
  const locationScope = await viewerLocationScope(actor);
  const locationId = lockTherapist ? null : scopedLocationId(locationScope, firstParam(sp.location));

  // Presentation-only filters (client-side over the fetched window).
  const status = firstParam(sp.status);
  const service = firstParam(sp.service);

  // ITEM 4 - notification deep link: /marcacoes?appointment=UUID.
  //
  // The "Ver marcação" links in Notificações have always carried this parameter
  // and this page has always ignored it, so the link landed reception on an
  // unfiltered week and left them to find the row by eye.
  //
  // RESOLVED SERVER-SIDE, BEFORE THE LIST QUERY, for two reasons. The
  // appointment may fall outside the default window, so its date is what decides
  // the range; and `getAppointment` is tenant- and RLS-scoped, so an id the
  // viewer may not see comes back null here rather than being probed for on the
  // client.
  const deepLinkId = firstParam(sp.appointment);
  const deepLinkAppt = deepLinkId ? await getAppointment(actor, deepLinkId) : null;
  // AN UNRESOLVED ID IS A STATE, NOT A SILENT NO-OP. Three different things
  // produce `null` - a malformed id, a deleted appointment, and one this viewer
  // has no scope for - and the page must not render as though no link was
  // followed. It says so, in one line, and still shows the list.
  const deepLinkMissing = !!deepLinkId && !deepLinkAppt;

  // The appointment's own Lisbon day, when it resolved. Widening (never
  // narrowing) the window keeps any explicit ?from/?to the user arrived with.
  const deepLinkDate = deepLinkAppt ? lisbonParts(new Date(deepLinkAppt.startsAt)).date : null;
  // The three interacting rules (widen to reach the target, never narrow the
  // user's own range, never exceed the 92-day ceiling) live in a pure function
  // with its own suite - see lib/scheduling/deep-link-window.ts. Every wrong
  // answer here renders a normal-looking list that simply does not contain the
  // linked row, which reception would read as "the appointment is gone".
  const windowed = deepLinkWindow({
    from,
    to,
    targetDate: deepLinkDate,
    maxWindowDays: MAX_WINDOW_DAYS,
  });

  const startUtc = lisbonMidnightUtc(windowed.from);
  const endUtc = lisbonMidnightUtc(addDays(windowed.to, 1));

  const [options, appointments, serviceRows] = await Promise.all([
    getAgendaOptions(actor),
    listAppointments(actor, {
      startUtc,
      endUtc,
      practitionerId,
      locationId,
    }),
    // W6-01b: the Serviço FILTER options are data-driven from the tenant's real
    // services. Filters INCLUDE inactive services (historic marcações still
    // reference them, e.g. NESA), so this uses the full listServices(actor) with
    // NO isActive filter, unlike creation forms, which show active only. Read
    // gate: services:read, held by every role that can reach this page.
    listServices(actor),
  ]);

  // Already name-sorted by listServices; map to the minimal {id, name} the
  // filter dropdown needs.
  const serviceFilterOptions = serviceRows.map((svc) => ({ id: svc.id, name: svc.name }));

  const filters: MarcacoesFilters = {
    // ITEM 4: the window ACTUALLY queried, which a deep link may have widened.
    // Showing the requested range here instead would leave the date pickers
    // contradicting the rows underneath them.
    from: windowed.from,
    to: windowed.to,
    practitionerId,
    locationId,
    status,
    service,
  };

  return (
    <MarcacoesView
      filters={filters}
      lockTherapist={lockTherapist}
      // PL-10: forwarded to the shared drawer (self-lock is create-only, so it is
      // inert here where the list opens edit mode; passed for prop-parity).
      viewer={{ role: actor.role, userId: actor.userId }}
      options={options}
      serviceFilterOptions={serviceFilterOptions}
      appointments={appointments}
      // ITEM 4: the row to scroll to and open, and the explicit "not found"
      // state. Kept as two props rather than one nullable id, because "no link
      // was followed" and "the link pointed at nothing" are different screens.
      focusAppointmentId={deepLinkAppt?.id ?? null}
      deepLinkMissing={deepLinkMissing}
      // W12-00: same authority the agenda passes the drawer - the drawer's
      // admin-only password hard-delete is server-enforced; this only shows/hides
      // the control. Reception/therapist get false, never see the delete button.
      canHardDelete={can(actor.role, "settings:manage")}
    />
  );
}

import { assertCan, can, ForbiddenError } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { scopedLocationId } from "@/lib/auth/location-choice";
import { resolveViewerLocationIds, viewerLocationScope } from "@/lib/auth/viewer-locations";
import { getPatient } from "@/lib/patients/queries";
import { getAgendaOptions, listAppointments } from "@/lib/scheduling/data";
import { sharedResourcesForViewer } from "@/lib/scheduling/shared-resource-guard";
import { listSharedResources } from "@/lib/scheduling/shared-resources";
import { reconcileAgendaStaff } from "@/lib/scheduling/staff-options";
import { listTherapistBlocks } from "@/lib/scheduling/day-availability";
import {
  formatTimeOfDay,
  lisbonMinutesFromMidnight,
  rangeForView,
  todayInLisbon,
  type AgendaView,
} from "@/lib/scheduling/time";
import { closureFor, gridWindow, toMinutes } from "@/lib/scheduling/clinic-hours";
import { s } from "@/lib/i18n";
import { AgendaView as AgendaViewClient } from "./agenda-view";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // requireRequestContext verifies the session and gives us tenantId + role + userId.
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
  const view: AgendaView = firstParam(sp.view) === "day" ? "day" : "week";
  const dateParam = firstParam(sp.date);
  const anchor =
    dateParam && DATE_RE.test(dateParam) ? dateParam : todayInLisbon();

  // Therapists default to their own calendar (per the agenda wireframe note);
  // reception/admin/owner see everyone unless a filter is set.
  const lockTherapist = actor.role === "therapist";
  let practitionerId = firstParam(sp.therapist);
  // SCHED-17: a therapist's agenda is the SET { self } plus the shared resources
  // (NESA) at their own locations, so the CB machine's diary is shared by the
  // people standing next to it. An LV therapist's set is { self }: the resource
  // is joined through staff_locations, so LV is unaffected as a property of the
  // data. A therapist may narrow to one member of the set and to nothing else.
  // `practitionerId` stays the viewer's own id, because it also chooses whose
  // blocked time is drawn, and a shared device has no time off.
  const therapistTenantResources = lockTherapist ? await listSharedResources(actor) : [];
  const sharedResources = lockTherapist
    ? sharedResourcesForViewer(therapistTenantResources, await resolveViewerLocationIds(actor))
    : [];
  let practitionerIds: string[] | null = null;
  if (lockTherapist) {
    const own = [actor.userId, ...sharedResources.map((r) => r.id)];
    practitionerIds = practitionerId && own.includes(practitionerId) ? [practitionerId] : own;
    practitionerId = actor.userId;
  }
  // W10-04 isolation: a therapist loses the location switch entirely - the server
  // ignores any location param for them so they cannot scope to another location's
  // agenda (they are already practitioner-locked to their own appointments).
  //
  // PL-14: for everyone else the location is IMPLICIT when the viewer has exactly
  // one clinic - scopedLocationId pins it and drops any hand-typed ?location= for
  // another clinic, so removing the toolbar control (agenda-view) removes a
  // choice the server was never going to honour either.
  const locationScope = await viewerLocationScope(actor);
  const locationId = lockTherapist ? null : scopedLocationId(locationScope, firstParam(sp.location));

  const { startUtc, endUtc } = rangeForView(view, anchor);

  // LE-agenda-does-not-learn-of-portal-bookings. Taken IMMEDIATELY BEFORE the
  // reads below, not after and not in the render: this is the instant the
  // appointments the toolbar stamps were fetched, and a stamp that drifts from
  // its own data is the thing this card is about.
  const readAt = new Date();

  // W6-03: "Nova marcação" on a patient profile deep-links here with the patient
  // id. Resolve the patient (tenant-scoped, active only) so the create drawer can
  // open with that patient preselected + locked. An unknown/deleted id resolves to
  // null and the agenda opens normally (no lock).
  const novaMarcacaoPacienteId = firstParam(sp.novaMarcacaoPaciente);

  const [options, appointments, lockedPatientRow, blocks, frontDeskResources] = await Promise.all([
    // W9-02: the selected location narrows the therapist dropdown to that
    // location's assigned therapists (owner ruling 2026-07-17). Null here means
    // "Todas as localizações" and restores the full roster.
    getAgendaOptions(actor, locationId),
    listAppointments(actor, {
      startUtc,
      endUtc,
      practitionerId: lockTherapist ? null : practitionerId,
      practitionerIds,
      locationId,
    }),
    novaMarcacaoPacienteId ? getPatient(novaMarcacaoPacienteId) : Promise.resolve(null),
    // W9-04 (CB QA item 3): blocked time is drawn ONLY when the agenda is scoped
    // to exactly one therapist. `time_off` is per therapist, but the grid has DAY
    // columns and no therapist axis (W9-01 (f)) - so under "Todos os terapeutas"
    // a full-width band would claim the whole clinic is blocked when only one
    // therapist is away, suppressing real bookable time. A therapist's own
    // agenda is always locked to them, so they always see their own blocks.
    // Owner question filed 2026-07-17 (inbox W9-04-SCOPE-blocked-band-therapist-axis).
    practitionerId
      ? listTherapistBlocks(actor, {
          therapistId: practitionerId,
          rangeStart: startUtc,
          rangeEnd: endUtc,
        })
      : Promise.resolve([]),
    // SCHED-29.4 (Q-SCHED-29-4-1 = A): owner, admin and reception are offered the
    // shared resources beside the is_bookable roster. READ PER REQUEST, not through
    // fetchAgendaReferenceData's 60-second unstable_cache: that cache is
    // stale-while-revalidate, so the first load after expiry served the old roster
    // (measured 2026-09-13), and a machine flagged by SQL would have appeared or
    // vanished a load late. A therapist already has theirs, read the same way above.
    lockTherapist ? Promise.resolve([]) : listSharedResources(actor),
  ]);

  /* ==================================================================== */
  /* 0085 - THE GRID'S WINDOW COMES FROM THE CLINIC NOW.                   */
  /* ==================================================================== */
  /* THE UNION UNDER "Todas as localizações", ruled by the owner: an       */
  /* intersection would hide a real working hour of whichever clinic opens */
  /* earlier or closes later, and the agenda would be lying about a day it */
  /* is showing. `gridWindow` falls back to 08:00-20:00 for an empty list, */
  /* which is what every surface assumed before this migration.            */
  const visibleClinics = locationId
    ? options.locations.filter((l) => l.id === locationId)
    : options.locations;

  /* ==================================================================== */
  /* AGENDA-NEVER-HIDES - AND THE APPOINTMENTS ALREADY ON THE DAY.         */
  /* ==================================================================== */
  /* Production, 2026-09-16: opening moved to 09:00 and an 08:00 booking   */
  /* at Linda-a-Velha could not be opened. It was never deleted - the grid */
  /* clamped it to the first drawn row, where it sat underneath the 09:00  */
  /* row. Hours change; the bookings made under the old ones do not.       */
  /*                                                                       */
  /* So the drawn window is the clinics' hours UNION the span of what is   */
  /* actually loaded for this view, and `clinicWindow` is kept separately  */
  /* so the grid can MARK the rows that only an appointment asks for.      */
  /* Passing the same object for both would silently lose the distinction. */
  const appointmentSpans = appointments.map((a) => ({
    startMin: lisbonMinutesFromMidnight(new Date(a.startsAt)),
    endMin: lisbonMinutesFromMidnight(new Date(a.endsAt)),
  }));
  const clinicWindow = gridWindow(visibleClinics);
  const dayWindow = gridWindow(visibleClinics, appointmentSpans);

  /* THE CLOSURE BAND IS DRAWN ONLY WHEN ONE CLINIC IS SELECTED, and that  */
  /* is the same ruling from the other direction. CB's lunch hour is not   */
  /* true of LV, so a band drawn across an unfiltered grid would grey out  */
  /* an hour LV is open. Same reasoning that keeps the therapist block     */
  /* band off the unfiltered agenda (W9-04): a full-width band is only     */
  /* truthful when the thing it describes covers everything on screen.     */
  const selectedLocation = locationId
    ? (options.locations.find((l) => l.id === locationId) ?? null)
    : null;
  const closureInterval = selectedLocation
    ? closureFor(todayInLisbon(), selectedLocation)
    : null;
  const closure =
    selectedLocation && closureInterval && selectedLocation.middayClosedFrom
      ? {
          startMin: toMinutes(selectedLocation.middayClosedFrom),
          endMin: toMinutes(selectedLocation.middayClosedTo ?? selectedLocation.middayClosedFrom),
          locationName: selectedLocation.label,
        }
      : null;

  const lockedPatient = lockedPatientRow
    ? {
        value: lockedPatientRow.id,
        // Carry the disambiguating NIF so same-name patients are unambiguous
        // (Rodica disambiguates by NIF in the patient list).
        label: lockedPatientRow.nif
          ? `${lockedPatientRow.fullName} (NIF ${lockedPatientRow.nif})`
          : lockedPatientRow.fullName,
      }
    : null;

  // ==========================================================================
  // GUEST-06 — the service and clinic a converted guest asked for.
  //
  // EACH IS RESOLVED AGAINST THE OPTIONS THIS PAGE ACTUALLY LOADED, and an id
  // that is not among them is DROPPED rather than passed through. That is not
  // defensive habit, it is STAFF-01 fixed at the source: a controlled <select>
  // handed a value with no matching <option> does not render the value and does
  // not render empty — the browser paints the FIRST option instead. Reception
  // would have read a real, wrong service off the screen, exactly as the Editar
  // marcação panel showed 11:00 for an appointment stored at 11:25.
  //
  // Where an id can legitimately be absent: the location is outside this
  // viewer's booking scope, the service was deactivated between the request and
  // the convert, or somebody typed the URL. Dropping it leaves the field on its
  // ordinary default, which is a field reception must fill in — visibly blank
  // beats confidently wrong. The server refuses the same values again at
  // `createAppointment`, so nothing here is load-bearing for correctness.
  // ==========================================================================
  const requestedServiceId = firstParam(sp.novaMarcacaoServico);
  const requestedLocationId = firstParam(sp.novaMarcacaoLocal);
  const prefill = {
    serviceId:
      requestedServiceId && options.services.some((o) => o.id === requestedServiceId)
        ? requestedServiceId
        : null,
    locationId:
      requestedLocationId &&
      options.bookableLocations.some((o) => o.id === requestedLocationId)
        ? requestedLocationId
        : null,
  };

  // Serialize the block instants for the client boundary, exactly as the
  // appointment rows already are (ISO 8601 UTC in, Lisbon placement at render).
  const blockSpans = blocks.map((b) => ({
    id: b.id,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    reason: b.reason,
    // SCHED-19: the note crosses to the client with the instants. It is the
    // only thing on a time_off row that records what somebody MEANT, and until
    // now it stopped at the server.
    note: b.note,
  }));

  // SCHED-29.4: the machines offered to owner, admin and reception MIRROR THE
  // BOOKING PERMISSION. sharedResourceLocationAllowed exempts only the owner from
  // the actor condition, so admin and reception are offered the machines at their
  // own assigned clinics. Not viewerLocationScope: it falls back to every clinic
  // for an unassigned staffer, and the offer would then be a booking the server
  // refuses.
  const offeredToFrontDesk =
    actor.role === "owner"
      ? frontDeskResources
      : sharedResourcesForViewer(frontDeskResources, await resolveViewerLocationIds(actor));

  // NESA-SCOPE: the roster (60-second cache) and the machines (per request) made
  // to agree. A machine this viewer is not offered leaves the people lists too,
  // even when it is flagged bookable, and labels are resolved over both, so the
  // Terapeutas filter, Bloquear horario and the drawer name a same-named machine
  // at each clinic the same way. See reconcileAgendaStaff.
  const staff = reconcileAgendaStaff({
    options,
    tenantResources: lockTherapist ? therapistTenantResources : frontDeskResources,
    offered: lockTherapist ? sharedResources : offeredToFrontDesk,
  });

  return (
    <AgendaViewClient
      view={view}
      anchor={anchor}
      filters={{ practitionerId, locationId }}
      lockTherapist={lockTherapist}
      // PL-10: the verified viewer identity powers the create-form therapist
      // self-lock (practitioner forced to self, Terapeuta selector hidden for
      // role "therapist"). Read-scope isolation stays on `lockTherapist` above.
      viewer={{ role: actor.role, userId: actor.userId }}
      options={{ ...options, ...staff }}
      appointments={appointments}
      blocks={blockSpans}
      dayWindow={dayWindow}
      clinicWindow={clinicWindow}
      closure={closure}
      lockedPatient={lockedPatient}
      prefill={prefill}
      canHardDelete={can(actor.role, "settings:manage")}
      // W12-28: same capability createTimeOffBlock server-enforces (settings:manage).
      // PL-27 (owner report 2026-07-31: "reception doesn't have that button I
      // have ... in agenda she can block something in the day, it's something
      // existent but not visible on their interface"). This was settings:manage,
      // which owner and admin hold and reception does not - so the control was
      // hidden from the one role whose job it is. The gate went STALE when PL-09
      // Phase 5 introduced schedule:manage and granted it to reception: the
      // server-side writes moved to the new capability, this UI check did not.
      // Now it matches what createTimeOffBlock actually enforces, so the button
      // appears exactly for the roles whose blocks would be accepted.
      canBlockTime={can(actor.role, "schedule:manage")}
      // LE-agenda-does-not-learn-of-portal-bookings. THE READ INSTANT, STAMPED
      // HERE AND NOWHERE ELSE.
      //
      // WHY IT IS COMPUTED ON THE SERVER: this page is dynamic SSR and re-queries
      // on every request, so `new Date()` at THIS point is the instant the
      // appointments above were read. A `new Date()` inside the client component
      // would re-evaluate on every client render and always say "now" - freshest
      // exactly when the data is stalest. The stamp has to travel with the data
      // it describes or it is worse than no stamp.
      //
      // FORMATTED HERE TOO, with the agenda's own `formatTimeOfDay`, so the
      // toolbar reads the same 24h Lisbon axis as the grid gutter and cannot
      // resolve to the browser's timezone or to a 12-hour locale.
      renderedAt={formatTimeOfDay(readAt)}
      renderedAtIso={readAt.toISOString()}
    />
  );
}

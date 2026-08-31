import { assertCan, can, ForbiddenError } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { scopedLocationId } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { getPatient } from "@/lib/patients/queries";
import { getAgendaOptions, listAppointments } from "@/lib/scheduling/data";
import { listTherapistBlocks } from "@/lib/scheduling/day-availability";
import {
  formatTimeOfDay,
  rangeForView,
  todayInLisbon,
  type AgendaView,
} from "@/lib/scheduling/time";
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
  if (lockTherapist) practitionerId = actor.userId;
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

  const [options, appointments, lockedPatientRow, blocks] = await Promise.all([
    // W9-02: the selected location narrows the therapist dropdown to that
    // location's assigned therapists (owner ruling 2026-07-17). Null here means
    // "Todas as localizações" and restores the full roster.
    getAgendaOptions(actor, locationId),
    listAppointments(actor, {
      startUtc,
      endUtc,
      practitionerId,
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
  ]);

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
  }));

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
      options={options}
      appointments={appointments}
      blocks={blockSpans}
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

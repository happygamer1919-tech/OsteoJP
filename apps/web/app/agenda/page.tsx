import { redirect } from "next/navigation";
import { assertCan, can, ForbiddenError, type RequestContext } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { scopedLocationId } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { getPatient } from "@/lib/patients/queries";
import { getAgendaOptions, listAppointments } from "@/lib/scheduling/data";
import { listTherapistBlocks } from "@/lib/scheduling/day-availability";
import {
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
    />
  );
}

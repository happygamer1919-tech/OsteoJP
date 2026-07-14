import { redirect } from "next/navigation";
import { assertCan, can, ForbiddenError, type RequestContext } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { getPatient } from "@/lib/patients/queries";
import { getAgendaOptions, listAppointments } from "@/lib/scheduling/data";
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
  const locationId = firstParam(sp.location);

  const { startUtc, endUtc } = rangeForView(view, anchor);

  // W6-03: "Nova marcação" on a patient profile deep-links here with the patient
  // id. Resolve the patient (tenant-scoped, active only) so the create drawer can
  // open with that patient preselected + locked. An unknown/deleted id resolves to
  // null and the agenda opens normally (no lock).
  const novaMarcacaoPacienteId = firstParam(sp.novaMarcacaoPaciente);

  const [options, appointments, lockedPatientRow] = await Promise.all([
    getAgendaOptions(actor),
    listAppointments(actor, {
      startUtc,
      endUtc,
      practitionerId,
      locationId,
    }),
    novaMarcacaoPacienteId ? getPatient(novaMarcacaoPacienteId) : Promise.resolve(null),
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

  return (
    <AgendaViewClient
      view={view}
      anchor={anchor}
      filters={{ practitionerId, locationId }}
      lockTherapist={lockTherapist}
      options={options}
      appointments={appointments}
      lockedPatient={lockedPatient}
      canHardDelete={can(actor.role, "settings:manage")}
    />
  );
}

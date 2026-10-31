import { s } from "@/lib/i18n";

import { clinicClosedMessage } from "./clinic-closed-message";
import { outsideClinicHoursMessage, type ClinicWindowRefusal } from "./clinic-hours-message";

/**
 * MARC-THERAPIST-01 - THE ONE SENTENCE FOR A REFUSED APPOINTMENT SAVE.
 *
 * These sentences lived inside the agenda drawer's `handleResult`. The ficha's
 * "Gerir marcação" now changes the Terapeuta through the same server action
 * (`rescheduleAppointment`), so it receives the same refusals, and the ruling is
 * that it shows the agenda's own messages. One function, read by both screens,
 * is how the two cannot drift: the same reason `clinicClosedMessage` and
 * `outsideClinicHoursMessage` next door each exist.
 *
 * WHAT IS NOT HERE: the overridable conflict. A `conflict` the server would
 * accept with `allowConflict` is not a sentence, it is a list of the bookings
 * in the way, and each screen draws that list itself (and decides whether it
 * offers "Guardar mesmo assim"). Callers branch on it BEFORE calling this.
 */
export type AppointmentRefusal = {
  error?: string;
  availabilityWindows?: { startTime: string; endTime: string }[];
  // 0085. Set only with error "clinic_closed"; carries the clinic's own name
  // and shut hour so the sentence can name the building, not a person.
  clinicClosure?: { locationName: string; from: string; to: string };
  // AGENDA-2100. Set only with error "outside_clinic_hours"; carries the
  // clinic's hours and the last start it accepts.
  clinicWindow?: ClinicWindowRefusal;
  conflictOverridable?: false;
};

/** True for the one refusal that is a list to draw and not a sentence. */
export function isOverridableConflict(r: AppointmentRefusal): boolean {
  return r.error === "conflict" && r.conflictOverridable !== false;
}

export function appointmentRefusalMessage(r: AppointmentRefusal): string {
  switch (r.error) {
    // SCHED-30: a therapist bringing a Cancelada back into a slot taken since.
    // A plain refusal and never the conflict list, for the reason double_booked
    // below gives: that path offers "Guardar mesmo assim", and the server does
    // not honour it for this call. An overridable conflict never reaches this
    // function (see the header); if one does, the generic sentence is the
    // honest one, because there is no list here to show.
    case "conflict":
      return r.conflictOverridable === false ? s["appointment.uncancelSlotTaken"] : s["errors.generic"];
    case "forbidden":
      return s["errors.forbidden"];
    // INC-08: its own message, not the generic one. The agenda's Estado select
    // offers all five statuses with no client-side guard, so an illegal move is
    // one click away and reception needs to be told WHICH move is refused.
    case "illegal_transition":
      return s["appointment.illegalTransition"];
    // INC-08 / 0061. A plain message and never the conflict list: that path
    // offers "Guardar mesmo assim", and this is the one refusal the override
    // may not reach.
    case "double_booked":
      return s["appointment.doubleBooked"];
    // RB-03. A plain message for the same reason as the double-booking above.
    // It would also render "conflicts with:" followed by nothing, because there
    // is no conflicting appointment: the candidate window IS the problem.
    //
    // THE MESSAGE NAMES THE WINDOW, which is the whole point of the refusal.
    // "Fora do horário" on its own sends reception to another screen to find
    // out what the horário IS; naming it means the next attempt is informed.
    // Split shift is why this joins a LIST rather than printing one pair: a
    // therapist-day can carry two periods (W13-A) and a message naming only the
    // first would be confidently wrong about the afternoon.
    //
    // NO WINDOWS IS A DIFFERENT SENTENCE, not a missing value: the therapist has
    // hours at this location but none that weekday.
    case "outside_availability": {
      const w = r.availabilityWindows ?? [];
      return w.length === 0
        ? `${s["appointment.outsideAvailability"]} ${s["appointment.outsideAvailabilityNoWindows"]} ${s["appointment.outsideAvailabilityHint"]}`
        : `${s["appointment.outsideAvailability"]} ${s["appointment.outsideAvailabilityWindows"]} ` +
            `${w.map((x) => `${x.startTime}-${x.endTime}`).join(", ")}. ` +
            `${s["appointment.outsideAvailabilityHint"]}`;
    }
    // 0085 - THE CLINIC IS SHUT, AND THE MESSAGE SAYS SO WITHOUT NAMING THE
    // THERAPIST. "O terapeuta está ausente" sends reception to that person's
    // blocks; there is nothing there, because the building is what is closed.
    // There is no "Guardar mesmo assim" for it: the server raises it outside
    // the allowConflict gate (owner: "not blockable-around").
    case "clinic_closed":
      return clinicClosedMessage(r.clinicClosure);
    // AGENDA-2100: the clinic is not OPEN at that hour, which is a different
    // sentence from the midday closure above. Also outside the allowConflict
    // gate.
    case "outside_clinic_hours":
      return outsideClinicHoursMessage(r.clinicWindow);
    // STAFF-02. The forms offer only assigned locations, so reaching this is
    // either a stale tab or a request that did not come from the form, and in
    // both cases the honest message names the location, not a permission.
    case "location_not_assigned":
      return s["appointment.locationNotAssigned"];
    // SCHED-17: a shared resource (NESA) at a clinic where it is not installed,
    // or outside the actor's own clinics. Not location_not_assigned's sentence:
    // a therapist assigned to both clinics is told the MACHINE is not there.
    case "shared_resource_location":
      return s["appointment.sharedResourceLocation"];
    // SCHED-30: a therapist cannot bring back a Cancelada that holds NESA until
    // 0088; the sentence sends them to reception, who can.
    case "uncancel_shared_resource":
      return s["appointment.uncancelSharedResource"];
    // APPT-EDIT-02: a therapist cannot hand a visit to another Terapeuta; the
    // sentence names who can, rather than a missing permission.
    case "therapist_change_reception_only":
      return s["appointment.therapistChangeReceptionOnly"];
    // RB-02: the pacote has fewer sessions left than this booking needs.
    case "pack_insufficient":
      return s["appointment.packInsufficient"];
    // PACK-03: the service was changed on a marcação that draws a pacote
    // session. The message says WHY it is locked and what to do instead.
    case "pack_service_locked":
      return s["appointment.packServiceLocked"];
    case "validation":
      return s["appointment.requiredFields"];
    case "unauthenticated":
      return s["errors.unauthenticated"];
    default:
      return s["errors.generic"];
  }
}

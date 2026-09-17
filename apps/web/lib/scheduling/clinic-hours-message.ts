import { s } from "@/lib/i18n";

/**
 * AGENDA-2100 - THE ONE SENTENCE FOR AN `outside_clinic_hours` REFUSAL.
 *
 * The same shape as `clinicClosedMessage` next door, and for the same reason:
 * three staff surfaces can receive this refusal (the appointment drawer's Nova
 * marcação / Editar / Reagendar, the Marcar novamente drawer, and the patient's
 * appointment list), and three template-fills would drift.
 *
 * IT NAMES THE HOUR THE READER SHOULD PICK INSTEAD, which is the whole point of
 * carrying the payload. "Outside opening hours" makes reception open another
 * screen to find out what the hours are; "the last appointment starts at 20:00"
 * is an instruction. Same doctrine as the closure sentence and the availability
 * refusal, which both name their own boundary.
 *
 * THE TWO HALVES ARE DIFFERENT SENTENCES rather than one with a variable, since
 * the reader's next action differs: too early moves forward to opening, too
 * late moves back to the last start.
 */
export type ClinicWindowRefusal = {
  reason: "before_open" | "after_latest_start";
  locationName: string;
  opensAt: string;
  closesAt: string;
  latestStart: string;
};

export function outsideClinicHoursMessage(c: ClinicWindowRefusal | undefined): string {
  if (!c) return s["appointment.outsideClinicHoursTitle"];
  const body =
    c.reason === "before_open"
      ? s["appointment.outsideClinicHoursBeforeOpen"]
          .replaceAll("{clinica}", c.locationName)
          .replaceAll("{abre}", c.opensAt)
      : s["appointment.outsideClinicHoursAfterLatest"]
          .replaceAll("{clinica}", c.locationName)
          .replaceAll("{fecha}", c.closesAt)
          .replaceAll("{ultima}", c.latestStart);
  return `${s["appointment.outsideClinicHoursTitle"]} ${body}`;
}

import { s } from "@/lib/i18n";
import type { ClinicDefaultSwitchVerdict, NamedClinic } from "@/lib/scheduling/effective-availability-core";

/**
 * HOR-01 - the Portuguese sentences for "Usar horario da clinica": the clinics
 * a confirm will switch off, and why a refusal refused. Pure, so the server
 * action and the button word the same verdict the same way.
 */
export function clinicList(clinics: readonly NamedClinic[]): string {
  return clinics.map((c) => c.name).join(", ");
}

export function clinicDefaultConfirmClinics(clinics: readonly NamedClinic[]): string {
  return s["schedule.useClinicHoursClinics"].replace("{clinics}", clinicList(clinics));
}

export function clinicDefaultRefusalMessage(
  verdict: Exclude<ClinicDefaultSwitchVerdict, { ok: true }>,
): string {
  switch (verdict.reason) {
    case "nothing_to_switch":
      return s["schedule.useClinicHoursNothing"];
    case "not_eligible":
      return s["schedule.useClinicHoursRefusedNotEligible"];
    case "not_member":
      return s["schedule.useClinicHoursRefusedNotMember"].replace("{clinics}", clinicList(verdict.clinics));
  }
}

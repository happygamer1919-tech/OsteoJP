import { GlassPanel } from "@osteojp/ui";

import { formatPatientNumber } from "@/lib/patients/format";
import { s } from "@/lib/i18n";

/**
 * Read-only patient header strip (SPEC-ficha-medica.md sec 3 / 5.0).
 *
 * NO-DUPLICATION RULE: identity/demographic data (nome, NIF, contactos, morada,
 * profissão, data de nascimento, sexo, número de paciente) lives on the patient
 * record and is edited THERE, never inside the ficha. This strip is display-only
 * — it surfaces the few demographics a clinician needs at a glance plus the
 * record's auto-stamped creation instant (sec 4). It contains no inputs, so it
 * cannot re-request any profile field.
 */
export function PatientHeaderStrip({
  name,
  patientNumber,
  dateOfBirth,
  sex,
  profession,
  createdAt,
}: {
  name: string;
  patientNumber: number | null;
  dateOfBirth: string | null;
  sex: string | null;
  profession: string | null;
  createdAt: string;
}) {
  const empty = s["clinical.headerStripEmpty"];
  // Europe/Lisbon display (CLAUDE.md: UTC in DB, Lisbon for display).
  const dateFmt = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon" });
  const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    dateStyle: "short",
    timeStyle: "short",
  });

  const items: Array<{ label: string; value: string }> = [
    {
      label: s["clinical.headerStripPatientNumber"],
      value: patientNumber != null ? formatPatientNumber(patientNumber) : empty,
    },
    {
      label: s["clinical.headerStripBirthDate"],
      value: dateOfBirth ? dateFmt.format(new Date(dateOfBirth)) : empty,
    },
    { label: s["clinical.headerStripSex"], value: sex ? formatSex(sex) : empty },
    {
      label: s["clinical.headerStripProfession"],
      value: profession && profession.trim() !== "" ? profession : empty,
    },
    {
      label: s["clinical.recordCreatedAt"],
      value: dateTimeFmt.format(new Date(createdAt)),
    },
  ];

  return (
    <GlassPanel title={s["clinical.headerStripTitle"]} className="mb-6">
      <div className="flex flex-col gap-3">
        <p className="text-lg font-medium text-v2-text-primary">{name}</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((it) => (
            <div key={it.label} className="min-w-0">
              <dt className="text-xs text-text-secondary">{it.label}</dt>
              <dd className="truncate text-sm text-v2-text-primary" title={it.value}>
                {it.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </GlassPanel>
  );
}

function formatSex(sex: string): string {
  if (sex === "male") return s["patients.sexMale"];
  if (sex === "female") return s["patients.sexFemale"];
  return s["patients.sexOther"];
}

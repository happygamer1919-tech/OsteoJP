import { s } from "@/lib/i18n";
import { closedDayReason } from "./closed-day-labels";
import type { ClinicClosurePayload } from "./closed-days-core";

/**
 * 0085 - THE ONE SENTENCE FOR A `clinic_closed` REFUSAL.
 *
 * Every staff surface that can receive this refusal renders it from here: the
 * appointment drawer (Nova marcação, Editar marcação, Reagendar) and the
 * Marcar novamente drawer. They were two copies of the same template-fill until
 * the clone path learned to refuse; one helper means the sentence cannot drift
 * between the two doors onto the same diary.
 *
 * IT NAMES THE CLINIC AND THE HOUR, AND NEVER THE THERAPIST. "O terapeuta está
 * ausente" sends reception to that person's blocks, and there is nothing there:
 * the building is what is closed. The body says so in as many words.
 *
 * `c` is absent only if a caller received `clinic_closed` without the payload
 * the server always attaches; the title alone is still true in that case.
 *
 * TIER C 0114: a DATED closure (a holiday, a closed day) carries `closedDay`,
 * and gets its own sentence. The lunch sentence says "todos os dias", which is
 * false of a closed date; the dated one names the reason (its label, or its
 * kind) and still says there is no block to remove.
 */
export function clinicClosedMessage(c: ClinicClosurePayload | undefined): string {
  if (!c) return s["appointment.clinicClosedTitle"];
  if (c.closedDay) {
    const reason = closedDayReason(c.closedDay.kind, c.closedDay.label);
    const dayBody = (c.closedDay.wholeDay ? s["appointment.clinicClosedDayBody"] : s["appointment.clinicClosedDayPartBody"])
      .replace("{clinica}", c.locationName)
      .replace("{motivo}", reason)
      .replace("{de}", c.from)
      .replace("{ate}", c.to);
    return `${s["appointment.clinicClosedTitle"]} ${dayBody}`;
  }
  const body = s["appointment.clinicClosedBody"]
    .replace("{clinica}", c.locationName)
    .replace("{de}", c.from)
    .replace("{ate}", c.to);
  return `${s["appointment.clinicClosedTitle"]} ${body}`;
}

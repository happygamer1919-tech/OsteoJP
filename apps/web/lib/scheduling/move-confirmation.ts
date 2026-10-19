// Q-K, strategy's ruling of the confirmation a staff MOVE re-sends.
//
// Until this, every save of a confirmed portal appointment through the move
// action (the agenda's edit panel, and the ficha's Terapeuta field, which
// reuses it) re-sent today's "Marcação confirmada", email AND SMS, whenever the
// last one was more than 24 hours old: the only thing that stopped a repeat was
// Inngest's duplicate key, which forgets after a day. The ruling:
//
//   (1) a change of START TIME always notifies the patient;
//   (2) a change of THERAPIST alone sends the email, and the SMS only when the
//       patient has no email on file;
//   (3) a visit brought back from Cancelada to Confirmada keeps today's send
//       (not this module: updateAppointment's targets carry no field).
//
// Its own module, pure, with no imports, so the move action can use it where a
// test replaces ./reminders whole.

/** See `ReminderEnqueueTarget.confirmation` in ./reminders.ts. */
export type MoveConfirmation = "therapist_only" | "none";

/**
 * Q-K, strategy's ruling: what a MOVE of one appointment owes the patient,
 * decided from the row as it was BEFORE the save and as it is after. Pure,
 * exported for direct testing.
 *
 *   the start changed            -> undefined: today's confirmation, always,
 *                                   whatever else changed with it (rule 1)
 *   only the Terapeuta changed   -> "therapist_only": email, SMS only when
 *                                   there is no email on file (rule 2)
 *   neither changed              -> "none": an identical re-save sends nothing
 *
 * THIS IS THE DUPLICATE KEY THAT DOES NOT EXPIRE. The Inngest key on the
 * confirmation (appointment + start + therapist) is forgotten after 24 hours;
 * this compares the same two values across the save itself, so a re-save a week
 * later sends nothing too.
 *
 * A change of clinic, duration or anything else at the same start and with the
 * same Terapeuta counts as "neither": the ruling names the start and the
 * therapist and nothing more.
 *
 * NO "BEFORE" ROW (not reachable today: the move reads every row it writes)
 * keeps today's confirmation, so a gap here can cost a repeat, never a lost
 * message.
 */
export function moveConfirmation(
  before: { startsAt: Date; practitionerId: string } | undefined,
  after: { startsAt: Date; practitionerId: string },
): MoveConfirmation | undefined {
  if (!before) return undefined;
  if (before.startsAt.getTime() !== after.startsAt.getTime()) return undefined;
  if (before.practitionerId !== after.practitionerId) return "therapist_only";
  return "none";
}

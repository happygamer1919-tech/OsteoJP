import {
  PACK_CONSUMING_STATUSES,
  packSessionsAvailable,
  type PackBalanceInputs,
} from "@osteojp/db";

/**
 * PACK-01 — may THIS appointment draw a session from THAT pacote instance?
 *
 * PURE, and separate from the server module, for the same reason
 * `day-availability-core` is separate from `day-availability`: the decision is
 * the part worth testing exhaustively, and it must not need a database to state
 * it. The server module does the reads and the write; this file decides.
 *
 * ==========================================================================
 * IT RETURNS A NAMED REFUSAL, NEVER A BOOLEAN, AND THAT IS THE POINT
 * ==========================================================================
 * Five different things stop a link, and four of them are things reception can
 * act on — buy another pacote, pick the right one, un-cancel the visit. A
 * boolean maps all five onto "no", and the screen then has to guess which, or
 * say nothing. That is exactly the §1.3 shape: an unknown case rendered as a
 * known-looking one. Every refusal below names itself, and the caller prints it.
 */

/** The appointment, reduced to what the decision actually reads. */
export type LinkableAppointment = {
  id: string;
  patientId: string | null;
  /** The service booked, or null for an appointment saved without one. */
  serviceId: string | null;
  status: string;
  /** The instance it already draws from, or null. */
  packInstanceId: string | null;
};

/** One of the patient's pacote instances, with its derived balance inputs. */
export type LinkablePackInstance = PackBalanceInputs & {
  id: string;
  patientId: string;
  packName: string;
  /** The service every session of this pacote is. */
  baseServiceId: string;
  baseServiceName: string;
};

export type PackLinkRefusal =
  | "already_linked"
  | "different_patient"
  | "service_mismatch"
  | "no_service"
  | "no_sessions_left"
  | "cancelled_consumes_nothing";

/**
 * The refusals that are facts about THE APPOINTMENT ALONE, so no pacote can
 * ever satisfy them. Null when the appointment itself is linkable.
 *
 * ==========================================================================
 * IT IS SPLIT OUT SO THE SCREEN CAN TELL "no pacote fits" FROM "this visit
 * cannot take one", which are different sentences with different next steps.
 * ==========================================================================
 * Collapsing them is the §1.3 conflation in its most ordinary form: an empty
 * option list would read as "this patient has no pacote", and reception would
 * go and sell one to a patient whose visit is simply already linked.
 */
export function packLinkAppointmentBlock(
  appt: LinkableAppointment,
): Extract<PackLinkRefusal, "already_linked" | "cancelled_consumes_nothing" | "no_service"> | null {
  if (appt.packInstanceId != null) return "already_linked";
  if (!(PACK_CONSUMING_STATUSES as readonly string[]).includes(appt.status))
    return "cancelled_consumes_nothing";
  if (appt.serviceId == null) return "no_service";
  return null;
}

/**
 * The refusal, or null when the link is allowed.
 *
 * ORDER IS DELIBERATE: the reasons that are FACTS ABOUT THE APPOINTMENT come
 * before the ones that are facts about the pacote, so a cancelled appointment
 * says it is cancelled rather than blaming whichever pacote happened to be
 * offered first.
 */
export function packLinkRefusal(
  appt: LinkableAppointment,
  inst: LinkablePackInstance,
): PackLinkRefusal | null {
  // 1-3. THE APPOINTMENT'S OWN REFUSALS, FIRST AND FROM ONE LIST.
  //    already_linked - not "overwrite the old link": the old link already
  //      spent a session, and silently moving it would change two balances from
  //      a control that says it is adding one.
  //    cancelled_consumes_nothing - the balance formula excludes cancelled rows
  //      (PACK_CONSUMING_STATUSES), so the link would be real and its effect
  //      would be zero. Refusing says so instead of leaving reception to notice
  //      the count did not move.
  //    no_service - nothing to match a pacote's service against.
  const own = packLinkAppointmentBlock(appt);
  if (own) return own;

  // 4. SAME PATIENT. The reads are already patient-scoped, so this should be
  //    unreachable - which is why it is asserted rather than assumed. An
  //    unreachable case that is not checked is a case that is not checked.
  if (appt.patientId == null || appt.patientId !== inst.patientId) return "different_patient";

  // 5. SAME SERVICE ONLY.
  if (appt.serviceId !== inst.baseServiceId) return "service_mismatch";

  // 6. CANNOT EXCEED THE SESSION COUNT. The DERIVED balance, never the frozen
  //    `sessions_remaining` column.
  if (packSessionsAvailable(inst) <= 0) return "no_sessions_left";

  return null;
}

/** The instances this appointment may draw from, in the order to offer them. */
export function linkablePacks(
  appt: LinkableAppointment,
  instances: readonly LinkablePackInstance[],
): LinkablePackInstance[] {
  return instances.filter((i) => packLinkRefusal(appt, i) === null);
}

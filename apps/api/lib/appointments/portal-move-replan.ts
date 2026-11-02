// No `server-only` here, deliberately, for the reason ./portal-move-audit.ts
// gives: store.ts imports this module, and it is unit-tested under vitest's
// node env. It reads no secret itself: the Inngest SDK reads
// INNGEST_EVENT_KEY from the environment, and nothing here prints it.
//
// R44 (strategy, 2026-11-02; owner, 2026-11-02, option 1): A PATIENT'S OWN
// MOVE IN THE PORTAL RE-PLANS THE VISIT'S REMINDERS, AS A STAFF MOVE DOES.
//
// The reminder job (apps/web, Inngest app `osteojp-reminders`) plans a visit's
// reminders when it receives `appointment/scheduled`, and every such event
// cancels the visit's sleeping reminder runs and plans them again from the
// start it carries. Before this, a portal move sent nothing, so the run planned
// for the OLD start still woke at the old mark.
//
// THE ONE EVENT apps/api SENDS. This module is the only Inngest code in
// apps/api: a send-only client, no `serve` endpoint, no function. Its one
// caller is `rescheduleOwn` (./store.ts), after the move's transaction has
// committed. apps/web/lib/reminders/confirmation-key-per-save.test.ts pins
// that, and re-arming-saves.test.ts lists it beside the staff doors.
//
// THE PAYLOAD IS THE STAFF MOVE'S, field for field
// (apps/web/lib/scheduling/reminders.ts `enqueueRemindersAfterCommit`, through
// apps/web/lib/reminders/index.ts `enqueueAppointmentReminders`): the
// appointment, the tenant, the NEW start as `toISOString()`, the Terapeuta, a
// fresh `saveId` made once for this save, and `confirmationEligible`. IDS AND
// INSTANTS ONLY (rule 7; the Inngest payload rule counsel reviewed, see
// ../notifications/patient-change.ts): no name, no phone, no email.
//
// `confirmationEligible` IS ALWAYS false: the owner ruled on 2026-11-02 that a
// patient who moves their own visit gets NO fresh confirmation (the portal
// shows the new time on screen). The reminders are re-planned either way; the
// confirmation function filters on this flag at its trigger.
//
// BEST-EFFORT, AS THE STAFF PATH IS. The move is already committed, so a
// failed send (no key in a preview or locally, Inngest down) is logged by the
// error's NAME only and swallowed. The patient's move stands; the cost is the
// old reminder still waiting, never a lost or failed move.
import { randomUUID } from "node:crypto";
import { Inngest } from "inngest";

/** The event the reminder job is triggered by. The same name apps/web sends. */
const PORTAL_MOVE_REPLAN_EVENT = "appointment/scheduled";

/** A send-only client. The id names the sender; it registers nothing (no serve endpoint). */
const inngest = new Inngest({ id: "osteojp-api" });

export type PortalMoveReplanData = {
  appointmentId: string;
  tenantId: string;
  /** The start AFTER the move, ISO-8601 UTC. */
  startsAt: string;
  /** The visit's Terapeuta (a staff user id). A portal move never changes it. */
  practitionerId: string;
  /** Made once per save, as `enqueueRemindersAfterCommit` makes it. */
  saveId: string;
  /** Always false: no confirmation for a portal move (owner, 2026-11-02). */
  confirmationEligible: false;
};

/** The event's data for one portal move. Pure, so the shape is tested on its own. */
export function portalMoveReplanData(args: {
  appointmentId: string;
  tenantId: string;
  startsAt: Date;
  practitionerId: string;
  saveId: string;
}): PortalMoveReplanData {
  return {
    appointmentId: args.appointmentId,
    tenantId: args.tenantId,
    startsAt: args.startsAt.toISOString(),
    practitionerId: args.practitionerId,
    saveId: args.saveId,
    confirmationEligible: false,
  };
}

/**
 * Re-plan the reminders of a visit the patient just moved. Call AFTER the
 * move has committed. Never throws.
 */
export async function replanAfterPortalMove(args: {
  appointmentId: string;
  tenantId: string;
  startsAt: Date;
  practitionerId: string;
}): Promise<void> {
  try {
    await inngest.send({
      name: PORTAL_MOVE_REPLAN_EVENT,
      data: portalMoveReplanData({ ...args, saveId: randomUUID() }),
    });
  } catch (e) {
    console.error("portal: reminder re-plan failed", e instanceof Error ? e.name : "unknown");
  }
}

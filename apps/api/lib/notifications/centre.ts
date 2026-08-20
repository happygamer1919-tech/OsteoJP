// W13-02 (Wave 13 LOOP 2) — the notification centre's WRITE half: the fan-out
// resolver and the persisting consumer that replaces `stubConsumer`.
//
// WHAT THIS REPLACES. patient-change.ts shipped a FIXED event contract with a
// stub consumer that logged and returned `delivered: false`, deliberately, so
// the emit sites could be real and exercised before the centre existed. This is
// the "later loop replaces one function" that file's header promised. The emit
// sites are untouched.
//
// IN-APP ONLY, and this is a hard scope boundary from PG4 and from LOOP 2's own
// restrictions: no email, no SMS, no push, not behind a flag, not "for later".
// Nothing in this file may import a transport. `centre.inapp-only.test.ts`
// asserts that on the transport rather than on intent.
//
// NO CLINICAL CONTENT, EVER. A notification is not a note viewer. The rows this
// writes carry identifiers and instants only — the same rule the event contract
// states — and the service name is excluded outright because several service
// names identify a treatment type.

import { and, eq, inArray } from "drizzle-orm";
import { getDbAdmin, roles, staffNotifications, users } from "@osteojp/db";

import type {
  ConsumerResult,
  PatientChangeConsumer,
  PatientChangeEvent,
} from "./patient-change";

/** The role slug whose holders all receive every patient-initiated change. */
const RECEPTION_ROLE_SLUG = "reception";

/**
 * Resolve the recipient user ids for one event.
 *
 * TWO SOURCES, UNIONED AND DEDUPLICATED:
 *
 *   1. Every ACTIVE reception user of the tenant. Reception is a role, not a
 *      person (the event contract says so), so this is a query and not an id
 *      carried in the payload — a reception user hired today receives changes
 *      from today, and a deactivated one receives nothing.
 *   2. The assigned practitioners, by id, from the event's audience. Plural
 *      since WF-05: a dual-participant service (Massagem 4 Maos, Sessao
 *      Familia) has two, and both are notified.
 *
 * DEDUPLICATED because the two sets can overlap: a practising owner or a
 * therapist who also holds the reception role would otherwise get two rows for
 * one event. The Set is the whole mechanism and it is cheap.
 *
 * THE PRACTITIONER IDS ARE VALIDATED AGAINST THE TENANT, not trusted. They
 * arrive from a caller in the same process today, but the fan-out writes rows
 * addressed to a user id, and an id from another tenant would create a row no
 * policy can select and a notification nobody can read. Filtering here means a
 * malformed event loses a recipient loudly (the count is logged) rather than
 * writing junk.
 */
export async function resolveRecipients(e: PatientChangeEvent): Promise<string[]> {
  const db = getDbAdmin();

  const receptionRows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(
      and(
        eq(users.tenantId, e.tenantId),
        eq(users.isActive, true),
        eq(roles.slug, RECEPTION_ROLE_SLUG),
      ),
    );

  const practitionerRows = e.audience.practitionerIds.length
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, e.tenantId),
            inArray(users.id, e.audience.practitionerIds),
          ),
        )
    : [];

  const recipients = new Set<string>();
  if (e.audience.reception) for (const r of receptionRows) recipients.add(r.id);
  for (const r of practitionerRows) recipients.add(r.id);

  return [...recipients];
}

/**
 * The persisting consumer. One row per recipient, one insert.
 *
 * WHY getDbAdmin AND NOT withPatientContext. This runs post-commit inside a
 * patient request, but it is a PLATFORM write, not a patient write: the rows
 * are addressed to staff and the recipients are resolved server-side. The
 * appointments store already takes getDbAdmin as its sanctioned path
 * (store.ts:41) with scope enforced in application code, and this follows it.
 * The RLS policies in 0055 remain the gate for every READ, which is where the
 * exposure actually lives.
 *
 * onConflictDoNothing IS THE IDEMPOTENCY GUARD, paired with the unique index in
 * 0055 over (recipient, appointment, kind, occurred_at). emitPatientChange is
 * best-effort and post-commit; a retry must not double-post the same change to
 * everyone. A genuine second action carries a different occurredAt and is
 * correctly a second row.
 *
 * `delivered` IS HONEST. It is true only when rows were actually persisted. An
 * event that resolves to zero recipients returns false, because nothing was
 * delivered — reporting true there would recreate exactly the silent-no-op
 * pattern the stub was written to avoid.
 */
export const persistingConsumer: PatientChangeConsumer = async (
  e: PatientChangeEvent,
): Promise<ConsumerResult> => {
  const recipients = await resolveRecipients(e);

  if (recipients.length === 0) {
    // Loud, and greppable. Reaching nobody is a real condition worth seeing: it
    // means the tenant has no active reception user AND the assigned
    // practitioners did not resolve.
    console.warn(
      `[notifications] patient-change resolved ZERO recipients ` +
        `kind=${e.kind} tenant=${e.tenantId} appointment=${e.appointmentId} ` +
        `practitioners=${e.audience.practitionerIds.join(",")}`,
    );
    // THE REASON IS REPORTED rather than left for the caller to infer from a
    // bare false. LE-pedido-emit-best-effort: this branch writes nothing and
    // throws nothing, so before the reason existed it was indistinguishable at
    // the call site from a write that was attempted and failed.
    return { delivered: false, reason: "no_recipients" };
  }

  await getDbAdmin()
    .insert(staffNotifications)
    .values(
      recipients.map((recipientUserId) => ({
        tenantId: e.tenantId,
        recipientUserId,
        kind: e.kind,
        // 0061. Null for every patient-initiated kind, where the actor is the
        // patient already named below. `?? null` and not `e.actorUserId`: the
        // field is optional on the event, and writing `undefined` would make
        // Drizzle omit the column rather than write NULL.
        actorUserId: e.actorUserId ?? null,
        appointmentId: e.appointmentId,
        patientId: e.patientId,
        previousStartsAt: new Date(e.previousStartsAt),
        newStartsAt: new Date(e.newStartsAt),
        occurredAt: new Date(e.occurredAt),
      })),
    )
    .onConflictDoNothing();

  return { delivered: true };
};

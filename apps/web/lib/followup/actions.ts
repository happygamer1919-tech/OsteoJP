"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { patientFollowupContacts, patientFollowupPostponements } from "@osteojp/db";

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { assertFollowupPatientInScope, followupLocationScope, FollowupScopeError } from "./scope";

/**
 * RB-01 — the three mutations behind the recuperacao list. There is no fourth.
 *
 * EVERY ONE RE-DERIVES THE ACTOR FROM THE VERIFIED SESSION and never takes a
 * user id from the caller. These are "use server" functions, so their arguments
 * are attacker-controlled by construction: anything the browser could supply is
 * treated as a request, not as a fact.
 *
 * ==========================================================================
 * AND FROM 2026-08-27 EVERY ONE CHECKS THE PATIENT, NOT ONLY THE CAPABILITY.
 * ==========================================================================
 * They used to check `followup:read` and stop, which was sound only while every
 * holder of that capability could see every patient. The owner ruling granting
 * therapists a SCOPED list ends that: without a per-patient check, the
 * capability would carry unscoped WRITE access behind a scoped READ, and the
 * `patientId` argument is the thing the header above already says is
 * attacker-controlled.
 *
 * `assertFollowupPatientInScope` (in `./scope`) is the one definition, and the
 * rule it states is the one a reader expects: you may act on a patient exactly
 * when you could have seen them on the list.
 *
 * NONE OF THEM SENDS A MESSAGE. `recordFollowupContact` records that a human
 * pressed a link on their own device. It is a marker, not a delivery receipt,
 * and the difference is written on the screen as well as here — see §"what the
 * tick means" in `followup-list.tsx`.
 */

/** The channels 0067's CHECK constraint admits. Kept as a const so a typo is a
 *  compile error here rather than a `23514` at the database. */
const CHANNELS = ["whatsapp", "sms", "email"] as const;
export type FollowupChannel = (typeof CHANNELS)[number];

/**
 * The postponement lengths reception may choose, in weeks.
 *
 * A CLOSED SET, NOT A FREE NUMBER. A text field would admit 0 (a postponement
 * that does nothing), 5200 (a deletion wearing a postponement's clothes) and
 * every typo between. The card asks for "postpone N weeks"; these are the N.
 */
export const POSTPONE_WEEKS = [2, 4, 8, 12] as const;
export type PostponeWeeks = (typeof POSTPONE_WEEKS)[number];

function isPostponeWeeks(n: number): n is PostponeWeeks {
  return (POSTPONE_WEEKS as readonly number[]).includes(n);
}

/**
 * Postpone a patient out of the list for N weeks.
 *
 * THE ROW IS THE RECORD AND THE PREDICATE AT ONCE. `postponed_until` is stored
 * as an instant rather than a week count precisely so the list's clause is a
 * comparison — see 0067's own comment on the column. Computing the instant here
 * and storing arithmetic there would put the same rule in two places.
 */
export async function postponeFollowup(patientId: string, weeks: number): Promise<void> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "followup:read");
  if (!isPostponeWeeks(weeks)) {
    throw new Error(`postponeFollowup: ${weeks} is not one of ${POSTPONE_WEEKS.join(", ")}`);
  }

  const until = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
  const locationScope = await followupLocationScope(ctx);

  await runScoped(ctx, async (tx) => {
    await assertFollowupPatientInScope(tx, ctx, patientId, locationScope);
    await tx.insert(patientFollowupPostponements).values({
      tenantId: ctx.tenantId,
      patientId,
      postponedUntil: until,
      createdBy: ctx.userId,
    });
  });

  revalidatePath("/recuperacao");
}

/**
 * Bring a postponed patient back to the list.
 *
 * IT RECORDS THE REVERSAL RATHER THAN DELETING THE ROW, which is the card's
 * requirement and also the only shape 0067 permits: `authenticated` holds no
 * DELETE on this table, so a handler that tried would fail at the database
 * gate. Both halves are written together because the CHECK constraint refuses a
 * row carrying a revoker and no time.
 *
 * SCOPED TO ROWS THIS TENANT CAN SEE by RLS, and to ACTIVE rows by the WHERE.
 * Revoking an already-revoked postponement would otherwise overwrite the name
 * of whoever really reversed it.
 *
 * THE ARGUMENT IS A POSTPONEMENT ID, NOT A PATIENT ID, so the scope check needs
 * one extra step: read whose postponement it is, then ask whether this viewer
 * may act on that patient. The read happens INSIDE the same transaction and
 * selects the patient id alone — it is a lookup for the guard, never a way to
 * see a row the guard is about to refuse.
 *
 * A MISSING OR ALREADY-REVOKED ROW TAKES THE SAME BRANCH AS AN OUT-OF-SCOPE
 * ONE. Distinguishing them would tell a caller that some postponement id exists
 * at this clinic, which is the existence oracle `scope.ts` refuses to be.
 */
export async function revokeFollowupPostponement(postponementId: string): Promise<void> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "followup:read");
  const locationScope = await followupLocationScope(ctx);

  await runScoped(ctx, async (tx) => {
    const [row] = await tx
      .select({ patientId: patientFollowupPostponements.patientId })
      .from(patientFollowupPostponements)
      .where(
        sql`${patientFollowupPostponements.id} = ${postponementId}
            AND ${patientFollowupPostponements.revokedAt} IS NULL`,
      )
      .limit(1);
    if (!row) throw new FollowupScopeError();
    await assertFollowupPatientInScope(tx, ctx, row.patientId, locationScope);

    await tx
      .update(patientFollowupPostponements)
      .set({ revokedBy: ctx.userId, revokedAt: new Date() })
      .where(
        sql`${patientFollowupPostponements.id} = ${postponementId}
            AND ${patientFollowupPostponements.revokedAt} IS NULL`,
      );
  });

  revalidatePath("/recuperacao");
}

/**
 * Record that reception opened a channel to this patient.
 *
 * ==========================================================================
 * WHAT THIS DOES AND DOES NOT PROVE, because the screen shows it as a tick and
 * a tick is the most over-read symbol available.
 * ==========================================================================
 * It proves a member of staff PRESSED A LINK at an instant. It does not prove a
 * message was composed, sent, delivered or read — the deep link opens WhatsApp
 * or the mail client and everything after that happens on the receptionist's
 * device, where this system has no visibility and deliberately wants none.
 *
 * The UI therefore says "contactado" with a name and a time, never "enviado".
 * That distinction is the whole reason this is one table and not a messaging
 * log, and it is repeated on the component because whoever changes the label
 * will be reading that file rather than this one.
 *
 * APPEND-ONLY, and 0067 grants no UPDATE and no DELETE. Three attempts to reach
 * somebody is a different fact from one attempt, and only the history can tell
 * them apart.
 */
export async function recordFollowupContact(
  patientId: string,
  channel: string,
): Promise<void> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "followup:read");
  if (!(CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(`recordFollowupContact: unknown channel ${channel}`);
  }

  const locationScope = await followupLocationScope(ctx);

  await runScoped(ctx, async (tx) => {
    await assertFollowupPatientInScope(tx, ctx, patientId, locationScope);
    await tx.insert(patientFollowupContacts).values({
      tenantId: ctx.tenantId,
      patientId,
      channel,
      contactedBy: ctx.userId,
    });
  });

  revalidatePath("/recuperacao");
}

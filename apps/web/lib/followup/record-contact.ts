import "server-only";
import { patientFollowupContacts } from "@osteojp/db";
import { assertCan } from "@osteojp/auth";

import { runScoped, type RequestContext } from "@/lib/auth/context";
import { assertFollowupPatientInScope, followupLocationScope } from "./scope";

/**
 * ==========================================================================
 * THE ONE DEFINITION OF "RECORD THAT SOMEBODY OPENED A CONTACT".
 * ==========================================================================
 * Extracted from the server action on 2026-08-28 by
 * LE-followup-contact-mark-never-recorded, so the transport can change without
 * the RULE changing. Capability, channel validation, scope and the insert live
 * here; who may CALL it, and over what wire, is the caller's problem.
 *
 * IT DOES NOT REVALIDATE AND IT DOES NOT KNOW ABOUT A PAGE. Its caller decides
 * whether a screen needs refreshing, because the reliable transport for this
 * particular write is a `keepalive` request that may outlive the document that
 * sent it - and a `revalidatePath` on behalf of a document that no longer
 * exists is a lie about what the user is looking at.
 */

/** The channels 0067's CHECK constraint admits. A const so a typo is a compile
 *  error here rather than a `23514` at the database. */
export const CONTACT_CHANNELS = ["whatsapp", "sms", "email"] as const;
export type FollowupChannel = (typeof CONTACT_CHANNELS)[number];

export function isFollowupChannel(v: unknown): v is FollowupChannel {
  return typeof v === "string" && (CONTACT_CHANNELS as readonly string[]).includes(v);
}

/**
 * Record that a member of staff opened a channel to this patient.
 *
 * ==========================================================================
 * WHAT IT PROVES, because the screen shows it as a line of text and text like
 * that is read as more than it says.
 * ==========================================================================
 * It proves a member of staff PRESSED A LINK at an instant. It does not prove a
 * message was composed, sent, delivered or read - the deep link opens WhatsApp
 * or the mail client and everything after that happens on the receptionist's
 * device, where this system has no visibility and deliberately wants none.
 *
 * The UI therefore says "contactado" with a name and a time, never "enviado".
 *
 * APPEND-ONLY, and 0067 grants no UPDATE and no DELETE. Three attempts to reach
 * somebody is a different fact from one attempt, and only the history can tell
 * them apart - which is also why a second channel on the same patient is a
 * SECOND ROW rather than an update of the first.
 *
 * THROWS ON REFUSAL. It never returns a falsy "did not work": the caller has to
 * handle the failure or let it propagate, and a swallowed rejection is the
 * defect this whole card exists for.
 */
export async function recordFollowupContactFor(
  ctx: RequestContext,
  patientId: string,
  channel: string,
): Promise<void> {
  assertCan(ctx.role, "followup:read");
  if (!isFollowupChannel(channel)) {
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
}

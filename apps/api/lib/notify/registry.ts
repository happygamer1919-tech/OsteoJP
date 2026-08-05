// Approval ledger for apps/api. DELIBERATELY EMPTY.
//
// It held two entries — patient activation by SMS and by email, both
// approved:false — and they went with the code that sent them. W13-03 deleted
// `lib/auth/activation.ts` under owner ruling WF-08 (R5, 2026-08-05): it minted
// a Supabase RECOVERY link and delivered it by SMS, which is a session grant,
// and Decision D permits no session from anything but a verified OTP. It had no
// production caller, verified by searching every export across apps/ and
// packages/ before the deletion.
//
// AN EMPTY REGISTRY IS THE CORRECT STATE, NOT A GAP. The approval gate is
// fail-closed: `resolveApproved` treats an unknown template id as unapproved, so
// an empty ledger means apps/api can send NOTHING, through any channel, under
// any flag. That is exactly right — this app has no remaining outbound body.
// Patient reminders live in apps/web and are gated by REMINDERS_LIVE_SEND;
// staff invites live in apps/web and are gated by INVITES_LIVE_SEND.
//
// The registry and the sender in `clients.ts` are kept rather than deleted with
// their last entry, and that is a deliberate choice: they are the CHOKE POINT.
// Removing them would mean the next outbound body added to this app has nowhere
// to register itself and no gate to pass, which is how an unapproved body
// reaches a patient. An empty gate that refuses everything is a smaller thing to
// maintain than the discipline of remembering to rebuild one.
//
// ADDING A BODY HERE IS A CLINICAL EVENT, not a code change. It registers
// approved:false, JP reviews the copy, and only then does the flag matter.

import { buildRegistry, type TemplateEntry } from "@osteojp/notify";

/**
 * No approved bodies. See the header: this is a fail-closed default, and the
 * empty array is load-bearing rather than a placeholder awaiting content.
 */
export const API_TEMPLATES: readonly TemplateEntry[] = [] as const;

export const apiRegistry = buildRegistry(API_TEMPLATES);

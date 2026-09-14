import { can, type Capability, type Role } from "@osteojp/auth";
import { s } from "../i18n";

/**
 * COMMS-01 (owner dispatch 2026-09-14, BL-2): the sections of the Comunicações
 * group, in order, each with the capability that opens it.
 *
 * ONE LIST, THREE READERS. The sidebar entry shows when a role may open any of
 * these (nav-items.ts), /comunicacoes redirects to the first one the role may
 * open, and the shared tab bar lists exactly these. A section added here reaches
 * all three; a section that existed in only one of them is how a tab bar comes
 * to offer a page its route then refuses.
 *
 * THE CAPABILITY IS THE PAGE'S OWN ROUTE GATE, restated, not a second rule: each
 * page redirects without it and its query asserts it.
 */
export type CommsSection = { href: string; label: string; capability: Capability };

export const COMMS_SECTIONS: readonly CommsSection[] = [
  // RB-01. Keeps its original URL: links, revalidatePath and e2e specs name it.
  { href: "/recuperacao", label: s["nav.followup"], capability: "followup:read" },
  // COMMS-01. Owner, admin and reception until a scoped therapist policy exists
  // (docs/QUESTIONS.md > Q-COMMS-01-1).
  { href: "/comunicacoes/lembretes-sms", label: s["remindersLog.nav"], capability: "reminders:log_read" },
];

/** The sections this role may open, in group order. */
export function commsSectionsForRole(role: Role): CommsSection[] {
  return COMMS_SECTIONS.filter((c) => can(role, c.capability));
}

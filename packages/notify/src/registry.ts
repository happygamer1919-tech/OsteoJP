// Template registry types + lookup.
//
// The registry is the approval ledger for outbound copy. A body may only reach a
// provider if its template is registered AND `approved` is true. Entries live
// co-located with the bodies they describe (see
// apps/web/lib/reminders/notification-registry.ts); this module owns only the
// shape and the fail-closed lookup, so the gate can stay app-agnostic.
//
// Fail-closed is the whole point: an id that is absent from the registry is
// treated exactly like an unapproved one. Adding a new body without registering
// it does not silently ship it.

import type { Audience, Channel, LiveSendFlag } from "./types";

export type TemplateEntry = {
  /** Stable id, referenced by dispatch callers and by the suppression logs. */
  id: string;
  channel: Channel;
  audience: Audience;
  /** Inngest event (or other trigger) that causes this body to be sent. */
  triggerEvent: string;
  /**
   * The authored body, imported from the module that owns the copy. Held here so
   * the approval packet and the registry cannot drift from what actually sends;
   * never re-authored in this file.
   */
  body: string;
  /** Which env var arms live sending for this template's stream. */
  liveSendFlag: LiveSendFlag;
  approved: boolean;
  /** Who approved the copy. null while unapproved. */
  approvedBy: string | null;
  /** ISO-8601 date of approval. null while unapproved. */
  approvedAt: string | null;
};

export type TemplateRegistry = ReadonlyMap<string, TemplateEntry>;

export function buildRegistry(entries: readonly TemplateEntry[]): TemplateRegistry {
  const map = new Map<string, TemplateEntry>();
  for (const e of entries) {
    if (map.has(e.id)) {
      throw new Error(`notify/registry: duplicate template id ${JSON.stringify(e.id)}`);
    }
    map.set(e.id, e);
  }
  return map;
}

/**
 * Approval decision for one dispatch. Returns the entry only when it is
 * registered, approved, and the requested channel matches what was approved —
 * approving an SMS body must not implicitly approve an email of the same id.
 */
export function resolveApproved(
  registry: TemplateRegistry,
  templateId: string,
  channel: Channel,
): TemplateEntry | null {
  const entry = registry.get(templateId);
  if (!entry) return null;
  if (entry.channel !== channel) return null;
  if (!entry.approved) return null;
  return entry;
}

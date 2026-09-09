import "server-only";
import { auditLog, type DbTx } from "@osteojp/db";

export type AppointmentAuditAction =
  | "appointment.create"
  | "appointment.update"
  | "appointment.reschedule"
  | "appointment.cancel"
  | "appointment.hard_delete";

/**
 * THE METADATA CONTRACT, ENFORCED RATHER THAN DOCUMENTED.
 *
 * The doc comment below has said "ids, status and ISO timestamps only - never
 * patient PII" since this helper was written, and `cancelAppointment` wrote a
 * free-text `reason` into it the whole time. Worse than a typed reason: the
 * agenda drawer passes the appointment's OWN `notes` field as that argument, so
 * an existing clinical note was copied verbatim into `audit_log` on every
 * cancel taken from the agenda.
 *
 * `audit_log` IS APPEND-ONLY AND RETAINED FOR EVER, so a contract kept only in
 * prose is not kept at all: nothing failed, nothing warned, and the row is not
 * editable afterwards. `clinical/records.ts` had the same shaped decision and
 * took the other branch - `metadata: { hadReason: Boolean(trimmed) }` - which is
 * why the fix here is to make the CONTRACT the thing that refuses, not to patch
 * one call site and leave the next one to remember.
 *
 * WHAT COUNTS AS PROSE, and it is deliberately crude because a clever rule would
 * have to understand the language: any string longer than 64 characters, or any
 * string containing whitespace. Every value the five callers write today is a
 * uuid (36), an ISO instant (24), a status enum, a column name or a slug such as
 * `portal_request_confirm` - none has a space and none is close to 64. A number,
 * a boolean, a null and an array or object of those are all allowed through, so
 * counts and field-name lists keep working.
 *
 * IT THROWS, INSIDE THE CALLER'S TRANSACTION, and that is the intended cost. The
 * alternative - drop the offending key and carry on - is exactly the "map an
 * unknown case onto a harmless-looking one" failure PORTAL-REHYDRATE §1.3 exists
 * to forbid: the mutation would succeed while the trail quietly lost a field.
 * A refusal is loud, is caught by the action's own `fail()` wrapper, and rolls
 * the mutation back rather than committing a row that breaks the contract.
 *
 * THE MESSAGE NAMES THE KEY AND NEVER THE VALUE. This error travels to logs and
 * to Sentry, so quoting the offending string to explain why it is PII would put
 * the PII in two more places.
 */
const AUDIT_STRING_MAX = 64;

export class AuditMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditMetadataError";
  }
}

function refuse(path: string, why: string): never {
  throw new AuditMetadataError(
    `audit metadata "${path}" ${why}. audit_log carries ids, enums, counts and ISO ` +
      `timestamps only - never free text (CLAUDE.md rule 7). Record a boolean and a ` +
      `reference instead, as clinical/records.ts does with hadReason. ` +
      `The value is deliberately not quoted here.`,
  );
}

function assertAuditValue(path: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    if (value.length > AUDIT_STRING_MAX) {
      refuse(path, `is ${value.length} characters, over the ${AUDIT_STRING_MAX} allowed`);
    }
    if (/\s/.test(value)) refuse(path, "contains whitespace, which makes it prose and not an identifier");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertAuditValue(`${path}[${i}]`, v));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertAuditValue(`${path}.${k}`, v);
    }
    return;
  }
  refuse(path, `is a ${typeof value}, which has no place in an audit row`);
}

/**
 * Refuse any audit metadata that carries free text. Exported so the SQL sweep in
 * `scripts/audit-free-text-count.sql` and this rule can be read side by side:
 * both ask the same two questions of every string, so the count the owner runs
 * against production is the count of rows this guard would now reject.
 */
export function assertPiiFreeAuditMetadata(metadata: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(metadata)) assertAuditValue(key, value);
}

/**
 * Append an audit row for an appointment mutation. MUST be called inside the
 * same tenant-scoped tx as the mutation it records, so the two commit or roll
 * back together (hard requirement: audit on every clinical/permission-sensitive
 * mutation).
 *
 * `metadata` carries IDs, status and ISO timestamps only — never patient PII
 * (names, contacts, clinical notes). ENFORCED above; read that comment before
 * adding a key.
 */
export async function writeAppointmentAudit(
  tx: DbTx,
  args: {
    tenantId: string;
    // Non-null: every appointment mutation records its actor (ctx.userId).
    actorUserId: string;
    action: AppointmentAuditAction;
    appointmentId: string;
    metadata: Record<string, unknown>;
    ip: string | null;
  },
): Promise<void> {
  assertPiiFreeAuditMetadata(args.metadata);
  await tx.insert(auditLog).values({
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    action: args.action,
    entityType: "appointment",
    entityId: args.appointmentId,
    metadata: args.metadata,
    ip: args.ip,
  });
}

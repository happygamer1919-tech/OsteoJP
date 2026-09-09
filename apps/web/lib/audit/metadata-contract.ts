import "server-only";

/**
 * THE audit_log METADATA CONTRACT, IN ONE PLACE, ENFORCED BY EVERY WRITER THAT
 * SHARES IT.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS AND WHY IT IS NOT IN scheduling/
 * ==========================================================================
 * FOUR helper functions append to `audit_log`, and until now all four stated
 * the same rule in a DOC COMMENT and three of them enforced nothing:
 *
 *   lib/scheduling/audit.ts  "IDs, status and ISO timestamps only - never
 *                             patient PII (names, contacts, clinical notes)"
 *   lib/admin/audit.ts       "PII-free by contract: changed field NAMES, role
 *                             slugs and ids - never raw values like email/NIF"
 *   lib/clinical/audit.ts    "ids / status / ISO timestamps only - never
 *                             clinical content or patient PII"
 *   lib/patients/audit.ts    "only ids, counts, and changed-field NAMES"
 *
 * #1226 enforced it on the SCHEDULING helper alone, after finding that
 * `cancelAppointment` had written a free-text reason into the log for months -
 * sourced from the agenda drawer's `form.notes`, i.e. an existing clinical note
 * about a named patient, into a table that is append-only and retained for ever.
 *
 * THAT FIX LEFT THE SAME HOLE IN THREE OTHER HELPERS, which is the defect this
 * file closes. `lib/admin/audit.ts` is the one a pacote switch will call: PACK-06
 * ruled that reception types an amount AND A REASON, and the reason is prose
 * typed at a front desk about one patient's money. Routing that through a helper
 * whose contract is a comment is precisely how the first violation happened.
 *
 * A CONTRACT STATED IN A COMMENT IS NOT A CONTRACT. It is a note to whoever
 * reads the file, and the caller who breaks it is by definition the one who did
 * not.
 *
 * ==========================================================================
 * WHAT COUNTS AS PROSE, AND WHY THE RULE IS DELIBERATELY CRUDE
 * ==========================================================================
 * Any string longer than 64 characters, or containing ANY whitespace. A cleverer
 * rule would have to understand the language, and the only thing worse than a
 * crude guard here is one that is confident and wrong.
 *
 * It fits every value the shared helpers write today: uuids (36), ISO instants
 * (24), status enums, column names, role slugs, hex colours, mime types and
 * slugs such as `portal_request_confirm`. None has a space; none is near 64.
 * Numbers, booleans, nulls, and arrays or objects of those pass untouched, so
 * counts and field-name lists keep working.
 *
 * ==========================================================================
 * WHAT IT DOES NOT COVER, STATED SO THE GAP IS KNOWN RATHER THAN ASSUMED
 * ==========================================================================
 * SEVEN MODULES INSERT INTO `audit_log` DIRECTLY, without going through any
 * helper, and this guard cannot see them: reminders/messaging-check.ts,
 * reminders/inbound-store.ts, reminders/confirm-redeem.ts,
 * reminders/inbound-reply.ts, integrations/ifthenpay/ledger-drizzle.ts,
 * apps/admin/lib/tenants.ts and packages/db/src/provision.ts.
 *
 * SIX OF THE SEVEN WRITE ONLY IDS, ENUMS, COUNTS AND HASHES - checked, not
 * assumed. THE SEVENTH IS A DELIBERATE, DOCUMENTED EXCEPTION AND IT IS THE
 * REASON THIS GUARD LIVES IN THE HELPERS RATHER THAN AT THE TABLE:
 *
 *   `reminders/messaging-check.ts` writes `metadata.failure` - THE PROVIDER'S
 *   OWN ERROR MESSAGE, trimmed to 300 characters. Twilio's wording is the whole
 *   diagnostic value of that page ("is not a valid phone number", "is not
 *   currently reachable"), its own comment reasons about it, and it contains no
 *   patient field: the only interpolated value is the provider's message. It is
 *   free text and it is NOT patient PII, and those are different things.
 *
 * A guard at the table level would refuse it and break the owner's messaging
 * diagnostic. So the boundary is the shared helper, and the exception is named
 * here instead of being discovered later as a mystery. It is also what a
 * non-zero result from `scripts/audit-free-text-count.sql` will mostly contain.
 */

const AUDIT_STRING_MAX = 64;

export class AuditMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditMetadataError";
  }
}

function refuse(where: string, path: string, why: string): never {
  throw new AuditMetadataError(
    `audit metadata "${path}" (${where}) ${why}. audit_log carries ids, enums, counts and ` +
      `ISO timestamps only - never free text (CLAUDE.md rule 7). Record a boolean and a ` +
      `reference instead, as clinical/records.ts does with hadReason, and put the prose in a ` +
      `domain column. The value is deliberately not quoted here.`,
  );
}

function assertAuditValue(where: string, path: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    if (value.length > AUDIT_STRING_MAX) {
      refuse(where, path, `is ${value.length} characters, over the ${AUDIT_STRING_MAX} allowed`);
    }
    if (/\s/.test(value)) {
      refuse(where, path, "contains whitespace, which makes it prose and not an identifier");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertAuditValue(where, `${path}[${i}]`, v));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertAuditValue(where, `${path}.${k}`, v);
    }
    return;
  }
  refuse(where, path, `is a ${typeof value}, which has no place in an audit row`);
}

/**
 * Refuse any audit metadata that carries free text.
 *
 * IT THROWS, INSIDE THE CALLER'S TRANSACTION, and that is the intended cost. The
 * alternative - drop the offending key and carry on - is exactly the "map an
 * unknown case onto a known, harmless-looking one" failure PORTAL-REHYDRATE §1.3
 * forbids: the mutation would succeed while the trail quietly lost a field. A
 * refusal is loud, is caught by the action's own error wrapper, and rolls the
 * mutation back rather than committing a row that breaks the contract.
 *
 * THE MESSAGE NAMES THE KEY AND NEVER QUOTES THE VALUE. It travels to logs and
 * to Sentry, so quoting the offending string to explain why it is PII would put
 * the PII in two more places than it started in.
 *
 * @param where which helper is writing, so a refusal names the writer as well as
 *              the key. Four helpers share this function and the stack alone
 *              does not say which contract was broken.
 */
export function assertPiiFreeAuditMetadata(
  metadata: Record<string, unknown>,
  where: string,
): void {
  for (const [key, value] of Object.entries(metadata)) assertAuditValue(where, key, value);
}

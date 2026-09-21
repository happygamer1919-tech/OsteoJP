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
 * (24), status enums, column names, role slugs, hex colours and slugs such as
 * `portal_request_confirm`. None has a space; none is near 64. Numbers,
 * booleans, nulls, and arrays or objects of those pass untouched, so counts and
 * field-name lists keep working.
 *
 * THIS LIST USED TO SAY "mime types", AND THAT WAS WRONG (H5). A media type is
 * not a short slug: the office ones run to 73 characters, the .docx type the
 * patient Documentos picker advertises is 71, and one carrying a parameter
 * contains a space. So the claim that they sit "nowhere near 64" was false, and
 * it is retracted here rather than quietly edited.
 *
 * The conclusion is NOT to widen the contract. A media type has a domain column
 * of its own — `attachments.mime_type`, reachable from the audit row by
 * `entity_id` — so raising the limit or exempting a key would loosen a crude PII
 * guard to carry a value that is already stored somewhere better, which is the
 * exact thing the refusal message tells callers not to do. It is now refused BY
 * SHAPE, in the section below.
 *
 * ==========================================================================
 * A MEDIA TYPE IS REFUSED BY SHAPE, NOT BY KEY NAME (H5)
 * ==========================================================================
 * `mimeType` is one spelling. `mime`, `contentType`, `type`, and a `...input`
 * spread that carries any of them are the others, and a rule written against one
 * identifier is a rule about that identifier rather than about the value. So the
 * refusal reads the VALUE: a string shaped `<registered top-level type>/<subtype>`
 * is refused whatever key it arrives under and whatever its length.
 *
 * THE TOP-LEVEL SET IS CLOSED ON PURPOSE: these ten tokens, which is what keeps
 * this from refusing ordinary slugs. A value is only a media type if it is
 * `application/…`, `audio/…`, `example/…`, `font/…`, `image/…`, `message/…`,
 * `model/…`, `multipart/…`, `text/…` or `video/…`. No enum, id, column name,
 * role slug or hex colour this codebase writes has that shape. The list is
 * maintained here and is not a mirror of any external registry; a test arm
 * asserts that this count and the regex's own alternatives cannot drift apart.
 *
 * IT RUNS AT THE WRITE, ON THE VALUE, which is why it holds where a source scan
 * cannot: a caller that builds its metadata in a helper function, a ternary or a
 * spread is checked exactly like a caller that inlines an object literal.
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

/**
 * A media type, by shape: one of the top-level types listed below, a slash, and
 * a subtype. An optional parameter tail (`; charset=utf-8`) is matched too, so
 * the refusal names the right reason rather than falling through to the
 * whitespace rule.
 *
 * The top-level set is closed on purpose. `^[a-z]+\/[a-z]+$` would refuse any
 * value that happens to contain a slash; these ten tokens are the whole set, and
 * no enum, id, column name, role slug or path fragment written to audit_log
 * begins with one of them followed by a slash.
 */
const MEDIA_TYPE =
  /^(application|audio|example|font|image|message|model|multipart|text|video)\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*(\s*;.*)?$/i;

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
    // BEFORE the length rule, so the message names the real reason: a short
    // media type such as `image/png` passes both other rules and still does not
    // belong here.
    if (MEDIA_TYPE.test(value)) {
      refuse(
        where,
        path,
        "is shaped like a media type, which belongs on the domain column that " +
          "holds it (attachments.mime_type) and not in an audit row",
      );
    }
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

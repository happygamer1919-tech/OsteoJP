const PG_FOREIGN_KEY_VIOLATION = "23503";

/** How far down the `cause` chain the walk goes. A chain that points back at itself stops here. */
const MAX_CAUSE_DEPTH = 8;

/**
 * Postgres 23503 foreign_key_violation, wherever the driver puts it.
 *
 * Drizzle wraps every driver failure in a `DrizzleQueryError` that carries no
 * `code` of its own; the `PostgresError` holding the SQLSTATE sits at `.cause`
 * (`sanitizeImportError` in packages/db/src/migration/upsert.ts reads it the
 * same way). So the walk goes down the `cause` chain, and the first layer that
 * carries a string `code` is the one that answers: a wrapper with a SQLSTATE of
 * its own is not looked behind.
 *
 * ONLY THE SQLSTATE IS READ. The message and the DETAIL of a foreign-key
 * refusal embed the key value, and nothing here hands them on (rule 7).
 */
export function isForeignKeyViolation(err: unknown): boolean {
  let cursor: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof cursor !== "object" || cursor === null) return false;
    const layer = cursor as { code?: unknown; cause?: unknown };
    if (typeof layer.code === "string") return layer.code === PG_FOREIGN_KEY_VIOLATION;
    cursor = layer.cause;
  }
  return false;
}

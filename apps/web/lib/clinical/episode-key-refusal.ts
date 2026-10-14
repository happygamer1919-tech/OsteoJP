/**
 * REG-03: the database's own refusal of a registo's episode, recognised by the
 * two fields that identify it and by nothing else.
 *
 * A registo is filed only in an episode of the same patient, in the same
 * tenant. `assertEpisodeIsThePatients` (records.ts) asks that before a registo
 * is written and refuses with `episode_mismatch`. Where the database carries
 * the foreign key named below, it refuses a write that breaks the same rule
 * with a foreign-key violation (SQLSTATE 23503) that names the key, and the
 * writers answer that with the same refusal the application already returns.
 * On a database that does not carry the key nothing raises this, and nothing
 * here matches.
 *
 * MATCHES ON THE SQLSTATE AND ON THE CONSTRAINT NAME, never on the message
 * text: the message is locale- and version-dependent, and it embeds row
 * values. Both are checked because 23503 belongs to every foreign key of the
 * table: a form template that does not exist is not an episode mismatch, and
 * answering it as one would send the therapist to the wrong field.
 *
 * THE CAUSE CHAIN IS WALKED BECAUSE THE ERROR ARRIVES WRAPPED. Drizzle raises
 * its own `Failed query` error, which carries neither field, and hangs the
 * driver's error off `.cause` (pinned against the real driver in
 * records.episode-guard.db.test.ts). `constraint_name` (postgres.js) and
 * `constraint` (node-postgres) are both read: the driver is a dependency, not
 * a contract. The depth cap and the `seen` set keep a self-referencing `cause`
 * from spinning. The same shape as `isDoubleConfirmedViolation` in
 * lib/scheduling/actions.ts.
 */

/** Postgres `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = "23503";

/** The foreign key, by name, whose refusal the registo writers answer as `episode_mismatch`. */
export const EPISODE_PATIENT_TENANT_KEY = "clinical_records_episode_patient_tenant_fk";

/**
 * The name of the foreign key that refused a write: read from the first layer
 * of the error chain that carries BOTH a foreign-key violation and a
 * constraint name. `null` when no layer carries the two together.
 */
export function refusingForeignKey(e: unknown): string | null {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  for (let depth = 0; cur && typeof cur === "object" && depth < 4; depth++) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    if (o.code === FOREIGN_KEY_VIOLATION) {
      const name = o.constraint_name ?? o.constraint;
      if (typeof name === "string" && name !== "") return name;
    }
    cur = o.cause;
  }
  return null;
}

/** Was this write refused by the key named above? */
export function isEpisodeKeyRefusal(e: unknown): boolean {
  return refusingForeignKey(e) === EPISODE_PATIENT_TENANT_KEY;
}

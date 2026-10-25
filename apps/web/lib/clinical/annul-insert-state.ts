/**
 * TEST SUPPORT, imported only by the apps/web DB-gated suites (never by the app).
 *
 * THE record_annulments INSERT POLICY (0107): WHICH EXPRESSION THE DATABASE
 * UNDER TEST HOLDS, read from the catalogue and never assumed, and whether the
 * repository says which one it must hold. The same question, asked the same
 * way, as packages/db/tests/record-annulments-insert-state.ts asks for the
 * suites of that package.
 *
 * The migration is packages/db/migrations/0107_record_annulments_insert_
 * policy.sql, promoted from packages/db/migrations-pending with no byte
 * changed: ONE statement, an ALTER
 * POLICY that sets the WITH CHECK of record_annulments_tenant_insert. The
 * database holds 0035's expression or the ruled expression.
 *   1. NEVER A THIRD EXPRESSION. The ruled expression is recognised by five
 *      terms. All five, or none; anything else THROWS.
 *   2. THE PROMOTION DECIDES. Once a .sql file in packages/db/migrations alters
 *      the policy, a database without the ruled expression THROWS.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql, type SQL } from "drizzle-orm";

type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

export type AnnulInsertState = {
  /** The INSERT policy holds the ruled expression. */
  applied: boolean;
  /** A file in packages/db/migrations alters the policy. */
  promoted: boolean;
  /** For a test title: which expression this database holds. */
  side: string;
};

/** The statement only this migration holds. */
const MARKER = 'ALTER POLICY "record_annulments_tenant_insert"';
const INSERT_POLICY = "record_annulments_tenant_insert";
/** The five terms the ruled expression is recognised by, as Postgres renders them. */
const RULED_TERMS = [
  "annulled_by_user_id",
  "'signed'",
  "practitioner_id",
  "jwt_role()",
  "clinical_therapist_sees_patient(r.patient_id)",
];

const SIDE_PRESENT = "ruled expression present";
const SIDE_ABSENT = "ruled expression absent";

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "packages", "db", "migrations");

/** The promoted migration files that alter the INSERT policy, if any. */
export function promotedFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(MIGRATIONS, f), "utf8").includes(MARKER));
}

const rowsOf = (r: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;

/** Which of the two expressions this database holds. Throws on anything else. */
export async function annulInsertState(db: SqlExecutor): Promise<AnnulInsertState> {
  const [row] = rowsOf(
    await db.execute(sql`
      select pg_get_expr(p.polwithcheck, p.polrelid) as chk
        from pg_policy p
       where p.polrelid = 'public.record_annulments'::regclass
         and p.polname = ${INSERT_POLICY}
         and p.polcmd = 'a'
    `),
  );
  const check = typeof row?.chk === "string" ? row.chk : null;
  if (!check) {
    throw new Error(
      `ANNULMENT INSERT POLICY UNREADABLE: public.record_annulments carries no ${INSERT_POLICY} with a WITH CHECK. ` +
        "Nothing was checked.",
    );
  }
  const n = RULED_TERMS.filter((term) => check.includes(term)).length;
  let applied: boolean;
  if (n === RULED_TERMS.length) applied = true;
  else if (n === 0) applied = false;
  else {
    throw new Error(
      `ANNULMENT INSERT POLICY IS NEITHER EXPRESSION: ${n} of ${RULED_TERMS.length} ruled terms present ` +
        `(${RULED_TERMS.join(", ")}). The migration is one statement, so this database was built some other way. ` +
        "No arm can be asserted.",
    );
  }
  const files = promotedFiles();
  if (files.length > 0 && !applied) {
    throw new Error(
      `THE ANNULMENT INSERT POLICY IS PROMOTED (${files.join(", ")} alters ${INSERT_POLICY}) BUT THIS DATABASE DOES ` +
        "NOT HAVE IT. From the promotion on, the ruled expression is the only one accepted.",
    );
  }
  return {
    applied,
    promoted: files.length > 0,
    side: applied ? SIDE_PRESENT : SIDE_ABSENT,
  };
}

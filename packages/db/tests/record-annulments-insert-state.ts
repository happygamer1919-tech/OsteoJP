/**
 * TEST SUPPORT, imported only by the packages/db DB-gated suites.
 *
 * THE record_annulments INSERT POLICY (0107): WHICH EXPRESSION THE DATABASE
 * UNDER TEST HOLDS, read from the catalogue and never assumed, and whether the
 * repository says which one it must hold.
 *
 * The migration is packages/db/migrations/0107_record_annulments_insert_
 * policy.sql, promoted from packages/db/migrations-pending with no byte
 * changed. It is ONE statement, an
 * ALTER POLICY that sets the WITH CHECK of record_annulments_tenant_insert, so
 * the database holds one of two expressions: 0035's expression, or the ruled
 * expression (the migration's header states it). A suite reads this state to
 * decide which of its arms run:
 *   1. NEVER A THIRD EXPRESSION. The ruled expression is recognised by five
 *      terms (annulled_by_user_id, the registo's status, its author, the
 *      caller's role, the therapist of the registo's patient). All five, or
 *      none; anything else THROWS, and nothing is measured.
 *   2. THE PROMOTION DECIDES. Once a .sql file in packages/db/migrations alters
 *      the policy, a database without the ruled expression THROWS: from the
 *      promotion commit on, every arm runs.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, live } from "./rls-harness";

/** The statement only this migration holds. */
const MARKER = 'ALTER POLICY "record_annulments_tenant_insert"';

export const INSERT_POLICY = "record_annulments_tenant_insert";

const SIDE_PRESENT = "ruled expression present";
const SIDE_ABSENT = "ruled expression absent";

/** The five terms the ruled expression is recognised by, as Postgres renders them. */
export const RULED_TERMS = [
  "annulled_by_user_id",
  "'signed'",
  "practitioner_id",
  "jwt_role()",
  "clinical_therapist_sees_patient(r.patient_id)",
] as const;

export type AnnulmentInsertState = {
  /** The INSERT policy holds the ruled expression. */
  applied: boolean;
  /** A file in packages/db/migrations alters the policy. */
  promoted: boolean;
  /** For a test title: which expression this database holds. */
  side: string;
};

/** The promoted migration files that alter the INSERT policy, if any. */
export function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(MARKER));
}

/** Which of the two expressions `check` is. Throws on anything else. */
export function sideOf(check: string | null | undefined, files: string[]): AnnulmentInsertState {
  if (!check) {
    throw new Error(
      `ANNULMENT INSERT POLICY UNREADABLE: public.record_annulments carries no ${INSERT_POLICY} with a WITH CHECK. ` +
        "Nothing here was measured.",
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
        "Nothing here was measured.",
    );
  }
  if (files.length > 0 && !applied) {
    throw new Error(
      `THE ANNULMENT INSERT POLICY IS PROMOTED (${files.join(", ")} alters ${INSERT_POLICY}) BUT THIS DATABASE DOES ` +
        "NOT HAVE IT. From the promotion on, the ruled expression is the only one accepted. Nothing here was measured.",
    );
  }
  return {
    applied,
    promoted: files.length > 0,
    side: applied ? SIDE_PRESENT : SIDE_ABSENT,
  };
}

/**
 * The title of an arm that needs the ruled expression: its id and what it
 * asserts where it runs, its id alone where it does not.
 */
export const ruledTitle = (state: AnnulmentInsertState, id: string, what: string): string =>
  state.applied ? `${id}: ${what}` : `${id}: ${SIDE_ABSENT}, arm not run`;

/** Which of the two expressions this database holds. */
export async function annulmentInsertState(): Promise<AnnulmentInsertState> {
  if (!live) return { applied: false, promoted: false, side: "no database" };
  const probe = connect();
  try {
    const rows = await probe<{ chk: string | null }[]>`
      select pg_get_expr(p.polwithcheck, p.polrelid) as chk
        from pg_policy p
       where p.polrelid = 'public.record_annulments'::regclass
         and p.polname = ${INSERT_POLICY}
         and p.polcmd = 'a'`;
    return sideOf(rows[0]?.chk, promotedFiles());
  } finally {
    await probe.end({ timeout: 5 });
  }
}

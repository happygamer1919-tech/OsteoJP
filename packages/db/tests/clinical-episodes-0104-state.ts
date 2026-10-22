/**
 * TEST SUPPORT, imported only by the packages/db DB-gated suites.
 *
 * 0104 (held): WHICH SIDE OF IT THE DATABASE UNDER TEST IS ON, read from the
 * catalogue and never assumed, and whether the repository says it must have it.
 *
 * The migration is packages/db/migrations-pending/NEXT-AFTER-0103_clinical_
 * episodes_role_matrix.sql until it is promoted. A suite that reads this state
 * names the side in its titles, runs the arms 0104 adds only on a database
 * that has it, and runs the arms that hold on either side on both:
 *   1. NEVER HALF. 0104 is one transaction with five effects on
 *      clinical_episodes: the FOR ALL staff policy is gone, the three policies
 *      (SELECT, INSERT, UPDATE, each TO authenticated) are there, and
 *      `authenticated` holds no DELETE. All five, or none; anything else
 *      THROWS, and nothing is measured.
 *   2. THE PROMOTION FLIPS IT. Once a .sql file in packages/db/migrations
 *      creates clinical_episodes_select, a database WITHOUT 0104 THROWS: from
 *      the promotion commit on, the 0104 arms cannot be skipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, live } from "./rls-harness";

/** The statement only 0104 holds. */
const MARKER = 'CREATE POLICY "clinical_episodes_select"';

export type Episodes0104State = {
  /** All five effects of 0104 are in the catalogue. */
  applied: boolean;
  /** A file in packages/db/migrations holds 0104's statements. */
  promoted: boolean;
  /** For a test title: which side this database is on. */
  side: string;
};

/** The promoted migration files that create 0104's read policy, if any. */
export function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(MARKER));
}

/** Which side of 0104 this database is on. Throws on anything but a whole side. */
export async function episodes0104State(): Promise<Episodes0104State> {
  if (!live) return { applied: false, promoted: false, side: "no database" };
  const probe = connect();
  try {
    const rows = await probe<{ polname: string; cmd: string; to_roles: string }[]>`
      select p.polname::text as polname, p.polcmd::text as cmd,
             coalesce(array_to_string(array(select pg_get_userbyid(r) from unnest(p.polroles) r order by 1), ','), '') as to_roles
        from pg_policy p
       where p.polrelid = 'public.clinical_episodes'::regclass`;
    const [grant] = await probe<{ del: boolean }[]>`
      select has_table_privilege('authenticated', 'public.clinical_episodes', 'DELETE') as del`;
    if (rows.length === 0 || grant === undefined) {
      throw new Error(
        "0104 STATE UNREADABLE: public.clinical_episodes carries no policy at all, or its privileges could not be read. " +
          "Nothing here was measured.",
      );
    }
    const has = (name: string, cmd: string) =>
      rows.some((r) => r.polname === name && r.cmd === cmd && r.to_roles === "authenticated");
    const parts = [
      !rows.some((r) => r.polname === "clinical_episodes_tenant_isolation"),
      has("clinical_episodes_select", "r"),
      has("clinical_episodes_insert", "a"),
      has("clinical_episodes_update", "w"),
      grant.del === false,
    ];
    const n = parts.filter(Boolean).length;
    let applied: boolean;
    if (n === 5) applied = true;
    else if (n === 0) applied = false;
    else {
      throw new Error(
        `0104 IS HALF APPLIED: ${n} of 5 parts present (the FOR ALL staff policy gone, the SELECT policy, the INSERT ` +
          "policy, the UPDATE policy, DELETE revoked from authenticated). 0104 applies as one transaction, so this " +
          "database was built some other way. Nothing here was measured.",
      );
    }
    const files = promotedFiles();
    if (files.length > 0 && !applied) {
      throw new Error(
        `0104 IS PROMOTED (${files.join(", ")} creates clinical_episodes_select) BUT THIS DATABASE DOES NOT HAVE IT. ` +
          "From the promotion on, the pre-0104 answer is no longer acceptable. Nothing here was measured.",
      );
    }
    return {
      applied,
      promoted: files.length > 0,
      side: applied ? "0104 APPLIED" : "0104 NOT APPLIED on this database (flips when 0104 is applied)",
    };
  } finally {
    await probe.end({ timeout: 5 });
  }
}

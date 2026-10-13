/**
 * TEST SUPPORT, imported only by the apps/web DB-gated suites (never by the app).
 *
 * REG-03: WHETHER THE DATABASE UNDER TEST CARRIES THE EPISODE KEY
 * (`EPISODE_PATIENT_TENANT_KEY`, episode-key-refusal.ts), read from the
 * catalogue and never assumed, and whether the repository says it must.
 *
 * The arms that read this assert WHICHEVER REFUSAL THE DATABASE OWES, the way
 * care-team-0098-state.ts has its arms do, and never skip (the skip-guard,
 * .github/scripts/assert-rls-executed.mjs, reddens any test that did not run):
 * where the database carries the key they read the database's refusal, by
 * SQLSTATE and by name; where it does not they read the application's
 * (`assertEpisodeIsThePatients`). Each suite prints `detail` once and carries a
 * test that names the side it ran on.
 *
 *   1. NEVER HALF. A constraint of that name that is not a validated foreign
 *      key from clinical_records to clinical_episodes is neither side, and this
 *      THROWS: every arm fails.
 *   2. THE PROMOTION FLIPS IT BY ITSELF. Once any .sql file in
 *      packages/db/migrations names the key, a database WITHOUT it is no longer
 *      an acceptable answer: this THROWS. Nobody has to remember to edit an arm
 *      for the check to become strict.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { EPISODE_PATIENT_TENANT_KEY } from "./episode-key-refusal";

type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

export type EpisodeKeyState = {
  /** The database carries the key, whole. */
  carried: boolean;
  /** A file in packages/db/migrations names the key. */
  promoted: boolean;
  /** One line for the log and the report: which side the arms asserted. */
  detail: string;
};

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "packages", "db", "migrations");

/** The promoted migration files that name the key, if any. */
export function promotedFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(MIGRATIONS, f), "utf8").includes(EPISODE_PATIENT_TENANT_KEY));
}

const rowsOf = (r: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;

export async function episodeKeyState(db: SqlExecutor): Promise<EpisodeKeyState> {
  const rows = rowsOf(
    await db.execute(sql`
      select c.contype::text as contype, c.convalidated as validated, c.confrelid::regclass::text as referenced
        from pg_constraint c
       where c.conrelid = 'public.clinical_records'::regclass
         and c.conname = ${EPISODE_PATIENT_TENANT_KEY}
    `),
  );
  if (rows.length > 1) {
    throw new Error(`EPISODE KEY STATE UNREADABLE: ${rows.length} constraints named ${EPISODE_PATIENT_TENANT_KEY}. Nothing was checked.`);
  }
  const found = rows[0];
  const whole =
    found !== undefined &&
    found.contype === "f" &&
    found.validated === true &&
    /^(public\.)?clinical_episodes$/.test(String(found.referenced));
  if (found !== undefined && !whole) {
    throw new Error(
      `THE EPISODE KEY IS HALF THERE: ${EPISODE_PATIENT_TENANT_KEY} exists and is not a validated foreign key to ` +
        `clinical_episodes (type ${String(found.contype)}, validated ${String(found.validated)}, references ` +
        `${String(found.referenced)}). That is neither side; no arm can be asserted.`,
    );
  }
  const files = promotedFiles();
  const promoted = files.length > 0;
  if (promoted && !whole) {
    throw new Error(
      `THE EPISODE KEY IS PROMOTED (${files.join(", ")} names ${EPISODE_PATIENT_TENANT_KEY}) BUT THIS DATABASE DOES NOT ` +
        "CARRY IT. From the promotion on, a database without it is no longer an acceptable answer.",
    );
  }
  const detail = whole
    ? `THE DATABASE CARRIES ${EPISODE_PATIENT_TENANT_KEY}: the arms read the database's refusal, by SQLSTATE and by name.` +
      (promoted ? ` Promoted as ${files.join(", ")}.` : "")
    : `THE DATABASE DOES NOT CARRY ${EPISODE_PATIENT_TENANT_KEY}, and no promoted migration names it: the arms read the ` +
      "application's refusal. This run says nothing about the key itself.";
  return { carried: whole, promoted, detail };
}

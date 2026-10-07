// 0102 (SAT-01's tables, doors, switch audit and policies): the migration, its two check files and
// its apply document agree with each other, byte for byte where it matters; every halt in the
// document's four blocks is explicit, proven by fault injection; and the document's clock is the
// weekday table.
//
// WHAT THIS PROVES, statically, with no database:
//   * the migration stands in EXACTLY ONE place, parked in migrations-pending or promoted to
//     0102, and its bytes are the pinned sha256 either way (the promotion is a rename, so this test
//     needs no edit when it happens);
//   * the migration's SHAPE, one rule at a time, each with an input only it refuses: the three
//     SET LOCAL lines first (the two bounds of R10, then idle_in_transaction_session_timeout at 15 s,
//     strategy's ruling of 2026-10-06, Q5 of S-1006-A) and nothing later naming a bound or
//     controlling the transaction;
//     no DELETE FROM, TRUNCATE, DROP, COPY or MERGE anywhere, and no INSERT, UPDATE or DELETE
//     statement outside a function body; ON DELETE CASCADE on exactly the two named references and
//     on nothing that holds an answer (O6 (a)); exactly the seven ALTER TABLE statements, the eight late
//     foreign keys folded into three of them, one per new table, clause for clause; exactly the
//     nine GRANTs and the twelve REVOKEs, and nothing to anon, PUBLIC or service_role; every
//     function owned by postgres with search_path = public, SECURITY DEFINER on eight and not on
//     the private helper; R34's ONE trigger, to the token (AFTER UPDATE of any column, per row,
//     WHEN the value changed); exactly two policies, both AS PERMISSIVE FOR SELECT TO authenticated;
//     and R39: THE TWO CREATE POLICY STATEMENTS ARE THE LAST TWO STATEMENTS OF THE FILE;
//   * the post-check's nine function-body md5 pins are the md5 of the bodies in the migration
//     file, with the same SECURITY DEFINER flags, volatilities and door grants; R32's fifth reason
//     stands in the helper the state and the door share;
//   * the pre-check and the post-check compare the journal with the pinned sha256 in code; they
//     write nothing (the post-check's only SET lines are the probes' SET LOCAL ROLE and RESET
//     ROLE) and read patients and appointments through counts alone; both read a NULL relacl as
//     acldefault() of its own object type; the verdict counts the blocks require are the counts
//     the files print (16 and 27); and R39's read of supautils.policy_grants is made once, cannot
//     fail the file, and is printed as INFO, never as a verdict;
//   * every sha256 the document pins is the real file, or the value the build was given and
//     verified, and the sidecar pins the document;
//   * THE CLOCK IS THE WEEKDAY TABLE, in stage 0 and in stage 1, and it can pass only in closed
//     hours: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed, in Lisbon
//     time. R9's proofs 2 and 3 are fixed `no`, nothing can turn either to yes, there is no
//     override arm, and no block carries a date;
//   * EVERY CLOCK READ carries TZ=Europe/Lisbon and reads the zone's name in the same `date` call, and
//     the next line stops unless it is WET or WEST (a zone that cannot be loaded answers UTC's clock, exit
//     0); one test runs the REAL `date` at fixed instants through the blocks' own clock lines;
//   * EVERY STOP THAT CAN FIRE AFTER THE COMMIT (all of stage 2 and of the closing read, and stage 1's
//     after the apply) says that 0102 is applied, that the write stands and that nothing is run again;
//     and the six whose own read can contradict that say the state is UNKNOWN;
//   * two shas are compared only as variables each checked to be 40 hex characters, never inline, and
//     every block asserts the document's sidecar, the closing read included;
//   * every carry stage 2 reads is a row the pre-check prints, and no carry name hides in another;
//   * the blocks carry no `#` line, no `!` but `test !`, no backslash continuation, and never the
//     apply worktree's old place;
//   * EVERY HALT IS EXPLICIT, and a fault-injection harness proves it, as for 0100 and 0101: each
//     block runs in GREEN's tool shape (`true && eval '<block>' < /dev/null && ...`, where zsh
//     ignores errexit) with every external command a stub, each call made to fail in turn; THE
//     WEEKDAY TABLE (the six minutes the ruling names and one green arm, each through stage 0 and
//     stage 1 whole); A ZONE THAT DID NOT LOAD (every block, a clock answering UTC); A RECORD THAT
//     READS EMPTY; A READ THAT CONTRADICTS THE MARKER; THE CLINICS' ROWS; THE WINDOW FEED; the
//     applied marker's age; and the harness's own control. In CI the harness runs under bash with
//     errexit forced off; under zsh wherever zsh is installed
//     (scripts/apply-lane/apply-lane-settings.test.mjs is the convention: zsh is not on the runner).
//
// THE HELD HEAD. 0102 adds SECURITY DEFINER functions, so its count GATE-CHANGE follows its apply
// (strategy R35) and its blocks read the pull request's held head, origin/db/0102-sat01-tables,
// where 0101's read main. Nothing else in the blocks differs from 0101's but names and counts.
//
// THE PREDECESSOR. 0102 follows 0101, which is promoted on main and applied to production
// (2026-10-05, #1538). The harness copies 0101's real file, whose sha256 must be SHAPREV, and its
// journal is the LIVE journal CUT AT ITS PREDECESSOR'S ENTRY with 0102's own appended, so a later
// promotion (0102's own, then 0103 and on) cannot redden this test.
//
// WHAT IT DOES NOT PROVE: that any of it runs against a database. That is the DB-gated suite
// packages/db/tests/sat01-survey-rls.db.test.ts, the build lane's run and the rehearsal
// (docs/migration-apply-0102.md, "Rehearsal").
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const md5 = (s) => createHash("md5").update(s).digest("hex");

const MIGRATION_SHA = "db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1";
const TAG = "0102_sat01_satisfaction_survey";
const PREV_TAG = "0101_guest_request_email";
/** 0101's journal entry as this document pins it, and as main's journal holds it. */
const PREV_ENTRY = Object.freeze({ idx: 98, when: 1788502200000 });
const OWN_ENTRY = Object.freeze({ idx: 99, when: 1788502300000 });
const HELD_REF = "origin/db/0102-sat01-tables";
const PENDING_PATH = "packages/db/migrations-pending/NEXT-AFTER-0101_sat01_satisfaction_survey.sql";
const PROMOTED_PATH = `packages/db/migrations/${TAG}.sql`;
const PREV_PATH = `packages/db/migrations/${PREV_TAG}.sql`;
const JOURNAL = "packages/db/migrations/meta/_journal.json";
const PRE = "scripts/db/precheck-0102-sat01-tables.sql";
const POST = "scripts/db/postcheck-0102-sat01-tables.sql";
const DOC = "docs/migration-apply-0102.md";
const SIDECAR = "docs/migration-apply-0102.sha256";
const GATE_FILE = "scripts/migration-timeouts.test.mjs";

/**
 * The pins of files this branch does not own, as the build was given them and verified them on origin/main.
 * SHAPREV is 0101's promoted file on main; the pins test hashes the real file against it.
 */
export const EXTERNAL_PINS = Object.freeze({
  SHAPREV: "36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b",
  SHAVM: "ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261",
  SHAGUARD: "6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96",
  SHAPTM: "e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c",
  SHAREADER: "825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387",
  SHACJ: "7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59",
});

/** Where the migration stands: exactly one of the two places. */
export function locateMigration(exists) {
  const found = [PENDING_PATH, PROMOTED_PATH].filter((p) => exists(p));
  if (found.length !== 1) {
    throw new Error(`the 0102 migration must stand in exactly one of ${PENDING_PATH} and ${PROMOTED_PATH}; found ${found.length}`);
  }
  return found[0];
}

/** SQL code: block and line comments removed (a `-->` breakpoint stays). */
export const codeOf = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n>][^\n]*/g, "");
/** The statements of the migration's code, split on drizzle's breakpoint, whitespace collapsed. */
export const statementsOf = (sql) =>
  codeOf(sql).split("--> statement-breakpoint").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

/** The nine functions, with what the migration must give each. The last is R34's trigger function. */
export const FUNCTIONS = Object.freeze([
  { name: "survey_manual_verdict", sig: "uuid, uuid, text", secdef: false, door: false },
  { name: "issue_survey_automatic", sig: "text, uuid, uuid, text", secdef: true, door: true },
  { name: "issue_survey_manual", sig: "text, uuid, uuid, text", secdef: true, door: true },
  { name: "survey_send_state", sig: "uuid, uuid", secdef: true, door: true },
  { name: "resolve_survey_code", sig: "text", secdef: true, door: true },
  { name: "submit_survey_response", sig: "text, uuid, integer, integer, text, boolean, text", secdef: true, door: true },
  { name: "opt_out_survey", sig: "text, uuid", secdef: true, door: true },
  { name: "purge_expired_survey_comments", sig: "uuid", secdef: true, door: false },
  { name: "patients_survey_switch_audit", sig: "", secdef: true, door: false },
]);
const TABLES = ["appointment_survey_sends", "appointment_survey_codes", "appointment_survey_responses"];

/** The function bodies: name -> the text between `AS $fn$` and `$fn$;`, exactly as Postgres stores it in prosrc. */
export function bodiesOf(sql) {
  const out = {};
  for (const m of sql.matchAll(/CREATE FUNCTION public\.(\w+)\([\s\S]*?\bAS \$fn\$([\s\S]*?)\$fn\$;/g)) out[m[1]] = m[2];
  return out;
}
/** The code with every function body emptied, so a rule can tell top-level SQL from a door's own. */
const outsideBodies = (sql) => codeOf(sql).replace(/\$fn\$[\s\S]*?\$fn\$/g, "$fn$$fn$");

const sigOf = (f) => `public.${f.name}(${f.sig})`;
const GRANTS_WANTED = [
  "GRANT UPDATE (survey_enabled) ON public.patients TO patient;",
  "GRANT SELECT ON TABLE public.appointment_survey_sends TO authenticated;",
  "GRANT SELECT ON TABLE public.appointment_survey_responses TO authenticated;",
  ...FUNCTIONS.filter((f) => f.door).map((f) => `GRANT EXECUTE ON FUNCTION ${sigOf(f)} TO authenticated;`),
].sort();
const REVOKES_WANTED = [
  ...TABLES.map((t) => `REVOKE ALL ON TABLE public.${t} FROM PUBLIC, anon, authenticated, patient;`),
  ...FUNCTIONS.map((f) => `REVOKE ALL ON FUNCTION ${sigOf(f)} FROM PUBLIC, anon, authenticated, patient, service_role;`),
].sort();
/**
 * THE EIGHT FOREIGN KEYS TO THE TABLES THAT EXISTED BEFORE THIS FILE, FOLDED INTO THREE STATEMENTS, ONE PER NEW TABLE
 * (strategy's ruling of 2026-10-06, Q5 of S-1006-A; ruling R44's re-pin). Each ALTER TABLE adds every foreign key of its table
 * in one statement, with comma-separated ADD CONSTRAINT clauses. THE ONE ORDER: the sends first, its clauses naming
 * appointments, then tenants, then users, then patients (whose lock is already held by the column's ALTER TABLE, which stands
 * before all three); then the codes; then the answers. Postgres takes a statement's locks in the order of its clauses
 * (measured: the apply document's "G6"), so the first statement takes all three new locks and the two after it take none. They
 * are not written in the three CREATE TABLE statements, so that nothing before the final group locks an existing table. Each
 * name is the one the inline form gives: <table>_<column>_fkey.
 */
const lateClause = (t, c, ref, tail = "") => `ADD CONSTRAINT ${t}_${c}_fkey FOREIGN KEY (${c}) REFERENCES public.${ref}(id)${tail}`;
/** The eight clauses, by table, in the order the file writes them. [table, [column, referenced table, delete rule]...]. */
export const LATE_FK_CLAUSES = Object.freeze([
  ["appointment_survey_sends", [["appointment_id", "appointments", " ON DELETE CASCADE"], ["tenant_id", "tenants"], ["sent_by", "users"], ["patient_id", "patients"]]],
  ["appointment_survey_codes", [["tenant_id", "tenants"]]],
  ["appointment_survey_responses", [["appointment_id", "appointments"], ["tenant_id", "tenants"], ["patient_id", "patients"]]],
]);
/** The three statements, whitespace collapsed, exactly as the migration must write them. */
export const LATE_FKS = Object.freeze(LATE_FK_CLAUSES.map(([t, cols]) => `ALTER TABLE public.${t} ${cols.map(([c, ref, tail]) => lateClause(t, c, ref, tail)).join(", ")};`));
/** A foreign key statement without its delete rules, clause by clause: which rule a clause carries is the cascade rule's business alone. */
const noDeleteRule = (s) => s.replace(/ ON DELETE [A-Z]+(?: [A-Z]+)?(?=[,;])/g, "");
const isLateFkStatement = (s) => /^ALTER TABLE public\.\w+ ADD CONSTRAINT \w+ FOREIGN KEY\b/.test(s);
/** A late foreign key statement with its clauses sorted, so that WHICH clauses it holds and IN WHICH ORDER are two rules, each with its own message. */
const clausesSorted = (s) => {
  const m = /^(ALTER TABLE public\.\w+) (ADD CONSTRAINT .*);$/.exec(s);
  return m && isLateFkStatement(s) ? `${m[1]} ${m[2].split(/, (?=ADD CONSTRAINT )/).sort().join(", ")};` : s;
};
const ALTER_TABLES_WANTED = [
  "ALTER TABLE public.patients ADD COLUMN survey_enabled boolean NOT NULL DEFAULT true;",
  ...TABLES.map((t) => `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`),
  ...LATE_FKS.map(noDeleteRule).map(clausesSorted),
].sort();
const CASCADES_WANTED = [
  "ADD CONSTRAINT appointment_survey_sends_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE",
  "send_id uuid NOT NULL UNIQUE REFERENCES public.appointment_survey_sends(id) ON DELETE CASCADE",
];
/** R34's trigger, as reviewed, whitespace collapsed: AFTER UPDATE of ANY column, per row, only WHEN the value changed. */
export const TRIGGER_WANTED =
  "CREATE TRIGGER patients_survey_switch_audit AFTER UPDATE ON public.patients FOR EACH ROW " +
  "WHEN (OLD.survey_enabled IS DISTINCT FROM NEW.survey_enabled) EXECUTE FUNCTION public.patients_survey_switch_audit();";
/** The patients column, as reviewed: the one statement that takes ACCESS EXCLUSIVE on patients. */
const PATIENTS_ALTER = "ALTER TABLE public.patients ADD COLUMN survey_enabled boolean NOT NULL DEFAULT true;";
/** What may stand between that ALTER TABLE and the first policy: its comment, its grant, the trigger, the three foreign key statements. Nothing else. */
const AFTER_PATIENTS_ALTER = [
  /^COMMENT ON COLUMN public\.patients\.survey_enabled IS /,
  /^GRANT UPDATE \(survey_enabled\) ON public\.patients TO patient;$/,
  /^CREATE TRIGGER patients_survey_switch_audit /,
  /^ALTER TABLE public\.appointment_survey_(sends|codes|responses) ADD CONSTRAINT appointment_survey_\w+_fkey FOREIGN KEY \(\w+\) REFERENCES public\.(appointments|tenants|users|patients)\(id\)( ON DELETE [A-Z]+(?: [A-Z]+)?)?(, ADD CONSTRAINT appointment_survey_\w+_fkey FOREIGN KEY \(\w+\) REFERENCES public\.(appointments|tenants|users|patients)\(id\)( ON DELETE [A-Z]+(?: [A-Z]+)?)?)*;$/,
];
/** A table of this file: locking it locks nothing that existed before. */
const isOwnTable = (name) => TABLES.includes(name.replace(/^public\./, ""));

/**
 * NOTHING BEFORE THE FINAL GROUP LOCKS A TABLE THAT EXISTED BEFORE THIS FILE (the review of 2026-10-05, round 2). The final
 * group opens at the patients column or at the first of the three late foreign key statements, whichever stands first. Before it: no
 * REFERENCES or FOREIGN KEY to a table that is not one of this file's three (SHARE ROW EXCLUSIVE on the table named), no
 * ALTER TABLE, CREATE INDEX, CREATE TRIGGER, COMMENT ON TABLE or COLUMN on one, and no LOCK; and all nine functions are
 * plpgsql, because a SQL-language body is planned when the function is created, which takes ACCESS SHARE on every table it
 * reads (measured: the read door, when it was SQL, locked appointments and patients at its CREATE).
 */
export function earlyLockProblems(sql) {
  const problems = [];
  const stmts = statementsOf(sql);
  const topStmts = outsideBodies(sql).split("--> statement-breakpoint").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const late = new Set(LATE_FKS.map(noDeleteRule));
  const groupAt = stmts.findIndex((s) => s === PATIENTS_ALTER || late.has(noDeleteRule(s)));
  for (const full of topStmts.slice(0, groupAt < 0 ? topStmts.length : groupAt)) {
    // A COMMENT's string is prose; only what it is ON is code.
    const s = /^COMMENT ON\b/i.test(full) ? full.slice(0, full.search(/ IS /)) : full;
    const where = `before the final group, which would hold a lock on it from there to the COMMIT: ${s.slice(0, 90)}`;
    for (const m of s.matchAll(/\bREFERENCES\s+([\w.]+)/gi)) if (!isOwnTable(m[1])) problems.push(`a foreign key to an existing table (${m[1]}) ${where}`);
    let m;
    if ((m = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w.]+)/i.exec(s)) && !isOwnTable(m[1])) problems.push(`an ALTER TABLE on an existing table (${m[1]}) ${where}`);
    if ((m = /^CREATE (?:UNIQUE )?INDEX\b.*?\bON (?:ONLY )?([\w.]+)/i.exec(s)) && !isOwnTable(m[1])) problems.push(`a CREATE INDEX on an existing table (${m[1]}) ${where}`);
    if ((m = /^CREATE (?:OR REPLACE |CONSTRAINT )?TRIGGER\b.*?\bON ([\w.]+)/i.exec(s)) && !isOwnTable(m[1])) problems.push(`a CREATE TRIGGER on an existing table (${m[1]}) ${where}`);
    if ((m = /^COMMENT ON TABLE ([\w.]+)/i.exec(s)) && !isOwnTable(m[1])) problems.push(`a COMMENT on an existing table (${m[1]}) ${where}`);
    if ((m = /^COMMENT ON COLUMN ([\w.]+)\.\w+$/i.exec(s)) && !isOwnTable(m[1])) problems.push(`a COMMENT on a column of an existing table (${m[1]}) ${where}`);
    if (/^LOCK\b/i.test(s)) problems.push(`a LOCK statement ${where}`);
  }
  for (const f of FUNCTIONS) {
    const create = stmts.find((s) => s.startsWith(`CREATE FUNCTION public.${f.name}(`));
    if (create && !/ LANGUAGE plpgsql /.test(create.slice(0, create.indexOf(" AS $fn$") + 1))) {
      problems.push(`${f.name} is not plpgsql: a SQL-language body is planned when the function is created, which locks every table it reads until the COMMIT`);
    }
  }
  return problems;
}
/** The doors only the server's own session may call (no user, no patient claim), and the doors that take a code. */
const SERVER_ONLY_DOORS = ["issue_survey_automatic", "resolve_survey_code", "submit_survey_response", "opt_out_survey"];
const CODE_SHAPE_DOORS = ["issue_survey_automatic", "issue_survey_manual", "submit_survey_response", "opt_out_survey"];
const CODE_SHAPE = "p_code_hash !~ '^[0-9a-f]{64}$'";
const CONSENT_BOUND = "CONSTRAINT appointment_survey_responses_consent_version_length CHECK (char_length(consent_version) <= 64)";
const POLICY_HEADS_WANTED = [
  "CREATE POLICY appointment_survey_responses_select ON public.appointment_survey_responses AS PERMISSIVE FOR SELECT TO authenticated",
  "CREATE POLICY appointment_survey_sends_select ON public.appointment_survey_sends AS PERMISSIVE FOR SELECT TO authenticated",
];

/** Every rule the migration's shape must keep, each with its own message. [] when it passes. */
export function migrationProblems(sql) {
  const problems = [];
  const stmts = statementsOf(sql);
  const top = outsideBodies(sql);
  const topStmts = top.split("--> statement-breakpoint").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (stmts[0] !== "SET LOCAL lock_timeout = '5s';") problems.push("statement 1 is not exactly SET LOCAL lock_timeout = '5s';");
  if (stmts[1] !== "SET LOCAL statement_timeout = '60s';") problems.push("statement 2 is not exactly SET LOCAL statement_timeout = '60s';");
  // THE THIRD LINE, AND THIRD: strategy's ruling of 2026-10-06 (Q5 of S-1006-A), 15 s. A session that stalls with the transaction
  // open is ended by the server and its locks are released. The frozen gate (scripts/migration-timeouts.test.mjs) allows the line
  // and does not yet require it, so THIS rule is what holds it in this file, its value included.
  if (stmts[2] !== "SET LOCAL idle_in_transaction_session_timeout = '15s';") problems.push("statement 3 is not exactly SET LOCAL idle_in_transaction_session_timeout = '15s';");
  if (stmts.slice(3).some((s) => /\b(lock_timeout|statement_timeout|idle_in_transaction_session_timeout)\b/i.test(s))) problems.push("a later statement names a bound");
  if (stmts.some((s) => /^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START\s+TRANSACTION|SAVEPOINT|RELEASE|RESET|DISCARD)\b/i.test(s))) {
    problems.push("a statement is transaction control, RESET or DISCARD");
  }
  // Every statement but a COMMENT ON, whose string is prose ("a copy of the appointment's location").
  const unexplained = stmts.filter((s) => !/^COMMENT ON\b/i.test(s)).join("\n");
  if (/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\b|\bCOPY\b|\bMERGE\b/i.test(unexplained)) problems.push("a DELETE FROM, TRUNCATE, DROP, COPY or MERGE in the code");
  if (topStmts.some((s) => /^(INSERT|UPDATE|DELETE|WITH)\b/i.test(s))) problems.push("a write statement outside a function body");
  const cascades = [...codeOf(sql).replace(/\s+/g, " ").matchAll(/(\w+ uuid NOT NULL (?:UNIQUE )?REFERENCES public\.\w+\(id\)|ADD CONSTRAINT \w+ FOREIGN KEY \(\w+\) REFERENCES public\.\w+\(id\)) ON DELETE (\w+)/g)].map((m) => `${m[1]} ON DELETE ${m[2]}`);
  const onDeletes = (codeOf(sql).match(/\bON DELETE\b/gi) ?? []).length;
  if (JSON.stringify(cascades.sort()) !== JSON.stringify([...CASCADES_WANTED].sort()) || onDeletes !== 2) {
    problems.push(`ON DELETE is not exactly the two cascades (a send with its appointment, a code with its send): ${cascades.join("; ")}`);
  }
  const alters = topStmts.filter((s) => /^ALTER TABLE\b/i.test(s)).map(noDeleteRule).map(clausesSorted).sort();
  if (JSON.stringify(alters) !== JSON.stringify(ALTER_TABLES_WANTED)) problems.push(`the ALTER TABLE statements are not exactly the seven (the column, RLS on three, the eight foreign keys folded into three statements, one per table): ${alters.join(" | ")}`);
  const grants = topStmts.filter((s) => /^GRANT\b/i.test(s)).sort();
  if (JSON.stringify(grants) !== JSON.stringify(GRANTS_WANTED)) problems.push(`the GRANTs are not exactly the nine: ${grants.join(" | ")}`);
  const revokes = topStmts.filter((s) => /^REVOKE\b/i.test(s)).sort();
  if (JSON.stringify(revokes) !== JSON.stringify(REVOKES_WANTED)) problems.push(`the REVOKEs are not exactly the twelve: ${revokes.join(" | ")}`);
  for (const f of FUNCTIONS) {
    const create = stmts.find((s) => s.startsWith(`CREATE FUNCTION public.${f.name}(`));
    if (!create) {
      problems.push(`no CREATE FUNCTION for ${f.name}`);
      continue;
    }
    const head = create.slice(0, create.indexOf(" AS $fn$"));
    if (!/ SET search_path = public$/.test(head)) problems.push(`${f.name} does not end its header with SET search_path = public`);
    if (/ SECURITY DEFINER( |$)/.test(head) !== f.secdef) problems.push(`${f.name} is ${f.secdef ? "not " : ""}SECURITY DEFINER`);
    // ONE OWNER PIN PER SECURITY DEFINER FUNCTION, AND NONE ELSE. packages/db/tests/secdef-from-migrations.ts
    // (pairingProblems) calls a pin on a function that is not a definer an EXTRA pin and fails, for good: the
    // review of 2026-10-05 found the private helper pinned, which no count GATE-CHANGE could have turned green.
    if (f.secdef && !stmts.includes(`ALTER FUNCTION ${sigOf(f)} OWNER TO postgres;`)) problems.push(`${f.name} is not owned by postgres`);
  }
  const pinsWanted = new Set(FUNCTIONS.filter((f) => f.secdef).map((f) => `ALTER FUNCTION ${sigOf(f)} OWNER TO postgres;`));
  for (const s of stmts.filter((x) => /^ALTER FUNCTION\b.*\bOWNER TO\b/i.test(x))) {
    if (!pinsWanted.has(s)) problems.push(`an owner pin that is not one of the eight SECURITY DEFINER functions', which the pairing rule refuses: ${s}`);
  }
  const fnCount = stmts.filter((s) => /^CREATE (OR REPLACE )?FUNCTION\b/i.test(s)).length;
  if (fnCount !== FUNCTIONS.length) problems.push(`${fnCount} functions are created, not ${FUNCTIONS.length}`);
  // R34: one trigger, the reviewed one, to the token.
  const triggers = topStmts.filter((s) => /^CREATE (OR REPLACE |CONSTRAINT )?TRIGGER\b/i.test(s));
  if (triggers.length !== 1 || triggers[0] !== TRIGGER_WANTED) problems.push(`the triggers are not exactly the one reviewed audit trigger: ${triggers.join(" | ")}`);
  const policies = stmts.filter((s) => /^CREATE POLICY\b/i.test(s));
  const policyHeads = policies.map((s) => s.slice(0, s.indexOf(" USING ("))).sort();
  if (JSON.stringify(policyHeads) !== JSON.stringify(POLICY_HEADS_WANTED) || policies.some((s) => /\bWITH CHECK\b/i.test(s))) {
    problems.push(`the policies are not exactly the two PERMISSIVE SELECT policies TO authenticated: ${policyHeads.join(" | ")}`);
  }
  // THE SURVEY PAGE'S DOORS AND THE JOB'S DOOR ANSWER ONLY THE SERVER'S OWN SESSION, and a code's shape is tested first.
  const bodies = bodiesOf(sql);
  for (const name of SERVER_ONLY_DOORS) {
    const b = bodies[name] ?? "";
    const refuses = name === "resolve_survey_code"
      ? b.includes("AND (SELECT auth.uid()) IS NULL") && b.includes("AND (SELECT public.jwt_patient_id()) IS NULL")
      : b.includes("OR (SELECT auth.uid()) IS NOT NULL") && b.includes("OR (SELECT public.jwt_patient_id()) IS NOT NULL");
    if (!refuses) problems.push(`${name} does not refuse a session that carries a user or a patient claim`);
  }
  for (const name of CODE_SHAPE_DOORS) {
    if (!(bodies[name] ?? "").includes(CODE_SHAPE)) problems.push(`${name} does not test the code's shape before it uses it`);
  }
  if (!codeOf(sql).replace(/\s+/g, " ").includes(CONSENT_BOUND)) problems.push("the consent label has no length bound");
  // THE PATIENTS COLUMN IS ADDED AS LATE AS IT CAN BE: between it and the first policy stand its comment, its grant, the trigger
  // and the three foreign key statements, and nothing else. (Where the policies themselves stand is R39's rule, below.)
  const alterAt = stmts.indexOf(PATIENTS_ALTER);
  if (alterAt >= 0) {
    const nextPolicy = stmts.findIndex((s, i) => i > alterAt && /^CREATE POLICY\b/i.test(s));
    const between = stmts.slice(alterAt + 1, nextPolicy < 0 ? stmts.length : nextPolicy);
    if (between.some((s) => !AFTER_PATIENTS_ALTER.some((re) => re.test(s)))) {
      problems.push("a statement other than its comment, its grant, the trigger and the three foreign key statements stands between ALTER TABLE public.patients and the policies: patients would be locked against reads for longer");
    }
    // THE ONE ORDER OF THE LOCKS: patients first (the column, the strongest lock, taken while nothing else is held), then
    // appointments, tenants, users. Measured on the lane: with the foreign keys BEFORE the column, a transaction that has read
    // patients and then writes is ended as a deadlock victim; with the column first it is waited for and goes on. SINCE THE FOLD
    // the order is the order of the three statements AND of the clauses inside each: the same eight clauses in the same three
    // statements, written in another order, are refused here and nowhere else.
    const fks = stmts.map(noDeleteRule).filter(isLateFkStatement);
    const wanted = LATE_FKS.map(noDeleteRule);
    const sameSet = JSON.stringify(fks.map(clausesSorted).sort()) === JSON.stringify(wanted.map(clausesSorted).sort());
    const firstFk = stmts.findIndex(isLateFkStatement);
    if (sameSet && (JSON.stringify(fks) !== JSON.stringify(wanted) || firstFk < alterAt)) {
      problems.push("the locks on the existing tables are not taken in their one order: patients (the column), then appointments, tenants, users");
    }
  }
  problems.push(...earlyLockProblems(sql));
  // R39: "Move the two CREATE POLICY statements to the end of the SAT-01 file." Nothing follows them, and no policy stands earlier.
  const lastTwo = stmts.slice(-2);
  if (lastTwo.length !== 2 || !lastTwo.every((s) => /^CREATE POLICY\b/i.test(s)) || stmts.slice(0, -2).some((s) => /\bPOLICY\b/i.test(s) && !/^COMMENT ON\b/i.test(s))) {
    problems.push("the CREATE POLICY statements are not the last two statements of the file, and the only two (R39)");
  }
  return problems;
}

/** A check file writes nothing: no code line begins with a writing verb, and no string is a writing statement. */
export function writeProblems(sql, allow = /^$/) {
  const problems = [];
  for (const line of codeOf(sql).split("\n")) {
    const t = line.trim();
    if (allow.test(t)) continue;
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|COMMIT|SET|RESET)\b/i.test(t)) {
      problems.push(`a writing statement: ${t.slice(0, 80)}`);
    }
    for (const m of t.matchAll(/'([^']*)'/g)) {
      if (/^\s*(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET|TRUNCATE\s|MERGE\s+INTO|COPY\s|REVOKE\s|GRANT\s|ALTER\s)/i.test(m[1])) {
        problems.push(`a writing statement in a string: '${m[1].slice(0, 60)}'`);
      }
    }
  }
  return problems;
}
/** The post-check's probes switch role and switch back, and do nothing else that a SET line could. */
const PROBE_ROLE_LINES = /^(SET LOCAL ROLE (anon|patient|authenticated);|RESET ROLE;)$/;

/** A NULL relacl reads as acldefault() of the relation's own object type ('s' for a sequence; 'S' is a FOREIGN SERVER). */
export const REL_DEFAULT = `acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner)`;
export function aclDefaultProblems(sql) {
  const problems = [];
  const code = codeOf(sql);
  if (/acldefault\(\s*'S'|THEN\s+'S'::"char"|'S'::"char"\s+ELSE/.test(code)) {
    problems.push("acldefault is given the FOREIGN SERVER code 'S' where a sequence's code is 's'");
  }
  if (!code.includes(REL_DEFAULT)) problems.push("rel_items does not read a NULL relacl as acldefault of its own object type");
  return problems;
}

/** The journal compares that DECIDE a verdict name the pinned sha256 in code. */
export function journalPinProblems(sql, which) {
  const problems = [];
  const code = codeOf(sql);
  if (!new RegExp(`WHERE hash = '${MIGRATION_SHA}'\\)\\s+AS has_0102,`).test(code)) problems.push("has_0102 does not count the pinned sha256");
  if (which === "post" && !code.includes(`CASE WHEN has_0102 = 1 AND newest_hash = '${MIGRATION_SHA}' THEN 'OK' ELSE 'FAIL' END`)) {
    problems.push("verdict 23 does not compare the newest row with the pinned sha256");
  }
  return problems;
}

/** The post-check's function rows: [name, secdef, vol, body md5, door]. */
export function postFunctionPins(post) {
  return [...codeOf(post).matchAll(/\('(\w+)\(([^)]*)\)', (true|false), '([sv])', '([0-9a-f]{32})', (true|false)\)/g)].map((m) => ({
    name: m[1], sig: m[2], secdef: m[3] === "true", vol: m[4], md5: m[5], door: m[6] === "true",
  }));
}
/** The post-check's function pins against the migration's own bodies and flags. */
export function bodyPinProblems(migrationSql, post) {
  const problems = [];
  const bodies = bodiesOf(migrationSql);
  const stmts = statementsOf(migrationSql);
  const pins = postFunctionPins(post);
  if (pins.length !== FUNCTIONS.length) problems.push(`the post-check pins ${pins.length} functions, not ${FUNCTIONS.length}`);
  for (const f of FUNCTIONS) {
    const p = pins.find((x) => x.name === f.name);
    if (!p) {
      problems.push(`the post-check pins no ${f.name}`);
      continue;
    }
    if (p.sig !== f.sig.replace(/, /g, ",")) problems.push(`${f.name}: the post-check pins the signature (${p.sig})`);
    if (bodies[f.name] === undefined) problems.push(`${f.name}: no body in the migration`);
    else if (p.md5 !== md5(bodies[f.name])) problems.push(`${f.name}: the post-check pins body md5 ${p.md5}, the migration's body is ${md5(bodies[f.name])}`);
    if (p.secdef !== f.secdef) problems.push(`${f.name}: the post-check pins SECURITY DEFINER ${p.secdef}`);
    if (p.door !== f.door) problems.push(`${f.name}: the post-check pins door ${p.door}`);
    const create = stmts.find((s) => s.startsWith(`CREATE FUNCTION public.${f.name}(`)) ?? "";
    const vol = / STABLE /.test(create.slice(0, create.indexOf(" AS $fn$"))) ? "s" : "v";
    if (p.vol !== vol) problems.push(`${f.name}: the post-check pins volatility ${p.vol}, the migration's is ${vol}`);
  }
  return problems;
}

/** Verdicts a check file can print OK for. */
const okVerdicts = (sql) => (codeOf(sql).match(/THEN 'OK' ELSE 'FAIL' END(?: AS verdict)? FROM j/g) ?? []).length;

/** The fenced blocks of a markdown text. */
export const blocksOf = (md) => [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);

/** The one block whose text carries `marker`. */
export function blockWith(md, marker) {
  const hits = blocksOf(md).filter((b) => b.includes(marker));
  if (hits.length !== 1) throw new Error(`expected exactly one block carrying ${marker}, found ${hits.length}`);
  return hits[0];
}

export function blockHazards(block) {
  const out = [];
  for (const line of block.split("\n")) {
    if (/^\s*#/.test(line)) out.push(`a # line: ${line.trim()}`);
    if (line.replace(/test !/g, "").includes("!")) out.push(`a !: ${line.trim().slice(0, 80)}`);
    if (/\\\s*$/.test(line)) out.push(`a backslash continuation: ${line.trim().slice(0, 80)}`);
    if (/\/Users\/ivan\/Documents\b/.test(line)) out.push(`the apply worktree's old place: ${line.trim().slice(0, 80)}`);
  }
  return out;
}

const PIN_NAMES = ["SHA0102", "SHAPRE", "SHAPOST", ...Object.keys(EXTERNAL_PINS), "SHAGATE"];
const PIN_LINE = new RegExp(`^(${PIN_NAMES.join("|")})=(\\S+)$`, "gm");

/** Every `NAME=<value>` pin line in the document's blocks, as [name, value] pairs. */
export const pinLines = (md) => blocksOf(md).flatMap((b) => [...b.matchAll(PIN_LINE)].map((m) => [m[1], m[2]]));

/** Why SHAGATE fails, or [] when it is the sha256 of the gate file's text (null: the file is missing). */
export function gateProblems(gate, fileText) {
  if (!/^[0-9a-f]{64}$/.test(gate)) return [`SHAGATE is not a sha256: ${gate}`];
  if (fileText === null) return [`${GATE_FILE} is missing, so SHAGATE proves nothing`];
  return gate === sha256(fileText) ? [] : [`SHAGATE ${gate} is not the sha256 of ${GATE_FILE}`];
}

/** Every pin the document gives is the file's real sha256 or the given external value. */
export function pinProblems(md, actual, gateText) {
  const problems = [];
  const own = { SHA0102: actual.migration, SHAPRE: actual[PRE], SHAPOST: actual[POST] };
  for (const [name, value] of pinLines(md)) {
    if (name in own && value !== own[name]) problems.push(`${name} pins ${value}, the file is ${own[name]}`);
    if (name in EXTERNAL_PINS && value !== EXTERNAL_PINS[name]) problems.push(`${name} pins ${value}, the build was given ${EXTERNAL_PINS[name]}`);
    if (name === "SHAGATE") problems.push(...gateProblems(value, gateText));
  }
  for (const [file, sha] of [[PRE, actual[PRE]], [POST, actual[POST]]]) {
    const row = md.split("\n").find((l) => l.startsWith("| ") && l.includes(`\`${file}\``) && /sha256 `[0-9a-f]{64}`/.test(l));
    if (!row) problems.push(`the fact table gives no sha256 for ${file}`);
    else if (!row.includes(`sha256 \`${sha}\``)) problems.push(`the fact table's sha256 for ${file} is not ${sha}`);
  }
  if (!md.includes(`sha256 \`${actual.migration}\` in both places`)) problems.push("the fact table's migration sha256 is not the file's");
  const names = new Set(pinLines(md).map(([n]) => n));
  for (const n of PIN_NAMES) if (!names.has(n)) problems.push(`no block pins ${n}`);
  return problems;
}

/** A block that runs the guard or the reader compares it, and the module both import, BEFORE it runs it. */
export function compareFirstProblems(block) {
  const problems = [];
  const at = (s) => block.indexOf(s);
  const runs = [
    ["node scripts/assert-production-target.mjs", ['= "${SHAGUARD}" ]', '= "${SHAPTM}" ]']],
    ["${READER} 2>&1", ['= "${SHAREADER}" ]', '= "${SHAPTM}" ]']],
  ];
  for (const [run, compares] of runs) {
    if (at(run) < 0) continue;
    for (const c of compares) {
      if (at(c) < 0 || at(c) > at(run)) problems.push(`the block runs ${run} without comparing ${c} first`);
    }
  }
  return problems;
}

// ---- THE WEEKDAY TABLE. Lisbon time. Weekday 1 is Monday, 7 is Sunday (date +%u). ----

/** The table as the ruling states it: [first weekday, last weekday, opens HHMM, closes HHMM]. Sunday has no row: closed. */
export const WEEKDAY_TABLE = Object.freeze([
  [1, 5, 800, 2100],
  [6, 6, 800, 1300],
]);
/** Whether the clinics are closed at weekday `d`, time `t` (HHMM as a number), by the table. */
export const closedByTable = (d, t) => !WEEKDAY_TABLE.some(([a, b, open, close]) => d >= a && d <= b && t >= open && t < close);

/** The clock lines, exactly as both stages carry them. */
export const CLOCK_READ = "DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z') || { echo \"STOP: the Lisbon clock could not be read. Nothing was applied\"; exit 1; }";
/** The zone is read in the SAME date call and must be Lisbon's: a zone that cannot be loaded answers with UTC's clock and exit 0, under a name that is not Lisbon's, and UTC is an hour off in summer. */
export const CLOCK_ZONE = "echo \"${DTZ}\" | grep -qxE '[1-7][0-2][0-9][0-5][0-9] (WET|WEST)' || { echo \"STOP: the Lisbon clock did not read as a weekday (1 to 7), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${DTZ}]. Nothing was applied\"; exit 1; }";
export const CLOCK_SPLIT = 'DT=$(echo "${DTZ}" | cut -c1-5)';
export const CLOCK_FORMAT = "echo \"${DT}\" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo \"STOP: the Lisbon weekday and time did not split out of the clock reading. Nothing was applied\"; exit 1; }";
export const CLOCK_AWK =
  "BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }";
export const CLOCK_DECIDE = `if awk -v s="\${DT}" '${CLOCK_AWK}'; then CLOCK=closed; else CLOCK=open; fi`;

/** The awk program a block's clock line runs, or null. */
export const clockProgramOf = (block) => (/^if awk -v s="\$\{DT\}" '([^']+)'; then CLOCK=closed; else CLOCK=open; fi$/m.exec(block) ?? [])[1] ?? null;

/** What a block's own clock program answers for a reading: "closed", "open", or the exit code. */
export function runClock(program, reading) {
  const r = spawnSync("awk", ["-v", `s=${reading}`, program], { encoding: "utf8" });
  return r.status === 0 ? "closed" : r.status === 1 ? "open" : `exit ${r.status}`;
}

/** The arm of one stage, which can pass only in closed hours by the weekday table. [] when the block keeps every rule. */
export function armProblems(block, stage) {
  const problems = [];
  const lines = block.split("\n");
  if (!lines.includes("D2=no")) problems.push("no D2=no line");
  if (!lines.includes("D3=no")) problems.push("no D3=no line");
  if (/D2=yes|D3=yes/.test(block)) problems.push("something can turn proof 2 or 3 to yes");
  if (/yesyesyes/.test(block)) problems.push("a daytime path that opens on all three proofs");
  if (/\bOVR\b|override/i.test(block)) problems.push("an override arm");
  if (!lines.includes(CLOCK_READ)) problems.push("the Lisbon weekday, time and zone are not read in one date call, with its halt");
  if (!lines.includes(CLOCK_ZONE)) problems.push("the clock reading is not refused unless its zone is WET or WEST");
  if (!lines.includes(CLOCK_FORMAT)) problems.push("the clock reading is not refused unless it is a weekday and HHMM");
  if (!lines.includes(CLOCK_DECIDE)) problems.push("closed is not decided by the weekday table");
  // The five lines stand together, in order, with nothing between them: read, zone, split, format, decide.
  const at = lines.indexOf(CLOCK_READ);
  const five = [CLOCK_READ, CLOCK_ZONE, CLOCK_SPLIT, CLOCK_FORMAT, CLOCK_DECIDE];
  if (at >= 0 && five.some((l, k) => lines[at + k] !== l) && five.every((l) => lines.includes(l))) problems.push("the clock's five lines are not together and in order");
  if (lines.filter((l) => /CLOCK=closed/.test(l)).length !== 1) problems.push("more than one line can set CLOCK=closed");
  const decision = lines.filter((l) => l.startsWith('if [ "${CLOCK}'));
  const want = stage === 0
    ? /^if \[ "\$\{CLOCK\}" = closed \]; then echo "R9: closed hours by the weekday table\. [^"]*"; else echo "STOP: [^"]*"; exit 1; fi$/
    : /^if \[ "\$\{CLOCK\}\$\{CLINICS\}" = closedinside \]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it\. [^"]*"; else echo "STOP: [^"]*"; exit 1; fi$/;
  if (decision.length !== 1 || !want.test(decision[0])) problems.push("the decision is not closed hours or STOP");
  if (stage === 1) {
    if (!block.includes("(opens_at < time '08:00' or closes_at > time '21:00')")) problems.push("stage 1 does not hold the clinics' own rows against the table's widest row");
    if (!/from public\.locations/.test(block)) problems.push("stage 1 does not read the clinics' own rows");
    problems.push(...armPositionProblems(block));
  }
  if (/\b20[0-9]{6}\b/.test(block)) problems.push("a date is written into the block");
  return problems;
}

/** Stage 1's arm sits after the pre-check and before the apply. */
export function armPositionProblems(block) {
  const problems = [];
  const arm = block.indexOf("THE CLOCK AND THE CLINICS (R9)");
  if (!(arm > block.indexOf("precheck-0102-sat01-tables.sql 2>&1"))) problems.push("the arm does not follow the pre-check");
  if (!(arm < block.indexOf("node packages/db/scripts/verified-migrate.mjs"))) problems.push("the arm does not precede the apply");
  return problems;
}

/** An explicit halt, as the last thing on a line. */
const EXPLICIT_HALT = /\|\| \{ (RC=\$\?; )?echo "STOP: [^"]+";( echo "\$\{STRAY\}";)? exit (1|\$\{RC\}); \}$/;

/** The sentence every STOP that can fire AFTER stage 1 committed must carry. */
export const WRITE_STANDS = "0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1";
/** Before a block has seen the applied marker it cannot know, so it says it conditionally. */
const WRITE_STANDS_IF = `If stage 1 ended with its line 0102 APPLIED, then ${WRITE_STANDS}`;
const STOP_TEXT = /echo "STOP: ([^"]+)"/;

/**
 * The sentence of a STOP whose OWN READ contradicts stage 1's marker. Such a STOP cannot also say
 * "0102 IS APPLIED": it has just read that the journal does not hold it, or holds one row too few.
 */
export const STATE_UNKNOWN = "Stage 1 recorded that it applied 0102, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report";
/**
 * The STOPs where a contradicting read is possible, each named by how its line starts. Six, and no other.
 * The first is the post-check's own psql run: the post-check reads the new tables, the new column and the new
 * functions by name, so on a database WITHOUT them the statement is refused, psql exits 3 and THIS is the STOP that fires,
 * before any verdict prints. It has confirmed nothing, so it cannot say the write stands.
 */
export const CONTRADICTING_READS = Object.freeze({
  stage2: ['psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before=', '[ "${FAILS}" = 0 ] || ', '[ "${JA}" = "$((J + 1))" ] || ', '[ "${HN}" = 1 ] || '],
  closing: ["grep -qx 'journal rows on production: 100' ", "grep -qE '^[[:space:]]*APPLIED[[:space:]]+0102_sat01_satisfaction_survey[.]sql$' "],
});

/**
 * Stage 2 and the closing read run AFTER the commit. Every STOP of theirs says that 0102 is applied and
 * that nothing is to be run again; and it says so unconditionally only once the block has seen stage
 * 1's applied marker. `markerLine` is the start of the line that reads the marker. The STOPs named in
 * `contradicting` are the exception: there the block's own read disagrees with the marker, so the
 * STOP says the state is UNKNOWN, and never that 0102 is applied.
 */
export function postCommitProblems(block, markerLine, contradicting) {
  const problems = [];
  const lines = block.split("\n");
  const marker = lines.findIndex((l) => l.startsWith(markerLine));
  if (marker < 0) return ["the block never reads stage 1's applied marker"];
  for (const start of contradicting) {
    if (lines.filter((l) => l.startsWith(start) && STOP_TEXT.test(l)).length !== 1) problems.push(`the block has not exactly one STOP for the contradicting read ${start.slice(0, 40)}`);
  }
  lines.forEach((l, i) => {
    const m = STOP_TEXT.exec(l);
    if (!m) return;
    if (contradicting.some((start) => l.startsWith(start))) {
      if (i <= marker) problems.push(`line ${i + 1}: a contradicting read before the block has read the applied marker`);
      else if (!m[1].includes(STATE_UNKNOWN)) problems.push(`line ${i + 1}: a STOP whose own read can contradict the marker does not say the state is UNKNOWN: ${m[1].slice(0, 60)}`);
      else if (m[1].includes("IS APPLIED")) problems.push(`line ${i + 1}: a STOP says 0102 IS APPLIED while its own read says otherwise`);
      return;
    }
    if (m[1].includes("Treat the state as UNKNOWN")) problems.push(`line ${i + 1}: a STOP calls the state UNKNOWN though its own read contradicts nothing`);
    else if (!m[1].includes(WRITE_STANDS)) problems.push(`line ${i + 1}: a post-commit STOP that does not say the write stands: ${m[1].slice(0, 70)}`);
    else if (i <= marker && !m[1].includes(WRITE_STANDS_IF)) problems.push(`line ${i + 1}: a STOP says 0102 is applied before the block has read the applied marker`);
    else if (i > marker && m[1].includes(WRITE_STANDS_IF)) problems.push(`line ${i + 1}: a STOP is still conditional after the block has read the applied marker`);
  });
  return problems;
}

/** Stage 1's two STOPs after the apply command: the apply's own (uncertain) and the marker's (certain). */
export function stageOnePostApplyProblems(block) {
  const problems = [];
  const lines = block.split("\n");
  const vm = lines.findIndex((l) => l.startsWith("node packages/db/scripts/verified-migrate.mjs"));
  if (vm < 0) return ["stage 1 does not run verified-migrate"];
  if (!/Do not read this as nothing applied: [^"]*Paste nothing else, not stage 1 again/.test(lines[vm])) problems.push("the apply's STOP does not say it may have applied and that nothing else is pasted");
  const after = lines.slice(vm + 1).filter((l) => STOP_TEXT.test(l));
  if (after.length !== 1 || !STOP_TEXT.exec(after[0])[1].includes(WRITE_STANDS)) problems.push("the STOP after a committed apply does not say the write stands and nothing is run again");
  return problems;
}

/** The variables a block holds a commit sha in. */
const SHA_VARS = ["HELD", "REC", "NOW", "HD", "WREC", "S2"];
const hexCheckOf = (v) => `echo "\${${v}}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: `;

/**
 * Two shas are compared only as VARIABLES, each already refused unless it is 40 hex characters. An
 * inline `[ "$(git rev-parse HEAD)" = "${REC}" ]` is true when both sides are empty: a record that
 * reads empty and a git that fails. And every block asserts the document's sidecar.
 */
export function shaCompareProblems(block) {
  const problems = [];
  const lines = block.split("\n");
  lines.forEach((l, i) => {
    if (/\[ "\$\((git rev-parse|cat \/tmp\/|cut -d' ' -f1 \/tmp\/)/.test(l)) problems.push(`line ${i + 1}: a sha is compared inline, without being read into a variable and checked`);
    for (const m of l.matchAll(/\[ "\$\{(\w+)\}" = "\$\{(\w+)\}" \]/g)) {
      for (const v of [m[1], m[2]]) {
        if (!SHA_VARS.includes(v)) continue;
        const checked = lines.slice(0, i).some((x) => x.startsWith(hexCheckOf(v)) && EXPLICIT_HALT.test(x));
        if (!checked) problems.push(`line ${i + 1}: \${${v}} is compared before it is checked to be 40 hex characters`);
      }
    }
  });
  if (!lines.some((l) => /^shasum -a 256 -c (\$\{DOCPIN\}|docs\/migration-apply-0102\.sha256) \|\| \{ echo "STOP: /.test(l))) problems.push("the block does not assert the document's sidecar");
  return problems;
}

/**
 * Every `date` call of a block reads LISBON time and the ZONE it read, and the next line refuses any
 * zone but WET or WEST. The harness's `date` is a stub, so a block that dropped `TZ=Europe/Lisbon`
 * would pass every stubbed run; this rule, the stub's own TZ check and the real-date arm are what see it.
 */
export function dateProblems(block) {
  const problems = [];
  const lines = block.split("\n");
  lines.forEach((l, i) => {
    const calls = (l.match(/\bdate (?=['+-])/g) ?? []).length;
    if (calls === 0) return;
    if ((l.match(/\bTZ=Europe\/Lisbon date (?=['+-])/g) ?? []).length !== calls) problems.push(`line ${i + 1}: a date call without TZ=Europe/Lisbon`);
    const m = /^(\w+)=\$\(TZ=Europe\/Lisbon date '\+[%A-Za-z]+ %Z'\) \|\| \{ echo "STOP: /.exec(l);
    if (!m || calls !== 1) { problems.push(`line ${i + 1}: a date call that does not read the zone, alone on its line, into a variable, with its halt`); return; }
    const next = lines[i + 1] ?? "";
    if (!(next.startsWith(`echo "\${${m[1]}}" | grep -qxE '`) && /\(WET\|WEST\)' \|\| \{ echo "STOP: /.test(next) && EXPLICIT_HALT.test(next))) {
      problems.push(`line ${i + 1}: the zone \${${m[1]}} read is not required, on the next line, to be WET or WEST`);
    }
  });
  return problems;
}

/** Every carry is a row the pre-check prints, and no other row's name contains it (stage 2's carry() matches with index()). */
export function carryProblems(carries, rowNames) {
  const problems = [];
  for (const c of carries) {
    const hits = rowNames.filter((r) => r.includes(c));
    if (!hits.includes(c)) problems.push(`the pre-check prints no row named ${c}`);
    else if (hits.length !== 1) problems.push(`carry ${c} is a substring of ${hits.join(", ")}`);
  }
  return problems;
}

const MIGRATION_PATH = locateMigration((p) => existsSync(join(ROOT, p)));
const migration = read(MIGRATION_PATH);
const pre = read(PRE);
const post = read(POST);
const doc = read(DOC);
const gateText = existsSync(join(ROOT, GATE_FILE)) ? read(GATE_FILE) : null;
const ACTUAL = { migration: sha256(migration), [PRE]: sha256(pre), [POST]: sha256(post) };
const STAGE0 = "0102 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED";
const STAGE1 = "0102 APPLIED. Paste stage 2 now.";
const STAGE2 = "0102 POST-CHECK PASSED.";
const CLOSING = "CLOSING READ: the journal reads 100";

/** `text` with `from` replaced by `to`; `from` must occur exactly once. */
const swap = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `not exactly once: ${from.slice(0, 80)}`);
  return text.replace(from, () => to);
};

test("the migration stands in exactly one place, and its bytes are the pinned sha256", () => {
  assert.equal(sha256(migration), MIGRATION_SHA);
  assert.throws(() => locateMigration(() => true), /exactly one/);
  assert.throws(() => locateMigration(() => false), /exactly one/);
});

test("the migration keeps every rule of its shape", () => {
  assert.deepEqual(migrationProblems(migration), []);
  assert.equal(statementsOf(migration).length, 70);
  // A word in a comment is not code.
  assert.deepEqual(migrationProblems(`${migration}\n/* DELETE FROM x; TRUNCATE y; DROP z; GRANT ALL TO anon; CREATE POLICY p ON t */\n`), []);
  // R39, read off the file itself: statements 69 and 70 are the two policies, and nothing follows them.
  const stmts = statementsOf(migration);
  assert.match(stmts[68], /^CREATE POLICY appointment_survey_sends_select /);
  assert.match(stmts[69], /^CREATE POLICY appointment_survey_responses_select /);
  // THE THREE SET LOCAL LINES ARE STATEMENTS 1, 2 AND 3, and the setting is named nowhere else in the code.
  assert.deepEqual(stmts.slice(0, 3), ["SET LOCAL lock_timeout = '5s';", "SET LOCAL statement_timeout = '60s';", "SET LOCAL idle_in_transaction_session_timeout = '15s';"]);
  assert.equal(stmts.filter((s) => /^SET\b/i.test(s)).length, 3);
  assert.equal(codeOf(migration).split("idle_in_transaction_session_timeout").length - 1, 1);
  // ENABLE ROW LEVEL SECURITY stays long before them: RLS on with no policy admits no application role.
  const rls = stmts.map((s, i) => (/ENABLE ROW LEVEL SECURITY;$/.test(s) ? i + 1 : 0)).filter(Boolean);
  assert.deepEqual(rls, [13, 14, 15]);
  // THE FINAL GROUP IS STATEMENTS 62 TO 70: the patients column, its comment, its grant, the trigger, the three foreign key
  // statements in their one order, the two policies. It is the first lock on a table that existed before this file, and every later one.
  assert.equal(stmts[61], PATIENTS_ALTER);
  assert.match(stmts[62], /^COMMENT ON COLUMN public\.patients\.survey_enabled IS /);
  assert.equal(stmts[63], "GRANT UPDATE (survey_enabled) ON public.patients TO patient;");
  assert.equal(stmts[64], TRIGGER_WANTED);
  // THE THREE FOLDED STATEMENTS, EXACTLY: 66 the sends (four clauses), 67 the codes (one), 68 the answers (three).
  assert.deepEqual(stmts.slice(65, 68), [...LATE_FKS]);
  assert.deepEqual(LATE_FKS, [
    "ALTER TABLE public.appointment_survey_sends ADD CONSTRAINT appointment_survey_sends_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE, ADD CONSTRAINT appointment_survey_sends_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id), ADD CONSTRAINT appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(id), ADD CONSTRAINT appointment_survey_sends_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);",
    "ALTER TABLE public.appointment_survey_codes ADD CONSTRAINT appointment_survey_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);",
    "ALTER TABLE public.appointment_survey_responses ADD CONSTRAINT appointment_survey_responses_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id), ADD CONSTRAINT appointment_survey_responses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id), ADD CONSTRAINT appointment_survey_responses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);",
  ]);
  // The tables each statement names, clause by clause: the first takes appointments, tenants, users in that order; the others name nothing new.
  assert.deepEqual(LATE_FKS.map((s) => [...s.matchAll(/REFERENCES public\.(\w+)\(id\)/g)].map((m) => m[1])), [["appointments", "tenants", "users", "patients"], ["tenants"], ["appointments", "tenants", "patients"]]);
  // The names are the ones Postgres gives an inline REFERENCES: <table>_<column>_fkey. Eight clauses, eight names.
  const lateNames = LATE_FKS.flatMap((s) => { const t = /^ALTER TABLE public\.(\w+) /.exec(s)[1]; return [...s.matchAll(/ADD CONSTRAINT (\w+) FOREIGN KEY \((\w+)\)/g)].map((m) => [m[1], `${t}_${m[2]}_fkey`]); });
  assert.equal(lateNames.length, 8);
  assert.ok(lateNames.every(([name, wantedName]) => name === wantedName));
  // NOTHING BEFORE STATEMENT 62 LOCKS AN EXISTING TABLE: the three CREATE TABLE statements name only one another.
  assert.deepEqual(earlyLockProblems(migration), []);
  const refs = stmts.slice(0, 61).flatMap((s) => [...s.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").matchAll(/\bREFERENCES\s+([\w.]+)/g)].map((m) => m[1]));
  assert.deepEqual(refs, ["public.appointment_survey_sends", "public.appointment_survey_sends"]);
  // All nine functions are plpgsql.
  assert.equal(stmts.filter((s) => /^CREATE FUNCTION\b/.test(s) && / LANGUAGE plpgsql /.test(s)).length, 9);
  assert.equal(stmts.filter((s) => /\bLANGUAGE sql\b/i.test(s.replace(/\$fn\$[\s\S]*?\$fn\$/g, ""))).length, 0);
  // Nothing before statement 62 names the table in a statement that locks it against reads.
  assert.deepEqual(stmts.slice(0, 61).filter((s) => /^(ALTER TABLE|CREATE TRIGGER|COMMENT ON COLUMN|GRANT|REVOKE)\b[^;]*\bpublic\.patients\b/.test(s)), []);
  // The trigger's function is created before the column, where it locks nothing.
  assert.match(stmts[57], /^CREATE FUNCTION public\.patients_survey_switch_audit\(\) RETURNS trigger /);
  // THE OWNER PINS: eight, one per SECURITY DEFINER function, and the private helper has none.
  const pins = stmts.filter((s) => /^ALTER FUNCTION\b.*\bOWNER TO\b/.test(s));
  assert.equal(pins.length, 8);
  assert.ok(pins.every((s) => !s.includes("survey_manual_verdict")));
});

/** The comment box that opens the switch's section: a statement added "to the file" in a control goes above it, before the patients column. */
const SWITCH_SECTION = "/* ====================================================================== */\n/* 6. THE PATIENT'S SURVEY SWITCH AND ITS AUDIT ROW (S8, R34)             */\n";

test("CONTROLS, ONE RULE AT A TIME: each migrationProblems rule is the only one an input breaks", () => {
  // A statement added before the switch's section, so only the rule it breaks sees it (R39's rule and the late-column rule have their own arms).
  const add = (s) => swap(migration, SWITCH_SECTION, `${s}--> statement-breakpoint\n\n${SWITCH_SECTION}`);
  const atEnd = (s) => `${migration}\n${s}--> statement-breakpoint\n`;
  const body = (fn, from, to) => {
    const start = migration.indexOf(`CREATE FUNCTION public.${fn}(`);
    const end = migration.indexOf("$fn$;", migration.indexOf("AS $fn$", start)) + 5;
    const seg = migration.slice(start, end);
    assert.equal(seg.split(from).length, 2, `not exactly once in ${fn}: ${from}`);
    return migration.slice(0, start) + seg.replace(from, () => to) + migration.slice(end);
  };
  const TRIGGER_TEXT = "CREATE TRIGGER patients_survey_switch_audit\n  AFTER UPDATE ON public.patients\n  FOR EACH ROW\n  WHEN (OLD.survey_enabled IS DISTINCT FROM NEW.survey_enabled)\n  EXECUTE FUNCTION public.patients_survey_switch_audit();";
  /** One clause line of a folded statement, as the file writes it: `end` is "," inside a statement and ";--> statement-breakpoint" at its end. */
  const CLAUSE_TEXT = (t, c, ref, tail = "", end = ",") => `  ADD CONSTRAINT ${t}_${c}_fkey FOREIGN KEY (${c}) REFERENCES public.${ref}(id)${tail}${end}\n`;
  const LAST = ";--> statement-breakpoint";
  /** The codes' statement whole: the one table with one late foreign key. */
  const CODES_FK_TEXT = `ALTER TABLE public.appointment_survey_codes\n${CLAUSE_TEXT("appointment_survey_codes", "tenant_id", "tenants", "", LAST)}`;
  /** The sends' statement whole, from its ALTER TABLE line to its breakpoint. */
  const SENDS_FK_TEXT = /ALTER TABLE public\.appointment_survey_sends\n(?:  ADD CONSTRAINT [^\n]*\n)+/.exec(migration)[0];
  const SEVEN = /^the ALTER TABLE statements are not exactly the seven/;
  const BETWEEN = /^a statement other than its comment, its grant, the trigger and the three foreign key statements stands between ALTER TABLE public\.patients and the policies/;
  const exchange = (a, b) => swap(swap(swap(migration, a, "@@A@@"), b, a), "@@A@@", b);
  const ORDER = /^the locks on the existing tables are not taken in their one order: patients \(the column\), then appointments, tenants, users$/;
  // The patients column, its comment, its grant and its trigger, moved as one block to stand AFTER the three foreign key statements.
  const columnBlock = migration.slice(migration.indexOf("/* FROM HERE TO THE COMMIT, patients IS LOCKED AGAINST READS AND WRITES."), migration.indexOf(TRIGGER_TEXT) + TRIGGER_TEXT.length + "--> statement-breakpoint\n".length);
  const POLICIES_SECTION = "/* ====================================================================== */\n/* 8. WHO READS WHAT, ENFORCED IN RLS: THE LAST TWO STATEMENTS (R39)      */\n";
  const fksFirst = swap(swap(migration, columnBlock, ""), POLICIES_SECTION, `${columnBlock}\n${POLICIES_SECTION}`);
  const sendsPolicy = /CREATE POLICY appointment_survey_sends_select ON[\s\S]*?\);--> statement-breakpoint\n/.exec(migration)[0];
  const LAST_TWO = /^the CREATE POLICY statements are not the last two statements of the file, and the only two \(R39\)$/;
  const cases = [
    ["statement 1", swap(migration, "SET LOCAL lock_timeout = '5s';", "SET LOCAL lock_timeout = '50s';"), /^statement 1 is not exactly/],
    ["statement 2", swap(migration, "SET LOCAL statement_timeout = '60s';", "SET LOCAL statement_timeout = '600s';"), /^statement 2 is not exactly/],
    ["a later bound", add("SELECT set_config('lock_timeout', '0', true);"), /^a later statement names a bound$/],
    // THE THIRD SET LOCAL (strategy, 2026-10-06, Q5 of S-1006-A): present, third, at its ruled value, and set once.
    ["statement 3: another value", swap(migration, "SET LOCAL idle_in_transaction_session_timeout = '15s';", "SET LOCAL idle_in_transaction_session_timeout = '150s';"), /^statement 3 is not exactly/],
    ["statement 3: zero, which is no limit", swap(migration, "SET LOCAL idle_in_transaction_session_timeout = '15s';", "SET LOCAL idle_in_transaction_session_timeout = 0;"), /^statement 3 is not exactly/],
    ["statement 3: a session SET, which would outlive the transaction", swap(migration, "SET LOCAL idle_in_transaction_session_timeout = '15s';", "SET idle_in_transaction_session_timeout = '15s';"), /^statement 3 is not exactly/],
    ["statement 3: the third SET LOCAL left out", swap(migration, "SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint\n", ""), /^statement 3 is not exactly/],
    ["statement 3: the third SET LOCAL inside a comment", swap(migration, "SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint\n", "/* SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint */\n"), /^statement 3 is not exactly/],
    ["the idle bound set again later, which would undo the ruled 15 s", add("SET LOCAL idle_in_transaction_session_timeout = '30s';"), /^a later statement names a bound$/],
    ["the idle bound switched off later through set_config", add("SELECT set_config('idle_in_transaction_session_timeout', '0', true);"), /^a later statement names a bound$/],
    ["transaction control", add("COMMIT;"), /^a statement is transaction control, RESET or DISCARD$/],
    ["a DELETE FROM inside a door", body("opt_out_survey", "  UPDATE public.patients p", "  DELETE FROM public.patients p WHERE false;\n  UPDATE public.patients p"), /^a DELETE FROM, TRUNCATE, DROP, COPY or MERGE in the code$/],
    ["a TRUNCATE", add("TRUNCATE public.appointment_survey_codes;"), /^a DELETE FROM, TRUNCATE, DROP, COPY or MERGE in the code$/],
    ["a DROP inside a door", body("purge_expired_survey_comments", "  RETURN v_purged;", "  EXECUTE 'SELECT 1'; DROP TABLE IF EXISTS public.zz_none;\n  RETURN v_purged;"), /^a DELETE FROM, TRUNCATE, DROP, COPY or MERGE in the code$/],
    ["a top-level UPDATE", add("UPDATE public.patients SET survey_enabled = true WHERE false;"), /^a write statement outside a function body$/],
    ["a top-level INSERT", add("INSERT INTO public.appointment_survey_codes SELECT NULL WHERE false;"), /^a write statement outside a function body$/],
    ["the answers cascade with the appointment (O6)", swap(migration, "ADD CONSTRAINT appointment_survey_responses_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id),", "ADD CONSTRAINT appointment_survey_responses_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE,"), /^ON DELETE is not exactly the two cascades/],
    ["the sends lose their cascade", swap(migration, "FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE,", "FOREIGN KEY (appointment_id) REFERENCES public.appointments(id),"), /^ON DELETE is not exactly the two cascades/],
    ["the sends' cascade turned into SET NULL", swap(migration, "FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE,", "FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL,"), /^ON DELETE is not exactly the two cascades/],
    ["the code loses its cascade from the send", swap(migration, "REFERENCES public.appointment_survey_sends(id) ON DELETE CASCADE\n);", "REFERENCES public.appointment_survey_sends(id)\n);"), /^ON DELETE is not exactly the two cascades/],
    ["an eighth ALTER TABLE", add("ALTER TABLE public.appointment_survey_codes FORCE ROW LEVEL SECURITY;"), SEVEN],
    ["RLS left off one table", swap(migration, "ALTER TABLE public.appointment_survey_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint\n", ""), SEVEN],
    ["a foreign key left out: the codes' whole statement", swap(migration, CODES_FK_TEXT, ""), SEVEN],
    ["a foreign key under another name", swap(migration, "ADD CONSTRAINT appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by)", "ADD CONSTRAINT appointment_survey_sends_sender_fkey FOREIGN KEY (sent_by)"), SEVEN],
    // THE FOLD (R44): a fold that drops, renames or re-points a clause, or that is undone, is refused as not the seven.
    ["the fold drops a clause from the middle of the sends' statement", swap(migration, CLAUSE_TEXT("appointment_survey_sends", "sent_by", "users"), ""), SEVEN],
    ["the fold drops the last clause of the answers' statement", swap(migration, `${CLAUSE_TEXT("appointment_survey_responses", "tenant_id", "tenants")}${CLAUSE_TEXT("appointment_survey_responses", "patient_id", "patients", "", LAST)}`, CLAUSE_TEXT("appointment_survey_responses", "tenant_id", "tenants", "", LAST)), SEVEN],
    ["the fold renames a clause in the answers' statement", swap(migration, "ADD CONSTRAINT appointment_survey_responses_tenant_id_fkey FOREIGN KEY (tenant_id)", "ADD CONSTRAINT appointment_survey_responses_tenant_fkey FOREIGN KEY (tenant_id)"), SEVEN],
    ["the fold points a clause at another table", swap(migration, CLAUSE_TEXT("appointment_survey_sends", "sent_by", "users"), CLAUSE_TEXT("appointment_survey_sends", "sent_by", "tenants")), SEVEN],
    ["the fold names another column in a clause", swap(migration, "ADD CONSTRAINT appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by)", "ADD CONSTRAINT appointment_survey_sends_sent_by_fkey FOREIGN KEY (patient_id)"), SEVEN],
    ["the fold carries a clause twice", swap(migration, CLAUSE_TEXT("appointment_survey_sends", "sent_by", "users"), `${CLAUSE_TEXT("appointment_survey_sends", "sent_by", "users")}${CLAUSE_TEXT("appointment_survey_sends", "sent_by", "users")}`), SEVEN],
    ["the fold undone for one clause: a foreign key back in a statement of its own", swap(migration, CLAUSE_TEXT("appointment_survey_sends", "tenant_id", "tenants"), `${CLAUSE_TEXT("appointment_survey_sends", "tenant_id", "tenants", "", LAST)}ALTER TABLE public.appointment_survey_sends\n`), SEVEN],
    ["a clause of another kind folded in beside the foreign keys", swap(migration, CLAUSE_TEXT("appointment_survey_sends", "sent_by", "users"), `${CLAUSE_TEXT("appointment_survey_sends", "sent_by", "users")}  ADD COLUMN zz integer,\n`), null],
    ["a grant to anon", add("GRANT SELECT ON TABLE public.appointment_survey_sends TO anon;"), /^the GRANTs are not exactly the nine/],
    ["INSERT granted on answers", swap(migration, "GRANT SELECT ON TABLE public.appointment_survey_responses TO authenticated;", "GRANT SELECT, INSERT ON TABLE public.appointment_survey_responses TO authenticated;"), /^the GRANTs are not exactly the nine/],
    ["the purge granted", add("GRANT EXECUTE ON FUNCTION public.purge_expired_survey_comments(uuid) TO authenticated;"), /^the GRANTs are not exactly the nine/],
    ["R34: the trigger function granted", add("GRANT EXECUTE ON FUNCTION public.patients_survey_switch_audit() TO authenticated;"), /^the GRANTs are not exactly the nine/],
    ["R34: a column-level UPDATE of the switch for authenticated (the reminder switches have none)", add("GRANT UPDATE (survey_enabled) ON public.patients TO authenticated;"), /^the GRANTs are not exactly the nine/],
    ["a table REVOKE on patients", add("REVOKE UPDATE ON TABLE public.patients FROM patient;"), /^the REVOKEs are not exactly the twelve/],
    ["service_role kept on a door", swap(migration, "REVOKE ALL ON FUNCTION public.resolve_survey_code(text) FROM PUBLIC, anon, authenticated, patient, service_role;", "REVOKE ALL ON FUNCTION public.resolve_survey_code(text) FROM PUBLIC, anon, authenticated, patient;"), /^the REVOKEs are not exactly the twelve/],
    ["authenticated kept on codes", swap(migration, "REVOKE ALL ON TABLE public.appointment_survey_codes FROM PUBLIC, anon, authenticated, patient;", "REVOKE ALL ON TABLE public.appointment_survey_codes FROM PUBLIC, anon, patient;"), /^the REVOKEs are not exactly the twelve/],
    ["R34: authenticated kept on the trigger function", swap(migration, "REVOKE ALL ON FUNCTION public.patients_survey_switch_audit() FROM PUBLIC, anon, authenticated, patient, service_role;", "REVOKE ALL ON FUNCTION public.patients_survey_switch_audit() FROM PUBLIC, anon, patient, service_role;"), /^the REVOKEs are not exactly the twelve/],
    ["a door without its search_path", swap(migration, "  SECURITY DEFINER\n  SET search_path = public\nAS $fn$\nBEGIN\n  RETURN QUERY\n  SELECT s.tenant_id", "  SECURITY DEFINER\nAS $fn$\nBEGIN\n  RETURN QUERY\n  SELECT s.tenant_id"), /^resolve_survey_code does not end its header with SET search_path = public$/],
    ["the helper made SECURITY DEFINER", body("survey_manual_verdict", "  STABLE\n  SET search_path = public\n", "  STABLE\n  SECURITY DEFINER\n  SET search_path = public\n"), /^survey_manual_verdict is SECURITY DEFINER$/],
    ["a door made SECURITY INVOKER", body("opt_out_survey", "  SECURITY DEFINER\n", ""), /^opt_out_survey is not SECURITY DEFINER$/],
    ["R34: the trigger function made SECURITY INVOKER", body("patients_survey_switch_audit", "  SECURITY DEFINER\n", ""), /^patients_survey_switch_audit is not SECURITY DEFINER$/],
    ["a door not owned by postgres", swap(migration, "ALTER FUNCTION public.opt_out_survey(text, uuid) OWNER TO postgres;--> statement-breakpoint\n", ""), /^opt_out_survey is not owned by postgres$/],
    // THE BLOCKER OF THE REVIEW: the helper's owner pin, exactly as the draft had it.
    ["the private helper pinned to an owner", swap(migration, "REVOKE ALL ON FUNCTION public.survey_manual_verdict(uuid, uuid, text) FROM", "ALTER FUNCTION public.survey_manual_verdict(uuid, uuid, text) OWNER TO postgres;--> statement-breakpoint\nREVOKE ALL ON FUNCTION public.survey_manual_verdict(uuid, uuid, text) FROM"), /^an owner pin that is not one of the eight SECURITY DEFINER functions', which the pairing rule refuses: ALTER FUNCTION public\.survey_manual_verdict/],
    ["an owner pin on a function this file does not create", add("ALTER FUNCTION public.jwt_role() OWNER TO postgres;"), /^an owner pin that is not one of the eight/],
    ["a door pinned to another owner", swap(migration, "ALTER FUNCTION public.opt_out_survey(text, uuid) OWNER TO postgres;", "ALTER FUNCTION public.opt_out_survey(text, uuid) OWNER TO supabase_admin;"), null],
    // THE MAJOR OF THE REVIEW: each door that only the server's own session may call, with its test taken out.
    ["the answer door admits a session with a user", body("submit_survey_response", "     OR (SELECT auth.uid()) IS NOT NULL\n", ""), /^submit_survey_response does not refuse a session that carries a user or a patient claim$/],
    ["the opt-out door admits a session with a user", body("opt_out_survey", "     OR (SELECT auth.uid()) IS NOT NULL\n", ""), /^opt_out_survey does not refuse a session that carries a user or a patient claim$/],
    ["the read admits a session with a user", body("resolve_survey_code", "     AND (SELECT auth.uid()) IS NULL\n", ""), /^resolve_survey_code does not refuse a session that carries a user or a patient claim$/],
    ["the read admits a patient claim", body("resolve_survey_code", "     AND (SELECT public.jwt_patient_id()) IS NULL\n", ""), /^resolve_survey_code does not refuse a session that carries a user or a patient claim$/],
    ["the answer door admits a patient claim", body("submit_survey_response", "     OR (SELECT public.jwt_patient_id()) IS NOT NULL THEN", " THEN"), /^submit_survey_response does not refuse a session that carries a user or a patient claim$/],
    ["the automatic door admits a session with a user", body("issue_survey_automatic", "     OR (SELECT auth.uid()) IS NOT NULL\n", ""), /^issue_survey_automatic does not refuse a session that carries a user or a patient claim$/],
    ["the answer door does not test the code's shape", body("submit_survey_response", "     OR p_code_hash !~ '^[0-9a-f]{64}$'\n", ""), /^submit_survey_response does not test the code's shape before it uses it$/],
    ["the opt-out door does not test the code's shape", body("opt_out_survey", "     OR p_code_hash !~ '^[0-9a-f]{64}$'\n", ""), /^opt_out_survey does not test the code's shape before it uses it$/],
    ["the automatic door does not test the code's shape", body("issue_survey_automatic", "     OR p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$'\n", ""), /^issue_survey_automatic does not test the code's shape before it uses it$/],
    ["the manual door does not test the code's shape", body("issue_survey_manual", "  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN", "  IF p_code_hash IS NULL THEN"), /^issue_survey_manual does not test the code's shape before it uses it$/],
    ["the consent label unbounded", swap(migration, "\n    CONSTRAINT appointment_survey_responses_consent_version_length CHECK (char_length(consent_version) <= 64),", ","), /^the consent label has no length bound$/],
    ["the consent label bounded at 640", swap(migration, "CHECK (char_length(consent_version) <= 64),", "CHECK (char_length(consent_version) <= 640),"), /^the consent label has no length bound$/],
    // THE FOREIGN KEYS TO THE PATIENT STAY NO ACTION: an answer is never erased as a side effect of deleting a patient.
    ["the answers cascade with the patient", swap(migration, "ADD CONSTRAINT appointment_survey_responses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);", "ADD CONSTRAINT appointment_survey_responses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;"), /^ON DELETE is not exactly the two cascades/],
    ["the sends cascade with the patient", swap(migration, "ADD CONSTRAINT appointment_survey_sends_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);", "ADD CONSTRAINT appointment_survey_sends_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;"), /^ON DELETE is not exactly the two cascades/],
    // THE PATIENTS COLUMN IS LATE: a statement put between it and the policies, and the column back where the draft had it.
    ["a statement between the patients column and the policies", swap(migration, "\nCOMMENT ON COLUMN public.patients.survey_enabled IS", "\nCOMMENT ON TABLE public.appointment_survey_codes IS 'x';--> statement-breakpoint\n\nCOMMENT ON COLUMN public.patients.survey_enabled IS"), BETWEEN],
    ["a statement about patients itself between the patients column and the policies", swap(migration, "\nCOMMENT ON COLUMN public.patients.survey_enabled IS", "\nCREATE INDEX patients_survey_enabled_idx ON public.patients (survey_enabled);--> statement-breakpoint\n\nCOMMENT ON COLUMN public.patients.survey_enabled IS"), BETWEEN],
    ["the patients column back at the top of the file", swap(swap(migration, "ALTER TABLE public.patients\n  ADD COLUMN survey_enabled boolean NOT NULL DEFAULT true;--> statement-breakpoint\n", ""), "SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint\n", "SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint\nALTER TABLE public.patients\n  ADD COLUMN survey_enabled boolean NOT NULL DEFAULT true;--> statement-breakpoint\n"), BETWEEN],
    ["a tenth function", add("CREATE FUNCTION public.zz_extra() RETURNS int LANGUAGE sql SET search_path = public AS $x$ SELECT 1 $x$;"), /^10 functions are created, not 9$/],
    ["R34: the trigger narrowed to UPDATE OF survey_enabled", swap(migration, "  AFTER UPDATE ON public.patients\n  FOR EACH ROW\n", "  AFTER UPDATE OF survey_enabled ON public.patients\n  FOR EACH ROW\n"), /^the triggers are not exactly the one reviewed audit trigger/],
    ["R34: the trigger without its WHEN", swap(migration, "  WHEN (OLD.survey_enabled IS DISTINCT FROM NEW.survey_enabled)\n", ""), /^the triggers are not exactly the one reviewed audit trigger/],
    ["R34: the trigger's WHEN compares with <>, which is NULL-blind", swap(migration, "  WHEN (OLD.survey_enabled IS DISTINCT FROM NEW.survey_enabled)\n", "  WHEN (OLD.survey_enabled <> NEW.survey_enabled)\n"), /^the triggers are not exactly the one reviewed audit trigger/],
    ["R34: the trigger made BEFORE UPDATE", swap(migration, "  AFTER UPDATE ON public.patients\n  FOR EACH ROW\n", "  BEFORE UPDATE ON public.patients\n  FOR EACH ROW\n"), /^the triggers are not exactly the one reviewed audit trigger/],
    ["R34: the trigger per statement", swap(migration, "  AFTER UPDATE ON public.patients\n  FOR EACH ROW\n", "  AFTER UPDATE ON public.patients\n  FOR EACH STATEMENT\n"), /^the triggers are not exactly the one reviewed audit trigger/],
    ["R34: the trigger gone", swap(migration, `${TRIGGER_TEXT}--> statement-breakpoint\n`, ""), /^the triggers are not exactly the one reviewed audit trigger/],
    ["R34: a second trigger", add("CREATE TRIGGER zz AFTER UPDATE ON public.appointment_survey_sends FOR EACH ROW EXECUTE FUNCTION public.patients_survey_switch_audit();"), /^the triggers are not exactly the one reviewed audit trigger/],
    // THE ONE ORDER OF THE LOCKS (round 2 of the review): the column first, then appointments, tenants, users.
    ["the foreign keys before the patients column, the order that ends a read-then-write transaction", fksFirst, ORDER],
    // THE FOLD KEEPS THE ORDER (R44): the same eight clauses in the same three statements, reordered, are refused by the order rule alone.
    ["the fold reorders two clauses: tenants locked before appointments", exchange(CLAUSE_TEXT("appointment_survey_sends", "appointment_id", "appointments", " ON DELETE CASCADE"), CLAUSE_TEXT("appointment_survey_sends", "tenant_id", "tenants")), ORDER],
    ["the fold reorders two clauses: users locked before tenants", exchange(CLAUSE_TEXT("appointment_survey_sends", "tenant_id", "tenants"), CLAUSE_TEXT("appointment_survey_sends", "sent_by", "users")), ORDER],
    ["the fold reorders two clauses of the answers' statement", exchange(CLAUSE_TEXT("appointment_survey_responses", "appointment_id", "appointments"), CLAUSE_TEXT("appointment_survey_responses", "tenant_id", "tenants")), ORDER],
    ["the codes' statement before the sends', which would lock tenants before appointments", swap(swap(migration, CODES_FK_TEXT, ""), SENDS_FK_TEXT, `${CODES_FK_TEXT}${SENDS_FK_TEXT}`), ORDER],
    // NOTHING BEFORE THE FINAL GROUP LOCKS AN EXISTING TABLE: one arm per way of locking one.
    ["an inline REFERENCES to an existing table, as the reviewed file had it", swap(migration, "  tenant_id      uuid NOT NULL,\n  appointment_id uuid NOT NULL,", "  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),\n  appointment_id uuid NOT NULL,"), /^a foreign key to an existing table \(public\.tenants\) before the final group/],
    ["an inline REFERENCES written without its schema", swap(migration, "  sent_by        uuid,", "  sent_by        uuid REFERENCES users(id),"), /^a foreign key to an existing table \(users\) before the final group/],
    ["a table-level FOREIGN KEY clause to an existing table", swap(migration, "  CONSTRAINT appointment_survey_sends_sender_matches_origin CHECK", "  CONSTRAINT zz_fk FOREIGN KEY (location_id) REFERENCES public.locations(id),\n  CONSTRAINT appointment_survey_sends_sender_matches_origin CHECK"), /^a foreign key to an existing table \(public\.locations\) before the final group/],
    ["an index on an existing table before the final group", add("CREATE INDEX zz_idx ON public.appointments (ends_at);"), /^a CREATE INDEX on an existing table \(public\.appointments\) before the final group/],
    ["a comment on an existing table before the final group", add("COMMENT ON TABLE public.patients IS 'x';"), /^a COMMENT on an existing table \(public\.patients\) before the final group/],
    ["a comment on an existing table's column before the final group", add("COMMENT ON COLUMN public.appointments.status IS 'x';"), /^a COMMENT on a column of an existing table \(public\.appointments\) before the final group/],
    ["a LOCK statement", add("LOCK TABLE public.patients IN ACCESS SHARE MODE;"), /^a LOCK statement before the final group/],
    ["the read door back in SQL, which locked appointments and patients at its CREATE", body("resolve_survey_code", "  LANGUAGE plpgsql\n", "  LANGUAGE sql\n"), /^resolve_survey_code is not plpgsql/],
    ["a door that reads patients.survey_enabled made SQL-language", body("issue_survey_automatic", "  LANGUAGE plpgsql\n", "  LANGUAGE sql\n"), /^issue_survey_automatic is not plpgsql/],
    ["the trigger function made SQL-language", body("patients_survey_switch_audit", "  LANGUAGE plpgsql\n", "  LANGUAGE sql\n"), /^patients_survey_switch_audit is not plpgsql/],
    ["a FOR ALL policy", swap(migration, "CREATE POLICY appointment_survey_sends_select ON public.appointment_survey_sends\n  AS PERMISSIVE\n  FOR SELECT", "CREATE POLICY appointment_survey_sends_select ON public.appointment_survey_sends\n  AS PERMISSIVE\n  FOR ALL"), /^the policies are not exactly the two PERMISSIVE SELECT policies/],
    ["a policy to PUBLIC", swap(migration, "CREATE POLICY appointment_survey_responses_select ON public.appointment_survey_responses\n  AS PERMISSIVE\n  FOR SELECT\n  TO authenticated", "CREATE POLICY appointment_survey_responses_select ON public.appointment_survey_responses\n  AS PERMISSIVE\n  FOR SELECT\n  TO PUBLIC"), /^the policies are not exactly the two PERMISSIVE SELECT policies/],
    // R39's own rule, alone: the two policies are still exactly the two, and something follows them, or one stands earlier.
    ["R39: a comment statement after the policies", atEnd("COMMENT ON TABLE public.appointment_survey_codes IS 'x';"), LAST_TWO],
    ["R39: a grant after the policies", `${swap(migration, "GRANT SELECT ON TABLE public.appointment_survey_sends TO authenticated;--> statement-breakpoint\n", "")}\nGRANT SELECT ON TABLE public.appointment_survey_sends TO authenticated;--> statement-breakpoint\n`, LAST_TWO],
    ["R39: the sends policy back where the draft had it, before the doors", swap(swap(migration, sendsPolicy, ""), "/* ====================================================================== */\n/* 5. THE DOORS", `${sendsPolicy}\n/* ====================================================================== */\n/* 5. THE DOORS`), LAST_TWO],
    ["R39: the trigger after the policies", `${swap(migration, `${TRIGGER_TEXT}--> statement-breakpoint\n`, "")}\n${TRIGGER_TEXT}--> statement-breakpoint\n`, LAST_TWO],
  ];
  for (const [name, input, want] of cases) {
    assert.notEqual(input, migration, `${name}: the input did not change the file`);
    const got = migrationProblems(input);
    if (want === null && name.startsWith("a door pinned")) {
      // A door pinned to another owner is both a missing pin and a pin that is not one of the eight.
      assert.deepEqual(got.map((g) => g.slice(0, 44)), ["opt_out_survey is not owned by postgres", "an owner pin that is not one of the eight SE"], name);
      continue;
    }
    if (want === null) {
      // A clause that is not a foreign key, folded into a late statement: it is not one of the seven, AND it is not what may stand after the column.
      assert.equal(got.length, 2, `${name}: ${JSON.stringify(got)}`);
      assert.match(got[0], SEVEN, name);
      assert.match(got[1], BETWEEN, name);
      continue;
    }
    assert.equal(got.length, 1, `${name}: expected exactly one problem, got ${JSON.stringify(got)}`);
    assert.match(got[0], want, name);
  }
  // An ALTER TABLE or a trigger on an existing table before the final group breaks its own list AND the early-lock rule, and both say so.
  const earlyAlter = migrationProblems(add("ALTER TABLE public.appointments ALTER COLUMN notes SET STATISTICS 100;"));
  assert.equal(earlyAlter.length, 2, JSON.stringify(earlyAlter));
  assert.match(earlyAlter[0], SEVEN);
  assert.match(earlyAlter[1], /^an ALTER TABLE on an existing table \(public\.appointments\) before the final group/);
  const earlyTrigger = migrationProblems(add("CREATE TRIGGER zz AFTER UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.patients_survey_switch_audit();"));
  assert.equal(earlyTrigger.length, 2, JSON.stringify(earlyTrigger));
  assert.match(earlyTrigger[0], /^the triggers are not exactly the one reviewed audit trigger/);
  assert.match(earlyTrigger[1], /^a CREATE TRIGGER on an existing table \(public\.appointments\) before the final group/);
  // An ALTER TABLE that is not one of the three, put among them: it is one too many, and it stands where only the three may.
  const lateAlter = migrationProblems(swap(migration, CODES_FK_TEXT, `${CODES_FK_TEXT}ALTER TABLE public.appointments ALTER COLUMN notes SET STATISTICS 100;--> statement-breakpoint\n`));
  assert.equal(lateAlter.length, 2, JSON.stringify(lateAlter));
  assert.match(lateAlter[0], SEVEN);
  assert.match(lateAlter[1], BETWEEN);
  // THE THIRD SET LOCAL, NOT THIRD: moved below the first CREATE TABLE it is both a wrong statement 3 and a later statement naming a bound.
  const idleLate = migrationProblems(swap(swap(migration, "SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint\n", ""), SWITCH_SECTION, `SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint\n\n${SWITCH_SECTION}`));
  assert.deepEqual(idleLate, ["statement 3 is not exactly SET LOCAL idle_in_transaction_session_timeout = '15s';", "a later statement names a bound"]);
  // The third line standing SECOND (the two swapped): statements 2 and 3 are both wrong, and each says so.
  const idleSecond = migrationProblems(swap(swap(swap(migration, "SET LOCAL statement_timeout = '60s';", "@@S@@"), "SET LOCAL idle_in_transaction_session_timeout = '15s';", "SET LOCAL statement_timeout = '60s';"), "@@S@@", "SET LOCAL idle_in_transaction_session_timeout = '15s';"));
  assert.deepEqual(idleSecond.map((p) => p.slice(0, 26)), ["statement 2 is not exactly", "statement 3 is not exactly"]);
  // THE FOLD, UNDONE WHOLE: the eight statements of the round 3 file, one foreign key each, are twelve ALTER TABLE statements and not the seven.
  const unfolded = migrationProblems(migration.replace(/(  ADD CONSTRAINT appointment_survey_(\w+?)_\w+_fkey [^\n]*),\n(?=  ADD CONSTRAINT)/g, (_, line, t) => `${line};--> statement-breakpoint\nALTER TABLE public.appointment_survey_${t}\n`));
  assert.equal(unfolded.length, 1, JSON.stringify(unfolded));
  assert.match(unfolded[0], SEVEN);
  assert.equal(unfolded[0].split(" ADD CONSTRAINT ").length - 1, 8, "the unfolded file is the eight one-clause statements");
  // The reviewed order itself (the foreign keys inline in the first CREATE TABLE, as 1f3312a6 had them): four foreign keys named, four problems.
  const inline = earlyLockProblems(swap(swap(migration, "  tenant_id      uuid NOT NULL,\n  appointment_id uuid NOT NULL,\n  patient_id     uuid NOT NULL,", "  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),\n  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,\n  patient_id     uuid NOT NULL REFERENCES public.patients(id),"), "  sent_by        uuid,", "  sent_by        uuid REFERENCES public.users(id),"));
  assert.deepEqual(inline.map((p) => /\((public\.\w+)\)/.exec(p)[1]), ["public.tenants", "public.appointments", "public.patients", "public.users"]);
  // A word in a COMMENT's string, and a table named inside a function body, lock nothing.
  assert.deepEqual(earlyLockProblems(add("COMMENT ON TABLE public.appointment_survey_codes IS 'REFERENCES public.patients(id); ALTER TABLE public.patients; LOCK';")), []);
  // A third policy breaks two rules, and both say so: it is one too many, and it is not one of the last two alone.
  const third = migrationProblems(add("CREATE POLICY zz ON public.appointment_survey_codes AS PERMISSIVE FOR SELECT TO authenticated USING (false);"));
  assert.equal(third.length, 2, JSON.stringify(third));
  assert.match(third[0], /^the policies are not exactly the two PERMISSIVE SELECT policies/);
  assert.match(third[1], LAST_TWO);
  // One policy gone: the trigger is then the statement before the last, so the last TWO are not both policies.
  const one = migrationProblems(swap(migration, sendsPolicy, ""));
  assert.equal(one.length, 2, JSON.stringify(one));
  assert.match(one[0], /^the policies are not exactly the two PERMISSIVE SELECT policies/);
  assert.match(one[1], LAST_TWO);
});

test("the post-check's nine body pins are the migration's own bodies, flags and volatilities", () => {
  assert.deepEqual(bodyPinProblems(migration, post), []);
  assert.equal(FUNCTIONS.length, 9);
  assert.equal(FUNCTIONS.filter((f) => f.secdef).length, 8);
  // CONTROLS: one byte of one body, a pin's SECURITY DEFINER flag, and a pin's door flag.
  const changedBody = swap(migration, "  RETURN v_purged;\nEND", "  RETURN v_purged ;\nEND");
  assert.deepEqual(bodyPinProblems(changedBody, post).map((p) => p.split(":")[0]), ["purge_expired_survey_comments"]);
  // R34: the audit row's shape is in the trigger function's body, so one byte of it moves its pin.
  const changedAudit = swap(migration, "'survey.switch_changed', 'patient', NEW.id,", "'survey.switch_changed', 'patient', OLD.id,");
  assert.deepEqual(bodyPinProblems(changedAudit, post).map((p) => p.split(":")[0]), ["patients_survey_switch_audit"]);
  const pin = postFunctionPins(post).find((p) => p.name === "survey_manual_verdict");
  assert.ok(pin);
  const flipped = swap(post, `('survey_manual_verdict(uuid,uuid,text)', false, 's', '${pin.md5}', false)`, `('survey_manual_verdict(uuid,uuid,text)', true, 's', '${pin.md5}', false)`);
  assert.deepEqual(bodyPinProblems(migration, flipped), ["survey_manual_verdict: the post-check pins SECURITY DEFINER true"]);
  const door = swap(post, `('survey_manual_verdict(uuid,uuid,text)', false, 's', '${pin.md5}', false)`, `('survey_manual_verdict(uuid,uuid,text)', false, 's', '${pin.md5}', true)`);
  assert.deepEqual(bodyPinProblems(migration, door), ["survey_manual_verdict: the post-check pins door true"]);
  // R32: the fifth reason is in the helper both the state and the door call, after the four of S4, and nowhere else.
  const verdict = bodiesOf(migration).survey_manual_verdict;
  const reasons = [...verdict.matchAll(/RETURN QUERY SELECT '(\w+)'::text/g)].map((m) => m[1]).filter((r) => r !== "not_allowed");
  assert.deepEqual(reasons, ["no_appointment", "opted_out", "no_channel", "open_link", "answered", "ready"]);
});

test("the pre-check and the post-check compare the journal with the pinned sha256 in code", () => {
  assert.deepEqual(journalPinProblems(pre, "pre"), []);
  assert.deepEqual(journalPinProblems(post, "post"), []);
  const zeros = "00000000" + MIGRATION_SHA.slice(8);
  const v23 = `CASE WHEN has_0102 = 1 AND newest_hash = '${MIGRATION_SHA}' THEN 'OK'`;
  assert.deepEqual(journalPinProblems(swap(post, v23, v23.replace(MIGRATION_SHA, zeros)), "post"), ["verdict 23 does not compare the newest row with the pinned sha256"]);
  const has = new RegExp(`WHERE hash = '${MIGRATION_SHA}'\\)(\\s+)AS has_0102,`);
  assert.deepEqual(journalPinProblems(post.replace(has, `WHERE hash = '${zeros}')$1AS has_0102,`), "post"), ["has_0102 does not count the pinned sha256"]);
  assert.deepEqual(journalPinProblems(pre.replace(has, `WHERE hash = '${zeros}')$1AS has_0102,`), "pre"), ["has_0102 does not count the pinned sha256"]);
});

test("the check files write nothing and read no personal column; the pre-check opens READ ONLY, the post-check runs inside the block's", () => {
  assert.deepEqual(writeProblems(pre), []);
  assert.deepEqual(writeProblems(post, PROBE_ROLE_LINES), []);
  const preCode = codeOf(pre);
  assert.ok(preCode.indexOf("BEGIN READ ONLY;") > 0 && preCode.indexOf("BEGIN READ ONLY;") < preCode.indexOf("WITH rel_items AS"));
  // R39's read sits inside that READ ONLY transaction too, before the verdicts.
  assert.ok(preCode.indexOf("BEGIN READ ONLY;") < preCode.indexOf("DO $r39$") && preCode.indexOf("DO $r39$") < preCode.indexOf("WITH rel_items AS"));
  assert.ok(preCode.trimEnd().endsWith("ROLLBACK;"));
  assert.match(blockWith(doc, STAGE2), /-c "begin read only" -f scripts\/db\/postcheck-0102-sat01-tables\.sql -c "rollback"/);
  // The probes' role lines are the only SET lines the post-check holds, and each is let through by name.
  const setLines = codeOf(post).split("\n").map((l) => l.trim()).filter((l) => /^(SET|RESET)\b/.test(l));
  assert.ok(setLines.length >= 8 && setLines.every((l) => PROBE_ROLE_LINES.test(l)), setLines.join(" | "));
  // COUNTS AND CATALOGUE FACTS ONLY. patients and appointments are read through count(*), and the only
  // column of a person either file names in a read is survey_enabled, in a count's WHERE.
  for (const [name, sql] of [["pre", pre], ["post", post]]) {
    const code = codeOf(sql);
    const reads = [...code.matchAll(/FROM public\.(patients|appointments)\b[^)]*/g)].map((m) => m[0]);
    assert.ok(reads.length >= 1, `${name}: patients is never read`);
    for (const r of reads) assert.match(r, /^FROM public\.(patients|appointments)(\s+WHERE (survey_enabled IS DISTINCT FROM true|status = 'completed'))?\s*$/, `${name}: ${r}`);
    assert.equal((code.match(/count\(\*\)::int FROM public\.(patients|appointments)/g) ?? []).length, reads.length, `${name}: a read of patients or appointments that is not a count`);
    assert.doesNotMatch(code.replace(/'(?:[^']|'')*'/g, "''"), /\b(full_name|date_of_birth|nif|address|postal_code)\b/, `${name} names a personal column`);
  }
  // CONTROLS
  assert.notDeepEqual(writeProblems(`${pre}\nDELETE FROM public.patients;\n`), []);
  assert.notDeepEqual(writeProblems(`${post}\nSET LOCAL ROLE postgres;\n`, PROBE_ROLE_LINES), []);
  assert.notDeepEqual(writeProblems(`${post}\nSET session_replication_role = replica;\n`, PROBE_ROLE_LINES), []);
  assert.notDeepEqual(writeProblems(`${pre}\nSELECT 'GRANT SELECT ON public.patients TO anon';\n`), []);
  for (const v of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "CREATE", "ALTER", "DROP", "GRANT", "REVOKE", "COPY", "MERGE", "CALL", "VACUUM", "LOCK", "COMMIT", "SET", "RESET"]) {
    assert.equal(writeProblems(`${v} x;`).length, 1, v);
  }
});

/** R39's read in the pre-check: ONE read of the platform setting, in a sub-block that cannot fail the file, printed as INFO and never as a verdict. */
export function policyGrantsReadProblems(preSql) {
  const problems = [];
  const code = codeOf(preSql);
  const reads = code.split("current_setting('supautils.policy_grants', true)").length - 1;
  if (reads !== 1) problems.push(`the pre-check reads supautils.policy_grants ${reads} times, not once, with missing_ok`);
  if (/current_setting\('supautils\.policy_grants'\)/.test(code)) problems.push("a read of the setting without missing_ok, which raises where the setting is absent");
  const block = /DO \$r39\$([\s\S]*?)\$r39\$;/.exec(code)?.[1] ?? "";
  if (!block.includes("current_setting('supautils.policy_grants', true)")) problems.push("the read is not inside its own DO block");
  if (!/EXCEPTION WHEN OTHERS THEN\s+info := /.test(block)) problems.push("the read's block has no handler that turns any error into a printed line");
  if (/\bRAISE\b/.test(block)) problems.push("the read's block can raise");
  if (!block.includes("auth.users")) problems.push("the read does not say whether auth.users is among the tables");
  if (!block.includes("jsonb_array_length(e.value)")) problems.push("the read does not count the tables per role");
  const row = code.split("\n").find((l) => l.startsWith("UNION ALL SELECT 'INFO R39:"));
  if (!row || !row.includes("policy_grants_info") || !/'INFO' FROM j;?$/.test(row.trim())) problems.push("the setting is not printed as an INFO row");
  if (/policy_grants_info[^\n]*THEN 'OK'|WHEN[^\n]*policy_grants_info/.test(code)) problems.push("a verdict reads the setting");
  return problems;
}

/** The ten foreign keys as the post-check's verdict 3 pins them: `name definition`, as pg_get_constraintdef prints one with public on the search_path. */
export function postForeignKeyPins(postSql) {
  const m = /AND fk_defs_seen = ((?:\s*(?:\|\| )?'[^']*')+)/.exec(postSql);
  return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join("").split("; ") : [];
}
/** The same ten, derived from the migration: the eight late ADD CONSTRAINT clauses (three ALTER TABLE statements) and the two inline REFERENCES to this file's own table. */
export function migrationForeignKeys(sql) {
  const flat = codeOf(sql).replace(/\s+/g, " ");
  const late = [...flat.matchAll(/ADD CONSTRAINT (\w+) FOREIGN KEY \((\w+)\) REFERENCES public\.(\w+)\(id\)( ON DELETE CASCADE)?[,;]/g)].map((m) => `${m[1]} FOREIGN KEY (${m[2]}) REFERENCES ${m[3]}(id)${m[4] ?? ""}`);
  const inline = [];
  for (const tbl of flat.matchAll(/CREATE TABLE public\.(\w+) \((.*?)\);--> statement-breakpoint/g)) {
    for (const m of tbl[2].matchAll(/(\w+) uuid (?:NOT NULL )?(?:UNIQUE )?REFERENCES public\.(\w+)\(id\)( ON DELETE CASCADE)?/g)) inline.push(`${tbl[1]}_${m[1]}_fkey FOREIGN KEY (${m[1]}) REFERENCES ${m[2]}(id)${m[3] ?? ""}`);
  }
  return [...late, ...inline].sort();
}

/** What round 2 made the post-check pin: the ten foreign keys by name and definition (the migration's own), validated, and plpgsql for all nine. */
export function latePinProblems(sql, postSql) {
  const problems = [];
  const pinned = postForeignKeyPins(postSql);
  const own = migrationForeignKeys(sql);
  if (pinned.length !== 10) problems.push(`the post-check pins ${pinned.length} foreign keys by name, not ten`);
  if (JSON.stringify(pinned) !== JSON.stringify(own)) problems.push("the foreign keys the post-check pins are not the migration's own, by name and definition");
  if (!/THEN 'OK'/.test(postSql.slice(postSql.indexOf("AND fks_valid = 10"), postSql.indexOf("AND fks_valid = 10") + 2500)) || !postSql.includes("AND fks_valid = 10\n             AND fk_defs_seen = ")) {
    problems.push("verdict 3 does not require the ten to be validated and not deferrable");
  }
  if (postSql.split("AND lang = 'plpgsql'").length - 1 !== 2 || !postSql.includes("(SELECT l.lanname::text FROM pg_language l WHERE l.oid = p.prolang) AS lang")) {
    problems.push("verdict 6 does not require plpgsql of all nine functions, in both its count and its list");
  }
  return problems;
}

test("the post-check pins the ten foreign keys by NAME and definition, they are the migration's own, and all nine functions are pinned plpgsql", () => {
  assert.deepEqual(latePinProblems(migration, post), []);
  const pinned = postForeignKeyPins(post);
  assert.deepEqual([...pinned].sort(), pinned, "the literal is in the order the post-check aggregates: by name");
  // Eight of the ten are the late ones, by the names an inline REFERENCES gives.
  assert.equal(pinned.filter((p) => LATE_FKS.some((s) => s.includes(`ADD CONSTRAINT ${p.split(" ")[0]} `))).length, 8);
  // CONTROLS, one rule at a time. The migration: a name, a delete rule, a missing key.
  const OWN = ["the foreign keys the post-check pins are not the migration's own, by name and definition"];
  assert.deepEqual(latePinProblems(swap(migration, "ADD CONSTRAINT appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by)", "ADD CONSTRAINT appointment_survey_sends_sender_fkey FOREIGN KEY (sent_by)"), post), OWN);
  assert.deepEqual(latePinProblems(swap(migration, "FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE,", "FOREIGN KEY (appointment_id) REFERENCES public.appointments(id),"), post), OWN);
  // A clause dropped from a folded statement, in the middle and at its end: the post-check would look for a key the file no longer makes.
  assert.deepEqual(latePinProblems(swap(migration, "  ADD CONSTRAINT appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(id),\n", ""), post), OWN);
  assert.deepEqual(latePinProblems(swap(migration, "FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),\n  ADD CONSTRAINT appointment_survey_responses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);", "FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);"), post), OWN);
  assert.deepEqual(latePinProblems(swap(migration, "  send_id   uuid NOT NULL UNIQUE REFERENCES public.appointment_survey_sends(id) ON DELETE CASCADE", "  send_id   uuid NOT NULL UNIQUE"), post), OWN);
  // The post-check: a pin changed, the pin gone, validation not asked, the language not asked.
  assert.deepEqual(latePinProblems(migration, swap(post, "'appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES users(id); '", "'appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL; '")), OWN);
  assert.deepEqual(latePinProblems(migration, swap(post, "             AND fk_defs_seen = ", "             AND fks_seen_twice = ")).slice(0, 2), ["the post-check pins 0 foreign keys by name, not ten", OWN[0]]);
  assert.deepEqual(latePinProblems(migration, swap(post, "             AND fks_valid = 10\n", "")), ["verdict 3 does not require the ten to be validated and not deferrable"]);
  assert.deepEqual(latePinProblems(migration, swap(post, "AND src_md5 = body_md5 AND lang = 'plpgsql')          AS fns_ok", "AND src_md5 = body_md5)          AS fns_ok")), ["verdict 6 does not require plpgsql of all nine functions, in both its count and its list"]);
  assert.deepEqual(latePinProblems(migration, swap(post, "AND src_md5 = body_md5 AND lang = 'plpgsql')) AS fns_bad", "AND src_md5 = body_md5)) AS fns_bad")), ["verdict 6 does not require plpgsql of all nine functions, in both its count and its list"]);
});

/** The pre-check's read of idle_in_transaction_session_timeout: once, with missing_ok, an INFO row, in no verdict. A name and a value only. */
export function idleReadProblems(preSql) {
  const problems = [];
  const code = codeOf(preSql);
  const reads = code.split("current_setting('idle_in_transaction_session_timeout', true)").length - 1;
  if (reads !== 1) problems.push(`the pre-check reads idle_in_transaction_session_timeout ${reads} times, not once, with missing_ok`);
  if (/current_setting\('idle_in_transaction_session_timeout'\)/.test(code)) problems.push("a read of the setting without missing_ok");
  const row = code.split("\n").find((l) => l.startsWith("UNION ALL SELECT 'INFO idle_in_transaction_session_timeout"));
  if (!row || !/, idle_in_tx, '[^']*', 'INFO' FROM j$/.test(row.trim())) problems.push("the setting is not printed as an INFO row");
  if (/idle_in_tx[^\n]*THEN 'OK'|WHEN[^\n]*idle_in_tx/.test(code)) problems.push("a verdict reads the setting");
  if (/\bSET\s+(LOCAL\s+|SESSION\s+)?idle_in_transaction_session_timeout\b|set_config\('idle_in_transaction_session_timeout'/i.test(code)) problems.push("the pre-check sets the setting");
  return problems;
}

test("the pre-check prints idle_in_transaction_session_timeout as INFO: one read, never a verdict, never set", () => {
  assert.deepEqual(idleReadProblems(pre), []);
  assert.ok(!codeOf(post).includes("idle_in_transaction_session_timeout"), "the post-check does not read the setting");
  // The migration sets it, once, as its third statement (strategy, 2026-10-06); the pre-check still only READS the database's own value.
  assert.equal(codeOf(migration).split("idle_in_transaction_session_timeout").length - 1, 1);
  assert.equal(statementsOf(migration)[2], "SET LOCAL idle_in_transaction_session_timeout = '15s';");
  const read = "current_setting('idle_in_transaction_session_timeout', true)";
  assert.deepEqual(idleReadProblems(swap(pre, read, "current_setting('idle_in_transaction_session_timeout')")), [
    "the pre-check reads idle_in_transaction_session_timeout 0 times, not once, with missing_ok", "a read of the setting without missing_ok",
  ]);
  assert.deepEqual(idleReadProblems(`${pre}\nSELECT ${read};\n`), ["the pre-check reads idle_in_transaction_session_timeout 2 times, not once, with missing_ok"]);
  assert.deepEqual(idleReadProblems(swap(pre, "idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j", "idle_in_tx, 'set', CASE WHEN idle_in_tx <> '0' THEN 'OK' ELSE 'FAIL' END FROM j")), [
    "the setting is not printed as an INFO row", "a verdict reads the setting",
  ]);
  assert.deepEqual(idleReadProblems(`${pre}\nSELECT set_config('idle_in_transaction_session_timeout', '30s', true);\n`), ["the pre-check sets the setting"]);
  assert.deepEqual(idleReadProblems(swap(pre, "UNION ALL SELECT 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j\n", "")), ["the setting is not printed as an INFO row"]);
});

test("R39: the pre-check reads supautils.policy_grants once, cannot fail on it, and prints it as INFO", () => {
  assert.deepEqual(policyGrantsReadProblems(pre), []);
  assert.ok(!codeOf(post).includes("supautils"), "the post-check does not read the setting");
  // CONTROLS, one rule at a time.
  const read = "current_setting('supautils.policy_grants', true)";
  assert.deepEqual(policyGrantsReadProblems(swap(pre, read, "current_setting('supautils.policy_grants')")).slice(0, 2), [
    "the pre-check reads supautils.policy_grants 0 times, not once, with missing_ok", "a read of the setting without missing_ok, which raises where the setting is absent",
  ]);
  assert.deepEqual(policyGrantsReadProblems(swap(pre, "  EXCEPTION WHEN OTHERS THEN\n    info := ", "  EXCEPTION WHEN undefined_object THEN\n    info := ")), ["the read's block has no handler that turns any error into a printed line"]);
  assert.deepEqual(policyGrantsReadProblems(swap(pre, "      IF jsonb_typeof(doc) <> 'object' THEN\n        info := 'set, JSON but not an object';", "      IF jsonb_typeof(doc) <> 'object' THEN\n        RAISE EXCEPTION 'not an object';")), ["the read's block can raise"]);
  assert.deepEqual(policyGrantsReadProblems(`${pre}\nSELECT ${read};\n`)[0], "the pre-check reads supautils.policy_grants 2 times, not once, with missing_ok");
  assert.deepEqual(policyGrantsReadProblems(swap(pre, "policy_grants_info, 'a profile, never a verdict', 'INFO' FROM j;", "policy_grants_info, 'set', CASE WHEN policy_grants_info <> 'not set' THEN 'OK' ELSE 'FAIL' END FROM j;")), [
    "the setting is not printed as an INFO row", "a verdict reads the setting",
  ]);
});

/** THE HELD HEAD. Every block resolves the pull request's held branch, once, never main, and uses the record /tmp/0102-head.sha. */
export function heldHeadProblems(block) {
  const problems = [];
  const resolved = [...block.matchAll(/git rev-parse (origin\/[^)\s]+)\)/g)].map((m) => m[1]);
  for (const r of resolved) if (r !== HELD_REF) problems.push(`the block resolves ${r}, not the held head ${HELD_REF}`);
  if (resolved.length !== 1) problems.push(`the block resolves a remote ref ${resolved.length} times, not once`);
  if (/origin\/main/.test(block)) problems.push("the block names origin/main");
  if (/\/tmp\/0102-main\.sha/.test(block) || !block.includes("/tmp/0102-head.sha")) problems.push("the block does not use the record /tmp/0102-head.sha");
  return problems;
}

test("THE HELD HEAD: every block resolves origin/db/0102-sat01-tables, once, and never main; and stage 2's last line counts what the migration creates", () => {
  for (const b of blocksOf(doc)) assert.deepEqual(heldHeadProblems(b), [], b.slice(0, 80));
  const s0 = blockWith(doc, STAGE0);
  const s1 = blockWith(doc, STAGE1);
  // RED ARMS, one rule at a time.
  assert.deepEqual(heldHeadProblems(swap(s1, `git rev-parse ${HELD_REF})`, "git rev-parse origin/main)")), [
    `the block resolves origin/main, not the held head ${HELD_REF}`, "the block names origin/main",
  ]);
  assert.deepEqual(heldHeadProblems(swap(s0, `git rev-parse ${HELD_REF})`, "git rev-parse origin/db/0101-sat01-tables)")), [`the block resolves origin/db/0101-sat01-tables, not the held head ${HELD_REF}`]);
  assert.deepEqual(heldHeadProblems(`${s1}\nX=$(git rev-parse ${HELD_REF})\n`), ["the block resolves a remote ref 2 times, not once"]);
  assert.deepEqual(heldHeadProblems(swap(s1, `NOW=$(git rev-parse ${HELD_REF})`, "NOW=$(git rev-parse HEAD)")), ["the block resolves a remote ref 0 times, not once"]);
  assert.deepEqual(heldHeadProblems(s1.replaceAll("/tmp/0102-head.sha", "/tmp/0102-main.sha")), ["the block does not use the record /tmp/0102-head.sha"]);
  assert.deepEqual(heldHeadProblems(`${s0}\necho "see origin/main"\n`), ["the block names origin/main"]);
  // Stage 0 records the sha it resolved, and stage 1 compares the branch with that record: the HEAD CHECK.
  assert.ok(s0.split("\n").some((l) => l.startsWith('echo "${HELD}" > /tmp/0102-head.sha || { echo "STOP: ')));
  assert.ok(s1.split("\n").some((l) => l.startsWith('[ "${NOW}" = "${REC}" ] || { echo "STOP: the held head moved since stage 0')));
  // STAGE 2'S LAST LINE says what the migration creates: three tables, eight SECURITY DEFINER functions.
  const lines = blockWith(doc, STAGE2).trimEnd().split("\n");
  assert.equal(lines.at(-1), ")");
  const secdef = FUNCTIONS.filter((f) => f.secdef).length;
  assert.equal(lines.at(-2), `echo "0102 POST-CHECK PASSED. 16/16 pre-check OK, 27/27 post-check OK, journal \${J} to \${JA}; tables \${T} to $((T + ${TABLES.length})), SECURITY DEFINER functions \${S} to $((S + ${secdef})). Paste the closing journal read now."`);
  // The post-check's verdict 16 and the pre-check's header hold the same two numbers.
  assert.ok(codeOf(post).includes(`n_tables = :'tables_before'::int + ${TABLES.length} AND secdef = :'secdef_before'::int + ${secdef} AND secdef_not_postgres = 0`));
  assert.equal(statementsOf(migration).filter((s) => /^CREATE TABLE\b/.test(s)).length, TABLES.length);
});

/** The ten carries: the variable stage 2 reads each into, the pre-check row it comes from, and the -v name the post-check takes it under. */
export const CARRY_MAP = Object.freeze([
  ["J", "journal_rows_before", "journal_rows_before"], ["T", "tables_before", "tables_before"], ["S", "secdef_functions_before", "secdef_before"],
  ["PM", "policies_md5", "policies_md5"], ["FM", "functions_md5", "functions_md5"], ["RM", "relation_acl_md5", "relation_acl_md5"],
  ["CM", "column_acl_md5", "column_acl_md5"], ["DM", "default_acl_md5", "default_acl_md5"], ["TR", "triggers_md5", "triggers_md5"],
  ["PU", "patient_update_columns", "patient_update_columns"],
]);

/**
 * WHAT EACH BLOCK HANDS THE PROGRAMS IT RUNS. The harness fakes psql and verified-migrate, and a fake does not read
 * its arguments, so a block that passed the wrong carry, the wrong predecessor or the wrong tag would pass every
 * run (the mutation sweep found six such lines). These are read off the text.
 */
export function argumentProblems(s1, s2) {
  const problems = [];
  const line = (block, start) => block.split("\n").find((l) => l.startsWith(start)) ?? "";
  // Stage 1: the pre-check is given the PREDECESSOR'S hash and when; verified-migrate this migration's tag, its sha256, and exactly one pending.
  if (!line(s1, 'psql "${DATABASE_URL_DIRECT}"').startsWith(`psql "\${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=\${SHAPREV} -v prev_when=\${W101} -f ${PRE} 2>&1 | tee /tmp/0102-precheck.new || `)) {
    problems.push("stage 1 does not run the pre-check with prev_hash=${SHAPREV} and prev_when=${W101}");
  }
  if (!line(s1, "node packages/db/scripts/verified-migrate.mjs").startsWith(`node packages/db/scripts/verified-migrate.mjs --tag ${TAG} --sha256 \${SHA0102} --expect-pending 1 2>&1 | tee /tmp/0102-apply.out || `)) {
    problems.push(`stage 1 does not run verified-migrate with --tag ${TAG} --sha256 \${SHA0102} --expect-pending 1`);
  }
  // Stage 2: each carry is read from the row of its own name, and handed to the post-check under its own name.
  for (const [v, row, name] of CARRY_MAP) {
    if (!s2.split("\n").includes(`${v}=$(carry ${row})`)) problems.push(`stage 2 does not read \${${v}} from the row ${row}`);
    if (s2.split(`-v ${name}="\${${v}}" `).length !== 2) problems.push(`stage 2 does not pass -v ${name}="\${${v}}" exactly once`);
  }
  const passed = [...s2.matchAll(/-v (\w+)="\$\{([A-Z]+)\}"/g)].map((m) => `${m[2]}:${m[1]}`).sort();
  if (JSON.stringify(passed) !== JSON.stringify(CARRY_MAP.map(([v, , name]) => `${v}:${name}`).sort())) problems.push("stage 2 passes a -v that is not one of the ten carries");
  // The three shape checks on the carries: three counts, six md5s, one list of column names.
  for (const want of [
    `echo "\${J} \${T} \${S}" | grep -qxE '[0-9]+ [0-9]+ [0-9]+' || `,
    `echo "\${PM} \${FM} \${RM} \${CM} \${DM} \${TR}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){5}' || `,
    `echo "\${PU}" | grep -qxE '[a-z_]+(,[a-z_]+)*' || `,
  ]) if (!s2.split("\n").some((l) => l.startsWith(want))) problems.push(`stage 2 lacks the carry check ${want.slice(0, 50)}`);
  return problems;
}

test("THE ARGUMENTS: what stage 1 hands the pre-check and verified-migrate, and what stage 2 hands the post-check, read off the text", () => {
  const s1 = blockWith(doc, STAGE1);
  const s2 = blockWith(doc, STAGE2);
  assert.deepEqual(argumentProblems(s1, s2), []);
  assert.equal(CARRY_MAP.length, 10);
  // RED ARMS: the six lines the mutation sweep found no test for, one at a time.
  const first = (list) => list[0];
  assert.match(first(argumentProblems(s1, swap(s2, "TR=$(carry triggers_md5)", "TR=$(carry policies_md5)"))), /^stage 2 does not read \$\{TR\} from the row triggers_md5$/);
  assert.ok(argumentProblems(s1, swap(s2, '-v patient_update_columns="${PU}" -v triggers_md5="${TR}"', '-v patient_update_columns="${TR}" -v triggers_md5="${PU}"')).length >= 2);
  assert.deepEqual(argumentProblems(s1, swap(s2, "grep -qxE '[a-z_]+(,[a-z_]+)*'", "grep -qxE '.*'")), ["stage 2 lacks the carry check echo \"${PU}\" | grep -qxE '[a-z_]+(,[a-z_]+)*' || "]);
  assert.deepEqual(argumentProblems(swap(s1, "--expect-pending 1 ", "--expect-pending 2 "), s2), [`stage 1 does not run verified-migrate with --tag ${TAG} --sha256 \${SHA0102} --expect-pending 1`]);
  assert.deepEqual(argumentProblems(swap(s1, `verified-migrate.mjs --tag ${TAG} `, `verified-migrate.mjs --tag ${PREV_TAG} `), s2), [`stage 1 does not run verified-migrate with --tag ${TAG} --sha256 \${SHA0102} --expect-pending 1`]);
  assert.deepEqual(argumentProblems(swap(s1, "-v prev_hash=${SHAPREV} ", "-v prev_hash=${SHA0102} "), s2), ["stage 1 does not run the pre-check with prev_hash=${SHAPREV} and prev_when=${W101}"]);
  assert.deepEqual(argumentProblems(swap(s1, "-v prev_when=${W101} ", "-v prev_when=1788502200000 "), s2), ["stage 1 does not run the pre-check with prev_hash=${SHAPREV} and prev_when=${W101}"]);
  assert.ok(argumentProblems(s1, swap(s2, ' -v triggers_md5="${TR}"', "")).length >= 1);
  assert.ok(argumentProblems(s1, swap(s2, "S=$(carry secdef_functions_before)", "S=$(carry tables_before)")).length >= 1);
  // W101 is 0101's journal when, read from the journal at the recorded sha, never typed.
  assert.ok(s1.split("\n").some((l) => l.startsWith("W101=$(node -e ") && l.includes(`p.tag==='${PREV_TAG}'?String(p.when):'none'`)));
});

test("the pre-check and the post-check read a NULL relacl as acldefault of its own object type ('s' for a sequence)", () => {
  assert.deepEqual(aclDefaultProblems(pre), []);
  assert.deepEqual(aclDefaultProblems(post), []);
  const foreignServer = (s) => s.replace(`THEN 's'::"char"`, `THEN 'S'::"char"`);
  assert.notDeepEqual(aclDefaultProblems(foreignServer(pre)), []);
  assert.notDeepEqual(aclDefaultProblems(foreignServer(post)), []);
  assert.deepEqual(aclDefaultProblems("SELECT acldefault('r', c.relowner);"), ["rel_items does not read a NULL relacl as acldefault of its own object type"]);
});

test("the verdict counts the blocks require are the counts the files print", () => {
  assert.equal(okVerdicts(pre), 16);
  assert.equal(okVerdicts(post), 27);
  assert.match(blockWith(doc, STAGE1), /\[ "\$\{OKS\}" = 16 \]/);
  assert.match(blockWith(doc, STAGE2), /\[ "\$\{OKS\}" = 27 \]/);
  assert.match(pre, /every verdict must read OK \(16 expected\)/);
  assert.match(post, /every verdict must read OK \(27 expected\)/);
});

test("blockWith finds exactly one block, and throws on none or two", () => {
  const fence = (body) => "```\n" + body + "\n```\n";
  assert.equal(blockWith(fence("a MARK") + fence("b"), "MARK"), "a MARK\n");
  assert.throws(() => blockWith(fence("a MARK") + fence("b MARK"), "MARK"), /found 2/);
  assert.throws(() => blockWith(fence("a") + fence("b"), "MARK"), /found 0/);
});

test("every pin is the real file or the given value, and SHAGATE is the gate file's", () => {
  assert.deepEqual(pinProblems(doc, ACTUAL, gateText), []);
  // CONTROLS
  assert.notDeepEqual(pinProblems(doc.replace(`SHAPRE=${ACTUAL[PRE]}`, `SHAPRE=${"0".repeat(64)}`), ACTUAL, gateText), []);
  assert.notDeepEqual(pinProblems(doc, { ...ACTUAL, [POST]: "f".repeat(64) }, gateText), []);
  assert.notDeepEqual(pinProblems(doc.replace(`SHAGUARD=${EXTERNAL_PINS.SHAGUARD}`, `SHAGUARD=${"b".repeat(64)}`), ACTUAL, gateText), []);
  assert.notDeepEqual(pinProblems(doc.replace(/^SHAGATE=.*$/m, "SHAGATE=TODO"), ACTUAL, gateText), []);
  assert.notDeepEqual(pinProblems(doc.replace(/^SHA0102=.*$/m, `SHA0102=${"a".repeat(64)}`), ACTUAL, gateText), []);
  const gate = pinLines(doc).find(([n]) => n === "SHAGATE")[1];
  assert.deepEqual(gateProblems(gate, gateText), []);
  assert.deepEqual(gateProblems(gate, null), [`${GATE_FILE} is missing, so SHAGATE proves nothing`]);
  assert.deepEqual(gateProblems(gate, `${gateText} `), [`SHAGATE ${gate} is not the sha256 of ${GATE_FILE}`]);
});

test("THE SIDECAR pins the document, byte for byte", () => {
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
});

test("THE WEEKDAY TABLE: the arm stands in stage 0 and stage 1, with no override and no date, and passes only in closed hours", () => {
  const s0 = blockWith(doc, STAGE0);
  const s1 = blockWith(doc, STAGE1);
  assert.deepEqual(armProblems(s0, 0), []);
  assert.deepEqual(armProblems(s1, 1), []);
  const proofs = (b) => b.split("\n").filter((l) => /^D[123]=no$|^if .*then D1=yes; fi$|^echo "R9 proof [123]/.test(l));
  assert.equal(proofs(s0).length, 7);
  assert.deepEqual(proofs(s1).map((l) => l.replace("${REC}", "${HELD}")), proofs(s0));
  // No block of the document carries a date, an override or the old apply path.
  for (const b of blocksOf(doc)) {
    assert.doesNotMatch(b, /\b20[0-9]{6}\b/, "a date in a block");
    assert.doesNotMatch(b, /\bOVR\b|override/i, "an override in a block");
  }
  // CONTROLS, one rule at a time.
  const one = (b, stage, from, to) => armProblems(swap(b, from, to), stage);
  assert.deepEqual(one(s0, 0, "D2=no\n", "D2=no\nif true; then D2=yes; fi\n"), ["something can turn proof 2 or 3 to yes"]);
  assert.deepEqual(one(s0, 0, "D3=no\n", ""), ["no D3=no line"]);
  assert.deepEqual(one(s0, 0, 'if [ "${CLOCK}" = closed ]; then', 'if [ "${CLOCK}" = closed ] || [ "${D1}${D2}${D3}" = yesyesyes ]; then'), [
    "a daytime path that opens on all three proofs", "the decision is not closed hours or STOP",
  ]);
  assert.deepEqual(one(s1, 1, 'if [ "${CLOCK}${CLINICS}" = closedinside ]; then', 'if [ "${CLOCK}" = closed ]; then'), ["the decision is not closed hours or STOP"]);
  for (const [from, to] of [["t >= 2100", "t >= 2000"], ["t >= 1300", "t >= 1200"], ["d == 7", "d >= 6"], ["d >= 1 && d <= 5", "d >= 1 && d <= 6"], ["(t < 800 || t >= 2100)", "(t < 900 || t >= 2100)"], ["t < 800 || t >= 1300", "t <= 800 || t >= 1300"]]) {
    assert.deepEqual(one(s1, 1, from, to), ["closed is not decided by the weekday table"], from);
    assert.deepEqual(one(s0, 0, from, to), ["closed is not decided by the weekday table"], from);
  }
  assert.deepEqual(one(s0, 0, "date '+%u%H%M %Z'", "date '+%H%M %Z'"), ["the Lisbon weekday, time and zone are not read in one date call, with its halt"]);
  assert.deepEqual(one(s0, 0, "date '+%u%H%M %Z'", "date '+%u%H%M'"), ["the Lisbon weekday, time and zone are not read in one date call, with its halt"]);
  assert.deepEqual(one(s0, 0, "[0-5][0-9] (WET|WEST)' ||", "[0-5][0-9] (WET|WEST|UTC)' ||"), ["the clock reading is not refused unless its zone is WET or WEST"]);
  assert.deepEqual(one(s1, 1, "[0-5][0-9] (WET|WEST)' ||", "[0-5][0-9] [A-Z]+' ||"), ["the clock reading is not refused unless its zone is WET or WEST"]);
  assert.deepEqual(one(s0, 0, `echo "\${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' ||`, `echo "\${DT}" | grep -qxE '[0-9]{5}' ||`), ["the clock reading is not refused unless it is a weekday and HHMM"]);
  assert.deepEqual(one(s0, 0, `${CLOCK_ZONE}\n${CLOCK_SPLIT}\n`, `${CLOCK_SPLIT}\n${CLOCK_ZONE}\n`), ["the clock's five lines are not together and in order"]);
  assert.deepEqual(one(s1, 1, "(opens_at < time '08:00' or closes_at > time '21:00')", "(opens_at < time '08:00')"), ["stage 1 does not hold the clinics' own rows against the table's widest row"]);
  assert.deepEqual(armProblems(`${s0}\nif [ "\${DT}" = 31200 ]; then CLOCK=closed; fi\n`, 0), ["more than one line can set CLOCK=closed"]);
  assert.deepEqual(armProblems(`${s0}\nOVR=no\n`, 0), ["an override arm"]);
  assert.deepEqual(armProblems(`${s0}\necho 20261004\n`, 0), ["a date is written into the block"]);
  const PRE_RUN = "precheck-0102-sat01-tables.sql 2>&1";
  const ARM = "THE CLOCK AND THE CLINICS (R9)";
  const APPLY = "node packages/db/scripts/verified-migrate.mjs";
  assert.deepEqual(armPositionProblems([PRE_RUN, ARM, APPLY].join("\n")), []);
  assert.deepEqual(armPositionProblems([ARM, PRE_RUN, APPLY].join("\n")), ["the arm does not follow the pre-check"]);
  assert.deepEqual(armPositionProblems([PRE_RUN, APPLY, ARM].join("\n")), ["the arm does not precede the apply"]);
});

/** The six minutes the ruling names, then one green arm: [name, weekday, HHMM, closed]. */
export const RULED_POINTS = Object.freeze([
  ["Friday 20:59", 5, "2059", false],
  ["Friday 21:00", 5, "2100", true],
  ["Saturday 12:59", 6, "1259", false],
  ["Saturday 13:00", 6, "1300", true],
  ["Sunday 15:00", 7, "1500", true],
  ["Monday 07:59", 1, "0759", true],
  ["Tuesday 22:30 (the green arm)", 2, "2230", true],
]);

test("THE WEEKDAY TABLE, the arm's own program: the six ruled minutes, and every boundary of every weekday, against the table", () => {
  for (const [name, d, hhmm, closed] of RULED_POINTS) assert.equal(closedByTable(d, Number(hhmm)), closed, `the table in this test disagrees with the ruling at ${name}`);
  for (const marker of [STAGE0, STAGE1]) {
    const program = clockProgramOf(blockWith(doc, marker));
    assert.equal(program, CLOCK_AWK);
    for (const [name, d, hhmm, closed] of RULED_POINTS) {
      assert.equal(runClock(program, `${d}${hhmm}`), closed ? "closed" : "open", `${marker.slice(0, 20)}: ${name}`);
    }
    let cells = 0;
    for (let d = 1; d <= 7; d += 1) {
      for (const hhmm of ["0000", "0001", "0759", "0800", "0801", "1259", "1300", "1301", "2059", "2100", "2101", "2359"]) {
        assert.equal(runClock(program, `${d}${hhmm}`), closedByTable(d, Number(hhmm)) ? "closed" : "open", `weekday ${d} at ${hhmm}`);
        cells += 1;
      }
    }
    assert.equal(cells, 84);
  }
  // CONTROLS: the harness's own reading of a program can go red, each way.
  assert.equal(runClock(CLOCK_AWK.replace("t >= 2100", "t > 2100"), "52100"), "open");
  assert.equal(runClock(CLOCK_AWK.replace("t >= 1300", "t >= 1259"), "61259"), "closed");
  assert.equal(runClock(CLOCK_AWK.replace("if (d == 7) exit 0; ", ""), "71500"), "open");
  assert.equal(runClock(CLOCK_AWK.replace("t < 800 || t >= 2100", "t <= 800 || t >= 2100"), "10800"), "closed");
  // A reading the format check would refuse never reads closed by accident.
  assert.equal(runClock(CLOCK_AWK, ""), "open");
  assert.equal(runClock(CLOCK_AWK, "01200"), "open");
  assert.equal(runClock(CLOCK_AWK, "81200"), "open");
});

test("EVERY date CALL READS LISBON TIME AND ITS ZONE, and the next line refuses any zone but WET or WEST", () => {
  let calls = 0;
  for (const b of blocksOf(doc)) {
    assert.deepEqual(dateProblems(b), [], b.slice(0, 80));
    calls += (b.match(/\bdate (?=['+-])/g) ?? []).length;
  }
  // One in stage 0, three in stage 1 (two window reads and the arm), one each in stage 2 and the closing read.
  assert.equal(calls, 6);
  const s1 = blockWith(doc, STAGE1);
  const s2 = blockWith(doc, STAGE2);
  // RED ARMS, one rule at a time. Dropping TZ from BOTH window reads of stage 1 is the case the
  // harness's stub alone would never have seen: the stub answers by format string.
  const noTz = s1.replaceAll("NOWZ=$(TZ=Europe/Lisbon date ", "NOWZ=$(date ");
  assert.notEqual(noTz, s1);
  assert.deepEqual(dateProblems(noTz).map((x) => x.replace(/^line \d+: /, "")), Array(4).fill(null).map((_, k) => (k % 2 === 0 ? "a date call without TZ=Europe/Lisbon" : "a date call that does not read the zone, alone on its line, into a variable, with its halt")));
  assert.deepEqual(dateProblems(swap(s2, "NOWZ=$(TZ=Europe/Lisbon date ", "NOWZ=$(TZ=UTC date ")).length, 2);
  assert.deepEqual(dateProblems(swap(s2, "date '+%Y%m%d%H%M %Z'", "date '+%Y%m%d%H%M'")).map((x) => x.replace(/^line \d+: /, "")), ["a date call that does not read the zone, alone on its line, into a variable, with its halt"]);
  assert.deepEqual(dateProblems(swap(s2, "grep -qxE '[0-9]{12} (WET|WEST)' ||", "grep -qxE '[0-9]{12} [A-Z]+' ||")).map((x) => x.replace(/^line \d+: /, "")), ["the zone ${NOWZ} read is not required, on the next line, to be WET or WEST"]);
  const zoneLine = s2.split("\n").find((l) => l.startsWith('echo "${NOWZ}" | grep -qxE'));
  assert.equal(dateProblems(s2.replace(`${zoneLine}\n`, "")).length, 1);
  assert.deepEqual(dateProblems('echo "the date is not a call"\nNOW=$(date +%s)'), ["line 2: a date call without TZ=Europe/Lisbon", "line 2: a date call that does not read the zone, alone on its line, into a variable, with its halt"]);
});

test("A POST-COMMIT STOP SAYS WHAT STANDS: the write, on every STOP of stage 2 and the closing read; UNKNOWN on the six whose own read contradicts the marker or did not finish; and stage 1's after the apply", () => {
  const s1 = blockWith(doc, STAGE1);
  const s2 = blockWith(doc, STAGE2);
  const cl = blockWith(doc, CLOSING);
  const M2 = '[ -n "$(find /tmp/0102-applied.ok -mmin -60 2>/dev/null)" ]';
  const M3 = "test -f /tmp/0102-applied.ok";
  const C2 = CONTRADICTING_READS.stage2;
  const C3 = CONTRADICTING_READS.closing;
  assert.deepEqual(postCommitProblems(s2, M2, C2), []);
  assert.deepEqual(postCommitProblems(cl, M3, C3), []);
  assert.deepEqual(stageOnePostApplyProblems(s1), []);
  const stops = (b) => b.split("\n").filter((l) => l.includes('echo "STOP: ')).length;
  assert.ok(stops(s2) >= 40 && stops(cl) >= 25, `${stops(s2)} and ${stops(cl)} STOP lines`);
  // Three STOPs of stage 2 come before or at the marker read and are conditional; two of the closing read's.
  assert.equal(s2.split("If stage 1 ended with its line 0102 APPLIED, then").length - 1, 3);
  assert.equal(cl.split("If stage 1 ended with its line 0102 APPLIED, then").length - 1, 2);
  // EXACTLY SIX STOPs say UNKNOWN, four and two; and stages 0 and 1, which run before the commit, never do.
  assert.equal(s2.split(STATE_UNKNOWN).length - 1, 4);
  assert.equal(C2.length + C3.length, 6);
  assert.equal(cl.split(STATE_UNKNOWN).length - 1, 2);
  for (const b of [blockWith(doc, STAGE0), s1]) assert.ok(!b.includes("Treat the state as UNKNOWN"));
  const clean = (list) => list.map((x) => x.replace(/^line \d+: /, ""));

  // RED ARMS, the flat sentence. One STOP that only says what failed, as the first draft's did.
  const bare = swap(s2, `STOP: a count carry is not a number. ${WRITE_STANDS}`, "STOP: a count carry is not a number");
  assert.match(postCommitProblems(bare, M2, C2)[0], /a post-commit STOP that does not say the write stands: a count carry/);
  assert.equal(postCommitProblems(bare, M2, C2).length, 1);
  // "The write stands" without "run nothing again" is not enough, on any STOP of either kind.
  assert.equal(postCommitProblems(s2.replaceAll(". Run nothing again, not stage 0 and not stage 1", ""), M2, C2).length, stops(s2));
  // An unconditional claim before the marker has been read, and a conditional one after it.
  assert.match(postCommitProblems(swap(cl, `STOP: the apply worktree is not there. If stage 1 ended with its line 0102 APPLIED, then ${WRITE_STANDS}`, `STOP: the apply worktree is not there. ${WRITE_STANDS}`), M3, C3)[0], /says 0102 is applied before the block has read the applied marker/);
  assert.match(postCommitProblems(swap(cl, `STOP: stage 2 left no pass mark, so it did not pass. ${WRITE_STANDS}`, `STOP: stage 2 left no pass mark, so it did not pass. If stage 1 ended with its line 0102 APPLIED, then ${WRITE_STANDS}`), M3, C3)[0], /still conditional after the block has read the applied marker/);
  assert.deepEqual(postCommitProblems(s2.replace(M2, '[ -n "$(find /tmp/0102-other.ok -mmin -60 2>/dev/null)" ]'), M2, C2), ["the block never reads stage 1's applied marker"]);

  // RED ARMS, the six. Each one as the second and third reviews found it: "the sha256 of 0102 is in the journal 0
  // times, not once. 0102 IS APPLIED and the write stands".
  for (const [b, marker, set] of [[s2, M2, C2], [cl, M3, C3]]) {
    for (const start of set) {
      const line = b.split("\n").find((l) => l.startsWith(start));
      assert.ok(line && line.includes(STATE_UNKNOWN), start);
      // Replacements are FUNCTIONS here: the closing read's grep line holds `$'`, which a replacement STRING reads as "the text after the match".
      const flat = line.replace(/Stage 1 recorded that it applied 0102[^"]*/, () => `${WRITE_STANDS}; the lead rules`);
      assert.notEqual(flat, line);
      const flatProblems = clean(postCommitProblems(b.replace(line, () => flat), marker, set));
      assert.equal(flatProblems.length, 1, start);
      assert.ok(flatProblems[0].startsWith("a STOP whose own read can contradict the marker does not say the state is UNKNOWN: "), flatProblems[0]);
      // Both sentences on one line is the contradiction itself.
      const both = line.replace(STATE_UNKNOWN, () => `0102 IS APPLIED and the write stands. ${STATE_UNKNOWN}`);
      assert.deepEqual(clean(postCommitProblems(b.replace(line, () => both), marker, set)), ["a STOP says 0102 IS APPLIED while its own read says otherwise"], start);
      // The line gone: the rule does not quietly lose it.
      assert.ok(postCommitProblems(b.replace(`${line}\n`, ""), marker, set).some((x) => x.startsWith("the block has not exactly one STOP for the contradicting read")), start);
    }
  }
  // A contradicting read placed BEFORE the marker read has no marker to contradict: refused.
  const hn = s2.split("\n").find((l) => l.startsWith('[ "${HN}" = 1 ] || '));
  const moved = s2.replace(`${hn}\n`, () => "").replace(M2, () => `${hn}\n${M2}`);
  assert.notEqual(moved, s2);
  assert.deepEqual(clean(postCommitProblems(moved, M2, C2)), ["a contradicting read before the block has read the applied marker"]);
  // UNKNOWN is not a softer sentence to reach for: on a STOP whose read contradicts nothing it is refused.
  const carryLine = s2.split("\n").find((l) => l.includes("STOP: a count carry is not a number. "));
  const soft = s2.replace(carryLine, () => carryLine.replace(/0102 IS APPLIED and the write stands[^"]*/, () => `${STATE_UNKNOWN}; the lead rules`));
  assert.notEqual(soft, s2);
  assert.deepEqual(clean(postCommitProblems(soft, M2, C2)), ["a STOP calls the state UNKNOWN though its own read contradicts nothing"]);
  // The rule is told which five: told none, it refuses each of them as it would a flat STOP gone wrong.
  assert.equal(postCommitProblems(s2, M2, []).length, 4);
  // And told only the first five, it refuses the sixth: the post-check's own psql STOP is in the list on purpose.
  assert.equal(postCommitProblems(s2, M2, C2.slice(1)).length, 1);
  assert.equal(postCommitProblems(cl, M3, []).length, 2);

  // Stage 1: the marker's STOP, and the apply's own.
  assert.deepEqual(stageOnePostApplyProblems(swap(s1, `so 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1.`, "so 0102 is applied.")), ["the STOP after a committed apply does not say the write stands and nothing is run again"]);
  assert.deepEqual(stageOnePostApplyProblems(swap(s1, "Do not read this as nothing applied: ", "")), ["the apply's STOP does not say it may have applied and that nothing else is pasted"]);
});

test("TWO SHAS ARE COMPARED ONLY AS CHECKED VARIABLES, and every block asserts the sidecar, the closing read included", () => {
  for (const b of blocksOf(doc)) assert.deepEqual(shaCompareProblems(b), [], b.slice(0, 80));
  const cl = blockWith(doc, CLOSING);
  const s1 = blockWith(doc, STAGE1);
  const rm = (b, start) => {
    const line = b.split("\n").find((l) => l.startsWith(start));
    assert.ok(line, start);
    return b.replace(`${line}\n`, "");
  };
  // RED ARMS. The closing read as first written: an inline compare, true when both sides are empty.
  assert.match(shaCompareProblems(`${cl}\n[ "$(git rev-parse HEAD)" = "\${REC}" ] || { echo "STOP: x"; exit 1; }`).at(-1), /a sha is compared inline/);
  assert.match(shaCompareProblems(`${cl}\n[ "$(cat /tmp/0102-stage2.ok)" = "\${REC}" ] || { echo "STOP: x"; exit 1; }`).at(-1), /a sha is compared inline/);
  assert.match(shaCompareProblems(`${cl}\n[ "$(cut -d' ' -f1 /tmp/0102-window.ok)" = "\${REC}" ] || { echo "STOP: x"; exit 1; }`).at(-1), /a sha is compared inline/);
  // Each variable's check removed, one at a time: REC is compared four times in the closing read.
  assert.equal(shaCompareProblems(rm(cl, 'echo "${REC}" | grep -qxE')).filter((x) => x.includes("${REC} is compared before")).length, 4);
  for (const v of ["HD", "S2", "WREC", "NOW"]) assert.match(shaCompareProblems(rm(cl, `echo "\${${v}}" | grep -qxE`))[0], new RegExp(`\\$\\{${v}\\} is compared before it is checked`), v);
  for (const v of ["REC", "NOW", "HD", "WREC"]) assert.ok(shaCompareProblems(rm(s1, `echo "\${${v}}" | grep -qxE`)).length >= 1, `stage 1 ${v}`);
  assert.ok(shaCompareProblems(rm(blockWith(doc, STAGE0), 'echo "${HELD}" | grep -qxE')).length >= 1);
  // A check that prints and goes on is not a check: the same line without its halt does not count.
  const s2check = cl.split("\n").find((l) => l.startsWith('echo "${S2}" | grep -qxE'));
  const noHalt = s2check.replace(/; exit 1; \}$/, "; }");
  assert.notEqual(noHalt, s2check);
  assert.deepEqual(shaCompareProblems(cl.replace(s2check, noHalt)).map((x) => x.replace(/^line \d+: /, "")), ["${S2} is compared before it is checked to be 40 hex characters"]);
  // The sidecar, in the closing read too.
  assert.deepEqual(shaCompareProblems(rm(cl, "shasum -a 256 -c docs/migration-apply-0102.sha256")), ["the block does not assert the document's sidecar"]);
  for (const b of blocksOf(doc)) assert.equal(b.split("\n").filter((l) => l.startsWith("shasum -a 256 -c ")).length, 1);
});

/** A `date` on PATH that is the REAL date at one fixed instant: GNU's `-d @epoch`, or BSD's `-r epoch`. It keeps the caller's TZ. */
function fixedDateDir(realDate) {
  const dir = mkdtempSync(join(tmpdir(), "real-date-0102-"));
  writeFileSync(join(dir, "date"), `#!/bin/sh\nif ${shq(realDate)} -d @0 +%s >/dev/null 2>&1; then exec ${shq(realDate)} -d "@$FIXED_EPOCH" "$@"; fi\nexec ${shq(realDate)} -r "$FIXED_EPOCH" "$@"\n`);
  chmodSync(join(dir, "date"), 0o755);
  return dir;
}

test("THE REAL date, at fixed instants, through the blocks' own clock lines: the Lisbon reading, summer and winter, and a zone that is not Lisbon's STOPS", () => {
  const dir = fixedDateDir(realPath("date"));
  try {
    const epoch = (iso) => String(Date.parse(iso) / 1000);
    // The process's own zone is Tokyo, so a line that lost its TZ= reads Tokyo's clock, not Lisbon's.
    const run = (script, iso) => spawnSync("bash", ["-c", script], { encoding: "utf8", env: { PATH: `${dir}:${SYSTEM_PATH}`, TZ: "Asia/Tokyo", FIXED_EPOCH: epoch(iso), LANG: "C" } });
    const s0 = blockWith(doc, STAGE0);
    const five = [CLOCK_READ, CLOCK_ZONE, CLOCK_SPLIT, CLOCK_FORMAT, CLOCK_DECIDE];
    for (const l of five) assert.ok(s0.split("\n").includes(l));
    const clock = `${five.join("\n")}\necho "READ \${DTZ} \${DT} \${CLOCK}"\n`;
    const cases = [
      ["2026-10-09T19:59:00Z", "READ 52059 WEST 52059 open"], // Friday 20:59 in Lisbon, summer time
      ["2026-10-09T20:00:00Z", "READ 52100 WEST 52100 closed"], // Friday 21:00
      ["2026-10-10T11:59:00Z", "READ 61259 WEST 61259 open"], // Saturday 12:59
      ["2026-10-10T12:00:00Z", "READ 61300 WEST 61300 closed"], // Saturday 13:00
      ["2026-10-11T14:00:00Z", "READ 71500 WEST 71500 closed"], // Sunday 15:00
      ["2026-10-12T06:59:00Z", "READ 10759 WEST 10759 closed"], // Monday 07:59
      ["2026-10-12T07:30:00Z", "READ 10830 WEST 10830 open"], // Monday 08:30 summer time: 07:30 UTC, which UTC would read as closed
      ["2026-10-26T07:59:00Z", "READ 10759 WET 10759 closed"], // the first Monday of winter time: Lisbon is UTC
      ["2026-10-26T08:00:00Z", "READ 10800 WET 10800 open"],
      ["2026-12-12T13:00:00Z", "READ 61300 WET 61300 closed"], // a winter Saturday
    ];
    for (const [iso, want] of cases) {
      const r = run(clock, iso);
      assert.equal(r.status, 0, `${iso}: ${r.stdout}${r.stderr}`);
      assert.equal(r.stdout.trim(), want, iso);
    }
    // RED ARMS, with the real date. A zone name that cannot be loaded does not fail: date answers with
    // UTC's clock and exit 0. At Monday 08:30 Lisbon summer time that is 07:30, "closed". WHAT IS
    // ASSERTED IS THE PROPERTY, NOT ONE SYSTEM'S SPELLING: the zone's name is then neither WET nor WEST
    // (BSD date prints UTC, GNU date prints the first letters of the misspelt name, "Europe"), and the
    // block STOPs with nothing after it. This test runs under GNU date in CI and BSD date on a Mac.
    const zoneIn = (out) => (/may not have loaded \[(?:[1-7][0-9]{4}|[0-9]{12}) ?([^\]\n]*)\]/.exec(out) ?? [])[1];
    const notLisbon = (z) => typeof z === "string" && z !== "WET" && z !== "WEST";
    const typo = run(clock.replace("TZ=Europe/Lisbon date", "TZ=Europe/Lisbonn date"), "2026-10-12T07:30:00Z");
    assert.equal(typo.status, 1, typo.stdout);
    assert.match(typo.stdout, /^STOP: the Lisbon clock did not read as a weekday \(1 to 7\), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded \[10730 /m);
    assert.ok(notLisbon(zoneIn(typo.stdout)), `the misspelt zone read [${zoneIn(typo.stdout)}]`);
    assert.doesNotMatch(typo.stdout, /^READ /m);
    // The same line with no TZ at all reads the process's own zone, which is not Lisbon's.
    const none = run(clock.replace("TZ=Europe/Lisbon date", "date"), "2026-10-12T07:30:00Z");
    assert.equal(none.status, 1, none.stdout);
    assert.match(none.stdout, /^STOP: the Lisbon clock did not read as a weekday/m);
    assert.ok(notLisbon(zoneIn(none.stdout)), `with no TZ the zone read [${zoneIn(none.stdout)}]`);
    assert.doesNotMatch(none.stdout, /^READ /m);
    // THE CONTROL OF THE RED ARMS: without the zone line, the misspelt zone reads 07:30 and says closed,
    // under whatever name the system gave it.
    const blind = run(clock.replace("TZ=Europe/Lisbon date", "TZ=Europe/Lisbonn date").replace(`${CLOCK_ZONE}\n`, ""), "2026-10-12T07:30:00Z");
    assert.equal(blind.status, 0, blind.stdout);
    const read = /^READ 10730 (\S*) 10730 closed$/.exec(blind.stdout.trim());
    assert.ok(read && notLisbon(read[1]), `the misspelt zone, unchecked, read [${blind.stdout.trim()}]`);
    // The YYYYMMDDHHMM reads of stages 1, 2 and the closing read: the same four lines in each.
    for (const marker of [STAGE1, STAGE2, CLOSING]) {
      const lines = blockWith(doc, marker).split("\n");
      const at = lines.findIndex((l) => l.startsWith("NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z')"));
      assert.ok(at > 0, marker);
      const four = `${lines.slice(at, at + 4).join("\n")}\necho "READ \${NOWL}"\n`;
      assert.equal(run(four, "2026-10-09T19:59:00Z").stdout.trim(), "READ 202610092059", marker);
      assert.equal(run(four, "2026-12-31T23:30:00Z").stdout.trim(), "READ 202612312330", marker);
      const bad = run(four.replace("TZ=Europe/Lisbon date", "TZ=Europe/Lisbonn date"), "2026-10-09T19:59:00Z");
      assert.equal(bad.status, 1, marker);
      assert.match(bad.stdout, /^STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST[^\n]*\[202610091959 /m, marker);
      assert.ok(notLisbon(zoneIn(bad.stdout)), `${marker}: the misspelt zone read [${zoneIn(bad.stdout)}]`);
      assert.doesNotMatch(bad.stdout, /^READ /m, marker);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every block that runs the guard or the reader compares it, and its module, first", () => {
  for (const b of blocksOf(doc)) assert.deepEqual(compareFirstProblems(b), []);
  assert.equal(blocksOf(doc).filter((b) => b.includes("node scripts/assert-production-target.mjs")).length, 2);
  assert.ok(blockWith(doc, CLOSING).includes("${READER} 2>&1"));
  const s1 = blockWith(doc, STAGE1);
  const cmp = s1.split("\n").find((l) => l.includes('= "${SHAPTM}" ]'));
  assert.notDeepEqual(compareFirstProblems(s1.replace(cmp + "\n", "")), []);
  assert.notDeepEqual(compareFirstProblems(s1.replace(cmp + "\n", "") + "\n" + cmp + "\n"), []);
  const closing = blockWith(doc, CLOSING);
  assert.notDeepEqual(compareFirstProblems(closing.replace('[ "${MW}" = "${SHAPTM}" ]', '[ "${MW}" = "${MW}" ]')), []);
});

test("every carry stage 2 reads is a row the pre-check prints, and no carry name hides in another row", () => {
  const carries = [...blockWith(doc, STAGE2).matchAll(/\$\(carry ([a-z0-9_]+)\)/g)].map((m) => m[1]);
  assert.equal(carries.length, 10);
  const rowNames = [...codeOf(pre).matchAll(/SELECT '((?:[^']|'')+)'(?: AS check)?,/g)].map((m) => m[1]);
  assert.equal(rowNames.length, 30, `${rowNames.length} rows read from the pre-check`);
  assert.deepEqual(carryProblems(carries, rowNames), []);
  // Every -v the post-check requires is passed by the block, from a carry.
  const required = [...post.matchAll(/^\\if :\{\?(\w+)\}$/gm)].map((m) => m[1]).sort();
  const passed = [...blockWith(doc, STAGE2).matchAll(/-v (\w+)="\$\{[A-Z]+\}"/g)].map((m) => m[1]).sort();
  assert.deepEqual(passed, required);
  assert.equal(required.length, 10);
  // Every :'name' and :name the post-check uses is one it requires.
  const quoted = [...codeOf(post).matchAll(/(?<![:\w]):'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1]);
  const bare = [...codeOf(post).replace(/(?<![:\w]):'[a-z_][a-z0-9_]*'/g, "V").replace(/'(?:[^']|'')*'/g, "''").matchAll(/(?<![:\w]):([a-z_][a-z0-9_]*)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set([...quoted, ...bare])].sort(), required);
  assert.ok(quoted.length >= 10, `${quoted.length} quoted uses`);
  assert.deepEqual(bare, [], "the post-check uses a carry unquoted");
  assert.deepEqual(carryProblems(["tables_before"], ["tables_count_before"]), ["the pre-check prints no row named tables_before"]);
  assert.deepEqual(carryProblems(["policies_md5"], ["policies_md5", "INFO policies_md5 again"]), ["carry policies_md5 is a substring of policies_md5, INFO policies_md5 again"]);
});

test("the four blocks are there, in order, and carry no # line, no ! but test !, no backslash continuation and no old path", () => {
  const blocks = blocksOf(doc);
  assert.equal(blocks.length, 4);
  assert.deepEqual([STAGE0, STAGE1, STAGE2, CLOSING].map((m) => blocks.findIndex((b) => b.includes(m))), [0, 1, 2, 3]);
  for (const b of blocks) assert.deepEqual(blockHazards(b), []);
  assert.doesNotMatch(doc, /\/Users\/ivan\/Documents\b/);
  assert.notDeepEqual(blockHazards("echo a\n# a comment\n"), []);
  assert.notDeepEqual(blockHazards("node -e \"process.exit(a !== b ? 1 : 0)\"\n"), []);
  assert.notDeepEqual(blockHazards("psql x \\\n  -f y\n"), []);
  assert.notDeepEqual(blockHazards("cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply || exit 1\n"), []);
  assert.deepEqual(blockHazards("test ! -f x || exit 1\n"), []);
});

// =====================================================================================
// EVERY HALT IS EXPLICIT: the static rule, then the fault-injection harness that proves it.
// =====================================================================================

/** A command a later step relies on: its failure must halt the block by an explicit guard. */
const MUST_HALT = [
  /^cd /, /\bgit (fetch|checkout|status|ls-remote|rev-parse origin\/)/, /^rm -f /, /^mv /, /^touch /, /\| tee /,
  /^node (scripts|packages)\//, /^node --env-file=/, /^node -e /, /\bpsql /, /^(T101|W101|REC|NOWZ|DTZ|HD|S2|HELD|NOW)=\$\(/, />>? \/tmp\/0102-/, /^set -o allexport/,
  // A TEST IS A GUARD TOO. A `test`, a `[ ... ]`, a `shasum -c` or a `grep -q` on a line of its own decides
  // whether the block may go on, and the harness cannot make a shell builtin fail. So the rule is static:
  // every such line carries its own explicit halt.
  /^test /, /^\[ /, /^shasum -a 256 -c /, /^grep -q/, /^echo "[^"]*" \| grep -q/,
];

/** The lines of a block that run a MUST_HALT command without an explicit `|| { echo "STOP: ..."; exit ...; }`. */
export function unguardedLines(block) {
  const out = [];
  block.split("\n").forEach((line, i) => {
    if (/^if /.test(line) || /^echo "[^"]*"$/.test(line)) return;
    if (MUST_HALT.some((re) => re.test(line)) && !EXPLICIT_HALT.test(line)) out.push(`${i + 1}: ${line.slice(0, 100)}`);
  });
  return out;
}

test("EVERY HALT IS EXPLICIT: each command a later step relies on carries its own || { echo \"STOP: ...\"; exit ...; }, and no block leans on set -e", () => {
  for (const b of blocksOf(doc)) {
    assert.deepEqual(unguardedLines(b), [], b.slice(0, 120));
    // `set -eo pipefail` is there for pipefail; it is the block's second line and appears nowhere else.
    assert.deepEqual(b.split("\n").map((l, i) => (/\bset -e/.test(l) ? i : -1)).filter((i) => i >= 0), [1]);
    // Every STOP is followed by an exit on its own line: no STOP that only prints.
    for (const line of b.split("\n")) if (line.includes('echo "STOP: ')) assert.match(line, /echo "STOP: [^"]+";( echo "\$\{STRAY\}";)? exit (1|\$\{RC\}); (\}|fi)$/, line.slice(0, 120));
  }
  const s1 = blockWith(doc, STAGE1);
  const guardLine = s1.split("\n").find((l) => l.startsWith("node scripts/assert-production-target.mjs"));
  const vmLine = s1.split("\n").find((l) => l.startsWith("node packages/db/scripts/verified-migrate.mjs"));
  assert.ok(guardLine && vmLine);
  assert.match(vmLine, /\| tee \/tmp\/0102-apply\.out \|\| \{ RC=\$\?; echo "STOP: [^"]+"; exit \$\{RC\}; \}$/);
  const strip = (line) => line.replace(/ \|\| \{ (RC=\$\?; )?echo "STOP: [^"]+"; exit (1|\$\{RC\}); \}$/, "");
  assert.equal(unguardedLines(s1.replace(guardLine, strip(guardLine))).length, 1);
  assert.equal(unguardedLines(s1.replace(vmLine, strip(vmLine))).length, 1);
  assert.equal(unguardedLines(s1.replace(CLOCK_READ, strip(CLOCK_READ))).length, 1);
  assert.equal(unguardedLines(s1.replace(CLOCK_ZONE, strip(CLOCK_ZONE))).length, 1);
  for (const planted of ["git fetch origin --prune", "cd /somewhere", 'echo "${HELD}" > /tmp/0102-head.sha', "rm -f /tmp/0102-x", "touch /tmp/0102-applied.ok",
    "node scripts/assert-production-target.mjs", "set -o allexport && . /x.env && set +o allexport", "NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z')",
    "DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z')", "HD=$(git rev-parse HEAD)", "S2=$(cat /tmp/0102-stage2.ok)", "HELD=$(git rev-parse origin/db/0102-sat01-tables)", "NOW=$(git rev-parse origin/db/0102-sat01-tables)", 'psql "${DATABASE_URL_DIRECT}" -f x.sql 2>&1 | tee /tmp/0102-x.out', "node scripts/x.mjs || { echo halt; exit 1; }",
    // The guards a fault cannot be injected into: each is caught by the static rule alone.
    "test -f docs/x.sha256", "test ! -f /tmp/0102-x", '[ "${NOW}" = "${REC}" ]', '[ -z "${STRAY}" ] || echo dirty', "shasum -a 256 -c docs/x.sha256",
    "grep -qx 'journal rows on production: 100' /tmp/0102-x.out", "echo \"${NOWL}\" | grep -qxE '[0-9]{12}'", 'node -e "process.exit(1)"']) {
    assert.equal(unguardedLines(planted).length, 1, planted);
  }
  assert.deepEqual(unguardedLines('echo "--- the pre-check. READ ONLY"\nif true; then D1=yes; fi'), []);
});

// ---- THE HARNESS. Nothing in it touches a real host, the secrets folder or a database. ----

const STUBBED = ["git", "psql", "node", "pnpm", "shasum", "tee", "mv", "rm", "touch", "cat", "find", "date", "grep", "cut", "awk", "head", "tail", "wc", "tr"];
const FAKED = new Set(["git", "psql", "pnpm"]);
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const PROD_APPLY = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const PROD_ENV = "/Users/ivan/osteojp-secrets/new-prod.env";
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
const FAKE_SHA = { HELD: "1".repeat(40), BEFORE: "3".repeat(40) };

/** The real program behind a name, resolved by plain sh on the system PATH. A missing one FAILS the test. */
function realPath(name) {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8", env: { PATH: SYSTEM_PATH } });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}, and it is not there`);
  return p;
}

/** A shell is present when `command -v` finds it on the system PATH. */
const hasShell = (name) => spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH } }).status === 0;

const shq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

/**
 * One POSIX sh stub. It numbers its own calls per name, logs the call and which records exist,
 * fails when it is the call named by HARNESS_FAIL, and otherwise answers.
 */
function stubText(name, real) {
  const R = (n) => shq(real[n]);
  return `#!/bin/sh
n=${shq(name)}
d="$HARNESS_RUN"
k=0
if [ -f "$d/cnt.$n" ]; then read -r k < "$d/cnt.$n"; fi
k=$((k + 1))
echo "$k" > "$d/cnt.$n"
id="$n#$k"
if [ "$n" = tee ]; then ${R("sleep")} 0.05; fi
inp=
if [ "$n" = cut ]; then inp=$(${R("cat")}); fi
ex=
for m in $HARNESS_MARKERS; do if [ -f "$d/tmp/$m" ] && [ "$d/tmp/$m" -nt "$d/t0" ]; then ex="$ex $m"; fi; done
printf '%s\\n' "$@" > "$d/args.$id"
if [ -n "$inp" ]; then printf 'STDIN %s\\n' "$inp" >> "$d/args.$id"; fi
printf '%s|%s\\n' "$id" "$ex" >> "$d/log"
unexpected() { printf '%s %s\\n' "$id" "$*" >> "$d/unexpected"; echo "harness: unexpected call $id" >&2; exit 97; }
for a in "$@"; do case "$a" in *osteojp-secrets*|*osteojp-prod-apply*) unexpected "a real path";; esac; done
if [ "$HARNESS_FAIL" = "$id" ]; then
  echo "$id" > "$d/fired"
  if [ "$HARNESS_FAIL_MODE" = empty ]; then ${R("cat")} > /dev/null; exit 0; fi
  case "$n" in
    git) echo "fatal: unable to access 'https://github.invalid/': Could not resolve host (harness fault)" >&2; exit 128;;
    psql) echo "psql: error: connection to server at harness.invalid failed: FATAL: harness fault" >&2; exit 2;;
    node) case "$1" in
        scripts/assert-production-target.mjs) echo "REFUSE: harness fault, the target is not the production session pooler" >&2; exit 2;;
        packages/db/scripts/verified-migrate.mjs) echo "harness fault: verified-migrate exits \${HARNESS_FAIL_CODE:-3}"; exit "\${HARNESS_FAIL_CODE:-3}";;
        --env-file=*) echo "REFUSE: harness fault, the reader refuses the target" >&2; exit 2;;
        *) echo "Error: harness fault" >&2; exit 1;;
      esac;;
    tee) ${R("cat")}; echo "tee: harness fault: Permission denied" >&2; exit 1;;
    grep) ${R("cat")} > /dev/null; echo "grep: harness fault: Input/output error" >&2; exit 2;;
    cut|awk|head|tail|wc|tr|shasum) ${R("cat")} > /dev/null; echo "$n: harness fault: Input/output error" >&2; exit 1;;
    *) echo "$n: harness fault: Operation failed" >&2; exit 1;;
  esac
fi
case "$n" in
  git) case "$1" in
      status) exit 0;;
      fetch) exit 0;;
      rev-parse) if [ "$2" = ${HELD_REF} ]; then echo "$HARNESS_HELD"; exit 0; fi
        if [ "$2" = HEAD ]; then read -r h < "$d/head"; echo "$h"; exit 0; fi;;
      cat-file) case "$3" in *[!0-9a-f]*) ;; *) if [ "\${#3}" -eq 40 ]; then echo commit; exit 0; fi;; esac
        echo "fatal: Not a valid object name $3" >&2; exit 128;;
      checkout) for a in "$@"; do last="$a"; done; echo "$last" > "$d/head"; exit 0;;
    esac
    unexpected "$@";;
  psql) if [ -z "$1" ]; then echo "psql: error: connection to server on socket failed: No such file or directory" >&2; exit 2; fi
    [ "$1" = "$HARNESS_DBURL" ] || unexpected "a database URL that is not the harness's";
    case "$*" in
      *precheck-0102-sat01-tables.sql*) exec ${R("cat")} "$HARNESS_FIX/pre.out";;
      *postcheck-0102-sat01-tables.sql*) exec ${R("cat")} "$HARNESS_FIX/\${HARNESS_POST:-post.out}";;
      *public.locations*) printf 'BEGIN\\n%s\\n' "$HARNESS_CLINICS"; exit 0;;
      *"where hash = "*) printf 'BEGIN\\n%s\\n' "\${HARNESS_HASHN:-1}"; exit 0;;
      *"limit 3"*) exec ${R("cat")} "$HARNESS_FIX/last3.out";;
      *"select count(*) from drizzle.__drizzle_migrations"*) printf 'BEGIN\\n%s\\n' "$HARNESS_ROWS"; exit 0;;
    esac
    unexpected "$@";;
  pnpm) unexpected "$@";;
  node) case "$1" in
      -e) exec ${R("node")} "$@";;
      scripts/check-journal.mjs) echo "check-journal: 100 .sql files match 100 journal entries in order (harness)"; exit 0;;
      scripts/assert-production-target.mjs) if [ -z "$DATABASE_URL_DIRECT" ]; then echo "REFUSE: DATABASE_URL_DIRECT is not set" >&2; exit 2; fi
        [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || unexpected "the guard ran with a URL that is not the harness's";
        printf 'host: harness.invalid\\nport: 5432\\nref: harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
      packages/db/scripts/verified-migrate.mjs) exec ${R("cat")} "$HARNESS_FIX/vm.out";;
      --env-file=*) f="\${1#--env-file=}"; [ -f "$f" ] || { echo "node: $f: not found" >&2; exit 9; }
        [ "$2" = packages/db/scripts/read-applied-migrations.mjs ] || unexpected "$@";
        if [ "$HARNESS_READER" = without-0102 ]; then printf 'journal rows on production: %s\\n  APPLIED  0101_guest_request_email.sql\\n  PENDING  0102_sat01_satisfaction_survey.sql\\npending on this ref: 1\\njournal rows with no matching file on this ref: 0\\n' "$HARNESS_ROWS"; exit 0; fi
        printf 'journal rows on production: %s\\n  APPLIED  0101_guest_request_email.sql\\n  APPLIED  0102_sat01_satisfaction_survey.sql\\npending on this ref: 0\\njournal rows with no matching file on this ref: 0\\n' "$HARNESS_ROWS"; exit 0;;
    esac
    unexpected "$@";;
  date) [ "$TZ" = Europe/Lisbon ] || unexpected "date ran without TZ=Europe/Lisbon [TZ=$TZ]";
    case "$1" in
      '+%u%H%M %Z') echo "$HARNESS_DHHMM $HARNESS_ZONE";;
      '+%Y%m%d%H%M %Z') echo "$HARNESS_STAMP $HARNESS_ZONE";;
      *) unexpected "$@";;
    esac; exit 0;;
  cut) if [ -n "$inp" ]; then printf '%s\\n' "$inp" | ${R("cut")} "$@"; exit $?; fi
    exec ${R("cut")} "$@" < /dev/null;;
esac
if [ "$HARNESS_HOOK_AFTER" = "$id" ]; then ${R(name)} "$@"; s=$?; ${R("mkdir")} -p "$HARNESS_HOOK_MKDIR"; exit $s; fi
exec ${R(name)} "$@"
`;
}

const MD5_CARRIES = ["policies_md5", "functions_md5", "relation_acl_md5", "column_acl_md5", "default_acl_md5", "triggers_md5"];
const PATIENT_COLUMNS = "address,city,locale,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at";

/** What the faked programs print: a 16-OK pre-check with its carries, a 27-OK post-check, verified-migrate's success. */
function harnessFixtures() {
  const row = (a, b, c) => ` ${a.padEnd(40)} | ${String(b).padEnd(30)} | ${c}`;
  const preOut = [
    row("check", "observed", "verdict"), "-".repeat(84),
    row("0. this transaction is READ ONLY", "on", "OK"), row("1. 0102 is absent from the journal", "0; control 1", "OK"),
    row("2. 0101 is present, the newest row", "1", "OK"), row("journal_rows_before", 99, "OK"),
    row("4. the session is postgres", "postgres", "OK"), row("5. nothing 0102 creates exists", "0, 0, 0, 0, 0", "OK"),
    row("6. every column 0102 reads", "26 of 26", "OK"), row("7. every function 0102 calls", "8 of 8", "OK"),
    row("8. the TABLES default", "0 other grantees", "OK"), row("9. the FUNCTIONS default", "0 other grantees", "OK"),
    row("10. the patient role updates exactly", PATIENT_COLUMNS, "OK"), row("11. the five roles", "5", "OK"),
    row("12. the server is Postgres 17", "170006", "OK"), row("secdef_functions_before", 28, "OK"),
    row("14. the patients table holds rows", "45", "OK"), row("15. PREMISE (R34)", "table UPDATE true", "OK"),
    row("tables_before", 48, "CARRY"),
    ...MD5_CARRIES.slice(0, 5).map((k) => row(k, md5(k), "CARRY")),
    row("patient_update_columns", PATIENT_COLUMNS, "CARRY"), row("triggers_md5", md5("triggers_md5"), "CARRY"),
    row("INFO the server version", "17.6", "INFO"), row("INFO patients, appointments", "45, 255, 254", "INFO"), row("INFO what the public defaults give", "f EXECUTE", "INFO"),
    row("INFO the text md5 of the UPDATE", "patients_update", "INFO"), row("INFO idle_in_transaction_session_timeout (0 is no limit)", "0", "INFO"),
    row("INFO R39: supautils.policy_grants", "postgres: 24 tables, auth.users yes", "INFO"),
    "(29 rows)", "",
  ].join("\n");
  const postOut = [row("check", "observed", "verdict"), "-".repeat(84),
    ...Array.from({ length: 27 }, (_, i) => row(`${i}. post-check verdict`, "harness", "OK")), "(27 rows)", ""].join("\n");
  const vm = [
    `file       ${TAG}.sql present, sha256 matches`, "journal    99 row(s) applied, last when=1788502200000",
    `pending    1  [${TAG}]`, "--- drizzle-kit migrate --- (harness)", "journal    99 -> 100  (delta 1)",
    `${TAG} present by sha256: yes`, "OK: the journal moved by exactly the pending count and carries the approved sha256.", "",
  ].join("\n");
  const last3 = ` id | hash | created_at\n 100 | ${MIGRATION_SHA.slice(0, 8)} | 1788502300000\n 99 | 36a1ed54 | 1788502200000\n 98 | 80f85018 | 1788502100000\n(3 rows)\n`;
  // A post-check in which one verdict reads FAIL: twenty-six OK and verdict 23, "0102 is in the journal by hash".
  const postFail = postOut.replace(row("23. post-check verdict", "harness", "OK"), row("23. post-check verdict", "harness", "FAIL"));
  if (postFail === postOut) throw new Error("the FAIL fixture did not change the post-check transcript");
  return { "pre.out": preOut, "post.out": postOut, "post-fail.out": postFail, "last3.out": last3, "vm.out": vm };
}

/** The repository files the blocks hash or read, copied into the fake apply worktree as they are. */
const APPLY_FILES = [
  PRE, POST, PREV_PATH, "scripts/assert-production-target.mjs", "scripts/production-target.mjs", "scripts/check-journal.mjs", GATE_FILE,
  "packages/db/scripts/verified-migrate.mjs", "packages/db/scripts/read-applied-migrations.mjs",
];

/**
 * The fake apply worktree's journal, AS OF 0102: the live journal CUT AT ITS PREDECESSOR'S ENTRY
 * (0101), then 0102's own. Cut and rebuilt, never copied: a copy of the live journal would move the
 * "newest entry" stage 0 asserts the day 0102 itself, or a later migration, is promoted, and redden
 * this test for a reason that is not this document's (which is what 0101's promotion did to 0100's
 * test, and why #1537 cut that one). 0101's entry must be the one this document pins, or this throws.
 */
export function journalAsOf0102(live) {
  const at = live.entries.findIndex((e) => e.tag === PREV_TAG);
  if (at < 0) throw new Error(`the live journal no longer holds ${PREV_TAG}`);
  const prev = live.entries[at];
  if (prev.idx !== PREV_ENTRY.idx || prev.when !== PREV_ENTRY.when) {
    throw new Error(`the live journal holds ${PREV_TAG} at idx ${prev.idx}, when ${prev.when}; this document pins idx ${PREV_ENTRY.idx}, when ${PREV_ENTRY.when}`);
  }
  return { ...live, entries: [...live.entries.slice(0, at + 1), { idx: OWN_ENTRY.idx, version: prev.version, when: OWN_ENTRY.when, tag: TAG, breakpoints: true }] };
}

/** The shared base of a sweep: the stubs, the fixtures, a fake env file, and a fake apply worktree holding `docText`. */
export function prepareHarness(base, docText) {
  for (const d of ["bin", "fix", "apply/docs"]) mkdirSync(join(base, d), { recursive: true });
  const real = Object.fromEntries([...STUBBED.filter((n) => !FAKED.has(n) && n !== "node"), "sleep", "mkdir"].map((n) => [n, realPath(n)]));
  real.node = process.execPath;
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, real));
    chmodSync(join(base, "bin", n), 0o755);
  }
  for (const [f, t] of Object.entries(harnessFixtures())) writeFileSync(join(base, "fix", f), t);
  writeFileSync(join(base, "fake-prod.env"), `DATABASE_URL_DIRECT=${FAKE_DB_URL}\nDATABASE_URL=${FAKE_DB_URL}\n`);
  for (const f of APPLY_FILES) {
    mkdirSync(dirname(join(base, "apply", f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(base, "apply", f));
  }
  mkdirSync(join(base, "apply", "packages/db/migrations/meta"), { recursive: true });
  writeFileSync(join(base, "apply", PROMOTED_PATH), migration);
  writeFileSync(join(base, "apply", JOURNAL), `${JSON.stringify(journalAsOf0102(JSON.parse(read(JOURNAL))), null, 2)}\n`);
  writeFileSync(join(base, "apply", DOC), docText);
  writeFileSync(join(base, "apply", SIDECAR), `${sha256(docText)}  ${DOC}\n`);
}

/** The block with its real paths moved into the run folder. A block that still names one is refused unrun. */
export function localize(block, run, envFile) {
  const out = block.replaceAll(PROD_APPLY, join(run, "apply")).replaceAll(PROD_ENV, envFile).replaceAll("/tmp/0102-", join(run, "tmp/0102-"));
  const rest = out.replaceAll(join(run, "tmp/0102-"), "").replaceAll(join(run, "apply"), "").replaceAll(envFile, "");
  for (const bad of ["/tmp/0102-", "osteojp-secrets", "osteojp-prod-apply", "/Users/ivan"]) {
    if (rest.includes(bad)) throw new Error(`the localized block still names ${bad}`);
  }
  return out;
}

/** GREEN's tool shape. zsh: exactly it. bash: the same, with errexit forced off, as zsh has it there. */
export function shellArgs(shell, text) {
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  if (shell === "zsh") return ["zsh", ["-f", "-c", tail]];
  if (shell === "bash") return ["bash", ["-c", `set() { builtin set "$@"; builtin set +e; }; ${tail}`]];
  throw new Error(`no shell ${shell}`);
}

function runShell(shell, text, env, cwd) {
  const [cmd, args] = shellArgs(shell, text);
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (out += b));
    const t = setTimeout(() => p.kill("SIGKILL"), 60000);
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 128, out }); });
  });
}

/** Run one block once; `fault` null is the positive control. Mode "empty" makes the call exit 0 and print nothing. */
export async function runOnce(cfg, runId, fault) {
  const run = join(cfg.base, "runs", runId);
  rmSync(run, { recursive: true, force: true });
  mkdirSync(join(run, "tmp"), { recursive: true });
  if (!fault?.noApply) symlinkSync(join(cfg.base, "apply"), join(run, "apply"));
  writeFileSync(join(run, "head"), `${cfg.initialHead ?? FAKE_SHA.BEFORE}\n`);
  cfg.setup?.(join(run, "tmp"));
  const t0 = Date.now() - 30000;
  writeFileSync(join(run, "t0"), "");
  utimesSync(join(run, "t0"), new Date(t0), new Date(t0));
  const text = localize(cfg.block, run, fault?.noEnv ? join(run, "no-such.env") : join(cfg.base, "fake-prod.env"));
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL,
    HARNESS_HELD: cfg.held ?? FAKE_SHA.HELD, HARNESS_MARKERS: cfg.markers.join(" "),
    HARNESS_ROWS: String(cfg.rows ?? 100), HARNESS_CLINICS: cfg.clock.clinics,
    HARNESS_DHHMM: cfg.clock.dhhmm, HARNESS_STAMP: cfg.clock.stamp, HARNESS_ZONE: cfg.clock.zone ?? "WEST",
    HARNESS_FAIL: fault?.call ?? "", HARNESS_FAIL_CODE: String(fault?.code ?? 3), HARNESS_FAIL_MODE: fault?.mode ?? "",
    HARNESS_HASHN: cfg.db?.hashN ?? "1", HARNESS_POST: cfg.db?.post ?? "post.out", HARNESS_READER: cfg.db?.reader ?? "",
    HARNESS_HOOK_AFTER: fault?.hookAfter ?? "", HARNESS_HOOK_MKDIR: fault?.hookMkdir ? join(run, "tmp", fault.hookMkdir) : "",
  };
  const r = await runShell(cfg.shell, text, env, join(cfg.base, "apply"));
  const readRun = (f) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8") : "");
  const calls = readRun("log").trim().split("\n").filter(Boolean).map((l, pos) => {
    const [id, ex] = l.split("|");
    return { id, pos, exists: ex.trim() ? ex.trim().split(" ") : [], args: readRun(`args.${id}`) };
  });
  const markersAtEnd = cfg.markers.filter((m) => {
    try { const st = statSync(join(run, "tmp", m)); return st.isFile() && st.mtimeMs > t0; } catch { return false; }
  });
  const result = { ...r, calls, markersAtEnd, unexpected: readRun("unexpected"), fired: readRun("fired").trim() };
  rmSync(run, { recursive: true, force: true });
  return result;
}

/** A short, readable name for a call: its program and arguments, long ones cut in the middle. */
export function describeCall(call) {
  const lines = call.args.split("\n").filter((l) => l !== "");
  const stdin = lines.filter((l) => l.startsWith("STDIN ")).map((l) => l.slice(6));
  const args = lines.filter((l) => !l.startsWith("STDIN ")).map((a) => (a.length > 70 ? `${a.slice(0, 40)}...${a.slice(-25)}` : a));
  return `${call.id.split("#")[0]} ${args.join(" ")}${stdin.length ? `  <stdin: ${stdin.join(" ").slice(0, 70)}>` : ""}`;
}

/** Where the positive run first wrote each record: the last call position before it appeared. */
function writePoints(positive, markers) {
  const wp = {};
  for (const m of markers) {
    const tee = positive.calls.find((c) => c.id.startsWith("tee#") && c.args.includes(`/tmp/${m}`));
    const first = positive.calls.find((c) => c.exists.includes(m));
    wp[m] = Math.min(tee ? tee.pos - 1 : Infinity, first ? first.pos - 1 : Infinity);
  }
  return wp;
}

async function inPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/** Sweep one block: the positive control, then every external call made to fail in turn, plus the extra faults. */
export async function sweep(cfg) {
  const positive = await runOnce(cfg, `${cfg.id}-positive`, null);
  const posProblems = [];
  if (positive.code !== 0) posProblems.push(`exit ${positive.code}`);
  if (!positive.out.includes(cfg.success[cfg.success.length - 1])) posProblems.push("its last line is missing");
  if (!positive.out.includes("TOOL-CHAIN-CONTINUED")) posProblems.push("the tool chain did not continue");
  if (positive.unexpected) posProblems.push(`unexpected calls: ${positive.unexpected}`);
  if (/^STOP: /m.test(positive.out)) posProblems.push("a STOP line");
  if (posProblems.length) return { positive, posProblems, rows: [] };
  const wp = writePoints(positive, cfg.markers);
  const faults = positive.calls.map((c) => ({ call: c.id, label: describeCall(c), pos: c.pos, at: c }));
  faults.push(...cfg.extraFaults(positive, wp));
  const rows = await inPool(faults, Math.max(2, cpus().length), async (f, i) => {
    const r = await runOnce(cfg, `${cfg.id}-f${i}`, f);
    const allowed = f.at ? cfg.mayContinue(f.at) : null;
    const id = f.mode === "empty" ? `${f.call}:empty` : f.call ?? f.kind;
    const halted = r.code !== 0 && !r.out.includes("TOOL-CHAIN-CONTINUED");
    const problems = [];
    if (f.call && r.fired !== f.call) problems.push(`the fault at ${f.call} never fired`);
    if (r.unexpected) problems.push(`unexpected calls: ${r.unexpected.trim()}`);
    const row = { fault: f.label, call: id, halted, problems, calls: r.calls, code: r.code, out: r.out };
    if (allowed) {
      if (halted) problems.push(`expected to continue (${allowed}), but it halted`);
      return { ...row, result: `continues: ${allowed}` };
    }
    if (r.code === 0) problems.push("(a) exit 0");
    if (r.out.includes("TOOL-CHAIN-CONTINUED")) problems.push("(a) the tool chain continued");
    for (const s of cfg.success) if (r.out.includes(s)) problems.push(`(b) printed ${s}`);
    for (const m of r.markersAtEnd) if (wp[m] > f.pos) problems.push(`(c) wrote ${m}`);
    if (!/^STOP: /m.test(r.out)) problems.push("no STOP line");
    const stop = (r.out.match(/^STOP: .*$/m) ?? [""])[0];
    return { ...row, result: halted ? `halts, exit ${r.code}: ${stop.slice(0, 100)}` : `DOES NOT HALT, exit ${r.code}` };
  });
  return { positive, posProblems, rows };
}

// ---- The four blocks as the harness runs them. ----

/**
 * The harness's clocks. The dates are harness inputs for the run-window record only (the
 * document's own blocks carry none): 2026-10-05 is a Monday, so Tuesday is the 6th, Friday the
 * 9th, Saturday the 10th and Sunday the 11th.
 */
const DAY_OF = { 1: "20261005", 2: "20261006", 3: "20261007", 4: "20261008", 5: "20261009", 6: "20261010", 7: "20261011" };
/** A clock at weekday `d`, `hhmm`, with a run window that holds it, so a STOP is the arm's own. */
export const clockAt = (d, hhmm, clinics = "0 of 2", zone = "WEST") => ({
  dhhmm: `${d}${hhmm}`, stamp: `${DAY_OF[d]}${hhmm}`, window: `${DAY_OF[d]}0000 ${DAY_OF[d]}2359 209912310000`, clinics, zone,
});
const CLOSED = clockAt(2, "2230");

test("the harness's dates are the weekdays it says they are", () => {
  for (const [d, ymd] of Object.entries(DAY_OF)) {
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00Z`;
    assert.equal(new Date(iso).getUTCDay() || 7, Number(d), ymd);
  }
});

const putRecord = (tmp, name, text, minutesAgo) => {
  const f = join(tmp, name);
  writeFileSync(f, text);
  const t = new Date(Date.now() - minutesAgo * 60000);
  utimesSync(f, t, t);
};

/** Per block: its pass lines (the last is its last line), its records, and the records its inputs need. */
const HARNESS_BLOCKS = {
  stage0: {
    marker: STAGE0, markers: ["0102-check-journal.out", "0102-head.sha"],
    success: ["running from the held head", STAGE0],
    // A previous sitting's applied marker, 13 hours old, so the marker-age line runs its find.
    setup: () => (tmp) => putRecord(tmp, "0102-applied.ok", "", 780),
    redirect: "0102-head.sha",
  },
  stage1: {
    marker: STAGE1, markers: ["0102-precheck.new", "0102-precheck.out", "0102-apply.out", "0102-applied.ok"],
    success: [STAGE1],
    setup: (clock) => (tmp) => {
      putRecord(tmp, "0102-head.sha", `${FAKE_SHA.HELD}\n`, 10);
      putRecord(tmp, "0102-window.ok", `${FAKE_SHA.HELD} ${clock.window}\n`, 5);
      putRecord(tmp, "0102-applied.ok", "", 780);
    },
    sources: true, vm: true,
  },
  stage2: {
    marker: STAGE2, markers: ["0102-postcheck.out", "0102-stage2.ok"], success: [STAGE2],
    setup: (clock) => (tmp) => {
      putRecord(tmp, "0102-head.sha", `${FAKE_SHA.HELD}\n`, 20);
      putRecord(tmp, "0102-window.ok", `${FAKE_SHA.HELD} ${clock.window}\n`, 15);
      putRecord(tmp, "0102-precheck.out", harnessFixtures()["pre.out"], 6);
      putRecord(tmp, "0102-applied.ok", "", 5);
    },
    redirect: "0102-stage2.ok", sources: true,
  },
  closing: {
    marker: CLOSING, markers: ["0102-journal-after.out"], success: ["CLOSING READ:"], initialHead: FAKE_SHA.HELD,
    setup: (clock) => (tmp) => {
      putRecord(tmp, "0102-head.sha", `${FAKE_SHA.HELD}\n`, 30);
      putRecord(tmp, "0102-window.ok", `${FAKE_SHA.HELD} ${clock.window}\n`, 25);
      putRecord(tmp, "0102-applied.ok", "", 10);
      putRecord(tmp, "0102-stage2.ok", `${FAKE_SHA.HELD}\n`, 1);
    },
    sources: true,
  },
};

const HARNESS_PLAN = ["stage0", "stage1", "stage2", "closing"];

/** The calls whose failure may leave a block running, each with its reason: R9 proof 1's, which read `no` and decide nothing. */
export function mayContinue(name) {
  return (call) => {
    const prog = call.id.split("#")[0];
    const a = call.args;
    if ((name === "stage0" || name === "stage1") && (a.includes(GATE_FILE) || (prog === "grep" && a.includes("[0-9a-f]{64}")))) {
      return "an R9 proof 1 call: a failure reads no, and proof 1 decides nothing in a closed-hours-only arm";
    }
    return null;
  };
}

/** The sweep configuration of one block at one clock, on one shell. */
export function harnessConfig(md, name, clock, shell, base) {
  const spec = HARNESS_BLOCKS[name];
  return {
    id: `${shell}-${name}`, shell, base, block: blockWith(md, spec.marker), markers: spec.markers, success: spec.success,
    setup: spec.setup(clock), initialHead: spec.initialHead, clock, mayContinue: mayContinue(name),
    extraFaults: (positive, wp) => {
      const out = [{ kind: "cd", label: "cd: the apply worktree is not there", noApply: true, pos: -1 }];
      const guard = positive.calls.find((c) => c.id.startsWith("node#") && /assert-production-target|--env-file=/.test(c.args));
      if (spec.sources) out.push({ kind: "env", label: ". or --env-file: the env file is not there", noEnv: true, pos: guard.args.startsWith("--env-file=") ? guard.pos : guard.pos - 1 });
      if (spec.redirect) out.push({ kind: "redirect", label: `> ${spec.redirect}: the path is a directory`, hookAfter: "rm#1", hookMkdir: spec.redirect, pos: Math.min(wp[spec.redirect], positive.calls.length - 1) });
      if (spec.vm) {
        const vm = positive.calls.find((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs"));
        for (const code of [2, 4, 5]) out.push({ kind: `vm-exit-${code}`, label: `node verified-migrate exits ${code}`, call: vm.id, code, pos: vm.pos, at: null });
      }
      for (const c of positive.calls.filter((x) => x.id.startsWith("date#") || (x.id.startsWith("cut#") && x.args.includes("0102-window.ok")))) {
        out.push({ kind: "empty", label: `${describeCall(c)}: exits 0 with empty output`, call: c.id, mode: "empty", pos: c.pos, at: c });
      }
      return out;
    },
  };
}

/** Run every sweep of the plan on one shell, and fail with every problem row. */
async function sweepAll(t, shell) {
  const base = mkdtempSync(join(tmpdir(), `fault-0102-${shell}-`));
  try {
    prepareHarness(base, doc);
    const bad = [];
    let faults = 0;
    for (const name of HARNESS_PLAN) {
      const r = await sweep(harnessConfig(doc, name, CLOSED, shell, base));
      assert.deepEqual(r.posProblems, [], `${shell} ${name}: the positive control did not reach its last line\n${r.positive.out.slice(-2000)}`);
      assert.ok(r.rows.length > r.positive.calls.length, `${shell} ${name}: ${r.rows.length} faults`);
      const halts = r.rows.filter((x) => x.halted).length;
      assert.ok(r.rows.length - halts <= 3, `${shell} ${name}: only ${halts} of ${r.rows.length} faults halt`);
      faults += r.rows.length;
      t.diagnostic(`${shell} ${name}: positive reaches its last line; ${r.rows.length} faults, ${halts} halt, ${r.rows.length - halts} allowed to continue`);
      for (const row of r.rows) {
        if (process.env.FAULT_TABLE === "1") t.diagnostic(`  ${name} | ${row.call} | ${row.fault.slice(0, 110)} | ${row.result}`);
        if (row.problems.length) bad.push(`${shell} ${name} ${row.call} [${row.fault}]: ${row.problems.join("; ")}`);
      }
    }
    assert.deepEqual(bad, [], `fault rows that broke a rule:\n${bad.join("\n")}`);
    assert.ok(faults > 180, `only ${faults} faults across the four blocks`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** zsh is GREEN's shell. Absent on the GitHub runner by the repository's recorded convention; absent anywhere else, a failure. */
function zshOrSkip(t) {
  if (hasShell("zsh")) return true;
  if (process.env.GITHUB_ACTIONS === "true") {
    t.skip("zsh is not on the CI runner (ubuntu-latest); the convention is scripts/apply-lane/apply-lane-settings.test.mjs, whose zsh sweeps are a recorded rehearsal. The bash arm ran here instead");
    return false;
  }
  assert.fail("zsh is not on this machine, and the zsh arm of the fault-injection harness must run wherever it is not the GitHub runner");
}

test("every block parses under bash -n and zsh -n", (t) => {
  for (const b of blocksOf(doc)) {
    const r = spawnSync("bash", ["-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `bash -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
  if (!zshOrSkip(t)) return;
  for (const b of blocksOf(doc)) {
    const r = spawnSync("zsh", ["-f", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `zsh -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
});

test("the harness's journal is the live journal cut at its predecessor's entry, with 0102's own appended, whatever is promoted later", () => {
  const live = JSON.parse(read(JOURNAL));
  const j = journalAsOf0102(live);
  const [p, e] = j.entries.slice(-2);
  assert.deepEqual([p.idx, p.tag, p.when, e.idx, e.tag, e.when, j.entries.length], [98, PREV_TAG, 1788502200000, 99, TAG, 1788502300000, 100]);
  // The document pins the same numbers, in stage 0's journal line, and they are main's: 0101 is the live journal's entry 98.
  assert.ok(blockWith(doc, STAGE0).includes(`j.entries.length===100&&e.idx===99&&e.tag==='${TAG}'&&e.when===1788502300000&&p.idx===98&&p.tag==='${PREV_TAG}'&&p.when===1788502200000`));
  const liveP = live.entries.find((x) => x.tag === PREV_TAG);
  assert.deepEqual([liveP.idx, liveP.when], [PREV_ENTRY.idx, PREV_ENTRY.when]);
  // Until 0102 is promoted, 0101 is the live journal's newest entry; afterwards 0102 is, and the cut is the same either way.
  const newest = live.entries.at(-1).tag;
  assert.ok(newest === PREV_TAG || live.entries.some((x) => x.tag === TAG), `the live journal's newest entry is ${newest}`);
  // A later promotion (0102 itself, then 0103 and on) changes nothing.
  const later = { ...live, entries: [...j.entries, { idx: 100, version: "7", when: 1788502400000, tag: "0103_later", breakpoints: true }] };
  assert.deepEqual(journalAsOf0102(later), j);
  // RED ARMS: 0101 at another position than the document pins; and a journal without 0101.
  assert.throws(() => journalAsOf0102({ ...live, entries: live.entries.map((x) => (x.tag === PREV_TAG ? { ...x, when: 1788502250000 } : x)) }), /this document pins idx 98, when 1788502200000/);
  assert.throws(() => journalAsOf0102({ ...live, entries: live.entries.map((x) => (x.tag === PREV_TAG ? { ...x, idx: 97 } : x)) }), /this document pins idx 98, when 1788502200000/);
  assert.throws(() => journalAsOf0102({ ...live, entries: live.entries.filter((x) => x.tag !== PREV_TAG) }), /no longer holds/);
  // THE PREDECESSOR'S BYTES: 0101's promoted file on this branch is the body SHAPREV pins, in the document and here.
  assert.equal(sha256(read(PREV_PATH)), EXTERNAL_PINS.SHAPREV, `${PREV_PATH} is not the body SHAPREV pins`);
  assert.ok(pinLines(doc).filter(([n]) => n === "SHAPREV").length >= 2 && pinLines(doc).filter(([n]) => n === "SHAPREV").every(([, v]) => v === sha256(read(PREV_PATH))));
});

test("THE HARNESS IS ITS OWN CONTROL: in the tool's shape set -e stops nothing, and a block without its guards runs on", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  for (const shell of shells) {
    const [cmd, args] = shellArgs(shell, "( set -eo pipefail; false; echo after-false; false | cat || echo pipefail-holds )");
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    assert.equal(r.status, 0, `${shell}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /after-false\npipefail-holds\nTOOL-CHAIN-CONTINUED/, shell);
  }
  const base = mkdtempSync(join(tmpdir(), "fault-0102-control-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      const cfg = harnessConfig(doc, "stage1", CLOSED, shell, base);
      const positive = await runOnce(cfg, `${shell}-control-positive`, null);
      assert.equal(positive.code, 0, positive.out.slice(-1500));
      const guardCall = positive.calls.find((c) => c.args.startsWith("scripts/assert-production-target.mjs"));
      const vmCall = positive.calls.find((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs"));
      const strip = (block, start) => {
        const line = block.split("\n").find((l) => l.startsWith(start));
        return block.replace(line, line.replace(/ \|\| \{ (RC=\$\?; )?echo "STOP: [^"]+"; exit (1|\$\{RC\}); \}$/, ""));
      };
      const refused = await runOnce(cfg, `${shell}-control-guard`, { call: guardCall.id });
      assert.notEqual(refused.code, 0, refused.out);
      assert.match(refused.out, /^STOP: the target guard refused or failed/m);
      assert.ok(!refused.out.includes("TOOL-CHAIN-CONTINUED") && !refused.out.includes(STAGE1));
      assert.deepEqual(refused.calls.filter((c) => c.id.startsWith("psql#") || c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), []);
      assert.deepEqual(refused.markersAtEnd, []);
      for (const code of [3, 4, 5]) {
        const r = await runOnce(cfg, `${shell}-control-vm-${code}`, { call: vmCall.id, code });
        assert.equal(r.code, code, r.out);
        assert.ok(!r.markersAtEnd.includes("0102-applied.ok") && !r.out.includes(STAGE1), r.out);
      }
      const noGuard = await runOnce({ ...cfg, block: strip(cfg.block, "node scripts/assert-production-target.mjs") }, `${shell}-control-noguard`, { call: guardCall.id });
      assert.equal(noGuard.code, 0, noGuard.out.slice(-800));
      assert.ok(noGuard.out.includes(STAGE1) && noGuard.calls.some((c) => c.id.startsWith("psql#")));
      const noVm = await runOnce({ ...cfg, block: strip(cfg.block, "node packages/db/scripts/verified-migrate.mjs") }, `${shell}-control-novm`, { call: vmCall.id, code: 3 });
      assert.equal(noVm.code, 0, noVm.out.slice(-800));
      assert.ok(noVm.out.includes(STAGE1) && noVm.markersAtEnd.includes("0102-applied.ok"));
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("FAULT INJECTION, bash with errexit off (runs in CI): every external call of every block, made to fail, halts it", async (t) => {
  await sweepAll(t, "bash");
});

test("FAULT INJECTION, zsh in GREEN's exact shape: every external call of every block, made to fail, halts it", async (t) => {
  if (!zshOrSkip(t)) return;
  await sweepAll(t, "zsh");
});

/** Run stages 0 and 1 whole at each ruled minute; return what each did. `mutate` rewrites the block first. */
export async function weekdayRuns(base, shell, mutate = (b) => b) {
  const out = [];
  for (const [name, d, hhmm, closed] of RULED_POINTS) {
    const clock = clockAt(d, hhmm);
    for (const stage of ["stage0", "stage1"]) {
      const cfg = harnessConfig(doc, stage, clock, shell, base);
      const r = await runOnce({ ...cfg, block: mutate(cfg.block) }, `${shell}-table-${stage}-${d}${hhmm}`, null);
      const last = stage === "stage0" ? STAGE0 : STAGE1;
      const record = stage === "stage0" ? "0102-head.sha" : "0102-applied.ok";
      out.push({
        name, stage, closed, code: r.code, out: r.out,
        passed: r.code === 0 && r.out.includes(last) && r.out.includes("TOOL-CHAIN-CONTINUED") && r.markersAtEnd.includes(record),
        stopped: r.code === 1 && !r.out.includes(last) && !r.out.includes("TOOL-CHAIN-CONTINUED") && !r.markersAtEnd.includes(record),
        ranApply: r.calls.some((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs")),
        ranPrecheck: r.calls.some((c) => c.args.includes("precheck-0102-sat01-tables.sql")),
      });
    }
  }
  return out;
}

test("THE WEEKDAY TABLE, both stages whole: Friday 20:59 open, Friday 21:00 closed, Saturday 12:59 open, Saturday 13:00 closed, Sunday 15:00 closed, Monday 07:59 closed, and one green arm", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0102-table-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      const runs = await weekdayRuns(base, shell);
      assert.equal(runs.length, 14);
      for (const r of runs) {
        const tag = `${shell} ${r.stage} at ${r.name}`;
        if (r.closed) {
          assert.ok(r.passed, `${tag}: closed by the table, and the block did not reach its last line (exit ${r.code})\n${r.out.slice(-700)}`);
          assert.match(r.out, r.stage === "stage0" ? /^R9: closed hours by the weekday table\. 0102 runs in closed hours only$/m : /^R9: closed hours by the weekday table, and every active clinic's own hours lie inside it\. /m, tag);
        } else {
          assert.ok(r.stopped, `${tag}: open by the table, and the block did not STOP clean (exit ${r.code})\n${r.out.slice(-700)}`);
          assert.match(r.out, r.stage === "stage0" ? /^STOP: Lisbon [1-7][0-9]{4} is inside clinic hours by the weekday table /m : /^STOP: Lisbon [1-7][0-9]{4}, clock open, clinics inside\. /m, tag);
          assert.match(r.out, /^Lisbon weekday and time [1-7][0-9]{4} .*: open by the weekday table$/m, tag);
          assert.ok(!r.ranApply, `${tag}: verified-migrate ran inside clinic hours`);
          // In stage 1 the run window and the pre-check passed first, so the STOP is the arm's own.
          if (r.stage === "stage1") assert.ok(r.ranPrecheck, `${tag}: the pre-check did not run first`);
        }
      }
      // THE CONTROL: with the Saturday row read as a weekday row, Saturday 13:00 no longer passes, and only that.
      const wrong = await weekdayRuns(base, shell, (b) => swap(b, "if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0;", "if (d >= 1 && d <= 6 && (t < 800 || t >= 2100)) exit 0;"));
      assert.deepEqual(wrong.filter((r) => r.closed !== r.passed).map((r) => `${r.stage} ${r.name}`), ["stage0 Saturday 13:00", "stage1 Saturday 13:00"], shell);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("THE CLINICS' ROWS: a clinic whose own hours reach outside the table, or no active clinic, stops stage 1 before the apply", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0102-clinics-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      const cases = [
        ["closed hours, one clinic's row outside 08:00 to 21:00", clockAt(2, "2230", "1 of 2"), /^STOP: Lisbon 22230, clock closed, clinics outside\. /m],
        ["closed hours, every clinic's row outside", clockAt(7, "1500", "2 of 2"), /^STOP: Lisbon 71500, clock closed, clinics outside\. /m],
        ["closed hours, no active clinic at all", clockAt(2, "2230", "0 of 0"), /^STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic \[0 of 0\]/m],
        ["closed hours, a reading that is not <k> of <n>", clockAt(2, "2230", "t"), /^STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic \[t\]/m],
        ["closed hours, more outside than active", clockAt(2, "2230", "3 of 2"), /^STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic \[3 of 2\]/m],
        ["inside clinic hours AND a row outside", clockAt(3, "1200", "1 of 2"), /^STOP: Lisbon 31200, clock open, clinics outside\. /m],
      ];
      for (const [label, clock, stop] of cases) {
        const cfg = harnessConfig(doc, "stage1", clock, shell, base);
        const r = await runOnce(cfg, `${shell}-clinics-${label.replace(/\W+/g, "-")}`, null);
        assert.equal(r.code, 1, `${shell} ${label}: ${r.out.slice(-600)}`);
        assert.match(r.out, stop, `${shell} ${label}`);
        assert.ok(r.calls.some((c) => c.args.includes("precheck-0102-sat01-tables.sql")), `${label}: the pre-check did not run first`);
        assert.ok(!r.markersAtEnd.includes("0102-applied.ok") && !r.out.includes(STAGE1), label);
        assert.deepEqual(r.calls.filter((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), [], `${label}: verified-migrate ran`);
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("A ZONE THAT DID NOT LOAD: every block, run whole with a clock that answers UTC, GMT or no zone, STOPS with nothing recorded and nothing run after it", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0102-zone-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      for (const name of HARNESS_PLAN) {
        const spec = HARNESS_BLOCKS[name];
        // THE CONTROL: Lisbon's winter name passes exactly as its summer name does.
        const wet = await runOnce(harnessConfig(doc, name, clockAt(2, "2230", "0 of 2", "WET"), shell, base), `${shell}-zone-${name}-WET`, null);
        assert.equal(wet.code, 0, `${shell} ${name} WET: ${wet.out.slice(-500)}`);
        assert.ok(wet.out.includes(spec.success.at(-1)));
        for (const zone of ["UTC", "GMT", "", "CET", "west"]) {
          const r = await runOnce(harnessConfig(doc, name, clockAt(2, "2230", "0 of 2", zone), shell, base), `${shell}-zone-${name}-${zone || "none"}`, null);
          const tag = `${shell} ${name} zone [${zone}]`;
          assert.equal(r.code, 1, `${tag}: ${r.out.slice(-500)}`);
          assert.match(r.out, /^STOP: the Lisbon clock did not read as [^\n]* and the zone WET or WEST[^\n]*so the Lisbon zone may not have loaded \[/m, tag);
          assert.ok(!r.out.includes("TOOL-CHAIN-CONTINUED") && !spec.success.some((x) => r.out.includes(x)), tag);
          // Nothing after the clock ran: no apply, no guard, no reader, and no psql.
          assert.deepEqual(r.calls.filter((c) => c.id.startsWith("psql#") || (c.id.startsWith("node#") && /^(packages\/db\/scripts\/verified-migrate|scripts\/assert-production-target|--env-file=)/.test(c.args))), [], tag);
          // Stage 0 keeps its check-journal transcript, written before the clock; no other record is written.
          assert.deepEqual(r.markersAtEnd.filter((m) => m !== "0102-check-journal.out"), [], tag);
        }
      }
      // In stage 1 the zone is asked three times. With only the LAST read answering UTC, the block has
      // passed the run window and the pre-check, and STOPs at the arm, before the apply.
      const cfg = harnessConfig(doc, "stage1", CLOSED, shell, base);
      const late = await runOnce({ ...cfg, block: swap(cfg.block, "DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z')", "DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z' | sed 's/WEST/UTC/')") }, `${shell}-zone-late`, null);
      assert.equal(late.code, 1, late.out.slice(-500));
      assert.match(late.out, /^STOP: the Lisbon clock did not read as a weekday \(1 to 7\), HHMM and the zone WET or WEST[^\n]*\[22230 UTC\]/m);
      assert.ok(late.calls.some((c) => c.args.includes("precheck-0102-sat01-tables.sql")));
      assert.deepEqual(late.calls.filter((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), []);
      assert.ok(!late.markersAtEnd.includes("0102-applied.ok"));
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("A RECORD THAT READS EMPTY OR SHORT, and a clock call without its zone: each block STOPS on it, and the harness itself sees a date call that lost TZ=Europe/Lisbon", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0102-record-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      // The recorded sha, empty and cut short: the case in which an inline compare of two empty strings was true.
      for (const name of ["stage1", "stage2", "closing"]) {
        for (const [label, text] of [["empty", ""], ["a blank line", "\n"], ["39 characters", `${"1".repeat(39)}\n`], ["not hex", `${"g".repeat(40)}\n`]]) {
          const cfg = harnessConfig(doc, name, CLOSED, shell, base);
          const r = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0102-head.sha", text, 10); } }, `${shell}-record-${name}-${label.replace(/\W+/g, "-")}`, null);
          const tag = `${shell} ${name}, the recorded sha ${label}`;
          assert.equal(r.code, 1, `${tag}: ${r.out.slice(-400)}`);
          assert.match(r.out, /^STOP: stage 0's record did not read as a full 40-character sha \[/m, tag);
          assert.ok(!r.out.includes("TOOL-CHAIN-CONTINUED") && !HARNESS_BLOCKS[name].success.some((x) => r.out.includes(x)), tag);
          assert.deepEqual(r.calls.filter((c) => c.id.startsWith("psql#") || (c.id.startsWith("node#") && !c.args.startsWith("-e"))), [], tag);
        }
      }
      // Stage 2's pass mark, empty, in the closing read: it used to be compared inline.
      const cl = harnessConfig(doc, "closing", CLOSED, shell, base);
      const mark = await runOnce({ ...cl, setup: (tmp) => { cl.setup(tmp); putRecord(tmp, "0102-stage2.ok", "", 1); } }, `${shell}-record-mark`, null);
      assert.equal(mark.code, 1, mark.out.slice(-400));
      assert.match(mark.out, /^STOP: stage 2's pass mark did not read as a full 40-character sha \[\]\. 0102 IS APPLIED and the write stands\. Run nothing again/m);
      // The run window's sha, short, in stage 2.
      const s2 = harnessConfig(doc, "stage2", CLOSED, shell, base);
      const win = await runOnce({ ...s2, setup: (tmp) => { s2.setup(tmp); putRecord(tmp, "0102-window.ok", `abc ${CLOSED.window}\n`, 15); } }, `${shell}-record-window`, null);
      assert.equal(win.code, 1, win.out.slice(-400));
      assert.match(win.out, /^STOP: the sha in the run window record did not read as a full 40-character sha \[abc\]/m);
      // THE STUB'S OWN CONTROL. A block whose clock read lost TZ=Europe/Lisbon does not get an answer from
      // the stub, so every sweep above would have gone red on it: the stub does not answer by format alone.
      for (const name of HARNESS_PLAN) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const stripped = cfg.block.replaceAll("$(TZ=Europe/Lisbon date ", "$(date ");
        assert.notEqual(stripped, cfg.block);
        const r = await runOnce({ ...cfg, block: stripped }, `${shell}-notz-${name}`, null);
        assert.notEqual(r.code, 0, `${shell} ${name} without TZ: ${r.out.slice(-300)}`);
        assert.match(r.unexpected, /date ran without TZ=Europe\/Lisbon/, `${shell} ${name}`);
        assert.ok(!HARNESS_BLOCKS[name].success.some((x) => r.out.includes(x)), `${shell} ${name}`);
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("A READ THAT CONTRADICTS THE MARKER: stage 2 and the closing read, run whole with a database that does not hold 0102, STOP saying the state is UNKNOWN and never that 0102 is applied", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0102-contra-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      // [block, what the faked database answers, the start of the STOP]. In each the applied marker is
      // there (the harness's records), so the block's own read is the only thing that disagrees.
      const cases = [
        ["stage2", { hashN: "0" }, "STOP: the sha256 of 0102 is in the journal 0 times, not once. "],
        ["stage2", { hashN: "2" }, "STOP: the sha256 of 0102 is in the journal 2 times, not once. "],
        ["stage2", { rows: 99 }, "STOP: the journal reads 99 rows, not 99 plus one. "],
        ["stage2", { rows: 101 }, "STOP: the journal reads 101 rows, not 99 plus one. "],
        ["stage2", { post: "post-fail.out" }, "STOP: the post-check printed [1] FAIL verdicts, or its transcript could not be read. "],
        ["closing", { rows: 99 }, "STOP: the journal read after the apply does not say 100. "],
        ["closing", { reader: "without-0102" }, "STOP: the journal read does not list 0102 as APPLIED. "],
      ];
      for (const [name, db, start] of cases) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const r = await runOnce({ ...cfg, rows: db.rows, db }, `${shell}-contra-${name}-${JSON.stringify(db).replace(/\W+/g, "-")}`, null);
        const tag = `${shell} ${name} ${JSON.stringify(db)}`;
        assert.equal(r.code, 1, `${tag}: ${r.out.slice(-500)}`);
        const stop = r.out.split("\n").filter((l) => l.startsWith("STOP: "));
        assert.equal(stop.length, 1, `${tag}: ${stop.join(" | ")}`);
        assert.ok(stop[0].startsWith(`${start}${STATE_UNKNOWN}`), `${tag}: ${stop[0]}`);
        assert.ok(!stop[0].includes("IS APPLIED") && !stop[0].includes("the write stands"), `${tag}: ${stop[0]}`);
        assert.ok(!r.out.includes("TOOL-CHAIN-CONTINUED") && !HARNESS_BLOCKS[name].success.some((x) => r.out.includes(x)), tag);
        // No pass mark: after a contradicting read in stage 2 the closing read refuses.
        assert.ok(!r.markersAtEnd.includes("0102-stage2.ok"), tag);
      }
      // THE POST-CHECK ITSELF DOES NOT COMPLETE: psql exits non-zero on it. This is where a database
      // WITHOUT 0102 lands, because the post-check reads the new tables, column and functions by name and
      // Postgres refuses the statement before any verdict prints. The STOP says UNKNOWN, and nothing
      // runs after it: no journal read, no pass mark.
      const s2cfg = harnessConfig(doc, "stage2", CLOSED, shell, base);
      const positive = await runOnce(s2cfg, `${shell}-contra-psql-positive`, null);
      assert.equal(positive.code, 0, positive.out.slice(-400));
      const postCall = positive.calls.find((c) => c.id.startsWith("psql#") && c.args.includes("postcheck-0102-sat01-tables.sql"));
      assert.ok(postCall, "stage 2 did not run the post-check through psql");
      assert.ok(positive.calls.some((c) => c.id.startsWith("psql#") && c.pos > postCall.pos), "the positive run reads the journal after the post-check");
      const failed = await runOnce(s2cfg, `${shell}-contra-psql-fails`, { call: postCall.id });
      assert.equal(failed.fired, postCall.id);
      assert.equal(failed.code, 1, failed.out.slice(-500));
      const stops = failed.out.split("\n").filter((l) => l.startsWith("STOP: "));
      assert.equal(stops.length, 1, stops.join(" | "));
      assert.ok(stops[0].startsWith("STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written, so it has confirmed nothing;"), stops[0]);
      assert.ok(stops[0].includes(STATE_UNKNOWN), stops[0]);
      assert.ok(!stops[0].includes("IS APPLIED") && !stops[0].includes("the write stands"), stops[0]);
      assert.ok(!failed.out.includes("TOOL-CHAIN-CONTINUED") && !failed.out.includes(STAGE2));
      // NOTHING RUNS AFTER IT: the post-check is the last psql call, and no pass mark is written.
      assert.deepEqual(failed.calls.filter((c) => c.id.startsWith("psql#") && c.pos > failed.calls.find((x) => x.id === postCall.id).pos), []);
      assert.ok(!failed.markersAtEnd.includes("0102-stage2.ok"));
      // THE CONTROLS: the same blocks with a database that DOES hold it pass (hash once, 100 rows, 0102 listed).
      for (const name of ["stage2", "closing"]) {
        const ok = await runOnce(harnessConfig(doc, name, CLOSED, shell, base), `${shell}-contra-${name}-control`, null);
        assert.equal(ok.code, 0, `${shell} ${name}: ${ok.out.slice(-400)}`);
        assert.ok(!ok.out.includes("UNKNOWN"));
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

/** THE WINDOW FEED: stage 1 run whole with one run-window record or clock each. */
export async function windowFeed(base, shell, block) {
  const M = FAKE_SHA.HELD;
  const now = "202610062230";
  const cases = [
    ["a good record", `${M} 202610062200 202610062300 202610070000`, null, null],
    ["now before the window opens", `${M} 202610062240 202610062300 202610070000`, null, /^STOP: Lisbon 202610062230 is before the run window opens at 202610062240/m],
    ["now past the last minute stage 1 may start", `${M} 202610062200 202610062220 202610070000`, null, /^STOP: Lisbon 202610062230 is past 202610062220, the last minute/m],
    ["now AT the window's end", `${M} 202610062200 202610062300 ${now}`, null, /^STOP: Lisbon 202610062230 is not before 202610062230, the run window's end/m],
    ["now PAST the window's end (the previous night's window)", `${M} 202610052100 202610062259 202610060800`, null, /^STOP: Lisbon 202610062230 is not before 202610060800, the run window's end/m],
    ["a record for another sha", `${"2".repeat(40)} 202610062200 202610062300 202610070000`, null, /^STOP: the run window was recorded for 2{40}, not for the sha stage 0 recorded/m],
    ["a malformed record: an 11-digit time", `${M} 20261006220 202610062300 202610070000`, null, /^STOP: the recorded run window did not parse/m],
    ["a malformed record: no end", `${M} 202610062200 202610062300`, null, /^STOP: the recorded run window did not parse/m],
    ["an empty clock", `${M} 202610062200 202610062300 202610070000`, "", /^STOP: /m],
    // THE EDGES THAT PASS. The window is closed at both ends of its start span: at the minute it opens
    // and at the last minute stage 1 may start, stage 1 starts.
    ["now AT the minute the window opens", `${M} ${now} 202610062300 202610070000`, null, null],
    ["now AT the last minute stage 1 may start", `${M} 202610062200 ${now} 202610070000`, null, null],
  ];
  const failures = [];
  for (const [i, [name, record, stamp, stop]] of cases.entries()) {
    const cfg = harnessConfig(doc, "stage1", CLOSED, shell, base);
    const setup = cfg.setup;
    const r = await runOnce({
      ...cfg, block,
      clock: stamp === null ? cfg.clock : { ...cfg.clock, stamp },
      setup: (tmp) => { setup(tmp); putRecord(tmp, "0102-window.ok", `${record}\n`, 5); },
    }, `${shell}-feed-${i}`, null);
    const psql = r.calls.some((c) => c.id.startsWith("psql#"));
    const applied = r.markersAtEnd.includes("0102-applied.ok") || r.out.includes(STAGE1);
    if (stop === null) {
      if (r.code !== 0 || !applied || !r.out.includes("TOOL-CHAIN-CONTINUED")) failures.push(`${name}: did not reach the applied line (exit ${r.code})`);
    } else if (r.code === 0 || applied || psql || !stop.test(r.out)) {
      failures.push(`${name}: exit ${r.code}, applied ${applied}, psql ran ${psql}, STOP ${(r.out.match(/^STOP: .*$/m) ?? ["none"])[0].slice(0, 90)}`);
    }
  }
  return { cases: cases.length, failures };
}

/** Stage 1 without its window-end line (`now < end`, after the first clock read). */
export function withoutWindowEnd(block) {
  const lines = block.split("\n");
  const hits = lines.filter((l) => l.startsWith('[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is not before ${WEND}'));
  assert.equal(hits.length, 1, "the line to remove is not there exactly once");
  lines.splice(lines.indexOf(hits[0]), 1);
  return lines.join("\n");
}

test("THE WINDOW FEED: stage 1 refuses every run-window record it must, before psql, and passes a good one and both edges", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0102-feed-"));
  try {
    prepareHarness(base, doc);
    const s1 = blockWith(doc, STAGE1);
    for (const shell of shells) {
      const real = await windowFeed(base, shell, s1);
      assert.equal(real.cases, 11);
      assert.deepEqual(real.failures, [], `${shell}: ${real.failures.join("\n")}`);
      const stripped = await windowFeed(base, shell, withoutWindowEnd(s1));
      assert.deepEqual(stripped.failures.map((f) => f.split(":")[0]), [
        "now AT the window's end",
        "now PAST the window's end (the previous night's window)",
      ], `${shell}: ${stripped.failures.join("\n")}`);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("THE APPLIED MARKER'S AGE: a marker from this sitting stops stages 0 and 1; one 13 hours old does not", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0102-marker-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      for (const name of ["stage0", "stage1"]) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        for (const [age, stops] of [[719, true], [780, false]]) {
          const r = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0102-applied.ok", "", age); } }, `${shell}-${name}-age-${age}`, null);
          if (stops) {
            assert.notEqual(r.code, 0, `${shell} ${name} ${age}`);
            assert.match(r.out, /^STOP: stage 1 has ALREADY APPLIED 0102 in this sitting/m);
            assert.deepEqual(r.calls.filter((c) => c.id.startsWith("git#")), [], `${shell} ${name}: it ran git after the marker`);
          } else {
            assert.equal(r.code, 0, `${shell} ${name} ${age}: ${r.out.slice(-600)}`);
          }
        }
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("THE HELD HEAD MOVED, OR THE HELD BRANCH IS GONE: stages 0 and 1 STOP with nothing applied; stage 2 and the closing read run from the recorded sha, or say what stands", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0102-held-"));
  const MOVED = "2".repeat(40);
  const resolves = (c) => c.id.startsWith("git#") && c.args.startsWith(`rev-parse\n${HELD_REF}`);
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      // THE HEAD MOVED between stage 0 and stage 1 (a push, or an update of the branch): stage 1 halts at the
      // HEAD CHECK, with both shas printed, before the environment is loaded, before psql and before the apply.
      const s1 = harnessConfig(doc, "stage1", CLOSED, shell, base);
      const moved1 = await runOnce({ ...s1, held: MOVED }, `${shell}-held-moved-stage1`, null);
      assert.equal(moved1.code, 1, moved1.out.slice(-400));
      assert.match(moved1.out, /^STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting\. The sitting halts and nothing is applied\. Report both shas above$/m);
      assert.match(moved1.out, new RegExp(`^recorded by stage 0: ${FAKE_SHA.HELD}$`, "m"));
      assert.match(moved1.out, new RegExp(`^the held head now:   ${MOVED}$`, "m"));
      assert.deepEqual(moved1.calls.filter((c) => c.id.startsWith("psql#") || c.id.startsWith("node#")), [], `${shell}: something ran after the HEAD CHECK`);
      assert.deepEqual(moved1.markersAtEnd, [], shell);
      assert.ok(!moved1.out.includes("TOOL-CHAIN-CONTINUED") && !moved1.out.includes(STAGE1));
      // AFTER THE APPLY a moved head is reported and nothing more: stage 2 and the closing read run from the RECORDED sha.
      for (const name of ["stage2", "closing"]) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const r = await runOnce({ ...cfg, held: MOVED }, `${shell}-held-moved-${name}`, null);
        assert.equal(r.code, 0, `${shell} ${name}: ${r.out.slice(-400)}`);
        assert.match(r.out, new RegExp(`^THE HELD HEAD MOVED since stage 0: recorded ${FAKE_SHA.HELD}, now ${MOVED}\\. `, "m"), `${shell} ${name}`);
        assert.ok(r.out.includes(HARNESS_BLOCKS[name].success.at(-1)), `${shell} ${name}`);
        for (const c of r.calls.filter((x) => x.id.startsWith("git#") && x.args.startsWith("checkout"))) assert.ok(c.args.includes(FAKE_SHA.HELD) && !c.args.includes(MOVED), `${shell} ${name}: checked out the moved head`);
        // THE CONTROL: with the head where stage 0 left it, the block says so.
        const same = await runOnce(cfg, `${shell}-held-same-${name}`, null);
        assert.match(same.out, /^the held head has not moved since stage 0/m, `${shell} ${name}`);
      }
      // THE BRANCH IS GONE FROM ORIGIN (merged, or deleted): the one line of each block that reads it fails, and the block STOPs there.
      for (const name of HARNESS_PLAN) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const positive = await runOnce(cfg, `${shell}-held-gone-${name}-positive`, null);
        const call = positive.calls.filter(resolves);
        assert.equal(call.length, 1, `${shell} ${name}: the block resolves the held head ${call.length} times`);
        const r = await runOnce(cfg, `${shell}-held-gone-${name}`, { call: call[0].id });
        const tag = `${shell} ${name}, the branch gone`;
        assert.equal(r.fired, call[0].id, tag);
        assert.equal(r.code, 1, `${tag}: ${r.out.slice(-400)}`);
        const stops = r.out.split("\n").filter((l) => l.startsWith("STOP: "));
        assert.equal(stops.length, 1, `${tag}: ${stops.join(" | ")}`);
        assert.ok(stops[0].startsWith(`STOP: the held head, ${HELD_REF}, could not be read. `), `${tag}: ${stops[0]}`);
        if (name === "stage0" || name === "stage1") assert.ok(stops[0].endsWith("Nothing was applied"), `${tag}: ${stops[0]}`);
        else assert.ok(stops[0].includes(WRITE_STANDS) && !stops[0].includes("UNKNOWN"), `${tag}: ${stops[0]}`);
        // Nothing runs after it: no database, no guard, no apply, no reader; and no record of this block is written.
        assert.deepEqual(r.calls.filter((c) => c.id.startsWith("psql#") || (c.id.startsWith("node#") && !c.args.startsWith("-e"))), [], tag);
        assert.deepEqual(r.markersAtEnd, [], tag);
        assert.ok(!r.out.includes("TOOL-CHAIN-CONTINUED") && !HARNESS_BLOCKS[name].success.some((x) => r.out.includes(x)), tag);
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

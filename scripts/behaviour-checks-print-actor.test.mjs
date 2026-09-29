// THE BEHAVIOUR CHECKS SAY WHO THEY ACT AS, ONCE, BEFORE ANY VERDICT.
//
// scripts/db/behaviour-*-readonly.sql impersonate one staff user and print
// verdicts about what that user's session can read. Two of them PICK the user
// at run time (the lowest matching id), two take it with -v actor_id, and one
// does either. Until this guard, none of them said which user it had acted as,
// so a transcript could not show whether the run had acted as a particular
// account, for example a test account somebody is about to deactivate.
//
// THE RULE, per file:
//   * exactly ONE line prints `ACTOR id <id> | role <slug> | chosen <how>`;
//   * it interpolates exactly :actor_id, :actor_role and :actor_source, and
//     nothing else, so no name, email or phone can reach it;
//   * :actor_role is read from roles.slug;
//   * every way the file can choose its actor sets :actor_source to a phrase
//     that names that way, and no other phrase;
//   * the line comes AFTER the actor id, the role and the source are final,
//     and BEFORE the verdict block, so it is printed before any verdict row;
//   * no line outside a `--` comment names a personal column, except the exact
//     lines PERSONAL_READS lists for that file, and every listed line must
//     still be in the file, so the allowance cannot outlive what it names.
//
// THE ONE ALLOWANCE. behaviour-conflict-name-readonly.sql proves that the
// conflict check returns a patient's name only where the caller's own reads
// would show it, and the only way to prove that is to read the name the caller
// reads and compare. It does so on exactly two lines; both results stay inside
// SQL and leave as a boolean or a count, never as text. The allowance is those
// two lines, verbatim and for that file only. It is not a column allowance:
// the same column on any other line of that file, or in any other file, fails.
//
// WHAT THIS DOES NOT PROVE: that the SQL runs. These files need a database,
// and CI runs none of them. This is a static check on the bytes, and each rule
// has a planted negative control below so a green run means it can go red.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PICKED = "picked at run time (the lowest matching id, -v actor_id is not read by this file)";
const PICKED_OR_PASSED = ["passed in with -v actor_id", "picked at run time (the lowest matching id)"];

/** Each file, and every :actor_source phrase it may set (one per way it chooses). */
export const FILES = {
  "scripts/db/behaviour-care-loc-readonly.sql": PICKED_OR_PASSED,
  "scripts/db/behaviour-care-team-readonly.sql": [PICKED],
  "scripts/db/behaviour-nesa-names-readonly.sql": [PICKED],
  "scripts/db/behaviour-rgpd-readonly.sql": ["passed in with -v actor_id"],
  "scripts/db/behaviour-conflict-name-readonly.sql": PICKED_OR_PASSED,
  // 0094 (held): the users/tenants/roles policy split. Passed in, like rgpd.
  "scripts/db/behaviour-users-tenants-roles-readonly.sql": ["passed in with -v actor_id"],
};

/** Per file, the exact trimmed lines that may name a personal column. See the header. */
export const PERSONAL_READS = {
  "scripts/db/behaviour-conflict-name-readonly.sql": [
    "((SELECT p.full_name FROM public.appointments a JOIN public.patients p ON p.id = a.patient_id",
    "(SELECT p.full_name FROM public.appointments a",
  ],
};

const ACTOR_LINE = /^\\echo 'ACTOR id' /;
const VERDICT_BLOCK = /^(WITH r\(|SELECT '0\. )/;
const PERSONAL = /\b(email|phone|full_name|first_name|last_name|display_name)\b|\bu\.name\b/i;

/** Index of the first `\gset` at or after line `from`, or -1. */
function gsetFrom(lines, from) {
  for (let i = from; i < lines.length; i++) if (/\\gset\b/.test(lines[i])) return i;
  return -1;
}

/** The last line index at which `name` is assigned: `AS name ... \gset` or `\set name`. */
function lastAssignment(lines, name) {
  let last = -1;
  lines.forEach((line, i) => {
    if (/^\s*--/.test(line)) return;
    if (new RegExp(`\\bAS ${name}\\b`).test(line)) last = Math.max(last, gsetFrom(lines, i));
    if (new RegExp(`^\\\\set ${name}\\b`).test(line)) last = Math.max(last, i);
  });
  return last;
}

/** Every problem with the actor line in one file's text. Empty means it passes. */
export function actorLineProblems(sql, allowedSources, personalReads = []) {
  const problems = [];
  const lines = sql.split("\n");
  const actorIdx = lines.map((l, i) => (ACTOR_LINE.test(l) ? i : -1)).filter((i) => i >= 0);
  if (actorIdx.length !== 1) {
    problems.push(`expected exactly one ACTOR line, found ${actorIdx.length}`);
    return problems;
  }
  const at = actorIdx[0];
  const vars = [...lines[at].matchAll(/:'?\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]).sort();
  if (JSON.stringify(vars) !== JSON.stringify(["actor_id", "actor_role", "actor_source"])) {
    problems.push(`the ACTOR line must interpolate exactly actor_id, actor_role, actor_source; it has ${vars.join(", ")}`);
  }

  const roleLine = lines.findIndex((l) => !/^\s*--/.test(l) && /\bAS actor_role\b/.test(l));
  if (roleLine < 0) problems.push("nothing assigns actor_role");
  else if (!lines.slice(Math.max(0, roleLine - 2), roleLine + 1).join(" ").includes("r.slug")) {
    problems.push("actor_role is not read from roles.slug");
  }

  const sources = lines
    .map((l) => l.match(/^\\set actor_source '([^']*)'\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
  if (JSON.stringify([...sources].sort()) !== JSON.stringify([...allowedSources].sort())) {
    problems.push(`actor_source must be set once per way of choosing, to ${JSON.stringify(allowedSources)}; found ${JSON.stringify(sources)}`);
  }

  for (const name of ["actor_id", "actor_role", "actor_source"]) {
    const last = lastAssignment(lines, name);
    if (last < 0 || last >= at) problems.push(`the ACTOR line is printed before ${name} is final`);
  }

  const verdict = lines.findIndex((l) => VERDICT_BLOCK.test(l));
  if (verdict < 0) problems.push("no verdict block found");
  else if (at > verdict) problems.push("the ACTOR line is printed after the verdict block starts");

  const trimmed = lines.map((l) => l.trim());
  lines.forEach((l, i) => {
    if (/^\s*--/.test(l)) return;
    if (PERSONAL.test(l) && !personalReads.includes(trimmed[i])) {
      problems.push(`line ${i + 1} names a personal column: ${l.trim()}`);
    }
  });
  for (const allowed of personalReads) {
    const at = trimmed.filter((t) => t === allowed).length;
    if (at !== 1) problems.push(`a PERSONAL_READS line must appear exactly once, found ${at}: ${allowed}`);
  }
  return problems;
}

for (const [file, sources] of Object.entries(FILES)) {
  test(`${file} prints one ACTOR line (id, role, how chosen) before any verdict`, () => {
    const problems = actorLineProblems(readFileSync(join(ROOT, file), "utf8"), sources, PERSONAL_READS[file]);
    assert.deepEqual(problems, [], `${file}:\n  ${problems.join("\n  ")}`);
  });
}

// ---------------------------------------------------------------------------
// NEGATIVE CONTROLS. Each plants one violation in a real file's text and
// requires the checker to name it. A checker that can only say yes is not one.
// ---------------------------------------------------------------------------

const CARE_LOC = "scripts/db/behaviour-care-loc-readonly.sql";
const real = () => readFileSync(join(ROOT, CARE_LOC), "utf8");
const echo = "\\echo 'ACTOR id' :actor_id '| role' :actor_role '| chosen' :actor_source";

test("CONTROL: the unplanted text passes, so every control below changes one thing", () => {
  assert.deepEqual(actorLineProblems(real(), FILES[CARE_LOC]), []);
});

test("CONTROL: a file with no ACTOR line is caught", () => {
  const found = actorLineProblems(real().replace(echo + "\n", ""), FILES[CARE_LOC]);
  assert.match(found.join("\n"), /exactly one ACTOR line, found 0/);
});

test("CONTROL: a second ACTOR line is caught", () => {
  const found = actorLineProblems(real().replace(echo, `${echo}\n${echo}`), FILES[CARE_LOC]);
  assert.match(found.join("\n"), /exactly one ACTOR line, found 2/);
});

test("CONTROL: an extra variable on the ACTOR line is caught", () => {
  const found = actorLineProblems(real().replace(echo, `${echo} :actor_name`), FILES[CARE_LOC]);
  assert.match(found.join("\n"), /interpolate exactly actor_id, actor_role, actor_source/);
});

test("CONTROL: an ACTOR line moved after the verdict block is caught", () => {
  const moved = real().replace(echo + "\n", "").replace("ROLLBACK;", `${echo}\nROLLBACK;`);
  const found = actorLineProblems(moved, FILES[CARE_LOC]);
  assert.match(found.join("\n"), /after the verdict block starts/);
});

test("CONTROL: an ACTOR line printed before the actor id is final is caught", () => {
  const early = real().replace(echo + "\n", "").replace("\\set actor_id :actor_checked", `${echo}\n\\set actor_id :actor_checked`);
  const found = actorLineProblems(early, FILES[CARE_LOC]);
  assert.match(found.join("\n"), /printed before actor_id is final/);
});

test("CONTROL: a choosing path that sets no source is caught", () => {
  const found = actorLineProblems(real().replace("\\set actor_source 'passed in with -v actor_id'\n", ""), FILES[CARE_LOC]);
  assert.match(found.join("\n"), /actor_source must be set once per way of choosing/);
});

test("CONTROL: a role read from anything but roles.slug is caught", () => {
  const found = actorLineProblems(real().replace("SELECT coalesce((SELECT r.slug", "SELECT coalesce((SELECT r.name"), FILES[CARE_LOC]);
  assert.match(found.join("\n"), /not read from roles\.slug/);
});

test("CONTROL: a personal column selected anywhere in the file is caught", () => {
  const found = actorLineProblems(real().replace("SELECT tenant_id AS actor_tenant", "SELECT tenant_id AS actor_tenant, u.email AS actor_email"), FILES[CARE_LOC]);
  assert.match(found.join("\n"), /names a personal column/);
});

// ---------------------------------------------------------------------------
// THE ALLOWANCE'S OWN CONTROLS. The conflict-name file may name a patient's
// name on its two listed lines and nowhere else, and only that file may.
// ---------------------------------------------------------------------------

const CONFLICT = "scripts/db/behaviour-conflict-name-readonly.sql";
const conflict = () => readFileSync(join(ROOT, CONFLICT), "utf8");

test("CONTROL: the conflict-name file passes only because of its two listed lines", () => {
  assert.deepEqual(actorLineProblems(conflict(), FILES[CONFLICT], PERSONAL_READS[CONFLICT]), []);
  const without = actorLineProblems(conflict(), FILES[CONFLICT]);
  assert.equal(without.filter((p) => /names a personal column/.test(p)).length, 2);
});

test("CONTROL: a personal column on any other line of the conflict-name file is caught", () => {
  const planted = conflict().replace("SELECT tenant_id AS actor_tenant", "SELECT tenant_id AS actor_tenant, u.email AS actor_email");
  const found = actorLineProblems(planted, FILES[CONFLICT], PERSONAL_READS[CONFLICT]);
  assert.match(found.join("\n"), /names a personal column: SELECT tenant_id AS actor_tenant, u\.email/);
});

test("CONTROL: the patient name read elsewhere in the conflict-name file is caught", () => {
  const planted = conflict().replace("SELECT tenant_id AS actor_tenant FROM public.users",
    "SELECT tenant_id AS actor_tenant, (SELECT p.full_name FROM public.patients p LIMIT 1) AS leak FROM public.users");
  const found = actorLineProblems(planted, FILES[CONFLICT], PERSONAL_READS[CONFLICT]);
  assert.match(found.join("\n"), /names a personal column: .*AS leak/);
});

test("CONTROL: a listed line that is no longer in the file is caught", () => {
  const stale = conflict().replace(PERSONAL_READS[CONFLICT][1], "(SELECT NULL::text FROM public.appointments a");
  const found = actorLineProblems(stale, FILES[CONFLICT], PERSONAL_READS[CONFLICT]);
  assert.match(found.join("\n"), /must appear exactly once, found 0/);
});

test("CONTROL: the allowance does not travel to another file", () => {
  const planted = real().replace("SELECT tenant_id AS actor_tenant", `${PERSONAL_READS[CONFLICT][1]}\nSELECT tenant_id AS actor_tenant`);
  const found = actorLineProblems(planted, FILES[CARE_LOC], PERSONAL_READS[CARE_LOC]);
  assert.match(found.join("\n"), /names a personal column: \(SELECT p\.full_name/);
});

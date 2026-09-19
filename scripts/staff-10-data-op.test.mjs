// staff-10-data-op.test.mjs - the STAFF-10 schedule-row data op: that its three
// stages agree with each other and with the two scripts that already carry these
// ids, and that each stage writes only what its header claims.
//
// No database. These are properties of the FILES, which is the half a machine can
// hold; the behaviour is rehearsed against a throwaway at production shape and
// recorded in docs/data-op-staff-10.md.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const S1 = readFileSync(join(ROOT, "scripts/data/staff-10-1-preview.sql"), "utf8");
const S2 = readFileSync(join(ROOT, "scripts/data/staff-10-2-apply.sql"), "utf8");
const S3 = readFileSync(join(ROOT, "scripts/data/staff-10-3-postcheck.sql"), "utf8");
const STAFF10 = readFileSync(join(ROOT, "packages/db/scripts/staff-10-jp-split-lv.mjs"), "utf8");
const STAFF11 = readFileSync(join(ROOT, "packages/db/scripts/staff-11-jp-one-clinic-check.mjs"), "utf8");
const RECEPTION = readFileSync(join(ROOT, "docs/staff-10-reception-list.md"), "utf8");

/** SQL with comments stripped, so a word inside a comment never passes for code. */
const code = (s) => s.replace(/--.*$/gm, "");

const ACTION = "staff.jp_lv_schedule_rows.retire";
const IDS = {
  JP_CB: "54d486e0-a9c3-4c82-acac-8b909ce5a2d0",
  JP_LV: "0c1a0000-0000-4000-8000-000000000001",
  LV: "de000002-0000-0000-0000-000000000001",
  CB: "de000002-0000-0000-0000-000000000002",
};

/* ---- agreement with the scripts that already carry these ids --------------- */

test("the four ids are STAFF-10's and STAFF-11's, byte for byte", () => {
  // A data op that invented its own id for JP would act on the wrong person and
  // every count would still look plausible.
  for (const [name, value] of Object.entries(IDS)) {
    const pick = (src) => src.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1];
    assert.equal(pick(STAFF10), value, `${name} differs from the STAFF-10 script`);
    assert.equal(pick(STAFF11), value, `${name} differs from the STAFF-11 check`);
    for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
      assert.ok(sql.includes(value), `${name} is missing from ${label}`);
    }
  }
});

/* ---- what each stage is allowed to write ---------------------------------- */

const WRITE = /\b(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from|truncate|alter\s+table|drop\s+)/i;

test("stage 1 writes NOTHING, and stage 3 writes nothing either", () => {
  assert.doesNotMatch(code(S1), WRITE, "stage 1 contains a write statement");
  assert.doesNotMatch(code(S3), WRITE, "the post-check contains a write statement");
});

test("NO stage writes an appointment, a clinical record, an episode or an attachment", () => {
  // The ruling this op runs under: clinical authorship never moves, and past
  // appointments never move. The strongest form of that is not writing those
  // tables at all, in any stage.
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    for (const table of ["appointments", "clinical_records", "clinical_episodes", "attachments"]) {
      const writes = new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?${table}\\b`, "i");
      assert.doesNotMatch(code(sql), writes, `${label} writes ${table}`);
    }
  }
});

test("stage 2 writes only the three things its header names", () => {
  const c = code(S2);
  assert.match(c, /update public\.availability_templates set is_active = false/i);
  assert.match(c, /update public\.availability_templates set user_id = c_jp_lv/i);
  assert.match(c, /delete from public\.time_off where id = v_block\.id/i);
  assert.match(c, /insert into public\.audit_log/i);
  // Anything else writing would be a fourth thing nobody approved.
  const writes = c.match(WRITE_ALL) ?? [];
  assert.equal(writes.length, 4, `stage 2 has ${writes.length} write statements, expected 4: ${writes.join(" | ")}`);
});
const WRITE_ALL = /\b(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from|truncate|alter\s+table)/gi;

/* ---- the handshake between the stages -------------------------------------- */

test("stage 2 is ONE transaction: a single DO block", () => {
  assert.equal((S2.match(/\bDO \$\$/g) ?? []).length, 1, "stage 2 is not exactly one DO block");
  assert.equal((S2.match(/\bEND \$\$;/g) ?? []).length, 1);
});

test("stage 2 consumes BOTH carries stage 1 prints", () => {
  for (const carry of ["staff10_expected_count", "staff10_expected_digest"]) {
    assert.ok(S1.includes(`'${carry}'`), `stage 1 does not print ${carry}`);
    assert.ok(S2.includes(`:'${carry}'`), `stage 2 does not consume ${carry}`);
  }
  // No carry name may be a substring of another, or the awk that parses them out
  // of the transcript picks the wrong line.
  assert.ok(!"staff10_expected_count".includes("staff10_expected_digest"));
  assert.ok(!"staff10_expected_digest".includes("staff10_expected_count"));
});

test("the digest is computed the SAME way in stage 1 and stage 2", () => {
  // If these two expressions ever drift, stage 2 refuses every correct run, or
  // worse, accepts an incorrect one.
  const digest = /md5\(string_agg\(action \|\| ':' \|\| id::text, ',' ORDER BY action, id\)\)/;
  assert.match(S1, digest, "stage 1's digest expression changed");
  assert.match(S2, digest, "stage 2's digest expression changed");
});

test("stage 2 refuses a re-run on its own audit row, and stage 3 reads that row", () => {
  assert.match(code(S2), new RegExp(`action = c_action`), "stage 2 has no re-run guard");
  assert.ok(S2.includes(`'${ACTION}'`), "stage 2 does not carry the audit action");
  assert.ok(S3.includes(`'${ACTION}'`), "the post-check does not read stage 2's audit action");
  assert.match(code(S2), /raise exception 'STOP: this block has already run/i);
});

test("every number the post-check checks is read BACK OUT of the audit row", () => {
  // SR-59: a number that travels through a human hand can be transcribed wrongly.
  for (const key of [
    "retired_count", "moved_count", "deleted_blocks", "appointments_before",
    "appt_cb_before", "appt_lv_before", "cb_at_cb_before", "lv_saturdays_before",
    "cb_inactive_before",
  ]) {
    assert.ok(S2.includes(`'${key}'`), `stage 2 does not record ${key}`);
    assert.ok(S3.includes(`'${key}'`), `the post-check does not read ${key} back`);
  }
});

test("the post-check prints 14 verdicts, the number the doc's shell block counts", () => {
  const verdicts = S3.match(/THEN 'OK' ELSE 'FAIL' END/g) ?? [];
  assert.equal(verdicts.length, 14, `the post-check emits ${verdicts.length} verdicts, not 14`);
});

/* ---- the rulings this op runs under ---------------------------------------- */

test("the Saturday weekday is 6, the schema's own convention", () => {
  // schema.ts: 0 = Sunday .. 6 = Saturday, matching JS getDay(), with a CHECK.
  assert.match(S1, /weekday = 6/);
  assert.match(S2, /weekday = 6/);
});

test("the portal predicate the post-check asserts is the portal's own", () => {
  // apps/api/lib/appointments/store.ts, listBookableTherapists: active AND the
  // template window covers today. An op that asserted a looser predicate would
  // report JP(cb) gone from a list it is still on.
  assert.match(S3, /valid_from\s+IS NULL OR av\.valid_from\s+<=/);
  assert.match(S3, /valid_until IS NULL OR av\.valid_until >=/);
});

test("the reception list names ids and never a patient name", () => {
  assert.doesNotMatch(RECEPTION, /full_name/, "the reception list reaches for a name column");
  assert.match(RECEPTION, /patient_id/, "the reception list must work from ids");
  // It must point at stage 1 rather than carrying rows that go stale.
  assert.match(RECEPTION, /staff-10-1-preview\.sql/);
});

test("no stage cancels an appointment, which is reception's decision", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    assert.doesNotMatch(
      code(sql),
      /set\s+status\s*=\s*'cancelled'/i,
      `${label} cancels an appointment`,
    );
  }
});

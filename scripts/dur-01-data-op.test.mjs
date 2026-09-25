// dur-01-data-op.test.mjs - the DUR-01 held data op: properties of its FILES,
// which is the half a machine can hold without a database. The behaviour is
// rehearsed on a throwaway and recorded in docs/data-op-dur-01.md, and the
// inline rule is compared with the app's own checks by
// apps/web/lib/scheduling/dur-01-classification.db.test.ts.
//
// Nothing here asserts a production count, and nothing here may: the op's sets
// are derived at run time, so any number in this file would be a claim about
// data that moves.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (p) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");

const F1 = "scripts/data/dur-01-1-measure.sql";
const F2 = "scripts/data/dur-01-2-write.sql";
const F3 = "scripts/data/dur-01-3-verify.sql";
const GUARD = "scripts/assert-production-target.mjs";
const DOCF = "docs/data-op-dur-01.md";
const S1 = read(F1);
const S2 = read(F2);
const S3 = read(F3);
const DOC = read(DOCF);
const ACTION = "staff.dur01.extend_import_duration";

/** SQL with line comments stripped, so a word in a comment never passes for code. */
const code = (s) => s.replace(/--.*$/gm, "");

/** The fenced block under the "## <heading>" whose text starts with `prefix`. */
function block(prefix) {
  const lines = DOC.split("\n");
  const at = lines.findIndex((l) => l.startsWith("## ") && l.slice(3).startsWith(prefix));
  assert.ok(at >= 0, `no heading starting "${prefix}"`);
  const open = lines.findIndex((l, i) => i > at && l === "```");
  const close = lines.findIndex((l, i) => i > open && l === "```");
  return lines.slice(open + 1, close).join("\n");
}

/** Every copy of the block between `-- >>> DUR-01 <name> BEGIN` and `-- <<< DUR-01 <name> END`. */
function copies(sql, name) {
  const begin = `-- >>> DUR-01 ${name} BEGIN`;
  const end = `-- <<< DUR-01 ${name} END`;
  const out = [];
  let from = 0;
  for (;;) {
    const a = sql.indexOf(begin, from);
    if (a < 0) break;
    const b = sql.indexOf(end, a);
    assert.ok(b > a, `a ${name} block does not close`);
    out.push(sql.slice(a, b + end.length));
    from = b + end.length;
  }
  return out;
}
const [BASE] = copies(S1, "BASE");

/* ---- the shared blocks --------------------------------------------------- */

test("stage 1 and stage 2 compute every set with the SAME bytes: one BASE in each, none in stage 3", () => {
  assert.equal(copies(S1, "BASE").length, 1, "stage 1 does not hold exactly one BASE block");
  assert.equal(copies(S2, "BASE").length, 1, "stage 2 does not hold exactly one BASE block");
  assert.equal(copies(S3, "BASE").length, 0, "stage 3 carries a BASE block");
  assert.equal(copies(S2, "BASE")[0], BASE, "the BASE block drifted between stage 1 and stage 2");
});

test("the rule is ONE text: byte-identical in stage 1's BASE, stage 2's BASE, stage 2's RECHECK and stage 3's RECHECK", () => {
  const all = [...copies(S1, "RULE"), ...copies(S2, "RULE"), ...copies(S3, "RULE")];
  assert.equal(copies(S1, "RULE").length, 1);
  assert.equal(copies(S2, "RULE").length, 2);
  assert.equal(copies(S3, "RULE").length, 1);
  for (const r of all) assert.equal(r, all[0], "a RULE block drifted");
  assert.ok(BASE.includes(all[0]), "stage 1's rule is not inside its BASE");
  const [r2] = copies(S2, "RECHECK");
  const [r3] = copies(S3, "RECHECK");
  assert.ok(r2 && r3, "a RECHECK block is missing");
  assert.equal(r3, r2, "the RECHECK block drifted between stage 2 and stage 3");
  assert.ok(r2.includes(all[0]), "the RECHECK block does not carry the rule");
  assert.equal(copies(S1, "RECHECK").length, 0);
});

/* ---- what each stage may write ------------------------------------------- */

const ANY_WRITE = /\b(insert\s+into|update\s+[a-z_.]+(\s+[a-z_]+)?\s+set|delete\s+from|truncate|alter\s+table|drop\s+|create\s+(table|function|trigger|index|view|policy)|merge\s+into|copy\s+)/i;

test("stage 1 and stage 3 write nothing, and each runs in a READ ONLY transaction it rolls back", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 3", S3]]) {
    assert.doesNotMatch(code(sql), ANY_WRITE, `${label} contains a write statement`);
    assert.match(code(sql), /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;/, `${label} is not READ ONLY`);
    assert.match(code(sql), /\nROLLBACK;\n/, `${label} does not roll back`);
    assert.doesNotMatch(code(sql), /\bCOMMIT\b/, `${label} commits`);
    assert.doesNotMatch(code(sql), /\bDO \$/, `${label} carries a DO block`);
  }
});

test("stage 2's writes are exactly the whitelist: ends_at and updated_at on appointments, and the audit insert", () => {
  const found = [...code(S2).matchAll(/\b(update\s+public\.[a-z_]+(?:\s+[a-z])?\s+set|delete\s+from\s+public\.[a-z_]+|insert\s+into\s+public\.[a-z_]+)/gi)]
    .map((m) => m[1].replace(/\s+/g, " ").toLowerCase());
  assert.deepEqual(found, ["update public.appointments a set", "insert into public.audit_log"]);
  const everyWrite = [...code(S2).matchAll(new RegExp(ANY_WRITE.source, "gi"))];
  assert.equal(everyWrite.length, found.length, `stage 2 has a write outside the whitelist: ${everyWrite.map((m) => m[0]).join(" | ")}`);
  const upd = code(S2).match(/UPDATE public\.appointments a\s+SET ([\s\S]*?)\n\s+FROM public\.services s\n([\s\S]*?);/);
  assert.ok(upd, "the UPDATE did not parse");
  const cols = [...upd[1].matchAll(/(?:^|,)\s*([a-z_0-9]+)\s*=/g)].map((m) => m[1]);
  assert.deepEqual(cols, ["ends_at", "updated_at"], "the UPDATE sets a column other than ends_at and updated_at");
  assert.match(upd[1], /^ends_at = a\.starts_at \+ make_interval\(mins => s\.duration_min\), updated_at = now\(\)$/);
  assert.match(upd[2], /WHERE a\.id = ANY\(v_ids\) AND a\.tenant_id = v_tenant/, "the UPDATE is not bound to the WRITE ids and the tenant");
  assert.match(upd[2], /AND a\.ends_at = a\.starts_at \+ interval '1 minute'/, "the UPDATE does not require the row still to last one minute");
  assert.match(upd[2], /AND a\.status IN \('scheduled', 'confirmed'\)/, "the UPDATE does not require the row to be live");
});

test("every write is followed by its ROW_COUNT, asserted exactly", () => {
  const c = code(S2);
  const writes = [...c.matchAll(/\b(UPDATE public\.|INSERT INTO public\.)/g)].map((m) => m.index);
  assert.equal(writes.length, 2);
  writes.forEach((at, i) => {
    const next = writes[i + 1] ?? c.length;
    const diag = c.indexOf("GET DIAGNOSTICS v_n = ROW_COUNT;", at);
    assert.ok(diag > at && diag < next, `write ${i + 1} is not followed by its ROW_COUNT before the next write`);
  });
  assert.match(c, /IF v_n <> cardinality\(v_ids\) THEN\s+RAISE EXCEPTION 'STOP: W1/, "the UPDATE's row count is not asserted against the WRITE set");
  assert.match(c, /IF v_n <> 1 OR \(SELECT count\(\*\) FROM public\.audit_log al WHERE al\.action = c_action\) <> 1 THEN/, "the audit insert is not asserted exactly once");
});

test("stage 2 is ONE DO block inside ONE transaction, and the locks come first, under a lock_timeout", () => {
  assert.equal((S2.match(/\bDO \$/g) ?? []).length, 1, "stage 2 is not exactly one DO block");
  assert.equal((S2.match(/^END \$dur01\$;$/gm) ?? []).length, 1);
  const c = code(S2);
  const begin = c.indexOf("BEGIN ISOLATION LEVEL READ COMMITTED;");
  const doAt = c.indexOf("DO $dur01$");
  const commit = c.indexOf("\nCOMMIT;\n");
  assert.ok(begin >= 0 && begin < doAt && doAt < commit, "the DO block is not between BEGIN and COMMIT");
  const body = c.slice(c.indexOf("\nBEGIN\n", doAt), commit);
  const timeout = body.indexOf("PERFORM set_config('lock_timeout', '5s', true);");
  const lock1 = body.indexOf("LOCK TABLE public.appointments IN SHARE ROW EXCLUSIVE MODE;");
  const lock2 = body.indexOf("LOCK TABLE public.time_off, public.availability_templates, public.staff_notifications IN SHARE MODE;");
  const firstRead = body.search(/\bSELECT\b/);
  assert.ok(timeout > 0 && timeout < lock1 && lock1 < lock2, "lock_timeout is not set before the locks");
  assert.ok(lock2 < firstRead, "a read comes before the locks");
});

test("the tables the lock covers are the tables the verdicts read that the app writes during the day", () => {
  const rule = copies(S1, "RULE")[0];
  for (const t of ["appointments", "time_off", "availability_templates", "staff_notifications"]) {
    assert.match(code(rule), new RegExp(`public\\.${t}\\b`), `the rule no longer reads ${t}; re-read the lock list`);
  }
});

test("the re-run refusal reads the audit action before anything else, and R04 reads it again", () => {
  const p0 = S2.indexOf("SELECT count(*)::int INTO v_n FROM public.audit_log al WHERE al.action = c_action;");
  assert.ok(p0 > 0 && p0 < S2.indexOf("-- >>> DUR-01 BASE BEGIN"), "P0 does not come before the sets");
  assert.ok(S2.includes(`c_action   constant text := '${ACTION}';`));
  assert.ok(BASE.includes(`al.action = '${ACTION}'`), "R04 does not read the audit action");
  assert.ok(S3.includes(`a.action = '${ACTION}'`), "stage 3 does not read the audit action");
});

/* ---- the source row ------------------------------------------------------ */

test("the importer's raw source row is read at exactly two keys, inicio and fim, inside the ledger CTE, into integers", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    const refs = [...code(sql).matchAll(/\braw\b/g)];
    const keyed = [...code(sql).matchAll(/\bm\.raw ->> '(inicio|fim)'/g)];
    assert.equal(refs.length, keyed.length, `${label} reads raw other than at inicio or fim`);
    assert.doesNotMatch(code(sql), /raw\s*->>?\s*'(?!inicio'|fim')/, `${label} reads another key of raw`);
    assert.doesNotMatch(code(sql), /raw\s*(#>|\?|@>|::)/, `${label} reads raw as a whole`);
  }
  assert.equal(copies(S3, "BASE").length, 0);
  const ledger = BASE.slice(BASE.indexOf("\nledger AS ("), BASE.indexOf("\npop AS ("));
  const outside = code(BASE).replace(code(ledger), "");
  assert.doesNotMatch(outside, /\braw\b/, "raw is read outside the ledger CTE");
  assert.match(ledger, /count\(\*\)::int AS ledger_rows,/);
  assert.match(ledger, /END\)::int AS src_seconds\n/, "the ledger does not reduce the source row to one integer");
  const s1tail = S1.slice(S1.indexOf("-- <<< DUR-01 BASE END"));
  assert.doesNotMatch(code(s1tail), /\braw\b|src_seconds/, "stage 1 prints something derived from raw beyond the verdict");
});

test("the source row is parsed only in the importer's own form, and nothing can throw on a malformed one", () => {
  const importer = read("packages/db/src/migration/sources/fisiozero.ts");
  assert.ok(importer.includes("/^(\\d{4})-(\\d{2})-(\\d{2})[ T](\\d{2}):(\\d{2})(?::(\\d{2}))?$/"), "the importer's naive form moved; re-read the ledger's parse");
  const ledger = BASE.slice(BASE.indexOf("\nledger AS ("), BASE.indexOf("\npop AS ("));
  assert.equal((ledger.match(/~ '\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\[ T\]\[0-9\]\{2\}:\[0-9\]\{2\}\(:\[0-9\]\{2\}\)\?\$'/g) ?? []).length, 2);
  assert.match(ledger, /AND left\(btrim\(m\.raw ->> 'inicio'\), 10\) = left\(btrim\(m\.raw ->> 'fim'\), 10\)/, "the parse does not require one date");
  assert.doesNotMatch(ledger, /::(timestamp|timestamptz|date|time)\b/, "the ledger casts a source value to a time type, which can throw");
});

/* ---- the rule is the app's rule ------------------------------------------ */

test("no stage calls a jwt-scoped function: the rule and the pedido test are INLINE", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    assert.doesNotMatch(code(sql), /\bappointment_conflicts\s*\(/, `${label} calls appointment_conflicts`);
    assert.doesNotMatch(code(sql), /\bis_unconfirmed_pedido\s*\(/, `${label} calls is_unconfirmed_pedido`);
    assert.doesNotMatch(code(sql), /\bjwt_tenant_id\s*\(/, `${label} reads jwt_tenant_id`);
    assert.doesNotMatch(code(sql), /\bauth\.(jwt|uid)\s*\(/, `${label} reads the JWT`);
  }
  const rule = copies(S1, "RULE")[0];
  assert.match(rule, /WHERE o\.status NOT IN \('cancelled', 'no_show'\)\n\s+AND NOT \(o\.status = 'scheduled'\n\s+AND \(o\.origin = 'patient_portal'\n\s+OR EXISTS \(SELECT 1 FROM public\.staff_notifications sn\n\s+WHERE sn\.appointment_id = o\.id AND sn\.kind = 'appointment_request'\)\)\)/, "the inline live filter is not 0052 plus 0067's pedido");
});

/** The migration files in journal order. */
function migrations() {
  const journal = JSON.parse(read("packages/db/migrations/meta/_journal.json"));
  return journal.entries.map((e) => ({ tag: e.tag, sql: read(`packages/db/migrations/${e.tag}.sql`) }));
}

test("the inline rule mirrors the LAST definitions of is_unconfirmed_pedido and appointment_conflicts", () => {
  const defs = (name) => migrations().filter((m) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`).test(m.sql)).map((m) => m.tag);
  const pedido = defs("is_unconfirmed_pedido");
  assert.equal(pedido.at(-1), "0067_followup_packs_and_provenance", `is_unconfirmed_pedido was redefined after 0067 (${pedido.at(-1)}); re-read it before trusting the inline rule`);
  const last = migrations().find((m) => m.tag === pedido.at(-1)).sql;
  const body = last.slice(last.indexOf("CREATE OR REPLACE FUNCTION public.is_unconfirmed_pedido("), last.indexOf("$$;", last.indexOf("CREATE OR REPLACE FUNCTION public.is_unconfirmed_pedido(")));
  assert.match(body, /a\.status = 'scheduled'/);
  assert.match(body, /a\.origin = 'patient_portal'/);
  assert.match(body, /n\.kind = 'appointment_request'/);
  const conflicts = defs("appointment_conflicts");
  assert.equal(conflicts.at(-1), "0059_pedido_does_not_block_slot", `appointment_conflicts was redefined after 0059 (${conflicts.at(-1)}); re-read it`);
  const c59 = migrations().find((m) => m.tag === conflicts.at(-1)).sql;
  const fn = c59.slice(c59.indexOf("CREATE OR REPLACE FUNCTION public.appointment_conflicts("));
  assert.match(fn, /a\.starts_at < p_ends\s+AND a\.ends_at > p_starts\s+AND a\.practitioner_id = p_practitioner/, "the therapist arm moved");
  assert.match(fn, /AND btrim\(p_room\) <> ''[\s\S]*AND a\.location_id = p_location\s+AND lower\(a\.room\) = lower\(btrim\(p_room\)\)/, "the room arm moved");
});

test("the app's checks the rule mirrors are still where and what they were", () => {
  const conflict = read("apps/web/lib/scheduling/conflict.ts");
  assert.match(conflict, /const occupants = await sharedResourcesAmong\(tx, \[args\.practitionerId, args\.practitionerTwoId\]\);/);
  assert.match(conflict, /if \(resourceId !== args\.practitionerId\) \{[\s\S]*?room: null \}\);\s+add\(asTerapeuta\.filter\(\(c\) => c\.kind === "therapist"\)\);/);
  assert.match(conflict, /eq\(appointments\.practitionerTwoId, args\.resourceId\),\s+notInArray\(appointments\.status, \["cancelled", "no_show"\]\),\s+sql`not public\.is_unconfirmed_pedido\(\$\{appointments\.id\}\)`/);
  assert.match(conflict, /eq\(timeOff\.userId, args\.practitionerId\),\s+lt\(timeOff\.startsAt, args\.endsAt\),\s+gt\(timeOff\.endsAt, args\.startsAt\),/);
  assert.match(read("apps/web/lib/scheduling/conflict-core.ts"), /new Set<ConflictInfo\["kind"\]>\(\["availability"\]\)/);
  assert.match(read("apps/web/lib/scheduling/shared-resources.ts"), /where u\.is_shared_resource\s+and u\.is_active/);
  const hours = read("apps/web/lib/scheduling/clinic-hours.ts");
  assert.match(hours, /export const BOOKING_LEAD_MIN = 60;/, "the last-start lead moved; the rule hard-codes 60");
  assert.match(hours, /if \(startMinOfDay < toMinutes\(hours\.opensAt\)\) return "before_open";\s+if \(startMinOfDay > latestStartMin\(hours\)\) return "after_latest_start";/);
  assert.match(hours, /return c\.start < endsAt && startsAt < c\.end;/);
  assert.match(hours, /if \(!from \|\| !to\) return null;/);
  const av = read("apps/web/lib/scheduling/availability.ts");
  assert.match(av, /const configured = templates\.some\(\(t\) => t\.isActive\);/);
  assert.match(av, /if \(s <= curEnd\) \{\s+curEnd = Math\.max\(curEnd, e\);/);
  assert.match(av, /if \(validFrom && dateStr < validFrom\) return false;\s+if \(validUntil && dateStr > validUntil\) return false;/);
  const actions = read("apps/web/lib/scheduling/actions.ts");
  const resched = actions.slice(actions.indexOf("export async function rescheduleAppointment("));
  for (const call of ["checkAvailability(tx,", "checkClinicClosure(tx,", "checkClinicWindow(tx,", "findConflictsForWindow(tx,", "blockingConflicts(c)"]) {
    assert.ok(resched.includes(call), `rescheduleAppointment no longer calls ${call}; re-read what reception's own change would refuse`);
  }
  // SCHED-17: asked on the Terapeuta and the row's clinic before any other check, and its
  // resource condition refuses every role before the owner's exemption is read.
  const sched17 = resched.indexOf("const shared = await sharedResourceBookingCheck(actor, input.practitionerId, input.locationId);");
  assert.ok(sched17 > 0 && sched17 < resched.indexOf("runScoped"), "rescheduleAppointment no longer asks SCHED-17 first");
  assert.match(actions, /const resource = resources\.find\(\(r\) => r\.id === practitionerId\) \?\? null;/, "SCHED-17 no longer reads the Terapeuta only");
  assert.match(read("apps/web/lib/scheduling/shared-resource-guard.ts"), /if \(!args\.resource\) return true;\s+if \(!args\.resource\.locationIds\.includes\(args\.targetLocationId\)\) return false;\s+if \(args\.role === "owner"\) return true;/, "the resource condition no longer refuses the owner too");
  assert.match(read("apps/web/lib/scheduling/shared-resources.ts"), /left join public\.staff_locations sl\s+on sl\.user_id = u\.id and sl\.tenant_id = u\.tenant_id/, "a resource's clinics are no longer its staff_locations in its tenant");
  assert.match(read("apps/web/app/agenda/appointment-drawer.tsx"), /durationMin: svc \? svc\.durationMin : f\.durationMin/, "the drawer no longer takes the service's duration");
});

test("the rule's arms: therapist, room, resource as Terapeuta and as Terapeuta 2, block, patient, closure, window, hours", () => {
  const rule = copies(S1, "RULE")[0];
  assert.match(rule, /JOIN shared r ON r\.tenant_id = c\.tenant_id AND r\.id IN \(c\.practitioner_id, c\.practitioner_2_id\)/, "the resources are not read from both slots");
  assert.match(rule, /WHERE u\.is_shared_resource IS TRUE AND u\.is_active IS TRUE/);
  const hb = rule.slice(rule.indexOf("\nhit_booking AS ("), rule.indexOf("\nhit_block AS ("));
  assert.match(hb, /o\.id <> c\.id\s+AND o\.starts_at < c\.e AND o\.ends_at > c\.s/, "the booking arm is not half-open, or does not exclude the candidate");
  for (const arm of [
    "o.practitioner_id = c.practitioner_id",
    "o.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)",
    "o.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)",
    "lower(o.room) = lower(btrim(c.room))",
  ]) assert.ok(hb.includes(arm), `the booking arm lost: ${arm}`);
  assert.match(rule, /t\.tenant_id = c\.tenant_id AND t\.user_id = c\.practitioner_id\s+AND t\.starts_at < c\.e AND t\.ends_at > c\.s/, "the block arm moved");
  assert.match(rule, /extract\(minute FROM l\.closes_at\)::int - 60\)\) IS TRUE/, "the start window is not closes_at minus 60");
  assert.match(rule, /date_trunc\('minute', l\.midday_closed_from::interval\)/);
  assert.match(rule, /OR w\.ws > w\.prev_max THEN 1 ELSE 0 END/, "the hours merge is not isRangeCovered's adjacent-inclusive merge");
  assert.match(rule, /r\.rs <= g\.s_min AND r\.re >= g\.e_min/);
  // SCHED-17: the Terapeuta only, an active shared resource, not installed at the row's clinic in its tenant.
  const away = rule.slice(rule.indexOf("\nres_away AS ("), rule.indexOf("\nclinic AS ("));
  assert.match(away, /JOIN shared r ON r\.id = c\.practitioner_id AND r\.tenant_id = c\.tenant_id/, "SCHED-17 does not read the Terapeuta as an active shared resource");
  assert.match(away, /WHERE NOT EXISTS \(SELECT 1 FROM public\.staff_locations sl\s+WHERE sl\.user_id = c\.practitioner_id AND sl\.tenant_id = c\.tenant_id\s+AND sl\.location_id = c\.location_id\)/, "SCHED-17 does not read where the resource is installed");
});

test("D5: a live twin's person row holds its NESA over the WHOLE person window, as STAFF-10 v2 will make it, in either order", () => {
  const rule = copies(S1, "RULE")[0];
  const th = rule.slice(rule.indexOf("\ntwin_hold AS ("), rule.indexOf("\nres_away AS ("));
  assert.match(th, /SELECT p\.id AS hold_id, n\.id AS n_id, n\.practitioner_id AS res_id, p\.tenant_id, p\.starts_at, p\.ends_at\n\s+FROM live p/, "the hold is not the live person row's own window on the NESA row's practitioner");
  assert.match(th, /JOIN public\.users up ON up\.id = p\.practitioner_id AND up\.is_shared_resource IS NOT TRUE/);
  assert.match(th, /AND n\.starts_at = p\.starts_at AND n\.id <> p\.id\s+AND n\.service_id IS NOT DISTINCT FROM ap\.service_id\s+AND n\.status NOT IN \('cancelled', 'no_show'\)/, "the twin under the hold is not STAFF-10 v2's live future pair");
  assert.match(th, /JOIN public\.users un ON un\.id = n\.practitioner_id AND un\.is_shared_resource IS TRUE/);
  assert.match(th, /h\.hold_id <> c\.id AND h\.n_id <> c\.id\s+AND h\.starts_at < c\.e AND h\.ends_at > c\.s\n\s+WHERE h\.res_id IN \(SELECT cr\.res_id FROM c_res cr WHERE cr\.cand_id = c\.id\)/, "the hold is not half-open, or not on a NESA the candidate names");
  // Unconditional on STAFF-10 v2's audit row: after it runs no live pair is left, so the same text answers both orders.
  assert.doesNotMatch(code(th), /staff10_v2|audit_log/, "the hold is gated on STAFF-10 v2 having run, so the two orders read two rules");
  assert.match(DOC, /## The order with STAFF-10 v2/);
  assert.ok(DOC.includes("`17 OVERLAPS THE NESA HOUR OF A LIVE TWIN`"), "the doc does not name verdict 17");
  // Section 1d reads STAFF-10 v2's set f (future, both live) and its R17 (the person window covers the NESA window).
  const lt = S1.slice(S1.indexOf("\nlive_twin AS ("), S1.indexOf("\nSELECT jsonb_build_object("));
  assert.match(lt, /\(p\.starts_at <= n\.starts_at AND p\.ends_at >= n\.ends_at\) AS covers,/, "section 1d's covers is not STAFF-10 v2's R17");
  assert.match(lt, /WHERE n\.status NOT IN \('cancelled', 'no_show'\) AND p\.status NOT IN \('cancelled', 'no_show'\)\s+AND n\.starts_at >= \(k\.today::timestamp AT TIME ZONE 'Europe\/Lisbon'\)/, "section 1d does not read the live future pairs");
  assert.ok(block("STAGE 1").includes("Read sections 1d, 2, 3, 3b, 4 and 6 before stage 2."), "stage 1's block does not point at section 1d");
});

test("the twin is list C's predicate, NULL-safe on the service, the partner in any status", () => {
  const tw = BASE.slice(BASE.indexOf("\ntwins AS ("), BASE.indexOf("\npair AS ("));
  assert.match(tw, /AND o\.starts_at = p\.starts_at AND o\.id <> p\.id\s+AND o\.service_id IS NOT DISTINCT FROM p\.service_id/);
  assert.match(tw, /\(up\.is_shared_resource IS TRUE AND uo\.is_shared_resource IS NOT TRUE\)\s+OR \(up\.is_shared_resource IS NOT TRUE AND uo\.is_shared_resource IS TRUE\)/);
  assert.doesNotMatch(tw.slice(tw.indexOf("FROM pop p")), /o\.status\s*(=|<>|IN\b|NOT\b)/i, "the twin predicate filters the partner's status, so a twin STAFF-10 v2 resolved would read as none");
});

test("the population is the ledger, one minute exactly, from now; never origin or created_at", () => {
  const pop = BASE.slice(BASE.indexOf("\npop AS ("), BASE.indexOf("\ncand AS ("));
  assert.match(pop, /JOIN ledger lg ON lg\.appointment_id = a\.id AND lg\.tenant_id = a\.tenant_id/);
  assert.match(pop, /WHERE a\.ends_at - a\.starts_at = interval '1 minute' AND a\.starts_at >= k\.t_now/);
  assert.doesNotMatch(code(pop.slice(pop.indexOf("   WHERE"))), /origin|created_at/, "the population is filtered on origin or created_at");
  const ledger = BASE.slice(BASE.indexOf("\nledger AS ("), BASE.indexOf("\npop AS ("));
  assert.match(ledger, /WHERE m\.source_system = 'fisiozero' AND m\.entity_type = 'appointment'\s+AND m\.status = 'imported' AND m\.imported_entity_id IS NOT NULL/);
});

/* ---- the verdicts --------------------------------------------------------- */

const VERDICTS = [...BASE.matchAll(/THEN '(\d{2} [A-Z ]+)'/g)].map((m) => m[1]);

test("every row gets exactly one verdict: the CASE lists them in order, each once, and the doc names each one", () => {
  assert.deepEqual(VERDICTS.map((v) => v.slice(0, 2)), Array.from({ length: VERDICTS.length }, (_, i) => String(i + 1).padStart(2, "0")));
  assert.equal(new Set(VERDICTS).size, VERDICTS.length);
  assert.match(BASE, /ELSE 'WRITE' END AS verdict/);
  for (const v of [...VERDICTS, "WRITE"]) assert.ok(DOC.includes(`| \`${v}\` |`), `the doc's verdict table does not name ${v}`);
  const who = S1.slice(S1.indexOf("\nvw AS ("), S1.indexOf("\nreasons AS ("));
  assert.match(who, /ELSE 'reception' END AS who/);
});

test("R09 re-reads every flag on the WRITE set NULL-safe, so a verdict order that lets a held row through refuses", () => {
  const f = BASE.slice(BASE.indexOf("\nf AS ("), BASE.indexOf("\nv AS ("));
  const flags = [...f.matchAll(/ AS (is_twin|in_closure|out_of_window|outside_hours|resource_away|hits_[a-z_]+)\b/g)].map((m) => m[1]);
  assert.deepEqual([...flags].sort(), ["hits_block", "hits_booking", "hits_patient", "hits_stub", "hits_twin_hold", "in_closure", "is_twin", "out_of_window", "outside_hours", "resource_away"], `the flags of f moved: ${flags.join(",")}`);
  const r09 = BASE.slice(BASE.indexOf("'R09'"), BASE.indexOf("\n),", BASE.indexOf("'R09'")));
  for (const fl of flags) assert.match(r09, new RegExp(`w\\.${fl} IS NOT FALSE`), `R09 does not re-read ${fl}`);
  for (const [fl, v] of [["is_twin", "08"], ["in_closure", "09"], ["out_of_window", "10"], ["outside_hours", "11"], ["hits_booking", "12"], ["hits_block", "13"], ["hits_stub", "14"], ["hits_patient", "15"], ["resource_away", "16"], ["hits_twin_hold", "17"]]) {
    assert.match(BASE, new RegExp(`WHEN f\\.${fl} THEN '${v} `), `flag ${fl} does not hold its verdict ${v}`);
  }
  assert.match(r09, /w\.ledger_rows IS DISTINCT FROM 1 OR w\.src_seconds IS DISTINCT FROM 60/);
  assert.match(r09, /w\.starts_at < \(SELECT k\.day1 FROM k\)/);
});

test("the refusals are contiguous from R01, stage 2 raises every one, and the doc counts them", () => {
  const codes = [...BASE.matchAll(/'(R\d{2})'(?: AS code)?,/g)].map((m) => m[1]);
  assert.deepEqual(codes, Array.from({ length: codes.length }, (_, i) => `R${String(i + 1).padStart(2, "0")}`));
  assert.match(S2, /WHERE \(e ->> 'n'\)::int > 0 ORDER BY 1\s+LOOP\s+RAISE EXCEPTION 'STOP: % refuses/);
  assert.ok(block("STAGE 1").includes(`[ "\${RN}" = ${codes.length} ]`), "stage 1's block does not count every refusal line");
  for (const c of codes) assert.ok(DOC.includes(`| ${c} |`), `the doc's refusal table does not name ${c}`);
});

/* ---- the handshake ------------------------------------------------------- */

const CARRIES = [...BASE.matchAll(/SELECT (\d+)(?: AS ord)?, '(dur01_[a-z0-9_]+)'/g)].map((m) => m[2]);

test("the carries: four names, none inside another, lifted in plain SQL, passed by the doc in order", () => {
  assert.deepEqual(CARRIES, ["dur01_run_day", "dur01_count", "dur01_digest", "dur01_s10v2_runs"]);
  for (const a of CARRIES) for (const b of CARRIES) if (a !== b) assert.ok(!b.includes(a), `carry ${a} is inside ${b}`);
  const doAt = S2.indexOf("DO $dur01$");
  for (const c of CARRIES) {
    const at = S2.search(new RegExp(`set_config\\('dur01\\.${c}',\\s+:'${c}',\\s+false\\)`));
    assert.ok(at > 0 && at < doAt, `stage 2 does not lift ${c} before the DO block`);
  }
  assert.doesNotMatch(S2.slice(doAt), /:'[a-z0-9_]+'/, "a psql variable is written inside the dollar-quoted body");
  assert.match(S2, new RegExp(`IF v_n <> ${CARRIES.length} THEN`), "stage 2 does not assert the carry count");
  const names = block("STAGE 2").match(/NAMES=\(\n([\s\S]*?)\n\)/)?.[1].split(/\s+/).filter(Boolean);
  assert.deepEqual(names, CARRIES, "the doc's stage 2 block does not pass exactly these carries, in order");
  const s1tail = S1.slice(S1.indexOf("-- <<< DUR-01 BASE END"));
  for (const c of CARRIES) {
    assert.equal(s1tail.split(c).length - 1, 0, `stage 1 prints ${c} outside the carries section, where the block's parse could read it`);
  }
});

test("one digest expression, in the carries, in stage 2 before and after the write, and in stage 3", () => {
  assert.match(BASE, /coalesce\(md5\(string_agg\(wr\.id::text \|\| '@' \|\| extract\(epoch FROM wr\.proposed_end\)::bigint::text,\s+',' ORDER BY wr\.id\)\), 'empty'\)/);
  assert.match(S2, /md5\(string_agg\(a\.id::text \|\| '@'\s+\|\| extract\(epoch FROM a\.starts_at \+ make_interval\(mins => s\.duration_min\)\)::bigint::text,\s+',' ORDER BY a\.id\)\), 'empty'\)/, "P5 does not recompute the digest from the table");
  assert.match(S2, /md5\(string_agg\(a\.id::text \|\| '@' \|\| extract\(epoch FROM a\.ends_at\)::bigint::text, ',' ORDER BY a\.id\)\), 'empty'\)/, "A1 does not read the digest back after the write");
  assert.match(S3, /md5\(string_agg\(wl\.id::text \|\| '@' \|\| extract\(epoch FROM wl\.after_end\)::bigint::text,\s+',' ORDER BY wl\.id\)\), 'empty'\)/);
  assert.ok(S2.indexOf("-- P5.") < S2.indexOf("-- W1.") && S2.indexOf("-- W1.") < S2.indexOf("-- A1."));
});

test("stage 2 refuses on stale or foreign carries: under an hour, same Lisbon day, exact-name parse", () => {
  const b = block("STAGE 2");
  assert.match(b, /find \/tmp\/dur01-stage1\.ok -mmin -60/);
  assert.match(b, /find \/tmp\/dur01-stage1\.out -mmin -60/);
  assert.match(b, /\$\(TZ=Europe\/Lisbon date \+%Y-%m-%d\)/);
  assert.match(S2, /current_setting\('dur01\.dur01_run_day', true\) IS DISTINCT FROM v_today::text/);
  for (const s of ["STAGE 1", "STAGE 2"]) {
    assert.ok(block(s).includes(`carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \\t]+|[ \\t]+$/,"",x)} x==k {v=$2;`), `${s} does not parse the carries by exact name`);
  }
});

test("stage 2 cannot hide its DONE line, and the block marks the write as soon as psql exits 0", () => {
  const c = code(S2);
  const pin = c.indexOf("SET client_min_messages = notice;");
  assert.ok(pin >= 0 && pin < c.indexOf("DO $dur01$"), "stage 2 does not pin client_min_messages before the block");
  assert.match(S2, /RAISE NOTICE 'DUR-01 STAGE 2 DONE/);
  const b = block("STAGE 2");
  const psql = b.indexOf("-f scripts/data/dur-01-2-write.sql");
  const touch = b.indexOf("touch /tmp/dur01-written.ok");
  const done = b.indexOf("grep -q 'DUR-01 STAGE 2 DONE'");
  assert.ok(psql > 0 && psql < touch && touch < done, "the written marker is not touched between psql and the transcript checks");
  for (const line of b.split("\n").slice(b.slice(0, touch).split("\n").length)) {
    if (line.includes("STOP:")) assert.match(line, /COMMITTED and the write stands/, `a STOP after the write does not say the write stands: ${line.slice(0, 90)}`);
  }
});

/* ---- what must not move -------------------------------------------------- */

const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
function appointmentColumnsFromSchema() {
  const src = read("packages/db/src/schema.ts");
  const at = src.indexOf("export const appointments = pgTable(");
  assert.ok(at >= 0, "schema.ts has no appointments table");
  const open = src.indexOf("{", at);
  const close = src.indexOf("\n  },\n", open);
  const body = src.slice(open, close).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...body.matchAll(/^\s+[a-zA-Z0-9]+: [a-zA-Z0-9]+\("([a-z_0-9]+)"/gm)].map((m) => m[1]);
}
function appointmentColumnsFromMigrations() {
  const cols = [];
  const TABLE = String.raw`(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:ONLY\s+)?(?:"?public"?\.)?"?appointments"?`;
  for (const m0 of migrations()) {
    const sql = stripSql(m0.sql);
    for (const m of sql.matchAll(new RegExp(String.raw`CREATE TABLE ${TABLE} \(([\s\S]*?)\n\);`, "gi"))) {
      for (const c of m[1].matchAll(/^\s*"?([a-z_0-9]+)"?\s+/gm)) {
        if (!/^(constraint|primary|unique|check|foreign|exclude)$/i.test(c[1])) cols.push(c[1]);
      }
    }
    for (const stmt of sql.split(";")) {
      if (!new RegExp(String.raw`^\s*ALTER TABLE ${TABLE}\s`, "i").test(stmt)) continue;
      for (const m of stmt.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([a-z_0-9]+)"?/gi)) if (!cols.includes(m[1])) cols.push(m[1]);
      for (const m of stmt.matchAll(/DROP COLUMN\s+(?:IF EXISTS\s+)?"?([a-z_0-9]+)"?/gi)) cols.splice(cols.indexOf(m[1]), 1);
      for (const m of stmt.matchAll(/RENAME COLUMN\s+"?([a-z_0-9]+)"?\s+TO\s+"?([a-z_0-9]+)"?/gi)) cols.splice(cols.indexOf(m[1]), 1, m[2]);
    }
  }
  return cols;
}
/** Every ROW(a....) fingerprint of the frozen columns, in stage 2 and stage 3. */
function frozenLists(sql) {
  return [...code(sql).matchAll(/ROW\((a\.id, a\.tenant_id, a\.patient_id[\s\S]*?)\)::text/g)].map((m) => [...m[1].matchAll(/\ba\.([a-z_0-9]+)/g)].map((x) => x[1]));
}

test("the frozen fingerprint is EVERY appointments column but ends_at and updated_at, from schema.ts and the migrations, one list everywhere", () => {
  const schema = appointmentColumnsFromSchema();
  const migrated = appointmentColumnsFromMigrations();
  assert.ok(schema.length > 0 && new Set(schema).size === schema.length, "schema.ts's appointments columns did not parse");
  assert.deepEqual([...migrated].sort(), [...schema].sort(), "schema.ts and the migrations disagree on the appointments columns");
  const want = schema.filter((c) => c !== "ends_at" && c !== "updated_at").sort();
  const lists = [...frozenLists(S2), ...frozenLists(S3)];
  assert.equal(frozenLists(S2).length, 2, "stage 2 does not take the frozen fingerprint before and after the write");
  assert.equal(frozenLists(S3).length, 1, "stage 3 does not recompute the frozen fingerprint");
  for (const l of lists) {
    assert.deepEqual(l, lists[0], "the frozen fingerprints are not one list");
    assert.deepEqual([...l].sort(), want, "the frozen fingerprint leaves out a column the op does not write, or names one it does");
  }
  // The assertion can fail: a list without the confirmation columns is caught.
  const short = lists[0].filter((c) => c !== "confirmation_channel");
  assert.notDeepEqual([...short].sort(), want);
});

test("verdict 19 reads both totals from the audit row, which stage 2 counts under its lock, and counts nothing live", () => {
  const rows = verdictRows();
  assert.match(rows[18], /^19, /);
  assert.match(S3, /\(SELECT \(al\.m -> 'after' ->> 'appointments'\)::int FROM al\) AS total_after,/);
  assert.match(S3, /\(SELECT \(al\.m -> 'before' ->> 'appointments'\)::int FROM al\) AS total_before,/);
  assert.match(rows[18], /CASE WHEN v\.total_after IS NULL OR v\.total_before IS NULL OR v\.total_after <> v\.total_before\s+THEN 'FAIL' ELSE 'OK' END/);
  assert.doesNotMatch(code(S3), /created_at <=/, "stage 3 counts the live table against the audit time, which a late commit or a hard delete moves");
  const audit = S2.slice(S2.indexOf("INSERT INTO public.audit_log"), S2.indexOf("GET DIAGNOSTICS", S2.indexOf("INSERT INTO public.audit_log")));
  assert.ok(audit.includes("'after', jsonb_build_object('appointments', v_a_total),"), "stage 2 does not record the total it counted after the write");
  const a3 = S2.slice(S2.indexOf("-- A3."), S2.indexOf("INSERT INTO public.audit_log"));
  assert.match(a3, /SELECT count\(\*\)::int INTO v_a_total FROM public\.appointments a WHERE a\.tenant_id = v_tenant;/);
  assert.match(a3, /IF v_a_total <> v_b_total THEN/);
});

test("stage 3 reads back only what stage 2 records", () => {
  const top = [...S3.matchAll(/m -> '([a-z_0-9]+)'/g)].map((m) => m[1]);
  const flat = [...S3.matchAll(/m ->> '([a-z_0-9]+)'/g)].map((m) => m[1]);
  const nested = [...S3.matchAll(/m -> '(before|after|md5|carries)' ->> '([a-z_0-9]+)'/g)].map((m) => m[2]);
  const audit = S2.slice(S2.indexOf("INSERT INTO public.audit_log"), S2.indexOf("GET DIAGNOSTICS", S2.indexOf("INSERT INTO public.audit_log")));
  for (const k of new Set([...top, ...flat])) assert.ok(audit.includes(`'${k}', `), `stage 3 reads ${k}, which stage 2 never writes`);
  for (const k of new Set(nested)) assert.ok(audit.includes(`'${k}', `) || CARRIES.includes(k), `stage 3 reads ${k}, which stage 2 never writes`);
  for (const k of ["id", "service_id", "duration_min", "before_end", "after_end", "before_updated_at"]) {
    assert.ok(S2.includes(`'${k}', `), `stage 2's written list lacks ${k}`);
    assert.ok(S3.includes(`e ->> '${k}'`), `stage 3 does not read ${k} of the written list`);
  }
});

/* ---- the verify ---------------------------------------------------------- */

const verdictRows = () => S3.slice(S3.indexOf("), r AS ("), S3.indexOf("SELECT r.n, r.\"check\"")).split(/\nUNION ALL SELECT /);

test("stage 3 prints a contiguous set of verdicts, each able to FAIL, and the doc counts them", () => {
  const ns = [...S3.matchAll(/^(?:  SELECT|UNION ALL SELECT) (\d+)(?: AS n)?, '/gm)].map((m) => Number(m[1]));
  const verdicts = ns.filter((n) => n !== 99);
  assert.deepEqual(verdicts, Array.from({ length: verdicts.length }, (_, i) => i + 1));
  const rows = verdictRows();
  assert.equal(rows.length, verdicts.length, "the verdict rows did not split one per verdict");
  rows.forEach((r, i) => assert.match(r, /THEN 'FAIL'/, `verdict ${i + 1} cannot FAIL`));
  const b = block("STAGE 3");
  assert.ok(b.includes(`[ "\${NV}" = ${verdicts.length} ]`), "the doc's stage 3 block counts a different number");
  assert.ok(DOC.includes(`${verdicts.length} verdicts and a SUMMARY row`), "the facts table counts a different number");
  const allowed = b.match(/grep -vxE '([0-9|]+)'/)?.[1].split("|").map(Number);
  assert.deepEqual(allowed, [18], "the allowed-VACUOUS list moved");
  rows.forEach((r, i) => {
    const n = i + 1;
    if (n === 1 || n === 19) return;
    assert.match(r, /THEN 'VACUOUS'/, `verdict ${n} has no VACUOUS branch, so an empty set could read OK`);
    assert.ok(r.indexOf("THEN 'FAIL'") < r.indexOf("THEN 'VACUOUS'"), `verdict ${n} must test FAIL before VACUOUS`);
  });
});

test("an instrument that cannot see the written rows FAILs the rule's verdicts, never reads VACUOUS or OK", () => {
  const rows = verdictRows();
  assert.match(rows[10], /^11, /);
  assert.match(rows[10], /CASE WHEN v\.rc_n <> v\.n_w OR v\.live_self <> v\.n_w THEN 'FAIL'/);
  for (const i of [11, 16]) assert.match(rows[i], /OR v\.live_self <> v\.n_w THEN 'FAIL'/, `verdict ${i + 1} does not FAIL on a blind live filter`);
  for (const i of [12, 13, 14, 15, 19]) assert.match(rows[i], /OR v\.rc_n <> v\.n_w THEN 'FAIL'/, `verdict ${i + 1} does not FAIL on a blind re-measure`);
  assert.match(rows[20], /^21, /);
  assert.match(rows[20], /OR v\.live_self <> v\.n_w THEN 'FAIL'/, "verdict 21 does not FAIL on a blind live filter");
  const rc = copies(S3, "RECHECK")[0];
  assert.match(rc, /\(SELECT count\(\*\) FROM cand c WHERE c\.id IN \(SELECT o\.id FROM live o\)\)::int AS live_self/);
  assert.match(S2, /IF \(v_rc ->> 'n'\)::int <> cardinality\(v_ids\) OR \(v_rc ->> 'live_self'\)::int <> cardinality\(v_ids\) THEN/, "stage 2's re-measure does not stop on a blind instrument");
});

test("stage 2's re-measure stops on any hit, before the audit row", () => {
  const a2 = S2.slice(S2.indexOf("-- A2."), S2.indexOf("-- A3."));
  const rc = copies(S2, "RECHECK")[0];
  for (const k of ["booking", "block", "closure", "clinic_hours", "therapist_hours", "patient", "resource_away", "twin_hold"]) {
    assert.ok(a2.includes(`(v_rc ->> '${k}')::int`), `the re-measure does not stop on ${k}`);
    assert.match(rc, new RegExp(`::int AS ${k},?\n`), `the RECHECK does not count ${k}`);
  }
  assert.ok(S2.indexOf("-- A2.") < S2.indexOf("INSERT INTO public.audit_log"));
});

/* ---- the pins and the public bytes --------------------------------------- */

test("the doc pins each file by its sha256, and the sidecar pins the doc", () => {
  const pins = { SHA1: F1, SHA2: F2, SHA3: F3, SHAGUARD: GUARD };
  for (const [name, file] of Object.entries(pins)) {
    const want = sha256(file);
    const set = [...DOC.matchAll(new RegExp(`^${name}=([0-9a-f]{64})$`, "gm"))].map((m) => m[1]);
    assert.ok(set.length > 0, `no block sets ${name}`);
    for (const v of set) assert.equal(v, want, `${name} in the doc is not the sha256 of ${file}`);
    assert.ok(DOC.includes(`\`${file}\`, `) && DOC.includes(want), `the facts table does not pin ${file}`);
  }
  assert.equal(sha256(GUARD), "bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093", "the target guard moved; re-pin it on purpose");
  const side = read("docs/data-op-dur-01.sha256");
  assert.equal(side, `${sha256(DOCF)}  ${DOCF}\n`, "the sidecar does not pin the doc");
  assert.doesNotMatch(DOC, /@@[A-Z0-9]+@@/, "the doc still carries a placeholder");
});

test("every stage block names the held branch and its own files, and no block but the undo names a table", () => {
  for (const s of ["HEAD CHECK", "STAGE 0", "STAGE 1", "STAGE 2", "STAGE 3"]) {
    const b = block(s);
    assert.ok(b.includes("data/DUR-01-import-stub-durations"), `${s} does not derive its head from the held branch`);
    assert.doesNotMatch(b, /origin\/main/, `${s} reads origin/main`);
    assert.doesNotMatch(b, /^\s*#/m, `${s} carries a # line`);
    assert.doesNotMatch(b, /!/, `${s} carries a !`);
    assert.doesNotMatch(b, /\\$/m, `${s} carries a backslash continuation`);
  }
  const undo = DOC.slice(DOC.indexOf("## Undoing it"), DOC.indexOf("## Rehearsed"));
  assert.match(undo, /\nROLLBACK;\n```/, "the documented undo does not end in ROLLBACK");
});

test("no public byte of the op carries a count next to a counted noun, or a dash", () => {
  const noun = /\b\d[\d,.]*\s*(?:future |past |live |twin |nesa |person |one-minute |held |written )?(?:pairs?|rows?|twins?|patients?|appointments?|bookings?|stubs?|thousand)\b/i;
  const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const vt = read("apps/web/lib/scheduling/dur-01-classification.db.test.ts");
  for (const [label, text] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3], ["the doc", DOC], ["this test", self], ["the db test", vt]]) {
    text.split("\n").forEach((line, i) => {
      if (label === "this test" && line.includes("const noun = ")) return;
      assert.doesNotMatch(line, noun, `${label}:${i + 1} reads like a count: ${line.trim().slice(0, 100)}`);
      assert.doesNotMatch(line, /[\u2013\u2014]/, `${label}:${i + 1} carries an en or em dash`);
    });
  }
});

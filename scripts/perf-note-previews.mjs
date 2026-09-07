#!/usr/bin/env node
/**
 * perf-note-previews.mjs — WHAT THE NOTE PREVIEWS COST, at production scale,
 * as the ASSIGNED principal.
 *
 * ==========================================================================
 * THE QUESTION, IN THE DISPATCH'S OWN WORDS
 * ==========================================================================
 * "Both surfaces render lists. If the preview costs a query per row, say so
 * with numbers before shipping."
 *
 * It does not, and this is the file that says so rather than a sentence in a
 * report. Two claims are measured here and they are different claims:
 *
 *   SHAPE  — the preview is ONE statement per render, whatever the row count.
 *            Proved by the code (`readLatestPatientNotes` /
 *            `readLatestAppointmentNotes` take an id ARRAY) and pinned by
 *            `lib/notes/latest-notes.statements.test.ts`, which counts them.
 *   COST   — what that one statement costs beside the list query it joins.
 *            Only a database at scale can answer that, which is this file.
 *
 * ==========================================================================
 * ASSIGNED, NOT UNASSIGNED. PERF-14, AND IT IS THE WHOLE POINT
 * ==========================================================================
 * Every timing this project took before PERF-14 was taken by a principal with
 * NO `staff_locations` row, for whom `viewer_has_location_assignment()` is
 * false and the expensive half of `patients_select` never runs. The same stat
 * strip measured 12.2 ms unassigned and 512.4 ms assigned. So this runs as
 * `e2e-admin@osteojp.test`, whom `perf-seed-admin-stats.mjs` gives two
 * locations, and REFUSES to measure if that principal is not assigned.
 *
 * ==========================================================================
 * PREREQUISITES, IN ORDER
 * ==========================================================================
 *   node scripts/perf-seed-admin-stats.mjs     # 8,413 patients, 40,848 appts
 *   node scripts/perf-note-previews.mjs        # this file: seeds notes, measures
 *
 * The note seeding is idempotent on its own marker and is re-runnable.
 *
 * LOCAL ONLY, ENFORCED. `assertLocalTarget` reads its host allowlist out of the
 * TypeScript source at runtime, so this cannot be pointed at production by
 * editing a constant here. Standing rule 1.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assertLocalTarget } from "./local-target.mjs";

const DB_URL = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
assertLocalTarget(DB_URL, process.env.DATABASE_URL_DIRECT ? "DATABASE_URL_DIRECT" : "DATABASE_URL");

const HERE = dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(join(HERE, "..", "packages", "db", "package.json"));
const { default: postgres } = await import(pathToFileURL(requireFromDb.resolve("postgres")).href);
const sql = postgres(DB_URL, { max: 4, idle_timeout: 20, connect_timeout: 15 });

const TENANT = "00000000-0000-0000-0000-0000000000a1"; // TENANT_A, the e2e tenant
const MARKER = "perf-note-preview"; // body prefix; identifies every note this writes
const RUNS = 10;
/** One patient in three carries a patient-level note; one visit in three a
 *  visit note. A fixture where EVERY row has one would flatter the subquery
 *  (it stops at the first hit) and one where none does would flatter it more
 *  (nothing to read). A third is a guess at a clinic's real density and it is
 *  stated as a guess rather than as a finding. */
const NOTE_EVERY = 3;

const one = async (q) => (await q)[0];

/* ---------------------------------------------------------------- principal */
const admin = await one(sql`
  select u.id from users u join roles r on r.id = u.role_id
   where u.tenant_id = ${TENANT} and u.email = ${"e2e-admin@osteojp.test"} and r.slug = 'admin'`);
if (!admin) {
  console.error("[perf-notes] the measuring principal does not exist. Run: node scripts/perf-seed-admin-stats.mjs");
  process.exit(2);
}
const assigned = await one(sql`
  select count(*)::int as n from staff_locations where tenant_id = ${TENANT} and user_id = ${admin.id}`);
if (assigned.n === 0) {
  // A MEASUREMENT TAKEN AS AN UNASSIGNED ADMIN IS THE CHEAP PRINCIPAL'S, and it
  // is indistinguishable from a real one in the output. Refuse rather than print it.
  console.error("[perf-notes] the admin holds NO location assignment - this would measure the cheap principal (PERF-14). Run scripts/perf-seed-admin-stats.mjs.");
  process.exit(2);
}
const total = await one(sql`select count(*)::int as n from patients where tenant_id = ${TENANT} and deleted_at is null`);
if (total.n < 5000) {
  console.error(`[perf-notes] only ${total.n} patients - this is not production scale. Run scripts/perf-seed-admin-stats.mjs.`);
  process.exit(2);
}
console.log(`[perf-notes] principal e2e-admin@osteojp.test, ${assigned.n} locations, ${total.n} patients`);

/* -------------------------------------------------------------- seed notes */
const already = await one(sql`
  select count(*)::int as n from appointment_notes
   where tenant_id = ${TENANT} and body like ${MARKER + "%"}`);
if (already.n > 0) {
  console.log(`[perf-notes] ${already.n} marker notes already present - skipping the seed`);
} else {
  // PATIENT-LEVEL notes: appointment_id NULL, every Nth patient by a stable
  // ordering so a re-seed picks the same people.
  const pat = await sql`
    insert into appointment_notes (tenant_id, patient_id, appointment_id, author_user_id, body)
    select ${TENANT}::uuid, p.id, null, ${admin.id}::uuid,
           ${MARKER} || ' paciente ' || p.id || ' ligou a remarcar, telefona ele proprio na proxima semana'
      from (select id, row_number() over (order by id) rn from patients
             where tenant_id = ${TENANT}::uuid and deleted_at is null) p
     where mod(p.rn, ${NOTE_EVERY}) = 0
    returning 1`;
  // VISIT notes: appointment_id set, every Nth appointment.
  const apt = await sql`
    insert into appointment_notes (tenant_id, patient_id, appointment_id, author_user_id, body)
    select ${TENANT}::uuid, a.patient_id, a.id, ${admin.id}::uuid,
           ${MARKER} || ' marcacao ' || a.id || ' trazer exames, dor lombar irradiada'
      from (select id, patient_id, row_number() over (order by id) rn from appointments
             where tenant_id = ${TENANT}::uuid) a
     where mod(a.rn, ${NOTE_EVERY}) = 0
    returning 1`;
  console.log(`[perf-notes] seeded ${pat.length} patient notes and ${apt.length} visit notes`);
}

/* ------------------------------------------------------------ the id sets */
// The 50 the Recuperacao page would render: FOLLOWUP_PAGE_SIZE of the recovery
// window, oldest attendance first. Taken from the seed's own bucket rather than
// re-deriving the window here - the point is the note read, not the selection.
const recovery = await sql`
  select p.id from patients p
   where p.tenant_id = ${TENANT} and p.deleted_at is null
     and exists (select 1 from appointments a where a.patient_id = p.id and a.status = 'completed')
     and not exists (select 1 from appointments a where a.patient_id = p.id and a.starts_at > now()
                       and a.status not in ('cancelled','no_show'))
   order by p.id limit 50`;
const recoveryIds = recovery.map((r) => r.id);

/**
 * ONE Marcacoes WINDOW, AND IT IS NOT THE PAGE'S DEFAULT WEEK. Said out loud
 * because the difference decides what the number means.
 *
 * The page opens on the current Mon-Fri. `perf-seed-admin-stats.mjs` builds its
 * buckets at now-2d, now+10d, the 15th of last month and long before that, so
 * the current week holds ZERO seeded marcacoes and a measurement there would be
 * a measurement of nothing. The window below is [now-7d, now+14d), which holds
 * the seed's `recent` (56) and `future` (153) buckets - a fuller three weeks
 * than a real Mon-Fri, so the reading is pessimistic rather than flattering.
 *
 * The 92-day CEILING is measured separately below: it is what a crafted ?from/
 * ?to can reach, and it is the number that decides whether this is safe at the
 * edge rather than in the middle.
 */
const week = await sql`
  select a.id, a.patient_id from appointments a
   where a.tenant_id = ${TENANT}
     and a.starts_at >= now() - interval '7 days'
     and a.starts_at <  now() + interval '14 days'
   order by a.starts_at`;
const weekApptIds = week.map((r) => r.id);
const weekPatientIds = [...new Set(week.map((r) => r.patient_id))];
console.log(`[perf-notes] recuperacao page: ${recoveryIds.length} patients`);
console.log(`[perf-notes] marcacoes week : ${weekApptIds.length} marcacoes, ${weekPatientIds.length} distinct patients`);
if (weekApptIds.length === 0) {
  console.error("[perf-notes] the current week holds no seeded marcacoes - the Marcacoes numbers would be meaningless. Refusing to print them.");
  process.exit(2);
}

/* ------------------------------------------------- measurement, RLS ON */
const CLAIMS = JSON.stringify({ tenant_id: TENANT, user_role: "admin", sub: admin.id });

/**
 * Ten runs of `query` inside ONE transaction that has dropped to
 * `authenticated` and set the admin's claims - the same two statements
 * `withTenantContext` issues. Reports the DB's own execution time, so the
 * driver and the harness are out of the number.
 */
async function measure(label, query) {
  const times = [];
  let plan = null;
  for (let i = 0; i < RUNS; i++) {
    await sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [CLAIMS]);
      const rows = await tx.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
      const top = rows[0]["QUERY PLAN"][0];
      times.push(top["Execution Time"]);
      if (i === RUNS - 1) plan = top;
    });
  }
  const s = [...times].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.ceil((s.length * p) / 100) - 1)];
  return { label, p50: pct(50), p95: pct(95), min: s[0], max: s[s.length - 1], plan };
}

const idList = (ids) => ids.map((i) => `'${i}'::uuid`).join(", ");

/** The note statement `readLatestPatientNotes` emits, verbatim in shape. */
const patientNoteQuery = (ids) => `
  select "patients"."id",
    (select n.content from (
        select an.body as content, an.created_at as at from appointment_notes an
         where an.patient_id = "patients"."id" and an.tenant_id = "patients"."tenant_id"
           and an.appointment_id is null
        union all
        select r.content, r.created_at from patient_note_revisions r
         where r.patient_id = "patients"."id" and r.tenant_id = "patients"."tenant_id"
      ) n order by n.at desc limit 1) as latest_note_body,
    (select count(distinct (n.content, n.at))::int from (
        select an.body as content, an.created_at as at from appointment_notes an
         where an.patient_id = "patients"."id" and an.tenant_id = "patients"."tenant_id"
           and an.appointment_id is null
        union all
        select r.content, r.created_at from patient_note_revisions r
         where r.patient_id = "patients"."id" and r.tenant_id = "patients"."tenant_id"
      ) n) as note_total
  from "patients" where "patients"."id" in (${idList(ids)})`;

/**
 * REJECTED CANDIDATE 1 — the inner join with only the APPOINTMENT ids pinned.
 * Kept and still measured, because it is what the obvious implementation looks
 * like and the reading below is the reason the shipped one has a second
 * predicate. See `readLatestAppointmentNotes`'s own header.
 */
const apptNoteQuery = (ids) => `
  select "appointments"."id",
    (select an.body from appointment_notes an
      where an.appointment_id = "appointments"."id" and an.tenant_id = "appointments"."tenant_id"
      order by an.created_at desc limit 1) as latest_note_body,
    (select count(*)::int from appointment_notes an
      where an.appointment_id = "appointments"."id" and an.tenant_id = "appointments"."tenant_id") as note_total
  from "appointments"
  inner join "patients" on "patients"."id" = "appointments"."patient_id"
  where "appointments"."id" in (${idList(ids)})`;

/**
 * SHIPPED — the inner join plus the patient ids the caller already holds, so
 * `patients_pkey` narrows to the window's patients BEFORE `patients_select` is
 * applied to them. This is the shape `readLatestAppointmentNotes` emits.
 */
const apptNoteQueryPinned = (ids, pids) => `
  select "appointments"."id",
    (select an.body from appointment_notes an
      where an.appointment_id = "appointments"."id" and an.tenant_id = "appointments"."tenant_id"
      order by an.created_at desc limit 1) as latest_note_body,
    (select count(*)::int from appointment_notes an
      where an.appointment_id = "appointments"."id" and an.tenant_id = "appointments"."tenant_id") as note_total
  from "appointments"
  inner join "patients" on "patients"."id" = "appointments"."patient_id"
  where "appointments"."id" in (${idList(ids)}) and "patients"."id" in (${idList(pids)})`;

/**
 * REJECTED CANDIDATE 2 — the same gate written as a semi-join. Measured because
 * "the join operator is the problem" is the first hypothesis anybody forms, and
 * it is wrong: this reads the same as candidate 1.
 */
const apptNoteQueryExists = (ids) => `
  select "appointments"."id",
    (select an.body from appointment_notes an
      where an.appointment_id = "appointments"."id" and an.tenant_id = "appointments"."tenant_id"
      order by an.created_at desc limit 1) as latest_note_body,
    (select count(*)::int from appointment_notes an
      where an.appointment_id = "appointments"."id" and an.tenant_id = "appointments"."tenant_id") as note_total
  from "appointments"
  where "appointments"."id" in (${idList(ids)})
    and exists (select 1 from "patients" p where p.id = "appointments"."patient_id")`;

/** The list query each preview sits beside, so the delta has a denominator. */
const recuperacaoListQuery = `
  select p.id, p.full_name, p.phone, p.email
    from patients p
   where p.tenant_id = '${TENANT}'::uuid and p.deleted_at is null
     and exists (select 1 from appointments a where a.patient_id = p.id and a.status = 'completed')
     and not exists (select 1 from appointments a where a.patient_id = p.id and a.starts_at > now()
                       and a.status not in ('cancelled','no_show'))
   order by p.id limit 50`;

const marcacoesListQuery = `
  select a.id, a.starts_at, a.ends_at, a.status, p.full_name, u.full_name as practitioner
    from appointments a
    left join patients p on p.id = a.patient_id
    join users u on u.id = a.practitioner_id
   where a.tenant_id = '${TENANT}'::uuid
     and a.starts_at >= now() - interval '7 days'
     and a.starts_at <  now() + interval '14 days'
   order by a.starts_at`;

/**
 * THE CEILING. `MAX_WINDOW_DAYS` on the Marcacoes page is 92, so this is the
 * widest read a crafted ?from/?to can produce - the case that decides whether
 * the preview is safe at the edge rather than only in the middle.
 */
const wide = await sql`
  select a.id, a.patient_id from appointments a
   where a.tenant_id = ${TENANT}
     and a.starts_at >= now() - interval '46 days'
     and a.starts_at <  now() + interval '46 days'
   order by a.starts_at`;
const wideApptIds = wide.map((r) => r.id);
const widePatientIds = [...new Set(wide.map((r) => r.patient_id))];
console.log(`[perf-notes] marcacoes 92d  : ${wideApptIds.length} marcacoes, ${widePatientIds.length} distinct patients`);

const results = [];
results.push(await measure("recuperacao  LIST (existing, 50 rows)", recuperacaoListQuery));
results.push(await measure("recuperacao  NOTE PREVIEW (new, 1 stmt / 50 ids)", patientNoteQuery(recoveryIds)));
results.push(await measure("marcacoes    LIST (existing, one week)", marcacoesListQuery));
results.push(await measure("marcacoes    appt note REJECTED join-only", apptNoteQuery(weekApptIds)));
results.push(await measure("marcacoes    appt note REJECTED exists", apptNoteQueryExists(weekApptIds)));
results.push(await measure("marcacoes    appt note SHIPPED (join + pin)", apptNoteQueryPinned(weekApptIds, weekPatientIds)));
results.push(await measure("marcacoes    patient note SHIPPED", patientNoteQuery(weekPatientIds)));
if (wideApptIds.length > weekApptIds.length) {
  results.push(await measure("marcacoes    appt note SHIPPED @92d CEILING", apptNoteQueryPinned(wideApptIds, widePatientIds)));
  results.push(await measure("marcacoes    patient note SHIPPED @92d CEILING", patientNoteQuery(widePatientIds)));
}

console.log("\n=== DB execution time, ms, RLS on, ASSIGNED admin, %d runs ===", RUNS);
for (const r of results) {
  console.log(
    `  ${r.label.padEnd(46)} p50 ${r.p50.toFixed(2).padStart(8)}  p95 ${r.p95.toFixed(2).padStart(8)}  min ${r.min.toFixed(2).padStart(8)}  max ${r.max.toFixed(2).padStart(8)}`,
  );
}

const byLabel = (needle) => results.find((r) => r.label.includes(needle));
const recList = byLabel("recuperacao  LIST");
const recNote = byLabel("recuperacao  NOTE PREVIEW");
const marList = byLabel("marcacoes    LIST");
const marApptNote = byLabel("appt note SHIPPED (join + pin)");
const marPatNote = byLabel("patient note SHIPPED");
const pct = (a, b) => `${((a / b) * 100).toFixed(0)}%`;
console.log("\n=== what the preview ADDS to each render ===");
console.log(
  `  recuperacao  +${recNote.p50.toFixed(2)} ms on ${recList.p50.toFixed(2)} ms  (${pct(recNote.p50, recList.p50)} of the list query)`,
);
const marAdd = marApptNote.p50 + marPatNote.p50;
console.log(
  `  marcacoes    +${marAdd.toFixed(2)} ms on ${marList.p50.toFixed(2)} ms  (${pct(marAdd, marList.p50)} of the list query)`,
);
console.log(
  "\n  STATEMENTS ADDED PER RENDER: recuperacao 1, marcacoes 2. Never per row -\n" +
    "  see lib/notes/latest-notes.statements.test.ts, which counts them.\n" +
    "  A LOCAL NUMBER IS NOT A PRODUCTION NUMBER: this database is in the same\n" +
    "  kernel, so it charges nothing for the round trip that production pays\n" +
    "  across the Supabase pooler. What transfers is the STATEMENT COUNT and the\n" +
    "  plan shape below; the milliseconds do not.",
);

console.log("\n=== plans of the new statements ===");
function nodeTree(node, depth = 0) {
  if (!node) return "";
  const pad = "  ".repeat(depth);
  const idx = node["Index Name"] ? ` [${node["Index Name"]}]` : "";
  const cond = node["Index Cond"] ? ` cond=(${node["Index Cond"]})` : "";
  let out = `${pad}${node["Node Type"]}${idx}${cond}  (rows=${node["Actual Rows"]} loops=${node["Actual Loops"]} time=${node["Actual Total Time"]?.toFixed(2)}ms)\n`;
  for (const c of node["Plans"] ?? []) out += nodeTree(c, depth + 1);
  return out;
}
console.log("--- recuperacao patient-note statement");
console.log(nodeTree(recNote.plan.Plan).split("\n").slice(0, 12).join("\n"));
console.log("--- marcacoes appointment-note statement");
console.log(nodeTree(marApptNote.plan.Plan).split("\n").slice(0, 20).join("\n"));

await sql.end();

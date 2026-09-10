/**
 * clinic-batch-20260910-simulation.mjs
 *
 * THE MEASUREMENT BEHIND TWO CARDS IN THE 2026-09-10 CLINIC BATCH:
 *   INC-notes-cannot-be-deleted-and-block-hard-delete
 *   SCHED-17-nesa-shared-agenda-at-cb
 *
 * It answers, by asking a real database rather than by reading a policy:
 *   - what a CB THERAPIST principal can see, edit and create on the agenda of a
 *     practitioner who is not them (NESA operated as a bookable therapist);
 *   - whether an authenticated principal can DELETE a patient note;
 *   - which of the ten reference classes `hardDeletePatient` counts are non-zero
 *     for a patient, and therefore which of its two refusals it would return.
 *
 * ==========================================================================
 * IT PRINTS FACTS AND ASSERTS NOTHING. IT IS NOT A GATE.
 * ==========================================================================
 * Deliberately not a test. Every line it prints describes behaviour that BOTH
 * cards exist to CHANGE, so a test asserting today's answers would go red the
 * moment the work lands - a change-detector that has to be deleted by the change
 * it is supposed to witness. The measurement is the deliverable; the assertions
 * belong to the migration's own DB-gated suite, which asserts the END state.
 *
 * ==========================================================================
 * LOCAL ONLY, AND IT REFUSES RATHER THAN TRUSTS
 * ==========================================================================
 * Standing rule 1: no terminal points anything at production. This SEEDS AND
 * DELETES a throwaway tenant, so a wrong target would be a production write.
 * The guard below refuses a DATABASE_URL that looks remote before opening a
 * connection - it is a check, not a convention.
 *
 * Run it against a lane stack:
 *   node scripts/lane-stack.mjs up --lane <lane>
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:<db port>/postgres \
 *     node scripts/clinic-batch-20260910-simulation.mjs
 *
 * Every RLS assertion runs inside a transaction that sets `local role
 * authenticated` and `request.jwt.claims`, then ROLLS BACK - the same seam
 * packages/db/tests/rls-harness.ts uses, and the same reason: the owner
 * connection bypasses RLS by ownership, so an assertion made on it would pass
 * for the wrong reason.
 */
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL required"); process.exit(2); }
if (/supabase\.com|dfotoodqvmjhbdcxyaxf/.test(url)) {
  console.error("REFUSED: this script is local-only and the target looks remote.");
  process.exit(2);
}
const sql = postgres(url, { prepare: false, max: 1 });

const claims = (tenantId, role, sub) =>
  JSON.stringify({ tenant_id: tenantId, user_role: role, sub });

class Rollback { constructor(v) { this.value = v; } }
async function asRole(role, c, fn) {
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      if (c !== null) await tx`select set_config('request.jwt.claims', ${c}, true)`;
      throw new Rollback(await fn(tx));
    });
    throw new Error("unreachable");
  } catch (e) { if (e instanceof Rollback) return e.value; throw e; }
}

const tenant = randomUUID();
const locCB = randomUUID();
const locLV = randomUUID();
const roleTherapist = randomUUID();
const roleReception = randomUUID();
const uTher = randomUUID();     // a real CB therapist
const uNesa = randomUUID();     // NESA operated as a bookable "therapist"
const uRecep = randomUUID();    // reception, who books the NESA slot
const patient = randomUUID();
const apptNesaByRecep = randomUUID();  // NESA appt created by reception
const apptNesaByTher = randomUUID();   // NESA appt created by the therapist
const apptOwn = randomUUID();          // the therapist's own appt
const noteId = randomUUID();

async function seed() {
  await sql`insert into tenants (id, name, slug) values (${tenant}, 'Repro', ${'repro-' + tenant.slice(0, 8)})`;
  await sql`insert into locations (id, tenant_id, name) values
    (${locCB}, ${tenant}, 'Castelo Branco'), (${locLV}, ${tenant}, 'Linda-a-Velha')`;
  await sql`insert into roles (id, tenant_id, slug, name) values
    (${roleTherapist}, ${tenant}, 'therapist', 'Terapeuta'),
    (${roleReception}, ${tenant}, 'reception', 'Recepcao')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name, is_bookable) values
    (${uTher},  ${tenant}, ${roleTherapist}, ${'t-' + uTher.slice(0,8) + '@x.pt'}, 'Terapeuta CB', true),
    (${uNesa},  ${tenant}, ${roleTherapist}, ${'nesa-' + uNesa.slice(0,8) + '@x.pt'}, 'NESA', true),
    (${uRecep}, ${tenant}, ${roleReception}, ${'r-' + uRecep.slice(0,8) + '@x.pt'}, 'Recepcao CB', false)`;
  await sql`insert into staff_locations (tenant_id, user_id, location_id) values
    (${tenant}, ${uTher}, ${locCB}), (${tenant}, ${uNesa}, ${locCB}), (${tenant}, ${uRecep}, ${locCB})`;
  await sql`insert into patients (id, tenant_id, full_name, primary_location_id) values
    (${patient}, ${tenant}, 'Paciente Repro', ${locCB})`;
  const t0 = new Date(Date.now() + 86400000);
  const t1 = new Date(t0.getTime() + 1800000);
  await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, created_by) values
    (${apptNesaByRecep}, ${tenant}, ${patient}, ${uNesa}, ${locCB}, ${t0}, ${t1}, ${uRecep}),
    (${apptNesaByTher},  ${tenant}, ${patient}, ${uNesa}, ${locCB}, ${new Date(t0.getTime()+3600000)}, ${new Date(t1.getTime()+3600000)}, ${uTher}),
    (${apptOwn},         ${tenant}, ${patient}, ${uTher}, ${locCB}, ${new Date(t0.getTime()+7200000)}, ${new Date(t1.getTime()+7200000)}, ${uRecep})`;
  await sql`insert into appointment_notes (id, tenant_id, patient_id, appointment_id, author_user_id, body)
    values (${noteId}, ${tenant}, ${patient}, null, ${uTher}, 'nota de teste')`;
}

async function cleanup() {
  await sql`delete from tenants where id = ${tenant}`;
}

function line(label, value) { console.log(`  ${label.padEnd(62)} ${value}`); }

async function main() {
  await seed();

  console.log("\n=== B3 — a CB therapist principal against NESA's agenda ===");
  console.log("principal: role=therapist, sub=<the CB therapist>, tenant scoped\n");

  const therClaims = claims(tenant, "therapist", uTher);

  const visible = await asRole("authenticated", therClaims, async (tx) => {
    const rows = await tx`select id, practitioner_id, created_by from appointments
                          where id in (${apptNesaByRecep}, ${apptNesaByTher}, ${apptOwn})`;
    return rows.map((r) => r.id);
  });
  line("SELECT own appointment (practitioner_id = self)", visible.includes(apptOwn) ? "VISIBLE" : "INVISIBLE");
  line("SELECT NESA appointment the therapist created themselves", visible.includes(apptNesaByTher) ? "VISIBLE" : "INVISIBLE");
  line("SELECT NESA appointment RECEPTION created", visible.includes(apptNesaByRecep) ? "VISIBLE" : "INVISIBLE");

  const upd = await asRole("authenticated", therClaims, async (tx) => {
    const a = await tx`update appointments set room = 'X' where id = ${apptNesaByRecep} returning id`;
    const b = await tx`update appointments set room = 'X' where id = ${apptNesaByTher} returning id`;
    return { recep: a.length, ther: b.length };
  });
  line("UPDATE NESA appointment RECEPTION created (rows affected)", upd.recep);
  line("UPDATE NESA appointment the therapist created (rows affected)", upd.ther);

  const ins = await asRole("authenticated", therClaims, async (tx) => {
    const t2 = new Date(Date.now() + 200000000);
    const rows = await tx`insert into appointments
      (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, created_by)
      values (${tenant}, ${patient}, ${uNesa}, ${locCB}, ${t2}, ${new Date(t2.getTime()+1800000)}, ${uTher})
      returning id`;
    return rows.length;
  });
  line("INSERT a NESA appointment as the therapist (rows created)", ins);

  console.log("\n=== B2 — notes: deletion, and what they do to a hard delete ===\n");

  const del = await asRole("authenticated", claims(tenant, "admin", uRecep), async (tx) => {
    const rows = await tx`delete from appointment_notes where id = ${noteId} returning id`;
    return rows.length;
  });
  line("DELETE appointment_notes as authenticated admin (rows deleted)", del);

  const delTher = await asRole("authenticated", therClaims, async (tx) => {
    const rows = await tx`delete from appointment_notes where id = ${noteId} returning id`;
    return rows.length;
  });
  line("DELETE appointment_notes as authenticated therapist (rows deleted)", delTher);

  const pols = await sql`select polname, polcmd from pg_policy
    where polrelid = to_regclass('public.appointment_notes') order by polname`;
  line("appointment_notes policies", pols.map((p) => `${p.polname}(${p.polcmd})`).join(" "));

  const polsRev = await sql`select polname, polcmd from pg_policy
    where polrelid = to_regclass('public.patient_note_revisions') order by polname`;
  line("patient_note_revisions policies", polsRev.map((p) => `${p.polname}(${p.polcmd})`).join(" "));

  // The nine reference classes hardDeletePatient counts, exactly as it counts them.
  const counts = await asRole("authenticated", claims(tenant, "admin", uRecep), async (tx) => {
    const one = async (q) => Number((await q)[0].n);
    return {
      clinical_records: await one(tx`select count(*)::int n from clinical_records where patient_id = ${patient}`),
      clinical_episodes: await one(tx`select count(*)::int n from clinical_episodes where patient_id = ${patient}`),
      appointments: await one(tx`select count(*)::int n from appointments where patient_id = ${patient} or patient_2_id = ${patient}`),
      appointment_notes: await one(tx`select count(*)::int n from appointment_notes where patient_id = ${patient}`),
      patient_note_revisions: await one(tx`select count(*)::int n from patient_note_revisions where patient_id = ${patient}`),
      invoices: await one(tx`select count(*)::int n from invoices where patient_id = ${patient}`),
      attachments: await one(tx`select count(*)::int n from attachments where patient_id = ${patient}`),
      patient_form_submissions: await one(tx`select count(*)::int n from patient_form_submissions where patient_id = ${patient}`),
      analytics_events: await one(tx`select count(*)::int n from analytics_events where patient_id = ${patient}`),
      merge_losers: await one(tx`select count(*)::int n from patients where merged_into_id = ${patient}`),
    };
  });
  console.log("\n  hardDeletePatient's reference counts for this patient:");
  for (const [k, v] of Object.entries(counts)) line("    " + k, v);
  const refs = Object.entries(counts).filter(([k]) => k !== "clinical_records").reduce((s, [, v]) => s + v, 0);
  line("  sum of the has_references classes", refs);
  line("  hardDeletePatient would return", counts.clinical_records > 0 ? "has_clinical_records" : refs > 0 ? "has_references" : "ok");

  console.log("\n  Same patient with the appointments removed, notes left in place:");
  await sql`delete from appointments where patient_id = ${patient}`;
  const counts2 = await asRole("authenticated", claims(tenant, "admin", uRecep), async (tx) => {
    const one = async (q) => Number((await q)[0].n);
    return {
      appointments: await one(tx`select count(*)::int n from appointments where patient_id = ${patient}`),
      appointment_notes: await one(tx`select count(*)::int n from appointment_notes where patient_id = ${patient}`),
    };
  });
  line("    appointments", counts2.appointments);
  line("    appointment_notes", counts2.appointment_notes);
  line("  hardDeletePatient would return", counts2.appointment_notes > 0 ? "has_references" : "ok");
}

main()
  .then(cleanup)
  .then(() => sql.end())
  .catch(async (e) => { console.error("\nFAILED:", e.message); await cleanup().catch(() => {}); await sql.end(); process.exit(1); });

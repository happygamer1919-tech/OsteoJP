#!/usr/bin/env node
/**
 * STAFF-10 - THE JP SPLIT, PHASE 2. OWNER-RUN. ONE TRANSACTION.
 *
 * Moves the original JP row's Linda-a-Velha rows to the LV row, per the standing
 * ruling (dispatch J1, 2026-09-11):
 *
 *   everything therapist-scoped AND located at Linda-a-Velha moves from the
 *   original JP to the LV row; Castelo Branco stays put; clinical note authorship
 *   is never rewritten; profile fields copy to the new row. A row with NO location
 *   attribution stays on the original row unless its linked appointment or
 *   patient clearly implies LV.
 *
 * WHAT MOVES (JP(cb) -> JP(lv)), EACH ONE COUNTED BEFORE AND AFTER:
 *   appointments.practitioner_id      every JP(cb) appointment at LV, past and future
 *   appointments.practitioner_2_id    the same for the second-therapist slot
 *   availability_templates.user_id    every JP(cb) schedule row at LV, recurring and day-defined
 *   time_off.user_id                  ONLY the PINNED blocks whose evidence is LV-only
 *   clinical_episodes.primary_practitioner_id   ONLY the PINNED episodes of LV-only patients
 *   analytics_events.therapist_user_id          every JP(cb) event located at LV
 *
 * WHAT COPIES (profile, onto JP(lv)): phone, job_title, is_bookable; the agenda
 * colour of JP(cb)'s CB membership onto JP(lv)'s LV membership; JP(cb)'s
 * therapist_services rows. NOT full_name, email, role or is_active: the owner set
 * those on the LV row himself, and email is a login identity.
 *
 * WHAT NEVER MOVES: clinical_records (authorship, and locked rows are immutable by
 * trigger), appointment_notes / patient_note_revisions authorship, audit_log,
 * patients.created_by, staff_notifications (an inbox; the LV row has no login),
 * every CB row, and every JP(cb) row with no LV evidence. Each is ASSERTED unchanged.
 *
 * PINNED, AND RE-DERIVED: the time-off and episode sets are pinned by id AND
 * recomputed from the data at run time. If the two differ, the data changed since
 * strategy verified this file, and the run halts before writing anything.
 *
 * MODES
 *   (no flag)                        PREVIEW: the whole transaction runs, every
 *                                    check runs, then it ROLLS BACK. Prints the
 *                                    EXPECT line the confirm needs.
 *   --confirm --expect <N>           APPLY. N is the appointment count the preview
 *                                    printed; any other count refuses.
 *   --rollback                       PREVIEW of the reversal, from the ids this
 *                                    script recorded in its own audit row.
 *   --rollback --confirm --expect <N>  APPLY the reversal.
 *
 * EXIT CODES: 0 OK, 1 FAILED (a check or a precondition; nothing was committed),
 * 2 BAD_INVOCATION. It prints host, port and ref, never a connection string.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const PROD_REF = "dfotoodqvmjhbdcxyaxf";
const TENANT = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";
const JP_CB = "54d486e0-a9c3-4c82-acac-8b909ce5a2d0"; // "JP(cb)", the original row
const JP_LV = "0c1a0000-0000-4000-8000-000000000001"; // "JP(lv)", the LV row
const CB = "de000002-0000-0000-0000-000000000002";
const LV = "de000002-0000-0000-0000-000000000001";
const ACTOR = "48a34faa-2692-40fd-b58d-8ba0c1624e9b"; // the owner, who runs this
const ACTION = "staff.jp_split.reassign";
const ACTION_ROLLBACK = "staff.jp_split.rollback";

/** Time-off blocks whose only evidence is LV (JP scheduled at LV that day, or JP's LV appointments inside it). */
const TIME_OFF_MOVE = [
  "d48f0989-d8dd-47b1-b7ce-aff7e74c5f9d", // 2026-08-26, 11 LV appointments inside, no CB
  "21068765-7268-4811-b956-ccddee07ed28", // 2026-09-07, scheduled at LV, no CB
  "a3f73ff0-64d6-487e-af8c-79f8a3a012fc", // 2026-09-09, scheduled at LV + 6 LV appointments, no CB
];
/** Episodes whose patient's primary clinic is LV and who has no CB appointment at all. */
const EPISODE_MOVE = [
  "184b27a7-93e0-4e9c-86ce-576d099f9e6d",
  "1b1c261e-fab6-4bf2-ac40-00180b73e802",
  "1cd9f75a-18d6-4dec-be5a-b4c4c10557f2",
  "3e1db38a-d4db-48ea-95b2-37ced91a6a7e",
  "479f0584-4032-4181-bea9-fabd4033b274",
  "8d75e490-980e-443f-8eac-970108b8baf9",
  "e33d2440-0794-407b-9d35-df6544d1fa50",
  "eb432147-2f2f-4d5a-8210-e8b8be5e9986",
];

class Halt extends Error {}
class PreviewDone extends Error {}

function bad(msg) {
  console.error(`BAD INVOCATION: ${msg}`);
  console.error("usage: node staff-10-jp-split-lv.mjs [--rollback] [--confirm --expect <N>]");
  process.exit(2);
}

function parseArgs(argv) {
  const a = { confirm: false, rollback: false, expect: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--confirm") a.confirm = true;
    else if (argv[i] === "--rollback") a.rollback = true;
    else if (argv[i] === "--expect") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0) bad("--expect needs a non-negative integer");
      a.expect = n;
    } else bad(`unknown argument ${argv[i]}`);
  }
  if (a.confirm && a.expect === undefined) bad("--confirm needs --expect <N>, the count the preview printed");
  if (!a.confirm && a.expect !== undefined) bad("--expect only means something with --confirm");
  return a;
}

/** PRODUCTION only on the pinned ref and the session pooler; otherwise LOCAL only. */
function target(raw) {
  let u;
  try { u = new URL(raw); } catch { bad("DATABASE_URL_DIRECT does not parse"); }
  const ref = u.username.split(".")[1] ?? "";
  if (u.hostname.endsWith(".pooler.supabase.com")) {
    if (ref !== PROD_REF || u.port !== "5432") bad(`refusing ${u.hostname}:${u.port} ref ${ref || "-"}: not ${PROD_REF} on 5432`);
    return { kind: "PRODUCTION", line: `host ${u.hostname} / port ${u.port} / ref ${ref}` };
  }
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
    return { kind: "LOCAL REHEARSAL", line: `host ${u.hostname} / port ${u.port} / ref local` };
  }
  bad(`refusing ${u.hostname}: neither the production pooler nor localhost`);
}

const SELF = fileURLToPath(import.meta.url);
const SELF_SHA = crypto.createHash("sha256").update(fs.readFileSync(SELF)).digest("hex");

/** Everything the checks compare, in one statement, so PRE and POST are the same question. */
async function counts(tx) {
  const [c] = await tx`
    select
      (select count(*) from appointments where tenant_id = ${TENANT} and practitioner_id = ${JP_CB} and location_id = ${LV})::int  appt_cb_at_lv,
      (select count(*) from appointments where tenant_id = ${TENANT} and practitioner_id = ${JP_CB} and location_id = ${LV} and starts_at >= now())::int appt_cb_at_lv_future,
      (select count(*) from appointments where tenant_id = ${TENANT} and practitioner_id = ${JP_CB} and location_id = ${CB})::int  appt_cb_at_cb,
      (select count(*) from appointments where tenant_id = ${TENANT} and practitioner_id = ${JP_LV} and location_id = ${LV})::int  appt_lv_at_lv,
      (select count(*) from appointments where tenant_id = ${TENANT} and practitioner_id = ${JP_LV} and location_id = ${CB})::int  appt_lv_at_cb,
      (select count(*) from appointments where tenant_id = ${TENANT})::int                                                            appt_total,
      (select count(*) from appointments where tenant_id = ${TENANT} and practitioner_2_id = ${JP_CB} and location_id = ${LV})::int appt2_cb_at_lv,
      (select count(*) from appointments where tenant_id = ${TENANT} and practitioner_2_id = ${JP_LV} and location_id = ${LV})::int appt2_lv_at_lv,
      (select count(*) from availability_templates where tenant_id = ${TENANT} and user_id = ${JP_CB} and location_id = ${LV})::int avail_cb_at_lv,
      (select count(*) from availability_templates where tenant_id = ${TENANT} and user_id = ${JP_CB} and location_id = ${CB})::int avail_cb_at_cb,
      (select count(*) from availability_templates where tenant_id = ${TENANT} and user_id = ${JP_LV} and location_id = ${LV})::int avail_lv_at_lv,
      (select count(*) from availability_templates where tenant_id = ${TENANT} and user_id = ${JP_LV} and location_id = ${CB})::int avail_lv_at_cb,
      (select count(*) from availability_templates where tenant_id = ${TENANT})::int                                                avail_total,
      (select count(*) from time_off where tenant_id = ${TENANT} and user_id = ${JP_CB})::int timeoff_cb,
      (select count(*) from time_off where tenant_id = ${TENANT} and user_id = ${JP_LV})::int timeoff_lv,
      (select count(*) from time_off where tenant_id = ${TENANT})::int                         timeoff_total,
      (select count(*) from clinical_episodes where tenant_id = ${TENANT} and primary_practitioner_id = ${JP_CB})::int episodes_cb,
      (select count(*) from clinical_episodes where tenant_id = ${TENANT} and primary_practitioner_id = ${JP_LV})::int episodes_lv,
      (select count(*) from clinical_episodes where tenant_id = ${TENANT})::int                                       episodes_total,
      (select count(*) from analytics_events where tenant_id = ${TENANT} and therapist_user_id = ${JP_CB} and location_id = ${LV})::int analytics_cb_at_lv,
      (select count(*) from analytics_events where tenant_id = ${TENANT} and therapist_user_id = ${JP_CB})::int analytics_cb,
      (select count(*) from analytics_events where tenant_id = ${TENANT} and therapist_user_id = ${JP_LV})::int analytics_lv,
      (select count(*) from analytics_events where tenant_id = ${TENANT})::int                                  analytics_total,
      (select count(*) from clinical_records where tenant_id = ${TENANT} and practitioner_id = ${JP_CB})::int records_cb,
      (select count(*) from clinical_records where tenant_id = ${TENANT} and practitioner_id = ${JP_LV})::int records_lv,
      (select count(*) from clinical_records where tenant_id = ${TENANT} and signed_by = ${JP_CB})::int       records_signed_cb,
      (select count(*) from appointment_notes where tenant_id = ${TENANT} and author_user_id = ${JP_CB})::int notes_author_cb,
      (select count(*) from appointment_notes where tenant_id = ${TENANT} and last_edited_by = ${JP_CB})::int notes_editor_cb,
      (select count(*) from patient_note_revisions where tenant_id = ${TENANT} and author_user_id = ${JP_CB})::int revisions_author_cb,
      (select count(*) from staff_notifications where tenant_id = ${TENANT} and recipient_user_id = ${JP_CB})::int notifications_cb,
      (select count(*) from staff_notifications where tenant_id = ${TENANT} and recipient_user_id = ${JP_LV})::int notifications_lv,
      (select count(*) from patients where tenant_id = ${TENANT} and created_by = ${JP_CB})::int patients_created_cb,
      (select count(*) from therapist_services where tenant_id = ${TENANT} and therapist_user_id = ${JP_CB})::int services_cb,
      (select count(*) from therapist_services where tenant_id = ${TENANT} and therapist_user_id = ${JP_LV})::int services_lv,
      (select count(*) from audit_log where tenant_id = ${TENANT})::int audit_total`;
  return c;
}

/** The time-off blocks whose evidence is LV-only, derived from the data. Must equal TIME_OFF_MOVE. */
async function deriveTimeOff(tx) {
  const rows = await tx`
    with blk as (
      select t.id, t.starts_at, t.ends_at,
             (t.starts_at at time zone 'Europe/Lisbon')::date d0,
             ((t.ends_at - interval '1 second') at time zone 'Europe/Lisbon')::date d1
        from time_off t where t.tenant_id = ${TENANT} and t.user_id = ${JP_CB}),
    days as (select b.id, gs::date d from blk b, generate_series(b.d0, greatest(b.d0, b.d1), interval '1 day') gs),
    sched as (
      select d.id, a.location_id
        from days d join availability_templates a
          on a.tenant_id = ${TENANT} and a.user_id = ${JP_CB} and a.is_active
         and a.weekday = extract(dow from d.d)::int
         and (a.valid_from is null or a.valid_from <= d.d) and (a.valid_until is null or a.valid_until >= d.d)),
    ev as (
      select b.id,
             (select count(*) from sched s where s.id = b.id and s.location_id = ${LV})
           + (select count(*) from appointments a where a.tenant_id = ${TENANT} and a.practitioner_id = ${JP_CB}
               and a.location_id = ${LV} and a.starts_at < b.ends_at and a.ends_at > b.starts_at) lv_ev,
             (select count(*) from sched s where s.id = b.id and s.location_id = ${CB})
           + (select count(*) from appointments a where a.tenant_id = ${TENANT} and a.practitioner_id = ${JP_CB}
               and a.location_id = ${CB} and a.starts_at < b.ends_at and a.ends_at > b.starts_at) cb_ev
        from blk b)
    select id::text from ev where lv_ev > 0 and cb_ev = 0 order by 1`;
  return rows.map((r) => r.id);
}

/** Episodes of LV-primary patients with no CB appointment. Must equal EPISODE_MOVE. */
async function deriveEpisodes(tx) {
  const rows = await tx`
    select e.id::text from clinical_episodes e join patients p on p.id = e.patient_id
     where e.tenant_id = ${TENANT} and e.primary_practitioner_id = ${JP_CB} and p.primary_location_id = ${LV}
       and not exists (select 1 from appointments a where a.tenant_id = ${TENANT} and a.location_id = ${CB}
                        and (a.patient_id = e.patient_id or a.patient_2_id = e.patient_id))
     order by 1`;
  return rows.map((r) => r.id);
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

function checker() {
  const rows = [];
  const check = (name, expected, actual) => {
    const ok = expected === actual;
    rows.push({ name, expected, actual, ok });
    console.log(`CHECK ${name.padEnd(44)} | expected ${String(expected).padStart(6)} | actual ${String(actual).padStart(6)} | ${ok ? "OK" : "FAIL"}`);
  };
  return { rows, check };
}

function printCounts(label, c) {
  console.log(`\n${label}`);
  for (const [k, v] of Object.entries(c)) console.log(`  ${k.padEnd(24)} ${String(v).padStart(7)}`);
}

async function reassign(tx, args) {
  // ---- preconditions: every one refuses BEFORE any write --------------------
  const [done] = await tx`
    select a.id::text from audit_log a
     where a.tenant_id = ${TENANT} and a.action = ${ACTION}
       and not exists (select 1 from audit_log r where r.tenant_id = ${TENANT} and r.action = ${ACTION_ROLLBACK} and r.metadata->>'reverses' = a.id::text)
     limit 1`;
  if (done) throw new Halt(`already applied (audit row ${done.id}) and not rolled back; roll it back first, or stop`);
  const users = await tx`select id::text, tenant_id::text, is_active, is_bookable, phone is null phone_null, job_title is null job_null
                           from users where id = any(${[JP_CB, JP_LV]}) for update`;
  const cb = users.find((u) => u.id === JP_CB), lv = users.find((u) => u.id === JP_LV);
  if (!cb || !lv || cb.tenant_id !== TENANT || lv.tenant_id !== TENANT) throw new Halt("both JP rows must exist in the tenant");
  if (!lv.is_active) throw new Halt("JP(lv) is inactive: its future LV appointments would leave the agenda. Activate it in Equipa first");
  if (!lv.phone_null || !lv.job_null) throw new Halt("JP(lv) already has a phone or job title: the profile copy would overwrite it. Re-verify");
  const [loc] = await tx`select (select count(*) from staff_locations where tenant_id = ${TENANT} and user_id = ${JP_LV} and location_id = ${LV})::int lv_member,
                                (select count(*) from staff_locations where tenant_id = ${TENANT} and user_id = ${JP_LV} and location_id = ${LV} and color is not null)::int lv_colour,
                                (select count(*) from staff_locations where tenant_id = ${TENANT} and user_id = ${JP_CB} and location_id = ${CB})::int cb_member`;
  if (loc.lv_member !== 1 || loc.cb_member !== 1) throw new Halt("JP(lv) must be a member of LV and JP(cb) of CB");
  if (loc.lv_colour !== 0) throw new Halt("JP(lv) already has an LV colour: the copy would overwrite it. Re-verify");
  const [clash] = await tx`
    select count(*)::int n from availability_templates a join availability_templates b
      on b.tenant_id = a.tenant_id and b.user_id = ${JP_LV} and b.location_id = a.location_id and b.weekday = a.weekday
     and b.start_time = a.start_time and b.end_time = a.end_time
     and b.valid_from is not distinct from a.valid_from and b.valid_until is not distinct from a.valid_until
     where a.tenant_id = ${TENANT} and a.user_id = ${JP_CB} and a.location_id = ${LV}`;
  if (clash.n !== 0) throw new Halt(`${clash.n} JP(cb) LV schedule rows already exist identically on JP(lv); the move would break availability_templates_dedupe_uq`);
  const [twin] = await tx`select count(*)::int n from appointments where tenant_id = ${TENANT} and location_id = ${LV}
                            and ((practitioner_id = ${JP_CB} and practitioner_2_id = ${JP_LV}) or (practitioner_id = ${JP_LV} and practitioner_2_id = ${JP_CB}))`;
  if (twin.n !== 0) throw new Halt(`${twin.n} LV appointments carry both JP rows; the move would make one therapist both slots`);
  const tOff = await deriveTimeOff(tx), eps = await deriveEpisodes(tx);
  console.log(`\nDERIVED time_off LV-only: ${tOff.length} | pinned ${TIME_OFF_MOVE.length} | ${sameSet(tOff, TIME_OFF_MOVE) ? "MATCH" : "DIFFER"}`);
  console.log(`DERIVED episodes LV-only: ${eps.length} | pinned ${EPISODE_MOVE.length} | ${sameSet(eps, EPISODE_MOVE) ? "MATCH" : "DIFFER"}`);
  if (!sameSet(tOff, TIME_OFF_MOVE)) throw new Halt(`the LV-only time-off set changed since it was pinned (derived: ${tOff.join(",") || "none"})`);
  if (!sameSet(eps, EPISODE_MOVE)) throw new Halt(`the LV-only episode set changed since it was pinned (derived: ${eps.join(",") || "none"})`);

  const pre = await counts(tx);
  printCounts("PRE", pre);
  console.log(`\nEXPECT appointments=${pre.appt_cb_at_lv}`);
  if (args.confirm && args.expect !== pre.appt_cb_at_lv) {
    throw new Halt(`--expect ${args.expect} but ${pre.appt_cb_at_lv} JP(cb) appointments are at LV now. Re-run the preview`);
  }

  // ---- the moves: each RETURNING, each asserted against its PRE count --------
  const { rows, check } = checker();
  console.log("");
  const ids = {};
  ids.appointments = (await tx`update appointments set practitioner_id = ${JP_LV}
     where tenant_id = ${TENANT} and practitioner_id = ${JP_CB} and location_id = ${LV} returning id::text`).map((r) => r.id);
  check("moved appointments.practitioner_id", pre.appt_cb_at_lv, ids.appointments.length);
  ids.appointments_second = (await tx`update appointments set practitioner_2_id = ${JP_LV}
     where tenant_id = ${TENANT} and practitioner_2_id = ${JP_CB} and location_id = ${LV} returning id::text`).map((r) => r.id);
  check("moved appointments.practitioner_2_id", pre.appt2_cb_at_lv, ids.appointments_second.length);
  ids.availability = (await tx`update availability_templates set user_id = ${JP_LV}
     where tenant_id = ${TENANT} and user_id = ${JP_CB} and location_id = ${LV} returning id::text`).map((r) => r.id);
  check("moved availability_templates.user_id", pre.avail_cb_at_lv, ids.availability.length);
  ids.time_off = (await tx`update time_off set user_id = ${JP_LV}
     where tenant_id = ${TENANT} and user_id = ${JP_CB} and id = any(${TIME_OFF_MOVE}) returning id::text`).map((r) => r.id);
  check("moved time_off.user_id (pinned)", TIME_OFF_MOVE.length, ids.time_off.length);
  ids.episodes = (await tx`update clinical_episodes set primary_practitioner_id = ${JP_LV}
     where tenant_id = ${TENANT} and primary_practitioner_id = ${JP_CB} and id = any(${EPISODE_MOVE}) returning id::text`).map((r) => r.id);
  check("moved clinical_episodes (pinned)", EPISODE_MOVE.length, ids.episodes.length);
  ids.analytics = (await tx`update analytics_events set therapist_user_id = ${JP_LV}
     where tenant_id = ${TENANT} and therapist_user_id = ${JP_CB} and location_id = ${LV} returning id::text`).map((r) => r.id);
  check("moved analytics_events.therapist_user_id", pre.analytics_cb_at_lv, ids.analytics.length);

  // ---- the profile copy --------------------------------------------------------
  const prof = await tx`update users lv set phone = cb.phone, job_title = cb.job_title, is_bookable = cb.is_bookable, updated_at = now()
     from users cb where lv.id = ${JP_LV} and cb.id = ${JP_CB} and lv.tenant_id = ${TENANT} and cb.tenant_id = ${TENANT} returning lv.id`;
  check("copied profile onto JP(lv)", 1, prof.length);
  const col = await tx`update staff_locations set color = (select color from staff_locations where tenant_id = ${TENANT} and user_id = ${JP_CB} and location_id = ${CB})
     where tenant_id = ${TENANT} and user_id = ${JP_LV} and location_id = ${LV} returning id`;
  check("copied agenda colour onto JP(lv) at LV", 1, col.length);
  ids.services_inserted = (await tx`insert into therapist_services (tenant_id, therapist_user_id, service_id)
     select tenant_id, ${JP_LV}, service_id from therapist_services where tenant_id = ${TENANT} and therapist_user_id = ${JP_CB}
     on conflict (tenant_id, therapist_user_id, service_id) do nothing returning id::text`).map((r) => r.id);

  // ---- the audit row carries every moved id, so the rollback reverses exactly these
  const counted = { appointments: ids.appointments.length, appointments_second: ids.appointments_second.length,
    availability: ids.availability.length, time_off: ids.time_off.length, episodes: ids.episodes.length,
    analytics: ids.analytics.length, services_inserted: ids.services_inserted.length };
  const [audit] = await tx`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
     values (${TENANT}, ${ACTOR}, ${ACTION}, 'user', ${JP_LV}, ${tx.json({
       script_sha256: SELF_SHA, from_user: JP_CB, to_user: JP_LV, location: LV,
       lv_is_bookable_before: lv.is_bookable, profile_fields: ["phone", "job_title", "is_bookable"],
       colour_copied: true, counts: counted, ids,
     })}) returning id::text`;
  console.log(`AUDIT ${ACTION} ${audit.id}`);

  // ---- POST, asserted against PRE -----------------------------------------------
  const post = await counts(tx);
  printCounts("POST", post);
  console.log("");
  check("JP(cb) appointments at LV", 0, post.appt_cb_at_lv);
  check("JP(lv) appointments at LV", pre.appt_lv_at_lv + pre.appt_cb_at_lv, post.appt_lv_at_lv);
  check("JP(cb) appointments at CB (stays)", pre.appt_cb_at_cb, post.appt_cb_at_cb);
  check("JP(lv) appointments at CB (untouched)", pre.appt_lv_at_cb, post.appt_lv_at_cb);
  check("appointments total", pre.appt_total, post.appt_total);
  check("JP(cb) second-therapist slots at LV", 0, post.appt2_cb_at_lv);
  check("JP(lv) second-therapist slots at LV", pre.appt2_lv_at_lv + pre.appt2_cb_at_lv, post.appt2_lv_at_lv);
  check("JP(cb) schedule rows at LV", 0, post.avail_cb_at_lv);
  check("JP(lv) schedule rows at LV", pre.avail_lv_at_lv + pre.avail_cb_at_lv, post.avail_lv_at_lv);
  check("JP(cb) schedule rows at CB (stays)", pre.avail_cb_at_cb, post.avail_cb_at_cb);
  check("JP(lv) schedule rows at CB (untouched)", pre.avail_lv_at_cb, post.avail_lv_at_cb);
  check("schedule rows total", pre.avail_total, post.avail_total);
  check("JP(cb) time off", pre.timeoff_cb - TIME_OFF_MOVE.length, post.timeoff_cb);
  check("JP(lv) time off", pre.timeoff_lv + TIME_OFF_MOVE.length, post.timeoff_lv);
  check("time off total", pre.timeoff_total, post.timeoff_total);
  check("JP(cb) episodes", pre.episodes_cb - EPISODE_MOVE.length, post.episodes_cb);
  check("JP(lv) episodes", pre.episodes_lv + EPISODE_MOVE.length, post.episodes_lv);
  check("episodes total", pre.episodes_total, post.episodes_total);
  check("JP(cb) analytics at LV", 0, post.analytics_cb_at_lv);
  check("JP(lv) analytics", pre.analytics_lv + pre.analytics_cb_at_lv, post.analytics_lv);
  check("analytics total", pre.analytics_total, post.analytics_total);
  check("clinical records by JP(cb) (authorship)", pre.records_cb, post.records_cb);
  check("clinical records by JP(lv) (authorship)", pre.records_lv, post.records_lv);
  check("records signed by JP(cb)", pre.records_signed_cb, post.records_signed_cb);
  check("appointment notes authored by JP(cb)", pre.notes_author_cb, post.notes_author_cb);
  check("appointment notes edited by JP(cb)", pre.notes_editor_cb, post.notes_editor_cb);
  check("note revisions authored by JP(cb)", pre.revisions_author_cb, post.revisions_author_cb);
  check("notifications to JP(cb) (inbox stays)", pre.notifications_cb, post.notifications_cb);
  check("notifications to JP(lv)", pre.notifications_lv, post.notifications_lv);
  check("patients created by JP(cb)", pre.patients_created_cb, post.patients_created_cb);
  check("JP(cb) services (kept)", pre.services_cb, post.services_cb);
  check("JP(lv) services", pre.services_lv + ids.services_inserted.length, post.services_lv);
  check("audit rows (+1)", pre.audit_total + 1, post.audit_total);
  const [same] = await tx`
    select (lv.phone is not distinct from cb.phone and lv.job_title is not distinct from cb.job_title and lv.is_bookable = cb.is_bookable)::int profile,
           ((select color from staff_locations where user_id = ${JP_LV} and location_id = ${LV})
              is not distinct from (select color from staff_locations where user_id = ${JP_CB} and location_id = ${CB}))::int colour,
           (select count(*) from therapist_services c where c.therapist_user_id = ${JP_CB} and not exists
              (select 1 from therapist_services l where l.therapist_user_id = ${JP_LV} and l.service_id = c.service_id))::int services_missing,
           (select count(*) from time_off where id = any(${TIME_OFF_MOVE}) and user_id <> ${JP_LV})::int timeoff_astray,
           (select count(*) from clinical_episodes where id = any(${EPISODE_MOVE}) and primary_practitioner_id <> ${JP_LV})::int episodes_astray
      from users lv, users cb where lv.id = ${JP_LV} and cb.id = ${JP_CB}`;
  check("JP(lv) profile equals JP(cb) (phone, job, bookable)", 1, same.profile);
  check("JP(lv) LV colour equals JP(cb) CB colour", 1, same.colour);
  check("JP(cb) services missing on JP(lv)", 0, same.services_missing);
  check("pinned time off not on JP(lv)", 0, same.timeoff_astray);
  check("pinned episodes not on JP(lv)", 0, same.episodes_astray);
  return { rows, moved: counted };
}

async function rollback(tx, args) {
  const [row] = await tx`
    select a.id::text, a.metadata from audit_log a
     where a.tenant_id = ${TENANT} and a.action = ${ACTION}
       and not exists (select 1 from audit_log r where r.tenant_id = ${TENANT} and r.action = ${ACTION_ROLLBACK} and r.metadata->>'reverses' = a.id::text)
     order by a.created_at desc limit 1 for update`;
  if (!row) throw new Halt(`no un-reversed ${ACTION} audit row: there is nothing to roll back`);
  const m = row.metadata, ids = m.ids;
  console.log(`\nREVERSING ${ACTION} ${row.id} (applied by script sha256 ${m.script_sha256})`);
  const pre = await counts(tx);
  printCounts("PRE", pre);
  console.log(`\nEXPECT appointments=${ids.appointments.length}`);
  if (args.confirm && args.expect !== ids.appointments.length) throw new Halt(`--expect ${args.expect} but the audit row recorded ${ids.appointments.length}`);
  const { rows, check } = checker();
  console.log("");
  const back = async (label, q, n) => check(`restored ${label}`, n, (await q).length);
  await back("appointments.practitioner_id", tx`update appointments set practitioner_id = ${JP_CB} where tenant_id = ${TENANT} and id = any(${ids.appointments}) and practitioner_id = ${JP_LV} returning id`, ids.appointments.length);
  await back("appointments.practitioner_2_id", tx`update appointments set practitioner_2_id = ${JP_CB} where tenant_id = ${TENANT} and id = any(${ids.appointments_second}) and practitioner_2_id = ${JP_LV} returning id`, ids.appointments_second.length);
  await back("availability_templates.user_id", tx`update availability_templates set user_id = ${JP_CB} where tenant_id = ${TENANT} and id = any(${ids.availability}) and user_id = ${JP_LV} returning id`, ids.availability.length);
  await back("time_off.user_id", tx`update time_off set user_id = ${JP_CB} where tenant_id = ${TENANT} and id = any(${ids.time_off}) and user_id = ${JP_LV} returning id`, ids.time_off.length);
  await back("clinical_episodes", tx`update clinical_episodes set primary_practitioner_id = ${JP_CB} where tenant_id = ${TENANT} and id = any(${ids.episodes}) and primary_practitioner_id = ${JP_LV} returning id`, ids.episodes.length);
  await back("analytics_events", tx`update analytics_events set therapist_user_id = ${JP_CB} where tenant_id = ${TENANT} and id = any(${ids.analytics}) and therapist_user_id = ${JP_LV} returning id`, ids.analytics.length);
  await back("therapist_services (copies removed)", tx`delete from therapist_services where tenant_id = ${TENANT} and id = any(${ids.services_inserted}) and therapist_user_id = ${JP_LV} returning id`, ids.services_inserted.length);
  await back("JP(lv) profile (phone and job title were empty)", tx`update users set phone = null, job_title = null, is_bookable = ${m.lv_is_bookable_before}, updated_at = now() where id = ${JP_LV} and tenant_id = ${TENANT} returning id`, 1);
  await back("JP(lv) LV colour (was empty)", tx`update staff_locations set color = null where tenant_id = ${TENANT} and user_id = ${JP_LV} and location_id = ${LV} returning id`, 1);
  const [audit] = await tx`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
     values (${TENANT}, ${ACTOR}, ${ACTION_ROLLBACK}, 'user', ${JP_LV}, ${tx.json({ reverses: row.id, script_sha256: SELF_SHA, counts: m.counts })}) returning id::text`;
  console.log(`AUDIT ${ACTION_ROLLBACK} ${audit.id}`);
  const post = await counts(tx);
  printCounts("POST", post);
  console.log("");
  const n = m.counts;
  check("JP(cb) appointments at LV", pre.appt_cb_at_lv + n.appointments, post.appt_cb_at_lv);
  check("JP(lv) appointments at LV", pre.appt_lv_at_lv - n.appointments, post.appt_lv_at_lv);
  check("appointments total", pre.appt_total, post.appt_total);
  check("JP(cb) schedule rows at LV", pre.avail_cb_at_lv + n.availability, post.avail_cb_at_lv);
  check("JP(cb) time off", pre.timeoff_cb + n.time_off, post.timeoff_cb);
  check("JP(cb) episodes", pre.episodes_cb + n.episodes, post.episodes_cb);
  check("JP(cb) analytics at LV", pre.analytics_cb_at_lv + n.analytics, post.analytics_cb_at_lv);
  check("clinical records by JP(cb) (authorship)", pre.records_cb, post.records_cb);
  check("audit rows (+1)", pre.audit_total + 1, post.audit_total);
  return { rows, moved: n };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = process.env.DATABASE_URL_DIRECT;
  if (!raw) bad("DATABASE_URL_DIRECT is not set; pass the env file with node --env-file");
  const t = target(raw);
  const mode = `${args.rollback ? "ROLLBACK" : "REASSIGN"} ${args.confirm ? `APPLY (expect ${args.expect})` : "PREVIEW (rolls back)"}`;
  console.log(`STAFF-10 jp-split-lv | ${mode} | ${t.kind} | ${t.line}`);
  console.log(`script sha256 ${SELF_SHA}`);
  const sql = postgres(raw, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 20, onnotice: () => {} });
  let result;
  try {
    await sql.begin(async (tx) => {
      await tx`set local lock_timeout = '10s'`;
      await tx`set local statement_timeout = '180s'`;
      result = args.rollback ? await rollback(tx, args) : await reassign(tx, args);
      const failed = result.rows.filter((r) => !r.ok);
      if (failed.length) throw new Halt(`${failed.length} check(s) FAILED: ${failed.map((r) => r.name).join("; ")}`);
      if (!args.confirm) throw new PreviewDone();
    });
    console.log(`\nVERDICT: APPLIED - ${result.rows.length} checks OK, committed. Moved: ${JSON.stringify(result.moved)}`);
    return 0;
  } catch (e) {
    if (e instanceof PreviewDone) {
      console.log(`\nVERDICT: PREVIEW OK - ${result.rows.length} checks OK, ROLLED BACK, nothing changed. Moved-if-applied: ${JSON.stringify(result.moved)}`);
      return 0;
    }
    if (e instanceof Halt) { console.log(`\nVERDICT: HALTED - ${e.message}. ROLLED BACK, nothing changed.`); return 1; }
    console.log(`\nVERDICT: FAILED - ${e.code ?? ""} ${e.message}. ROLLED BACK, nothing changed.`);
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

process.exit(await main());

import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { appointmentNotes, appointments, patients, type DbTx } from "@osteojp/db";

import { noteExcerpt, type NoteExcerpt } from "./preview";

/**
 * ==========================================================================
 * THE LATEST NOTE, FOR A LIST ROW, READ THROUGH THE PATIENT ROW ON PURPOSE
 * ==========================================================================
 *
 * These two functions exist because two work queues - Recuperação and Marcações
 * - need a note VISIBLE WITHOUT A CLICK, and a clinical note is the one thing on
 * either screen that must not be shown to a principal who could not open the
 * full view.
 *
 * ==========================================================================
 * `appointment_notes` RLS IS TENANT-ONLY. READ THAT SENTENCE AGAIN.
 * ==========================================================================
 * Migration 0026 (and 0030 for the legacy relation) gives these tables ONE
 * SELECT policy: `tenant_id = jwt_tenant_id()`. There is no location arm and no
 * therapist arm. So a `SELECT body FROM appointment_notes WHERE patient_id = $1`
 * issued by ANY authenticated staff session returns the note - for any patient
 * in the tenant, including one that `patients_select` would refuse them.
 *
 * That is not a defect in those policies. It is how the full notes view has
 * always been bounded: `getAppointmentNotesAction` resolves the patient and
 * calls `getPatient`, and `getPatient` is where `therapistPatientScope` /
 * `patientLocationScope` and `patients_select` decide. The note read rides the
 * PATIENT's visibility, and always has.
 *
 * ==========================================================================
 * SO THE PREVIEW RIDES IT TOO, STRUCTURALLY, AND NOT BY A SECOND CHECK
 * ==========================================================================
 * Both reads below SELECT `FROM patients` (or INNER JOIN it) and correlate the
 * note as a subquery. `patients_select` therefore decides whether the ROW
 * exists at all, so a note for a patient this viewer may not see is not
 * withheld from the render - IT IS NEVER SELECTED. There is nothing in the
 * process, nothing in the RSC payload and nothing in the browser's memory.
 *
 * THE ALTERNATIVE WAS ONE LINE SHORTER AND WRONG. Reading
 * `appointment_notes` keyed on the patient ids the previous query returned, and
 * filtering the result, would have disclosed the note first and hidden it
 * second - the exact distinction `lib/followup/queries.ts` records about the
 * therapist scope being a WHERE clause and never a `.filter()`. The join is not
 * decoration: it IS the gate.
 *
 * ==========================================================================
 * ONE STATEMENT PER RENDER, NOT ONE PER ROW
 * ==========================================================================
 * Both take the ids the caller has ALREADY selected and answer for all of them
 * in a single statement, exactly as `listFollowupCandidates` reads its contact
 * marks. A per-row read would be fifty round trips on a page of fifty, and on
 * production every one of those crosses the Supabase transaction pooler - the
 * cost `agenda-transaction-count.test.ts` exists to pin one layer up.
 *
 * They take a `DbTx` rather than a context, so the caller's OWN transaction is
 * reused and no second `BEGIN` / `set local role` / `set_config` / `COMMIT` is
 * paid. Same reason `readTherapistLocationAssignments` takes one (PERF-06).
 */

/** What a row shows: the newest note, and how many there are in total. */
export type LatestNote = {
  excerpt: NoteExcerpt;
  /** Total notes of this kind. `> 1` is what lets the label say the excerpt is
   *  the LATEST of several rather than the whole conversation - the honesty
   *  PL-17 added to the agenda hover for the same reason. */
  total: number;
};

/**
 * A PATIENT note is one that belongs to the PERSON and not to a visit.
 *
 * TWO RELATIONS HOLD THEM AND BOTH ARE READ. `appointment_notes` with
 * `appointment_id IS NULL` is the unified store's patient-level row (0042 made
 * the column nullable for exactly this); `patient_note_revisions` is the legacy
 * relation, which has no appointment_id at all, so every row in it is
 * patient-level by construction. `listPatientNotes` merges the same two legs for
 * the full view, so the excerpt on the row and the first entry in the board are
 * the same note.
 *
 * THE BACKFILL DUPLICATE CANNOT SPLIT THE ANSWER. `notes-merge.ts` de-duplicates
 * the two legs on (content, created_at) because the owner-gated backfill copies
 * legacy rows into the unified store. Taking the MAXIMUM created_at across the
 * union is dedup-safe without that machinery: a duplicated note appears twice
 * with the SAME instant and the SAME body, so either copy yields the same
 * excerpt. The COUNT is the number that would double, which is why it is a
 * count of DISTINCT (content, created_at) and not a bare `count(*)`.
 */
const patientNoteUnion = (patientIdCol: string, tenantIdCol: string) => `
  select an.body as content, an.created_at as at
    from appointment_notes an
   where an.patient_id = ${patientIdCol}
     and an.tenant_id  = ${tenantIdCol}
     and an.appointment_id is null
  union all
  select r.content, r.created_at
    from patient_note_revisions r
   where r.patient_id = ${patientIdCol}
     and r.tenant_id  = ${tenantIdCol}
`;

/**
 * The latest PATIENT note for each of `patientIds`, keyed by patient id.
 *
 * A patient with no note, or one this viewer may not see, is ABSENT from the
 * map. Absent and "has no notes" are the same answer to the caller on purpose:
 * both mean render nothing, and a caller that could tell them apart would be
 * holding the fact that a note exists for a patient it may not read.
 */
export async function readLatestPatientNotes(
  tx: DbTx,
  patientIds: readonly string[],
): Promise<Map<string, LatestNote>> {
  if (patientIds.length === 0) return new Map();
  /**
   * THE OUTER COLUMNS ARE NAMED IN FULL AND QUOTED, and that is not style.
   *
   * A bare `id` inside `FROM appointment_notes an` binds to `an.id`, so the
   * correlation would compare a note's own id to itself, match nothing, and
   * return NULL for every row - with no error anywhere and a screen that simply
   * shows no notes. INC-12 cost a production incident to exactly that, and
   * `packLinkedCountSql` carries the full account of the same mistake one
   * feature over, where it silently counted ZERO linked appointments.
   */
  const P = '"patients"."id"';
  const T = '"patients"."tenant_id"';
  const rows = await tx
    .select({
      patientId: patients.id,
      body: sql<string | null>`(
        select n.content from (${sql.raw(patientNoteUnion(P, T))}) n
        order by n.at desc limit 1
      )`.as("latest_note_body"),
      total: sql<number>`(
        select count(distinct (n.content, n.at))::int
          from (${sql.raw(patientNoteUnion(P, T))}) n
      )`.as("note_total"),
    })
    .from(patients)
    // BOUND, never interpolated: `inArray` is the form `guest-requests.ts`
    // records preferring over a hand-built IN list, and these ids reach here
    // from a previous query rather than from a request only because THIS
    // caller happens to be shaped that way - the next one may differ.
    .where(inArray(patients.id, [...patientIds]));

  const out = new Map<string, LatestNote>();
  for (const r of rows) {
    const excerpt = noteExcerpt(r.body);
    // A row whose only notes are blank yields no excerpt, so it yields no entry.
    // `total` is not consulted for that decision: a count of one whitespace note
    // is still nothing to show.
    if (excerpt) out.set(r.patientId, { excerpt, total: Number(r.total ?? 0) });
  }
  return out;
}

/**
 * NOTES-01, REBUILT 2026-09-08 — the latest note of EITHER KIND for a patient.
 *
 * ==========================================================================
 * WHY THE FIRST BUILD RENDERED NOTHING, AND WOULD ALWAYS HAVE
 * ==========================================================================
 * /recuperacao read `readLatestPatientNotes`, which is patient-LEVEL notes only:
 * `appointment_notes` rows with `appointment_id IS NULL`, plus the legacy
 * relation. PRODUCTION HOLDS ONE such note. It holds 43,403 APPOINTMENT notes.
 * So the read was sound, its scope was sound, its tests were sound, and it was
 * pointed at the one relation the clinic does not write to. The owner saw an
 * empty note line on every row and there was nothing wrong with the query.
 *
 * THE RULING (strategy, 2026-09-08): show the latest note of EITHER kind, and
 * LABEL it so the reader knows which - the way /marcacoes already labels its
 * two lines. One line, because this is a call list and the row exists to be
 * acted on, not read.
 *
 * ==========================================================================
 * ONE UNION, NOT TWO READS, AND THE KIND COMES OUT OF THE SAME ROW
 * ==========================================================================
 * `appointment_id IS NULL` is the discriminator the unified store already
 * carries (0042 made the column nullable for exactly this), so the kind is a
 * CASE on the row that won, not a second query whose answer could disagree with
 * the first. `patient_note_revisions` is patient-level by construction - it has
 * no appointment_id at all - so its leg is labelled without a test.
 *
 * `total` COUNTS THE KIND THAT WON, not both. "Ultima nota da marcacao (de 3)"
 * has to be true about appointment notes; a count spanning both kinds would put
 * a number on the line that answers a question the line does not ask. It is the
 * same meaning `marcacoes` gives its own per-source totals.
 *
 * THE SCOPE IS THE PATIENTS ROW, exactly as in `readLatestPatientNotes`: this
 * selects FROM `patients` and correlates, so `patients_select` decides, and
 * there is no second definition of who may read a note.
 */
export type LatestNoteOfKind = LatestNote & { kind: "patient" | "appointment" };

/*
 * NOTES-03: `sort_at` is where the note sits in the history - the marcação's
 * start for a note on one, the creation instant otherwise - so "latest" here is
 * the FIRST entry `listPatientNotes` draws, as the Recuperação popup promises.
 * `at` stays the creation instant: it is half of the (content, created_at) key
 * the backfill de-duplication counts on. An appointment this viewer's
 * `appointments` policy hides yields NULL and falls back to creation, exactly as
 * the LEFT join in `listPatientNotes` does.
 */
const anyNoteUnion = (patientIdCol: string, tenantIdCol: string) => `
  select an.body as content, an.created_at as at,
         coalesce((select a.starts_at from appointments a
                    where a.id = an.appointment_id and a.tenant_id = an.tenant_id),
                  an.created_at) as sort_at,
         case when an.appointment_id is null then 'patient' else 'appointment' end as kind
    from appointment_notes an
   where an.patient_id = ${patientIdCol}
     and an.tenant_id  = ${tenantIdCol}
  union all
  select r.content, r.created_at, r.created_at, 'patient' as kind
    from patient_note_revisions r
   where r.patient_id = ${patientIdCol}
     and r.tenant_id  = ${tenantIdCol}
`;

export async function readLatestNoteEitherKind(
  tx: DbTx,
  patientIds: readonly string[],
): Promise<Map<string, LatestNoteOfKind>> {
  if (patientIds.length === 0) return new Map();
  // The outer columns are named in full and quoted for the reason the block in
  // `readLatestPatientNotes` gives: a bare `id` binds to the inner table and the
  // correlation silently matches nothing.
  const P = '"patients"."id"';
  const T = '"patients"."tenant_id"';
  const rows = await tx
    .select({
      patientId: patients.id,
      body: sql<string | null>`(
        select n.content from (${sql.raw(anyNoteUnion(P, T))}) n
        order by n.sort_at desc, n.at desc limit 1
      )`.as("latest_any_body"),
      kind: sql<string | null>`(
        select n.kind from (${sql.raw(anyNoteUnion(P, T))}) n
        order by n.sort_at desc, n.at desc limit 1
      )`.as("latest_any_kind"),
      total: sql<number>`(
        select count(distinct (n.content, n.at))::int
          from (${sql.raw(anyNoteUnion(P, T))}) n
         where n.kind = (
           select n2.kind from (${sql.raw(anyNoteUnion(P, T))}) n2
           order by n2.sort_at desc, n2.at desc limit 1
         )
      )`.as("latest_any_total"),
    })
    .from(patients)
    .where(inArray(patients.id, [...patientIds]));

  const out = new Map<string, LatestNoteOfKind>();
  for (const r of rows) {
    const excerpt = noteExcerpt(r.body);
    // A row whose newest note is blank yields no excerpt and so no entry - the
    // same rule `readLatestPatientNotes` applies, for the same reason.
    if (!excerpt) continue;
    const kind = r.kind === "appointment" ? "appointment" : "patient";
    out.set(r.patientId, { excerpt, total: Number(r.total ?? 0), kind });
  }
  return out;
}

/**
 * The latest APPOINTMENT note for each of `appointmentIds`, keyed by appointment
 * id.
 *
 * ==========================================================================
 * THE INNER JOIN TO `patients` IS THE GATE AND MUST STAY AN INNER JOIN
 * ==========================================================================
 * `baseAppointmentQuery` LEFT joins `patients` deliberately
 * (SEC-appointment-vanishes-with-patient-scope): an appointment whose patient
 * this viewer may not see must still RENDER, as an occupied slot with the name
 * withheld, or reception books over it. That ruling is about the SLOT.
 *
 * It is not about the NOTE. A withheld name beside a readable clinical note
 * would disclose the more sensitive of the two while hiding the less, so here
 * the join is INNER: no patient row, no note row, no entry in the map.
 *
 * ==========================================================================
 * WHAT THE CONTROLS ACTUALLY SHOWED, RATHER THAN WHAT THIS COMMENT FIRST CLAIMED
 * ==========================================================================
 * This block used to end "changing it to a LEFT join would silently re-open
 * exactly that". IT WAS RUN, AND IT IS FALSE: with the patient-id pin below in
 * place, a LEFT join keeps every case green, because `patients.id` is NULL for a
 * withheld patient and `NULL IN (…)` is not true, so the row is filtered anyway.
 * What DOES redden the suite is deleting the `patients` participation entirely.
 *
 * So there are TWO independent gates over the same set, and the sentence is
 * corrected rather than left standing beside a control that contradicts it -
 * a comment asserting a property nothing tests is the defect class this
 * codebase keeps finding in its own instruments.
 *
 * The legacy relation contributes nothing here: `patient_note_revisions` has no
 * appointment_id, so a legacy note belongs to a patient and never to a visit -
 * the same reason `listAppointmentNotes` reads the unified store alone.
 */
export async function readLatestAppointmentNotes(
  tx: DbTx,
  appts: readonly { id: string; patientId: string }[],
): Promise<Map<string, LatestNote>> {
  if (appts.length === 0) return new Map();
  const appointmentIds = appts.map((a) => a.id);
  /**
   * ==========================================================================
   * THE PATIENT IDS ARE PINNED TOO, AND IT IS A PLAN FIX, NOT A SECURITY ONE
   * ==========================================================================
   * READ THIS BEFORE REMOVING THE SECOND `inArray`. It is redundant by
   * construction - these ARE the patient ids of those appointments, derived
   * from the same argument so the two lists cannot be mismatched - and it is
   * worth 8.7x.
   *
   * MEASURED, at production scale (8,413 patients, 40,848 appointments) as the
   * ASSIGNED admin, over a 209-row Marcações window:
   *
   *   inner join alone                63.5 ms
   *   inner join + this predicate      7.3 ms
   *
   * WHY. With the ids only on `appointments.id`, the planner drove the join
   * from the PATIENTS side: `Index Scan patients_tenant_idx (rows=8409,
   * 56.6ms)` and then `appointments_patient_idx` at loops=8409. It has no cheap
   * way to see that the 209 appointments touch only 209 patients, and
   * `patients_select`'s `id = ANY(viewer_visible_patient_ids())` makes that
   * side look worth starting from. Naming the patients narrows `patients_pkey`
   * to 209 rows BEFORE the policy is applied to them.
   *
   * THE `exists (...)` FORM WAS TRIED AND CHANGED NOTHING (63.8 ms): the
   * problem is not the join operator, it is that nothing bounded the patients
   * side.
   *
   * IT IS NOT THE GATE AND MUST NOT BE READ AS ONE. The gate is the INNER JOIN
   * under `patients_select`, exactly as the header says. This predicate only
   * restates a set the join already implies, so removing it costs speed and not
   * safety - and adding it does not let the join be weakened, which is why the
   * suite still asserts the withheld case directly.
   */
  const patientIds = [...new Set(appts.map((a) => a.patientId))];
  const rows = await tx
    .select({
      appointmentId: appointments.id,
      body: sql<string | null>`(
        select an.body from appointment_notes an
         where an.appointment_id = "appointments"."id"
           and an.tenant_id      = "appointments"."tenant_id"
         order by an.created_at desc
         limit 1
      )`.as("latest_note_body"),
      total: sql<number>`(
        select count(*)::int from appointment_notes an
         where an.appointment_id = "appointments"."id"
           and an.tenant_id      = "appointments"."tenant_id"
      )`.as("note_total"),
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .where(and(inArray(appointments.id, appointmentIds), inArray(patients.id, patientIds)));

  const out = new Map<string, LatestNote>();
  for (const r of rows) {
    const excerpt = noteExcerpt(r.body);
    if (excerpt) out.set(r.appointmentId, { excerpt, total: Number(r.total ?? 0) });
  }
  return out;
}

/**
 * Exported for the negative-arm suite ALONE, and it is exported rather than
 * duplicated there for the reason `followup-selection.db.test.ts` gives about
 * the follow-up clauses: a proof written against a re-typed copy of a rule goes
 * green while asserting the old rule.
 *
 * It is the UNGATED read - `appointment_notes` reached directly, with only its
 * tenant-only policy in the way. The suite runs it as the very principal the
 * gated read refuses, and asserts it SUCCEEDS. That is what makes the gate
 * load-bearing rather than incidental: without this arm, a test showing the
 * preview is empty proves only that the fixture had no note.
 */
export async function readPatientNotesUngated(
  tx: DbTx,
  patientId: string,
): Promise<{ body: string }[]> {
  const rows = await tx
    .select({ body: appointmentNotes.body })
    .from(appointmentNotes)
    .where(
      and(eq(appointmentNotes.patientId, patientId), isNull(appointmentNotes.appointmentId)),
    );
  return rows;
}

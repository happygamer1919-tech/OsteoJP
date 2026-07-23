# Loop W12-13 - BUILD notes unification (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, BUILD, GATED on W12-12 SPEC + the model-choice ruling. OWNER-MERGE (migration + backfill). OWNER VISUAL GATE surface. CYAN pre-merge audit mandatory.** Implements the unified note model per `docs/design/SPEC-notes-unification.md`: agenda notes reflect in Marcacoes + the patient profile; the Inicio block gains patient + appointment selectors (two modes). One migration in flight, one PR in flight. Starts from **fresh `origin/main`**; never stacked.

## Preconditions (hard gate)
1. **W12-12 merged** + the model-choice ruled (unify onto nullable `appointment_notes` with backfill, unless the owner chose the keep-both fallback).

## Field 1. Scope and ground truth

Build the unified model + surfaces per the spec: the migration (default: make `appointment_notes.appointment_id` nullable + indexes) + a backfill from `appointments.notes` and `patient_note_revisions`; every read surface (agenda hover, Marcacoes, patient profile Notas) reads the unified store; the Inicio "Notas rapidas" block gains a patient selector + an appointment selector (mode: patient-level note, or a note on one specific appointment); shared `PatientSelector`/`AppointmentSelector` extracted; append-only + portal-note-free + RLS invariants held.

Ground truth (from the W12-12 SPEC + recon; executor re-verifies, ZERO memory):
- `appointment_notes` (patient_id + appointment_id + optional episode_id, append-only, migration 0026) is the unify target; `appointment_id` is currently NOT NULL - the migration makes it nullable so it can hold a patient-level note.
- Agenda drawer writes `appointments.notes` today; the build re-points the write to the unified store (keeping `appointments.notes` readable during backfill, then read-migrating).
- The Inicio "Notas rapidas" card + profile composer write `patient_note_revisions` today; the build re-points them + adds the appointment selector.
- The "Sem nota" chip (`hasNote`) currently always shows because nothing wrote `appointment_notes`; once notes land there, the chip becomes meaningful - keep it consistent.
- Portal `AppointmentView` must stay note-free (W9-06 guard `notes-privacy.test.ts`).

**Scope:** one migration (nullable + indexes) + a backfill + the read/write re-pointing + the Inicio selectors + shared selector components + tests (incl. RLS isolation + the portal note-free guard). One migration in flight; head advances by one; manual `drizzle-kit` direct apply (5432, cwd `packages/db`). Cloud REAL DATA ONLY; verify on local + Preview. May SPLIT (migration+backfill / read re-point / Inicio selectors) if it exceeds one coherent PR.

## Field 2. Ordered steps
1. **Precondition check** (W12-12 merged + ruling). **A0 isolation guard** off fresh `origin/main`; worktree; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Migration:** make `appointment_notes.appointment_id` nullable (+ any index the spec names); ship the migration mirrored in `packages/db/migrations/` + `supabase/migrations/`, with `tenant_id` intact, RLS unchanged/append-only, and an isolation test in the SAME PR.
3. **Backfill:** insert existing `appointments.notes` (as appointment-linked notes) + `patient_note_revisions` (as patient-level notes) into `appointment_notes`, idempotent, tenant-scoped, append-only; rehearse on local, then owner-gated on prod with before/after counts + HALT-on-mismatch.
4. **Re-point reads:** agenda hover, Marcacoes, patient profile Notas all read the unified store; the patient profile shows both patient-level + appointment-linked notes.
5. **Re-point writes + Inicio selectors:** agenda drawer note + Inicio "Notas rapidas" write the unified store; the Inicio block gains a shared `PatientSelector` + `AppointmentSelector` with the two modes; extract the selectors (retire the duplicated combobox copies where clean).
6. **CYAN pre-merge audit** (migration + backfill); live-apply the migration manually with journal evidence; Preview app + portal smoke (portal stays note-free).
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation + portal note-free guard), `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` scoped.

## Field 3. Definition of done (machine-verifiable)
- **Reflect PROOF:** an e2e adds a note in the Agenda drawer and asserts it appears in Marcacoes hover AND on the patient profile Notas tab. Paste it.
- **Two-mode PROOF:** an e2e uses the Inicio block to (a) add a patient-level note and (b) add a note on one specific appointment, asserting each lands in the right scope. Paste it.
- **Migration PROOF:** `appointment_notes.appointment_id` nullable; the isolation test in-PR; CYAN CLEAN; manual live-apply journal; head advanced by one.
- **Backfill PROOF:** local rehearsal + owner-gated prod before/after counts, append-only, no history erased.
- **Portal PROOF:** the W9-06 portal note-free guard still green.
- **Gates green** incl. RLS isolation + Preview smoke.

## Field 4. Verification (paste evidence)
The reflect e2e, the two-mode e2e, the migration + isolation test, the CYAN audit + journal, the backfill counts, the portal guard, the Preview smoke, suite counts, the Preview URL + role steps, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **One migration in flight, one PR in flight**; SPLIT if larger.
- **Append-only:** the backfill INSERTS; it never destructively erases `patient_note_revisions` or `appointments.notes` (leave the source columns readable; a later cleanup loop is separate + owner-gated).
- **Portal stays note-free** (W9-06 guard); **every table keeps tenant_id + RLS + an isolation test in-PR + a CYAN pre-merge audit**; live-apply manual (direct 5432, cwd `packages/db`).
- Cloud REAL DATA ONLY; verify on local `127.0.0.1` + Preview; pt-PT + en both; no emoji; plain hyphens; no em/en dashes; no new hex without token approval. **Never force-push / `--admin`.** No PII in logs.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR W12-12 is not merged.
- The backfill would need to erase or mutate append-only history - HALT.
- The migration lacks its RLS isolation test, or the portal note-free guard breaks - HALT.
- The build cannot fit one migration / one PR - SPLIT (do not stack).

## Field 7. Report back
The reflect + two-mode e2es, the migration + isolation test, the CYAN audit + journal, the backfill counts, the portal guard, the Preview smoke, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-13 is OWNER-MERGE (migration + backfill + owner-visible surface).** NOT `[SELF-MERGE-OK]`. Required checks (DB-gated tests incl. RLS isolation, Lint+typecheck+test, Playwright E2E) + all three Vercel deploys green (checks API not banner) NECESSARY; **CYAN pre-merge audit mandatory**; the owner authorizes the backfill + merges (OWNER VISUAL GATE on the note-reflection surface).
- **GATED on W12-12** + the model ruling. One migration in flight, one PR in flight, fresh `origin/main`, never stacked. Workflow files never touched. HALT-LOUD on history erasure / missing isolation test / portal note leak.

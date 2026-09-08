# REPORT — 1027 notes no screen can display

**Report only. No write. The recovery is a production data migration and it is
strategy's.** BLUE, 2026-09-08. Re-derived from `origin/main` and from the
committed provisioning evidence; nothing here is taken from a prior report.

The owner's production read: **`patients.notes` non-empty on 1027 rows**,
**`patient_note_revisions` EMPTY**, **`appointment_notes` patient-level = 1**.

---

## 1. Did 0030's seed run? Yes. Was it reverted? No. It found nothing.

`0030_patient_note_revisions.sql` contains the backfill, in full:

```sql
INSERT INTO public.patient_note_revisions (tenant_id, patient_id, content, author_user_id, created_at)
SELECT tenant_id, id, notes, NULL, now()
FROM public.patients
WHERE notes IS NOT NULL AND btrim(notes) <> '';
```

It ran. It was not reverted, and no later migration deletes from that table.
**It inserted zero rows because `patients` was empty at the moment it ran**, and
that is not a failure — it is the backfill doing exactly what it says.

### The timeline, from committed evidence

| when | what | source |
|---|---|---|
| 2026-07-22 | the **new** production project is built from the committed migrations to head 0037 | `docs/recon/W11-02-provisioning-evidence.md` — its own words: *"28 domain tables, **all empty** (0 rows) — no real data present"* |
| 2026-07-22 | W11-03 copies **config only** — 11 tables, 115 rows | `W11-03-migration-evidence.md`, post-commit: *"NEW patient-linked/audit/analytics: all 0"*. The old project's 5 `patient_note_revisions` rows were deliberately **not** migrated (`would_migrate=0`) |
| later | the Fisiozero imports write ~8,400+ patients **including `notes`** | `upsert.ts:698` |

0030 is migration index 29. It ran in step 1, against zero patients.

---

## 2. So what is the defect?

**0030's backfill is a one-shot at apply time, and the only writer of the column
it reads arrived afterwards.**

`packages/db/src/migration/upsert.ts:698` is the **only** writer of
`patients.notes` in the entire repository — checked across `apps/`, `packages/`
and `scripts/`, not assumed. The Fisiozero adapter maps `observacoes` (plus any
additional telephone numbers) into it. The importer does not write
`patient_note_revisions` and never did.

Every row written to `patients.notes` after 0030 was applied is invisible to it
forever. On this database that is **100% of them**.

### No screen reads the column

The profile Notas tab reads `listPatientNotes`, which merges `appointment_notes`
and `patient_note_revisions`. Neither reads `patients.notes`. The agenda hover
reads `appointment_notes` falling back to **`appointments.notes`** — a different
column on a different table.

### And the spec that would have caught it says the opposite

`SPEC-notes-unification` §1's store table records `patients.notes` as *"Written
by nothing (backfilled into `patient_note_revisions` rev 1) … Read by nothing."*
**Both halves of that row are now false.** The importer writes it; and the
parenthetical is true only of rows that existed at apply time, which here was
none.

**Consequence: the held W12-13 backfill would not recover them either.** §4.2
covers `appointments.notes` and `patient_note_revisions` and does not mention
`patients.notes`, because when it was written nothing wrote that column. Running
it as specified leaves all 1027 behind.

---

## 3. What recovery would take

One `INSERT` into `appointment_notes` — the **unified** store, not
`patient_note_revisions`, which W12-13 retires:

| column | value | why |
|---|---|---|
| `appointment_id` | `NULL` | a patient-level note; 0042 made it nullable for exactly this |
| `patient_id` | the patient | |
| `author_user_id` | `NULL` | 0042 made it nullable for migrated notes with no resolvable author |
| `body` | `patients.notes` | |
| `created_at` | **`patients.created_at`** | see below |

**`created_at` is the one real decision, and it is not `now()`.** Fisiozero's
`observacoes` carries no timestamp. `patients.created_at` is the source
registration date, which the importer already preserves — its own comment refuses
to *"silently stamp import day onto a patient the clinic has had for a decade"*.
`now()` would do that to 1027 notes at once **and** put them all at the top of
every newest-first list.

**Idempotence is not optional.** The merge de-dupes on `(content, created_at)`,
so a re-run that re-inserted would show the note twice. The insert needs
`NOT EXISTS` on that same pair — the natural key is already defined in
`notes-merge.ts`.

---

## 4. One read first: `scripts/import/notes-1027-provenance.sql`

Read-only, owner-run, **prints no note and no patient** — every column is a count
or a length, and the `like` predicates test a shape and return a boolean.

It answers the two things that change what recovery should do:

- **Are all 1027 import-sourced?** The code says they must be; row 3 falsifies
  that if anything else writes the column, and a non-zero there must be chased
  before any recovery runs.
- **How many are only the `Outros contactos:` line?** That is the adapter's
  append for a patient's second and later phone numbers. It is contact data, not
  a clinical observation, and copying it into a notes surface is a **different
  decision** from recovering a receptionist's note.

It also reports the `created_at` range (a floor at the import date would mean the
source dates did *not* survive) and **duplicate `(content, created_at)` pairs**,
because the recovery's idempotence key is only safe if it is unique.

**Proved on a lane before it was handed over.** Run against a fixture of five
synthetic notes in a rolled-back transaction: every arm fires, the arithmetic
holds (2+3 = 1, and 4+5+6 = 1), and the collision row finds its planted
duplicate. Nothing persisted.

---

## 5. Recommendation

**Run the provenance read, then decide the split.** My recommendation is to
recover rows that carry a real observation (row 6, plus row 5's mixed notes) and
to leave the contacts-only notes (row 4) where they are — a phone number
rendered as a clinical note in the Notas tab is a worse outcome than a phone
number nobody sees, and the numbers themselves are already on `patients.phone`
and in the additional-contacts text.

**And fix `SPEC-notes-unification` §1 in the same change**, or the next person to
plan a notes migration reads the same false row.

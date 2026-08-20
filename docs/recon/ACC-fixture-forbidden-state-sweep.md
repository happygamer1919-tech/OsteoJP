# ACC-fixture-forbidden-state-sweep — the invariant list and the scan

**Derived from `origin/main` at `53ae1bd`, 2026-08-20.** Method first, so the
result can be re-derived or disputed without asking anyone.

---

## 1. The invariant list, taken from the schema rather than invented

The card's instruction was to *"start from the constraints and triggers the
schema already carries, because those are invariants somebody has already decided
are real."* Enumerated from `packages/db/migrations`: 86 `ADD CONSTRAINT`, 81
`CHECK`, 7 unique indexes, 4 triggers.

**The named ones that matter here:**

| mechanism | invariant |
|---|---|
| `appointments_no_double_confirmed` (EXCLUDE, GiST, 0061) | no two `confirmed` appointments on one practitioner at one overlapping window |
| `consultations_window_check` | `consultation_ended_at >= consultation_started_at` |
| `guest_booking_requests_window_check` | `requested_ends_at > requested_starts_at` |
| `consultations_attempt_count_check` | `attempt_count >= 0` |
| `consultations_fire_status_check` | `fire_status IN ('pending','fired','needs_attention')` |
| `guest_booking_requests_status_check` | `status IN ('pending','confirmed','declined')` |
| `consultations_recording_unique` | one recording per (tenant, patient, window) |
| `quick_notes_tenant_user_uq` | one quick-note row per (tenant, staff user) |
| trigger `clinical_records_enforce_immutability` | a locked/signed record cannot be updated or deleted |
| trigger `patient_audit_log_append_only` | no UPDATE, no DELETE |
| trigger `action_token_consumptions_append_only` | no UPDATE, no DELETE |
| trigger `patients_assign_patient_number` | assigns on insert |

## 2. THE SPLIT THAT DECIDES WHAT A FIXTURE CAN EVEN VIOLATE

**A fixture is a STATE. It is not a transition.** So of the four triggers, *none*
is reachable by a fixture: immutability, both append-only rules and
patient-number assignment all constrain **what may happen to a row**, not **what
a row may look like**. No seed block can express "this locked record was later
edited" — that is a sequence, and the trigger refuses the second step.

That leaves the invariants a fixture genuinely can violate: the EXCLUDE
constraint, the window `CHECK`s, the range and enum `CHECK`s, and the two
uniqueness rules.

**This is the first result and it was not obvious going in:** most of the
schema's enforcement is about transitions, and the fixture question is much
narrower than the constraint count suggests.

## 3. The scan

441 test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, excluding
`node_modules`), comments stripped.

| check | examined | violations |
|---|---|---|
| window inversion (`end <= start`), start/end literal pairs within one object literal | 48 pairs | **0** |
| `fire_status` outside its `CHECK` | all literals | **0** |
| negative `attempt_count` | all literals | **0** |
| two coexisting `confirmed` appointments on one practitioner at one window | 6 candidate files | **0** |

### The "six files" figure was counting mentions, not rows

The parent card recorded *"six of the 30 build two or more confirmed appointment
objects"*. Read individually, **none of them builds two coexisting rows**:

- `estado-server-enforcement.test.ts` — every occurrence is an **argument to `updateAppointment`**, i.e. a transition being requested against one row.
- `audit-override-trace.test.ts` — the same, plus `seriesRow = { ...seriesRow, status: "confirmed" }`, which is one row being reassigned.
- `agenda-grid.test.tsx` — `render([appt({ status: "confirmed" })])`, a **single-element array**; the three at lines 328-332 are three separate renders, not one list.
- `actions.status-event.test.ts` — one base fixture plus an update call.
- `pedido-confirm.test.ts` — an **assertion** (`expect(sets[0]).toEqual({ status: "confirmed" })`) and an **audit payload field** (`to_status`). Not fixtures at all.
- `double-booked-surface.test.ts` — 7 occurrences, and it is the **legitimate** one: it builds the forbidden state on purpose to prove the constraint's refusal reaches the agenda as pt-PT rather than as a raw Postgres 500.

**Fifth instance of the same lesson**, after categories (A), (B), (C) and the
first fixture pass: a shape-match counts the *appearance of a string*, not the
thing the string sometimes indicates.

## 4. A defect in this scan, caught by its own guard

The first run reported **0 test files scanned and therefore 0 violations** — a
clean-looking result. The cause was a `cd` into `packages/db/migrations`
persisting from an earlier command, so `find apps packages` matched nothing. A
`find` that matches nothing exits 0 and a scan over zero files finds zero
problems.

It was caught because the scan **asserts its own file count**
(`assert len(files) > 300`) before reporting anything. That assertion exists
because of the negative control that regressed zero call sites
(`LEARNINGS.md` §5) and the `sed` substitutions that silently matched nothing
(§4). Third time the same class has appeared in an instrument in this project,
and the first time the guard was already in place before the mistake happened.

## 5. What is NOT covered

- **The `CHECK` constraints were not exhaustively enumerated.** 81 exist; the named ones above are those with a constraint name, which is what makes them greppable. Anonymous inline `CHECK`s are not listed and their invariants are not tested against fixtures.
- **Uniqueness violations across separate fixture objects were not scanned.** `consultations_recording_unique` and `quick_notes_tenant_user_uq` would need per-file object collection to check, which this pass did not do.
- **Only the invariants a fixture can express as STATE were in scope**, per §2.

## 6. Result

**Zero forbidden states found in fixtures**, against the invariants the schema
names and that a fixture is capable of expressing. The one historical instance
(`appointment-note-present-capture.test.ts`) remains fixed, and its class remains
unconstructible in the database rather than merely watched.

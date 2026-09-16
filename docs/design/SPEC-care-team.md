# SPEC — Care team (assigned therapists)

Status: **PROPOSAL. Nothing is built. Blocked on ruling Q-CARE-1.**
Dispatch: CARE-TEAM-M1 (BLUE, 2026-09-16). Measure-and-spec only: no migration file,
no code, no production write. **No migration number is claimed here** — the number is
taken when the migration is authored, never reserved in a document.

Baseline: `origin/main` 979e3d66. Production read-only, 2026-09-16 13:57–14:05Z,
journal 86 rows (0088 applied; `appointments_shared_resource_second_participant_select`
present in `pg_policies`).

---

## 1. The answer first

**The clinic's complaint is true of ONE object and already false of the other three.**

A therapist who shares an appointment with a patient can *already* read that patient's
entire registo history, every attachment, every episode and the ficha — including records
authored by colleagues. What they cannot read is **the appointments themselves**. That is
the whole of the measured gap.

| What Rodica asked for | Visible to the treating therapist today? | Why |
|---|---|---|
| every **appointment**, including colleagues' | **NO** — this is the gap | `appointments_rls` admits a row only if the therapist is its `practitioner_id`, `practitioner_2_id` or `created_by` |
| every **registo clínico** | **YES, already** | `clinical_therapist_sees_patient(patient_id)` is a *patient-level* fact: one shared appointment exposes the patient's whole record history |
| every **attached document** | **YES, already — and to every therapist in the clinic** | `attachments_tenant_isolation` is `FOR ALL USING (tenant_id = jwt_tenant_id())`. No narrowing of any kind |
| the **episodes** behind them | **YES, already — and to every therapist in the clinic** | `clinical_episodes_tenant_isolation`, same shape |
| the **ficha** | **YES** once the patient is visible | rides on `patients_select` |

Two of those rows are the opposite of the complaint: `attachments` and `clinical_episodes`
are readable by **any** therapist in the tenant, with no patient-side condition at all.
Read from production's own catalogue, not inferred from the repo:

```
attachments        | attachments_tenant_isolation       | ALL | (tenant_id = ( SELECT jwt_tenant_id()))
clinical_episodes  | clinical_episodes_tenant_isolation | ALL | (tenant_id = ( SELECT jwt_tenant_id()))
```

So a care-team feature justified as "so therapists can see the documents" would be
**solving a problem that does not exist, while an unintended exposure sits next to it**.
That exposure is not this spec's to close — it is flagged in §7 as its own decision.

---

## 2. The current rule, one sentence per table (N2)

Measured at `origin/main` 979e3d66 and confirmed against the live catalogue.

- **patients** — visible iff the therapist is `practitioner_id` or `practitioner_2_id` on
  an appointment where the patient is `patient_id` **or** `patient_2_id`
  (`viewer_treated_patient_ids()`), **or** `patients.created_by` is the therapist.
- **appointments** — a row is visible iff the therapist is its `practitioner_id`, its
  `practitioner_2_id`, or its `created_by`; plus two NESA disjuncts that currently admit
  nothing (§6). **The patient columns never enter the predicate.**
- **clinical_records** — all of a patient's records are visible iff the therapist authored
  one, **or** `clinical_therapist_sees_patient(patient_id)` holds, i.e. the therapist
  created the patient or shares any appointment with them in either slot.
- **clinical_episodes** — tenant-only. No narrowing.
- **attachments** — tenant-only. No narrowing.
- **storage objects (`clinical-attachments`)** — **no policies at all**; the bucket is
  private and the app mints 60-second signed URLs. The only server-side test is
  `path.startsWith(tenantId + "/")`, so it is neither patient- nor record-scoped.
- **creating an appointment for a patient** — no patient-side gate in **either** layer:
  any therapist may book for any patient in the tenant, subject only to
  `appointments:write`, the location being one of their `staff_locations`, and
  `practitioner_id` being themselves (or a shared resource).

---

## 3. The gap, measured (N4)

Production, 2026-09-16. Legacy account `0c1a0000-…-0001` and NESA rows excluded from
therapist counts; both variants reported.

| Measure | With legacy | Without legacy |
|---|---:|---:|
| patients with 2+ distinct practitioners across all appointments | **5,131** | **4,736** |
| …of those, patients with a future appointment | **329** | **324** |

Pairs *(patient, therapist holding a future appointment with them)*, legacy and NESA excluded:

| Split | Count |
|---|---:|
| pairs total | **452** |
| pairs that cannot read at least one of the patient's **appointments** | **353** |
| hidden **appointment rows** (of 22,014 considered) | **12,160** |
| pairs blocked from a **registo** | **0** |
| pairs blocked from an **attachment** | **0** |
| pairs blocked from an **episode** | **0** |

The three zeros are measured, not assumed: 452 of 452 pairs satisfy
`clinical_therapist_sees_patient` by sharing an appointment, and the other two tables are
tenant-only. For scale, those same 452 pairs already reach **527 registo rows authored by
a colleague** (across 168 pairs), **263 attachment rows**, and **523 episodes led by a
colleague**.

---

## 4. What each option resolves (Q-CARE-1)

| Option | Resolves | Cost / risk |
|---|---|---|
| **(a)** reception assignment only | **0 today.** No assignment data exists, so nothing is resolved until reception assigns. Ceiling is whatever they enter, against 16,405 imported patients | Every visible patient becomes a data-entry task; a missed assignment is an invisible failure at the desk |
| **(b)** (a) + any therapist with a **future** appointment | **353 pairs / 12,160 appointment rows**, automatically, on day one | The automatic half needs no data entry and expires naturally; assignment covers the patient who has no appointment yet |
| **(c)** (b) + any therapist who **ever** treated the patient | **14,593 pairs / 262,379 appointment rows** | 40× the exposure of (b) — 18,142 ever-treated pairs against 452 live ones — for demand nobody has measured. A therapist who saw a patient once in 2020 keeps a permanent window |

**Recommendation: (b).** It resolves the entire measured live gap without a single row of
data entry, and the assignment half covers the case (b)'s automatic half cannot: a patient
who has been assigned but not yet booked. (c) buys history nobody asked for at forty times
the surface. If the clinic later reports a real need for old history, (c) is a predicate
change on one helper, not a redesign.

---

## 5. Proposed shape

**Table** (name and columns proposed, no migration number):

```
patient_care_team
  id           uuid primary key
  tenant_id    uuid not null                       -- hard rule 1
  patient_id   uuid not null -> patients(id)   on delete cascade
  user_id      uuid not null -> users(id)      on delete cascade
  assigned_by  uuid null     -> users(id)
  assigned_at  timestamptz not null default now()
  removed_at   timestamptz null                    -- soft remove: who was on the team
                                                   -- last March is an auditable question
  unique (tenant_id, patient_id, user_id) where removed_at is null
```

**Helper**, mirroring the existing set-returning helpers so the policies stay readable and
one rule lives in one place:

```
viewer_care_team_patient_ids() returns uuid[]   -- SECURITY DEFINER, STABLE,
                                                -- search_path = public, owner postgres
```

**Policy change per table** (from the N1 map):

| Table | Change | Shape |
|---|---|---|
| `appointments` | **A NEW, SEPARATE `PERMISSIVE FOR SELECT` POLICY**, never a widening of `appointments_rls` | `appointments_rls` is `FOR ALL` with USING and WITH CHECK character-identical, so widening its USING would also widen DELETE and UPDATE. A read rule must be its own `FOR SELECT` policy — exactly the shape 0088 already used for the NESA case |
| `patients` | extend the therapist arm of `patients_select` with the care-team set | needed so an assigned patient is visible before any appointment exists |
| `clinical_records` | extend `clinical_therapist_sees_patient` with the care-team set | **only** needed for the assigned-but-never-booked case; the shared-appointment case already passes |
| `clinical_episodes` | none required for this feature | already tenant-wide (§7) |
| `attachments` | none required for this feature | already tenant-wide (§7) |
| storage objects | none required for this feature | no policies exist (§7) |

**Reception screen.** On the patient profile, a card "Equipa de cuidados": the assigned
therapists, an add control and a remove control. Managed by reception, admin and owner
under a new capability `care_team:manage`; therapists see the list read-only. Removal is a
soft remove.

**Booking rights.** Option (b) says an assigned therapist may book for that patient. Note
plainly: **that is already true of every therapist for every patient**, so this clause
grants nothing. If the intent is that only the care team may book, that is a
**narrowing** and a separate decision — it would be the first patient-side condition on
booking this system has ever had, and it would change the front desk's day.

**Audit.** Two new actions: `care_team.assign` and `care_team.remove`, written on every
assignment change, with the actor, the patient and the therapist. A row on *every therapist
read of another author's registo* is also asked for; recommended shape is to audit the
record-open action, not the list query — a list of twenty records would otherwise write
twenty audit rows per page view, and the audit table is append-only.

---

## 6. What never changes

- **Clinical authorship never moves.** `clinical_records.practitioner_id` is not rewritten
  by any part of this. A care team decides who may READ; it never decides who wrote.
- **`clinical_records_enforce_immutability` is untouched**, as are the `draft → locked →
  signed` lifecycle and the addendum rule.
- **No INSERT, UPDATE or DELETE policy changes.** Every change proposed here is on a read
  path.
- NESA: `users.is_shared_resource` is **true on 0 rows** in production today, so the two
  NESA disjuncts (0086, 0088) currently admit nothing and none of the counts above depend
  on them.

---

## 7. Flagged, not proposed — three things found while measuring

1. **`attachments` and `clinical_episodes` are readable tenant-wide by every therapist.**
   Not a consequence of this feature; the state today. Narrowing them is a behaviour change
   that could blank existing screens, so it needs its own card and its own ruling.
2. **Storage has no RLS at all.** Any holder of `clinical_records:read` or `patients:read`
   can mint a signed URL for any object path under their tenant prefix. The bucket is
   private and URLs last 60 seconds, but the gate is the tenant, not the patient.
3. **Booking has no patient-side gate**, in either layer (§2). Worth knowing before the
   care team is described to the clinic as "the therapists who can book for this patient".

---

## 8. Import provenance (N3)

Scoped to genuinely imported rows via `migration_staging_rows.imported_entity_id`:

| Entity | Imported | Legacy account | Native rows |
|---|---:|---:|---:|
| appointments | 88,529 | 4,516 (**5.1%**), 0 NULL | 702 (36 legacy) |
| clinical_records | 5,632 | 3,052 (**54.2%**) | 40 (0 legacy) |

The legacy share of appointments is concentrated in the oldest history: 890 of 1,524 in
2020 (58%), falling to 52 of 12,734 in 2026 (0.4%).

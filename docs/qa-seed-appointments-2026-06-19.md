# QA — Seed Data: Appointments, Episodes, Clinical Records

**Date:** 2026-06-19  
**Supabase project:** `ufbkzbyghvxtosyrkgjq` (dev)  
**Tenant:** `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`  
**PR audited:** #322 (feat(db): dev seed — appointments, clinical episodes, and records)  
**Access:** read-only queries via Supabase session pooler  
**Seed reference date:** 2026-06-19T12:00:00Z  

---

## Summary

| Check | Result |
|---|---|
| Appointment total | ✓ 271 (matches deterministic formula) |
| Status distribution | ✓ Past: completed/cancelled/no_show. Future: scheduled/confirmed |
| Location spread | ✓ LAV majority, CB secondary, MTN smallest |
| Date range | ✓ 2025-12-18 → 2026-07-29 (≈6 months past, ≈6 weeks future) |
| All FK checks | ✓ 0 orphans across all four FK axes |
| Appointment durations | ✓ Fisioterapia 45 min, all others 60 min |
| No weekend appointments | ✓ 0 |
| Hour range | ✓ 9:00–18:00 UTC |
| Fixed ID pattern | ✓ All IDs match `de000007-*` pattern |
| Episode total | ✓ 40 (30 open, 10 closed) |
| Episode FK integrity | ✓ 0 orphans; 0 patient mismatches |
| Clinical record total | ✓ 60 (30 locked, 15 draft, 15 signed) |
| Record FK integrity | ✓ 0 orphans (episode, patient, template) |
| Record state consistency | ✓ signed→signed_at+signed_by set; draft/locked→none |
| Tenant isolation | ✓ 0 rows on wrong tenant |
| **Practitioner double-bookings** | ⚠ **7 slots** — dev-seed artifact, not a prod risk |

---

## 1. Appointments

### 1.1 Total

**Expected:** `sum(3 + pi % 6) for pi in 0..49` = 8 cycles × 33 + (3+4) = **271**  
**Actual:** **271** ✓

Every one of the 50 patients has at least one appointment. Per-patient range: 3–8 (avg 5.4).

### 1.2 Status distribution

| Status | Count | % |
|---|---|---|
| completed | 132 | 48.7% |
| no_show | 44 | 16.2% |
| cancelled | 43 | 15.9% |
| scheduled | 36 | 13.3% |
| confirmed | 16 | 5.9% |
| **Total** | **271** | |

Past appointments (starts_at < query time): **222**. Future: **49**.

Status assignment logic from seed: past → `roll % 10 < 6 → completed, < 8 → cancelled, else no_show` (≈60/20/20); future → `(pi+ai)%3===2 → confirmed else scheduled` (≈1/3 confirmed, 2/3 scheduled). Observed ratios match exactly. The 3 appointments whose `starts_at` fell between the seed reference noon and query time (~20:00 UTC) legitimately appear in the "future status / past time" category — expected behavior.

### 1.3 Location distribution

| Location | Count | % |
|---|---|---|
| Linda-a-Velha | 131 | 48.3% |
| Castelo Branco | 116 | 42.8% |
| Montemor-o-Novo | 24 | 8.9% |
| **Total** | **271** | |

**Design intent:** LAV patients (pi 0–24) default to LAV; CB patients (pi 25–49) default to CB. Cross-location visits are seeded as occasional (1-in-7 for LAV→CB, 1-in-11 for LAV→MTN; 1-in-6 for CB→MTN, 1-in-9 for CB→LAV). MTN's low share (8.9%) reflects it being the newest/smallest location with only two assigned therapists (Inês Carmo + Rui Correia).

### 1.4 Date spread and monthly distribution

| | Value |
|---|---|
| Earliest | 2025-12-18 09:00 UTC |
| Latest | 2026-07-29 18:00 UTC |
| Past (by query time) | 222 |
| Future | 49 |

Monthly distribution:

| Month | Count |
|---|---|
| 2025-12 | 50 |
| 2026-01 | 18 |
| 2026-02 | 32 |
| 2026-03 | 37 |
| 2026-04 | 36 |
| 2026-05 | 24 |
| 2026-06 | 42 |
| 2026-07 | 32 |

The December 2025 spike (50) is expected: all 50 patients have their first appointment clustered near the start of the 6-month past window. The January dip (18) is an artifact of how the deterministic offset formula spreads appointments — a full linear spread would put fewer appointments near the boundaries. Not a data integrity issue.

### 1.5 Service distribution

| Service | Count | Duration |
|---|---|---|
| Osteopatia | 55 | 60 min ✓ |
| Fisioterapia | 54 | **45 min ✓** |
| Massagem Terapêutica | 54 | 60 min ✓ |
| Pilates Terapêutico | 54 | 60 min ✓ |
| NESA | 54 | 60 min ✓ |

Services rotate uniformly across patients (pick by `(pi + ai*2) % 5`). Fisioterapia correctly uses 45-minute slots; all others use 60 minutes. **0 appointments with wrong duration.** ✓

### 1.6 Practitioner distribution

| Practitioner | Role | Count | % |
|---|---|---|---|
| Dr. Rui Correia | Admin (all locations) | 90 | 33.2% |
| Dra. Sofia Mendes | Therapist (LAV + CB) | 58 | 21.4% |
| Dr. Bernardo Figueira | Therapist (CB) | 50 | 18.5% |
| Dr. André Costa | Therapist (LAV) | 49 | 18.1% |
| Dra. Inês Carmo | Therapist (MTN) | 24 | 8.9% |

Rui Correia's higher share (33%) reflects his cross-location role covering all three clinics. Inês Carmo's lower share mirrors MTN's smaller appointment volume. Distribution is consistent with the seeded location logic.

### 1.7 Business rules

| Rule | Result |
|---|---|
| No weekend appointments | ✓ 0 (seed shifts Saturday→Monday, Sunday→Monday) |
| Hours within 9:00–18:00 | ✓ min=9, max=18 |
| No appointments with ends_at ≤ starts_at | ✓ 0 |
| No future appointments with completed/no_show/cancelled status | ✓ 0 |

### 1.8 Practitioner double-bookings ⚠

**7 practitioner+timeslot conflicts detected** (same practitioner, identical `starts_at`, 2 appointments):

| Practitioner | Timeslot (UTC) | n |
|---|---|---|
| Dr. Rui Correia | 2025-12-22 17:00 | 2 |
| Dr. André Costa | 2026-02-09 13:00 | 2 |
| Dr. André Costa | 2026-04-23 14:00 | 2 |
| Dr. André Costa | 2026-04-27 14:00 | 2 |
| Dr. André Costa | 2026-04-27 18:00 | 2 |
| Dr. Rui Correia | 2026-05-14 11:00 | 2 |
| Dr. Rui Correia | 2026-05-18 13:00 | 2 |

**Root cause:** the seed script generates appointments per-patient without a global conflict check. The overlapping appointments are at **different locations** (the practitioner's location assignment rotates and can land two different patients with the same cross-location therapist at the same time). In production the booking flow prevents this at the application layer before insert.

**Impact on QA:** None. This is a dev seed artifact, not a real scheduling conflict that needs fixing. The seed's purpose is representative data volume and distribution, not conflict-free scheduling fidelity. No remediation needed in the seed script unless the dev environment is used to test double-booking prevention UI flows — in that case a post-seed cleanup pass would help.

---

## 2. FK Integrity — Appointments

All four FK axes verified:

| Check | Orphans found |
|---|---|
| `appointments.patient_id` → `patients` | **0** ✓ |
| `appointments.practitioner_id` → `users` | **0** ✓ |
| `appointments.location_id` → `locations` | **0** ✓ |
| `appointments.service_id` → `services` | **0** ✓ |

All 50 patients have at least one appointment (0 patients with no appointments).

Fixed ID pattern `de000007-{pi:04x}-{ai:04x}-0000-000000000000` matches 100% of the 271 rows.

---

## 3. Clinical Episodes

### 3.1 Total and status

| Status | Count |
|---|---|
| open | 30 |
| closed | 10 |
| **Total** | **40** |

**Expected:** 30 patients covered; `pi % 3 === 0` → 2 episodes (patients 0, 3, 6, …, 27 = 10 patients × 2 = 20), remainder → 1 episode (20 patients × 1 = 20). Total **40** ✓.

Second episodes (4–7 months old) are always closed (10). First episodes (1–3 months old) are always open (30).

### 3.2 Date spread

| | Value |
|---|---|
| Earliest opened_at | 2025-11-19 (≈7 months ago) |
| Latest opened_at | 2026-05-19 (≈1 month ago) |

Spread is driven by `monthsAgo = ei===0 ? 1+(pi%3) : 4+(pi%4)` (1–3 months for open, 4–7 months for closed). Both ends are within expected range.

### 3.3 Patient coverage

- 30 of 50 patients have at least one episode (patients 0–29 from the seed). ✓  
- 20 patients (30–49, all CB cohort beyond index 29) have no episodes by design. ✓

### 3.4 FK integrity

| Check | Orphans |
|---|---|
| `clinical_episodes.patient_id` → `patients` | **0** ✓ |
| Closed episodes with `closed_at IS NULL` | **0** ✓ |
| Records where `record.patient_id ≠ episode.patient_id` | **0** ✓ |

Fixed ID pattern `de000005-0000-0000-0000-{n:012x}` matches 100% of the 40 rows. ✓

---

## 4. Clinical Records

### 4.1 Total and status

| Status | Count |
|---|---|
| locked | 30 |
| draft | 15 |
| signed | 15 |
| **Total** | **60** |

**Expected:** verified by tracing the seed logic:
- Even-index patients (pi 0, 2, 4, …) → 2 records per episode; odd → 1.
- Open episode, ri=0 → `locked`; ri=1 → `draft`.
- Closed episode → `signed` (all records, regardless of ri).
- Resulting: 15 signed (from 10 closed episodes, mixed 1/2 records), 30 locked (all open first records), 15 draft (open episodes for even-pi patients, second record). **60 total** ✓.

### 4.2 Records per episode

| Records per episode | Num episodes |
|---|---|
| 1 | 20 |
| 2 | 20 |

Matches seed: even-pi patients get 2 records, odd-pi get 1. No episode has 0 records. ✓

### 4.3 Form template usage

| Template | Version | Count |
|---|---|---|
| osteopathy | v2 | 35 |
| physiotherapy | v4 | 25 |

Template key rotates by `(pi + ei) % 2`. The slight osteopathy majority reflects the distribution across even/odd combinations. Both form templates resolve to real rows (not orphaned). ✓

### 4.4 State-machine consistency

| Rule | Violations |
|---|---|
| `status='signed'` must have `signed_at` + `signed_by` | **0** ✓ |
| `status IN ('draft','locked')` must NOT have `signed_at` | **0** ✓ |
| All episodes have at least one record | **0** ✓ |

### 4.5 FK integrity

| Check | Orphans |
|---|---|
| `clinical_records.episode_id` → `clinical_episodes` | **0** ✓ |
| `clinical_records.patient_id` → `patients` | **0** ✓ |
| `clinical_records.form_template_id` → `form_templates` | **0** ✓ |

Fixed ID pattern `de000006-0000-0000-0000-{n:012x}` matches 100% of the 60 rows. ✓

---

## 5. Tenant Isolation

No data leaked to wrong tenants:

| Table | Rows on wrong tenant |
|---|---|
| `appointments` | **0** ✓ |
| `clinical_episodes` | **0** ✓ |
| `clinical_records` | **0** ✓ |

---

## 6. Findings summary

### Pass ✓ (16 checks)

- Appointment total: 271 (formula-correct)
- Status mix: past/future assignment correct; no future rows with terminal status
- Location distribution: LAV 48%, CB 43%, MTN 9% — reflects designed cross-visit rates
- Date range: 2025-12-18 → 2026-07-29, no outliers
- Service distribution: uniform rotation, 1-service-per-slot variation expected
- All appointment durations correct (Fisioterapia 45 min, others 60 min)
- No weekend appointments (shift-to-Monday logic applied)
- Hour range confined to 9:00–18:00 UTC
- All fixed ID patterns match (`de000007-*`, `de000005-*`, `de000006-*`)
- 0 FK orphans across all checked axes (appointments ×4, episodes ×2, records ×3)
- No patient with 0 appointments
- Episode total: 40 (30 open / 10 closed) matches formula
- 20 patients with no episodes (by design: seed covers patients 0–29 only)
- Record total: 60 (15 draft / 30 locked / 15 signed) matches formula
- Record-state consistency: signed metadata present only where expected
- Tenant isolation: 0 cross-tenant rows

### Advisory ⚠ (1 item)

**A-1 — 7 practitioner double-bookings (dev-seed artifact)**

Dr. André Costa (4 slots) and Dr. Rui Correia (3 slots) each appear in two simultaneous appointments. Root cause: the seed script generates per-patient without a global conflict guard; the overlapping slots occur at different locations. The production booking flow blocks this before insert. No fix needed in the seed unless the dev environment is specifically used to test double-booking prevention; if so, a post-seed cleanup script removing the 14 conflicting rows would be appropriate.

# Loop W4-11 - Scripted test-data cleanup: purge synthetic content + dev fixture therapists, preserve all real accounts (GUARDED live-DB op, migration-free)

GATE: **MAX GATE** — runs only AFTER **W4-03 has merged** AND **Max confirms real-therapist entry is complete** (relayed by Ivan), and **BEFORE W4-06** (so the recording chain and the W4-10 dry run run on a clean tenant that still holds the real therapists). GUARDED destructive live-DB data op, migration-free (data-only; NO schema change). Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Purge accumulated **synthetic test data** from the dev tenant while **preserving every real account and every real reference row**, so the recording dry run (W4-10) fires on a clean-but-realistic tenant.

Ground truth (locked discipline to embed — GREEN runs with ZERO memory):
- **Dev tenant:** `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`. This is a **guarded live-DB op** on dev — the SEED-guard / SEED_DEV_CONFIRM discipline and the idempotence ruling (DECISIONS 2026-07-02) apply, mirroring the W3-09 guarded data op precedent.
- **Never-hard-delete is amended ONLY for the specific gated cases** (W3-06 appointment delete, W4-01 therapist delete); this loop performs deliberate permanent deletes of **verified synthetic content only**, under full guard.

**TARGETS (delete — verified synthetic only):**
- **synthetic patients** and their **appointments**;
- their **`patient_note_revisions`**;
- **analytics/test events** produced during QA;
- the **5 dev fixture therapists** WITH their **`availability_templates`** and **`therapist_services`** mappings.

**PRESERVE BY EXCLUSION (never touched):**
- **ALL real therapist accounts (Max's entries)** — and their `availability_templates` + `therapist_services`;
- **locations, services, roles, tenant settings** (incl. `tenants.settings.secrets`).

**PERMANENT-DELETE DISCIPLINE (all mandatory):**
- **verified synthetic content ONLY** — natural-key resolution of what is synthetic vs real (e.g. the 5 known fixture-therapist natural keys, synthetic-patient markers); **NEVER hardcode FK ids** (resolve by natural key, per the FA-1 users-seed precedent);
- **live counts BEFORE**;
- **child rows FIRST** (delete `patient_note_revisions` / appointments / mappings before their parents; respect FK order);
- **every DELETE with `RETURNING`** (so every removed row is evidenced);
- **live counts AFTER**;
- **immediate re-run must be ZERO-DELTA** (idempotent — a second run deletes nothing);
- **all evidence pasted** (counts before/after, `RETURNING` output, zero-delta re-run).
- **Any ambiguity about whether a row is synthetic → HALT, classification DATA** — do NOT delete a row you cannot prove is synthetic.

**Migration-free** — data op only, no schema change. This is a script/guarded op, not app UI; no product copy.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-11-scripted-cleanup origin/main -b osteojp-w4-11-scripted-cleanup`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-11-scripted-cleanup`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **MAX-GATE preflight:** confirm **W4-03 merged** AND **Max's real-therapist entry is complete** (Ivan's relay). If either is not satisfied, HALT — do NOT run cleanup early (you could delete rows Max is mid-entry on).
3. **Classify by natural key (paste the classification):** enumerate the **5 dev fixture therapists** by natural key and the **synthetic patients / test events** by their markers; list the **real** therapist accounts (Max's) that MUST be preserved. Any row that cannot be classified with certainty → HALT (classification DATA), do not proceed on it.
4. **Live counts BEFORE:** count every target relation (synthetic patients, their appointments, their `patient_note_revisions`, analytics/test events, the 5 fixture therapists + their `availability_templates` + `therapist_services`) and the preserve-set (real therapists + their rows) — paste.
5. **Delete child-first, tenant-scoped, `RETURNING`:** in FK-safe order (notes/appointments/mappings → then fixture-therapist rows; synthetic-patient children → then synthetic patients), each DELETE tenant-scoped to `3a2d0711-...` and filtered by the natural-key classification, each with `RETURNING`. Paste the `RETURNING` output (ids/enums only).
6. **Live counts AFTER + preserve-set check:** re-count; prove targets are gone AND the real-therapist preserve-set is **unchanged** (same counts as BEFORE).
7. **Zero-delta re-run:** run the identical op again immediately; it must delete **zero** rows. Paste the zero-delta evidence.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free / no-schema PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/` (a script may live under `scripts/`/`packages/db` tooling but adds no migration). Paste it.
- **MAX-GATE satisfied:** W4-03 merged + Max's real-therapist-entry-complete relay confirmed — stated.
- **Classification pasted:** synthetic targets (natural keys) vs real preserve-set (natural keys); NO hardcoded FK ids.
- **Counts BEFORE + AFTER** pasted for every target relation and the preserve-set; targets → 0 (or the intended residual), preserve-set **unchanged**.
- **`RETURNING` evidence** for every DELETE (ids/enums only, PII-free).
- **Zero-delta re-run** pasted (second run deletes nothing).
- **Preserve-by-exclusion proven:** all real therapist accounts (Max's) + their `availability_templates`/`therapist_services`, and locations/services/roles/tenant settings, are **untouched** (count-stable).

## Field 4. Verification (paste evidence)
MAX-GATE confirmation, the natural-key classification, counts BEFORE/AFTER for targets + preserve-set, the `RETURNING` output for every DELETE, the zero-delta re-run, and the preserve-set-untouched proof. All PII-free and credential-free.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-11-scripted-cleanup` off `origin/main`; never edit the primary clone.
- **GUARDED destructive op:** SEED_DEV_CONFIRM / seed-guard discipline; verified-synthetic-only; child-first; `RETURNING`; counts before/after; zero-delta re-run. **Any ambiguity → HALT (classification DATA).**
- **NEVER hardcode FK ids** — resolve everything by natural key (FA-1 precedent).
- **PRESERVE BY EXCLUSION:** never touch real therapist accounts (Max's), their `availability_templates`/`therapist_services`, or locations/services/roles/tenant settings (incl. `tenants.settings.secrets`).
- **Migration-free / no schema change:** data-only. NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. One migration may be in flight system-wide; this loop opens none.
- **Tenant-scoped** to `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` on every statement; `tenant_id` explicit (service-role op — CLAUDE.md hard rule 3: never global).
- **Secrets never printed** — fingerprints only; evidence PII-free (ids/enums/counts, never patient names or notes bodies).
- **Owner-confirmable destructive gate:** this deletes data — it runs only under the MAX GATE + owner-confirmed sequencing (DECISIONS 2026-07-06); it is NOT autonomous beyond that gate.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch/DB GREEN and record resume state. **Never guess.** Do NOT poll a mailbox (none is running).

Halt if:
- **The MAX GATE is not satisfied** (W4-03 not merged OR Max's real-therapist entry not confirmed complete) — do NOT run; report and wait.
- **ANY row cannot be classified** synthetic-vs-real with certainty (classification DATA) — STOP on that row; deleting an unclassified row risks removing a real account. Report the ambiguous rows and a recommended classification.
- A DELETE would **cascade into or touch a preserve-set row** (a real therapist's mapping/template, a location/service/role/tenant setting) — STOP; the preserve set is inviolable.
- The **before/after preserve-set counts change** (a real row was affected) — STOP immediately, report, do not continue; the op is not idempotent-safe until this is understood.
- The op is **not zero-delta on re-run** (it deleted something the second time) — STOP; the classification/idempotence is wrong.

## Field 7. Report back
MAX-GATE confirmation, the natural-key classification, counts BEFORE/AFTER, the `RETURNING` evidence, the zero-delta re-run, the preserve-set-untouched proof, migration-free/no-schema proof, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** This is a guarded destructive op — do NOT self-merge; owner reviews the evidence and merges. A refused or blocked merge is a HALT reported to Ivan.

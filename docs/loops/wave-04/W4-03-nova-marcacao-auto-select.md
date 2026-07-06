# Loop W4-03 - Nova marcação: Serviço auto-fill broken for W4-01-created primary mappings (defect fix, recon-first, migration-free)

GATE: none. FIRST in the Wave 04 authoring queue (owner QA 2026-07-06 defect). UI + server, migration-free. Recon-first: the fix is unknown until recon; do NOT assume a hypothesis. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
A booking defect surfaced in owner QA on 2026-07-06: **selecting a therapist in Nova marcação does NOT auto-fill Serviço** for a therapist whose primary service was assigned via the W4-01 (#480) dropdown.

Ground truth (locked mechanisms to embed — GREEN runs with ZERO memory; do not assume anything not written here):
- **`therapist_services` (migration 0023)** — tenant-scoped join `(id, tenant_id, therapist_user_id → users.id, service_id → services.id, created_at)`, UNIQUE `(tenant_id, therapist_user_id, service_id)`. **NO-GRANT append pattern**: SELECT / INSERT / DELETE only; **UPDATE THROWS SQLSTATE 42501**. A mapping is add/remove, never edit-in-place.
- **"Primary service" = the EARLIEST-CREATED mapping** for that therapist (`ORDER BY created_at ASC`, tie-break by id) — the representation W3-04 (#471) established with no schema change.
- **W3-03 (#470) built the booking auto-fill:** in **Nova marcação**, selecting a Terapeuta auto-fills the **Serviço** field from that therapist's mapped service ordered `created_at ASC` (i.e. the primary), editable override honored.
- **W4-01 (#480) changed mapping writes:** re-designation / first-assignment now goes through a **single delete+insert path with `clock_timestamp()` ordering** (so the chosen service becomes the earliest-created row). This is the write path that owner QA exercised: assigning `fisioterapia` to real therapist **Tiago Reis** via the W4-01 Equipa dropdown.
- **The defect (owner QA 2026-07-06):** after assigning `fisioterapia` to Tiago Reis via the W4-01 dropdown, selecting Tiago Reis in **Nova marcação** does **NOT** auto-fill Serviço. The read (W3-03) and the write (W4-01) disagree for W4-01-created mappings.

**RECON DETERMINES THE FIX — do not pre-commit to a hypothesis.** Candidate hypotheses to prove or rule out with evidence:
- **(a)** booking reads a **stale source** (e.g. a cached options payload, or a read path that predates W4-01's write shape);
- **(b)** the **therapist-selection event does not re-trigger** the auto-fill for W4-01-created mappings (event wiring / effect dependency gap);
- **(c)** the **W4-01 write shape diverges** from what the W3-03 read expects (e.g. `clock_timestamp()` vs `created_at` ordering, or a differing `created_at` precision / tie-break) so the "earliest" row the read picks is not the intended primary.

**SECOND-COMPONENT-PATH RULE (mandatory — same failure class as W3-01 estado and W4-02 picker):** recon **ALL** paths that render/derive the Serviço field, not just Nova marcação. Known/likely surfaces to check (confirm and extend in recon):
- **Nova marcação** (the confirmed offender);
- **Agendar lote** (the batch drawer's therapist→service auto-select, W2-10/W2-02);
- **batch rebook** (the failure-dialog inline rebook path, W2-05/W3-02);
- **patient "schedule-again"** clone (W2/#442, `schedule-again-clone`).
Fix **every affected path**, not the first one found.

**LIVE-DATA CAUTION:** real therapist accounts (Max's entries, incl. **Tiago Reis**) exist on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`. **Never modify or delete a real account, its `availability_templates`, or its `therapist_services` rows.** Reproduce and verify against a **real-therapist-shaped fixture on the E2E seed tenant** (the W4-01 precedent), NOT against Tiago Reis.

All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). **Migration-free.** All build/verify work is **synthetic-data-only** (real-data go-live is separately gated, owner ruling 2026-07-06).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-03-nova-marcacao-auto-select origin/main -b osteojp-w4-03-nova-marcacao-auto-select`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-03-nova-marcacao-auto-select`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Reproduce FIRST on a fixture (paste evidence):** on the **E2E seed tenant**, create/verify a therapist-shaped fixture with a primary mapping written via the **W4-01 delete+insert path** (not a hand-seeded row), then confirm Nova marcação fails to auto-fill Serviço — i.e. reproduce the QA defect against synthetic data. If it does NOT reproduce this way, recon why (the write path or seed differs) before proceeding.
3. **Recon, report BEFORE fixing (paste paths + the proven hypothesis):**
   - The W3-03 read path: exactly how Serviço is defaulted on therapist selection, which query/action supplies the therapist's primary, and the ordering it uses (`created_at ASC` vs anything else).
   - The W4-01 write path: how the delete+insert assigns `created_at` / `clock_timestamp()`, and whether the resulting earliest row matches what the read selects.
   - **Recon ALL four (or more) Serviço-rendering paths** (Nova marcação, Agendar lote, batch rebook, schedule-again) — state for each whether it shares the read helper or has its own, and whether it is affected.
   - State which hypothesis (a/b/c or a combination) the evidence proves, with the deciding artifact (query result, event trace, or diffed write/read ordering).
4. **Fix every affected path** per the proven root cause — a shared read helper fixed ONCE so all mount sites inherit it if they share it, or each divergent path fixed with a note on why it diverges. Do NOT introduce an `UPDATE` to `therapist_services` (42501); if the root cause is a write-shape mismatch, the fix is on the read/ordering or the write's `created_at` assignment WITHOUT an UPDATE. **Migration-free** — no schema change.
5. **Tests:**
   - a therapist with a W4-01-written primary → Nova marcação auto-fills Serviço, editable override intact and honored on submit;
   - regression coverage on the other booking paths (Agendar lote, batch rebook, schedule-again) proving each auto-fills the primary too;
   - a value/ordering test proving the read selects the same row the W4-01 write intends as primary.
6. **Full gates for the touched booking views:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the Nova marcação therapist→Serviço auto-fill (plus one other affected path).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Reproduction pasted:** the defect reproduced on a W4-01-written fixture on the E2E seed tenant (synthetic), BEFORE the fix.
- **Recon report pasted:** read path + write path + the proven hypothesis (deciding artifact) + the all-paths audit (which of Nova marcação / Agendar lote / batch rebook / schedule-again were affected).
- **Auto-fill restored:** selecting a therapist with a W4-01-written primary in Nova marcação auto-fills Serviço; override editable + honored. Paste the test + e2e summary.
- **Every affected path fixed:** paste per-path regression evidence (not just Nova marcação).
- **No UPDATE against `therapist_services`:** the fix issues no UPDATE (respects the 0023 42501 mechanism) — state so and show the fix is read/ordering-side.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated at Wave 03 close (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Reproduction on the synthetic fixture, recon report with the proven hypothesis, migration-free `git diff --name-only origin/main`, Nova marcação auto-fill test, per-path regression evidence for the other booking surfaces, the ordering/round-trip test, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-03-nova-marcacao-auto-select` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. No `UPDATE` to `therapist_services` (42501). **One migration may be in flight system-wide; this loop opens none.** Any proven schema-change need is a **HALT** (Field 6).
- **LIVE-DATA CAUTION:** never modify or delete real therapist accounts (Max's entries, incl. Tiago Reis), their `availability_templates`, or their `therapist_services` rows on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`. Reproduce/verify against a real-therapist-shaped fixture on the **E2E seed tenant** only.
- **Synthetic-data-only** for all build and verify work (real-data go-live is separately gated, owner ruling 2026-07-06).
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **Secrets never printed** — fingerprints only if any credential surfaces (none should here).
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state in the report. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- The defect **cannot be reproduced** against a W4-01-written fixture on the E2E seed tenant (means the root cause is data-specific to Tiago Reis / the real tenant, which you must NOT mutate) — report the reproduction gap and recommend a default (e.g. inspect the real row's shape READ-ONLY vs the fixture).
- The root cause **requires a schema change or an `UPDATE` to `therapist_services`** to fix — STOP; this loop is migration-free and 0023 is UPDATE-forbidden. Surface the blast radius and recommend.
- The read/write divergence turns out to be in a **shared `packages/ui`/`packages/db` primitive** whose change ripples beyond booking auto-fill — surface the ripple, do not proceed.
- Fixing one booking path would **break another shared path** (the batch/lote drawer shares sub-components) — surface the shared-component blast radius.

## Field 7. Report back
Reproduction evidence, recon report with proven hypothesis + all-paths audit, the fix per affected path, the auto-fill + regression + ordering tests, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.

# Loop W4-10 - First end-to-end test fire: synthetic patient, real recorder, full pipeline, André confirms token exposure (recording chain step 5, migration-free)

GATE: depends on **W4-09 merged** (the fire path exists) AND **W4-11 completed** (cleanup ran, so the dry run fires on a clean dev tenant that still holds the real therapist accounts). LAST in the recording chain. Backend/manual dry-run lane, migration-free. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Fire the **whole pipeline once, end to end** — record → sign → PUT → presigned GET → M1 webhook — and confirm a draft lands in the review queue AND that André can map `audio_filename` in Make.

Ground truth (locked rulings from DECISIONS 2026-07-06 + SPEC-ai-recording.md — GREEN runs with ZERO memory):
- **Patient:** a **synthetic quick-created** patient (W4-06). NOT a real patient.
- **`doctor_id`:** a **real therapist account** used **READ-ONLY** as the `doctor_id` value — **zero mutation** of the account. (The pipeline references the id; it does not write to the therapist row.) LIVE-DATA CAUTION applies: never modify the real account, its `availability_templates`, or `therapist_services`.
- **Audio source (owner ruling 2026-07-06):** the **laptop microphone** or a **generated `webm`/opus file** (opus, 32 kbps, mono per SPEC) is acceptable for this first fire. The Jabra Speak 510 is **not a blocker**; a **Jabra re-test is a follow-up**, not part of this loop's DoD.
- **Must carry `x-make-apikey` AND `audio_filename`:** André needs one real fire so **Make exposes `audio_filename` as a mappable token for his module-26 remap**. A fire without these two is not a valid first fire.
- **Ingestion landing (CLAUDE.md rule 4):** AI-ingested content never lands `locked`/`signed`; it enters the `ai_review_state` queue as **`pending_review`** via the **existing HMAC ingestion endpoint** for a human to accept. The dry run's machine DoD is a **draft in `pending_review`**, DB-verified.

**Scope:** perform the single end-to-end fire against synthetic data, verify the draft lands `pending_review` in the DB, and coordinate with André to confirm receipt + `audio_filename` token exposure. This loop is a **dry run**; it may add only the small glue/fixtures needed to fire (no schema). **Migration-free.**

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-10-first-test-fire-e2e origin/main -b osteojp-w4-10-first-test-fire-e2e`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-10-first-test-fire-e2e`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Preflight (paste, credential-free):** confirm W4-09 merged and W4-11 cleanup completed (clean dev tenant, real therapists preserved); confirm the M1 webhook URL + `x-make-apikey` env + the scoped AWS key env are present (NAMES only, values redacted); confirm the HMAC ingestion endpoint that produces `pending_review` drafts.
3. **Prepare the fire inputs:** a **synthetic** quick-created patient (`patient_id`); a **real therapist id** as `doctor_id` (READ-ONLY — no write); an audio blob from the **laptop mic OR a generated `webm`/opus** (opus/32k/mono); machine-stamped `consultation_started_at`/`consultation_ended_at`.
4. **Fire end to end ONCE:** record/supply blob → sign PUT → direct-to-S3 PUT → presigned GET (1h) → M1 webhook fire carrying the full contract + **`x-make-apikey`** + **`audio_filename`**.
5. **Machine DoD:** verify the draft lands **`pending_review`** in the DB via the existing HMAC ingestion endpoint; paste DB evidence (ids/enums only, **no PII, no secrets**).
6. **External DoD (André):** André confirms receipt of the fire and that **`audio_filename` is now exposed as a mappable token** in Make (module-26 remap). This is relayed by Ivan.
7. **Gates for any glue added:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (and `test:e2e` if any user-facing glue changed). If the loop adds no product code (pure dry run), state that and run the gates that apply.

## Field 3. Definition of done (machine-verifiable — TWO parts)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **DoD part 1 (MACHINE):** a **draft lands `pending_review`** via the existing HMAC ingestion endpoint after the end-to-end fire. Paste the **DB evidence** (row id + `ai_review_state = pending_review` + correlating ids), **PII-free and credential-free** (presigned-URL token truncated, no key, no patient name).
- **`x-make-apikey` + `audio_filename` carried:** state + show (redacted) that the real fire included both — the whole point of the first fire (André's module-26 token exposure).
- **Real therapist account untouched:** state + prove the `doctor_id` therapist row (and its `availability_templates`/`therapist_services`) was **read-only** — a before/after check shows zero mutation.
- **DoD part 2 (EXTERNAL):** André confirms receipt + `audio_filename` token exposure, **relayed by Ivan**. GREEN files an **AWAITING-EXTERNAL mailbox note** and the loop **closes on the relay** (does not block indefinitely on André).
- **Suite/gate status** pasted for any glue added (or a statement that no product code changed).

## Field 4. Verification (paste evidence)
Preflight (env names redacted), migration-free `git diff --name-only origin/main`, the redacted end-to-end fire trace, the **`pending_review` DB evidence** (PII-free, credential-free), the both-headers-carried proof, the real-therapist-untouched before/after check, the AWAITING-EXTERNAL note for André's confirmation, and any gate results.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-10-first-test-fire-e2e` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Dry-run glue/fixtures only. Any proven schema need is a HALT. One migration may be in flight system-wide; this loop opens none.
- **Synthetic patient only** (real-data go-live separately gated, owner ruling 2026-07-06). The **`doctor_id` is a real therapist id used READ-ONLY** — **LIVE-DATA CAUTION: zero mutation** of the real account, its `availability_templates`, or `therapist_services` on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`. Verify against the E2E seed tenant where possible; the read-only real id use is the sole real-data touch and it must not write.
- **Audio source:** laptop mic or generated `webm`/opus is acceptable for the first fire; **Jabra re-test is a follow-up**, not a blocker (owner ruling). Do not block the fire waiting on the Jabra.
- **Secrets NEVER printed / logged / committed:** `x-make-apikey`, the AWS key, and the HMAC secret live in vault/env; all evidence is redacted (key absent, presigned-URL token truncated). A missing env var → QUESTIONS + block, never stub/hardcode.
- **PII-free evidence:** DB proof shows ids/enums/timestamps only — never a patient name or notes body (CLAUDE.md rule 7).
- **Fire ONCE** for the dry run (idempotency key protects re-fires, but this is a single deliberate fire); do not spray fires at André's endpoint.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- pt-PT for any user-facing copy, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record resume state. **Never guess a product decision.** Do NOT poll a mailbox for a product decision (the AWAITING-EXTERNAL André note is a close-out relay, not a decision poll).

Halt if:
- **W4-09 or W4-11 is not complete** (the fire path or the clean-tenant precondition is missing) — report the missing dependency.
- The draft **does not land `pending_review`** after the fire (pipeline breaks somewhere) — report where it broke with the redacted trace; do NOT patch by hand-inserting a DB row.
- Firing would require **writing to the real therapist account** (not just reading its id) — STOP; the real account is read-only.
- A required env var/secret (`x-make-apikey`, AWS key, HMAC secret, webhook URL) is **missing** — QUESTIONS + block; never stub/hardcode.
- André's endpoint **rejects the contract** or `audio_filename` does not expose as a token — surface it as the external coordination item; the machine DoD (part 1) may still pass, part 2 stays AWAITING-EXTERNAL.

## Field 7. Report back
Preflight, the end-to-end fire trace (redacted), the **`pending_review` DB evidence** (PII-free, credential-free), the both-headers-carried + real-therapist-untouched proofs, the AWAITING-EXTERNAL André note, migration-free proof, any gate results, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Machine DoD (part 1) closes on merge; external DoD (part 2) closes on Ivan's relay of André's confirmation. Do NOT self-merge. A refused or blocked merge is a HALT reported to Ivan.

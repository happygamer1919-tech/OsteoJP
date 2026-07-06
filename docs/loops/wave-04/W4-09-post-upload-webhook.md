# Loop W4-09 - Post-upload webhook: presigned GET + fire the M1 webhook with x-make-apikey (recording chain step 4, migration-free)

GATE: depends on **W4-08 merged** (the object is in the bucket to reference). Backend lane, migration-free. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
After the audio lands in `osteojp-audio-intake` (W4-08), the backend generates a **presigned GET** and **fires the M1 webhook** with the full contract plus the API-key header, so André's pipeline can pull the audio and process it.

Ground truth (locked contract from SPEC-ai-recording.md + DECISIONS 2026-07-06 — GREEN runs with ZERO memory):
- **Presigned GET:** signed by the OsteoJP backend with the scoped key (`s3:GetObject` on `osteojp-audio-intake`), **1h expiry**.
- **M1 webhook contract fields:** `audio_url` (the presigned GET, 1h), `audio_filename` (e.g. `consultation.webm`), `patient_id`, `doctor_id`, `consultation_started_at`, `consultation_ended_at`, and the template `osteopathy`.
- **API-key header:** **`x-make-apikey`** (lowercase) on **every** fire. The key lives in **vault/env ONLY — never in chat, never in code, never committed**.
- **`audio_filename` matters downstream:** it is the token André maps in Make (module 26 remap). It must be present and correct in the fire.
- **Timestamps come from W4-07** machine-stamps (they feed the idempotency key); this loop forwards them, does not re-derive them by hand.

**Scope:** a backend step that, for a completed upload, generates the presigned GET and POSTs the M1 webhook with the full contract + `x-make-apikey`, handling success/failure. **Key read from env only; never printed.** This loop **fires** the webhook; the first real end-to-end fire with André in the loop is **W4-10**.

**Migration-free** — backend fire wiring; no schema. All copy **pt-PT via i18n keys** where user-facing, no hardcoded strings, no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-09-post-upload-webhook origin/main -b osteojp-w4-09-post-upload-webhook`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-09-post-upload-webhook`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building (paste paths + env NAMES only):** the env var NAMES for the M1 webhook URL and the `x-make-apikey` value (values redacted); the W4-08 signer to reuse for the presigned GET; where the upload-complete signal originates (so the fire triggers after a confirmed PUT).
3. **Presigned GET:** reuse the W4-08 signer to produce a **1h** presigned GET for the uploaded object (scoped `s3:GetObject`, `osteojp-audio-intake`).
4. **Fire the M1 webhook:** POST the full contract — `audio_url` (the 1h GET), `audio_filename`, `patient_id`, `doctor_id`, `consultation_started_at`, `consultation_ended_at`, template `osteopathy` — with header **`x-make-apikey`** read from env. Handle non-2xx (retry/log per the SPEC; surface a pt-PT error if user-facing).
5. **Tests:**
   - the fired payload contains **all** contract fields with correct shapes (`audio_filename` present; `audio_url` is a presigned GET; timestamps forwarded from the recording, not hand-set);
   - the `x-make-apikey` header is attached and read **from env**, and is **never logged/returned** (assert no secret in logs or response);
   - a non-2xx webhook response is handled (does not crash; logged/surfaced per SPEC).
6. **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the upload-complete→GET→fire path (webhook endpoint mocked).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** env NAMES (redacted), the reused signer, the upload-complete trigger.
- **A fire returns success with ALL contract fields present:** paste the payload shape **redacted** — no `x-make-apikey` value, presigned-URL token TRUNCATED. Every field (`audio_url`, `audio_filename`, `patient_id`, `doctor_id`, `consultation_started_at`, `consultation_ended_at`, template `osteopathy`) shown present.
- **`x-make-apikey` from env, never logged:** state + prove the header is set from env and absent from logs/response.
- **`audio_filename` present + correct** (the André-mappable token): shown in the payload.
- **No secret in the diff/logs:** grep → zero literal key/token.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report (env names redacted), migration-free `git diff --name-only origin/main`, the redacted successful-fire payload (all fields present, key absent, URL token truncated), the header-from-env / never-logged proof, the non-2xx handling test, the no-secret grep, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-09-post-upload-webhook` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Backend fire wiring only. Any proven schema need is a HALT. One migration may be in flight system-wide; this loop opens none.
- **Secrets NEVER printed / in code / committed / logged:** `x-make-apikey` and the AWS key live in vault/env; read at runtime; evidence is redacted (key absent, presigned-URL token truncated). A missing env var → QUESTIONS + block, never stub/hardcode (CLAUDE.md).
- **Presigned GET is 1h expiry**, scoped `GetObject` on the one bucket — do not broaden scope or expiry.
- **`audio_filename` must be present** (André's module-26 mappable token) — the fire is incomplete without it.
- **Synthetic-data-only** for build + verify (real-data go-live separately gated, owner ruling 2026-07-06). **LIVE-DATA CAUTION:** never fire a webhook carrying a real patient's data on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`; synthetic context only (the real end-to-end fire is W4-10, still synthetic patient).
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- pt-PT via i18n keys for user-facing copy, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- The **M1 webhook URL or `x-make-apikey` env var is missing** — log to QUESTIONS, block; never stub/hardcode (CLAUDE.md).
- A contract field cannot be populated from upstream (e.g. `audio_filename` not carried through W4-07/W4-08, or a timestamp missing) — surface the gap; do NOT hand-fabricate a value that would corrupt the idempotency key.
- The webhook requires a **request shape that conflicts** with `SPEC-ai-recording.md` (e.g. André's endpoint expects a different field set) — surface the conflict and recommend a reconciliation with the SPEC before firing for real (W4-10).
- Firing needs a **net-new dependency** (HTTP client not already present) — owner-confirmable; log a QUESTION with a default.

## Field 7. Report back
Recon report (env names redacted), the presigned-GET + M1-webhook fire, the redacted successful-fire payload (all fields, key absent, token truncated), the header-from-env/never-logged + non-2xx-handling tests, the no-secret grep, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge. A refused or blocked merge is a HALT reported to Ivan.

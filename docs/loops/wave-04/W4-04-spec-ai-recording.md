# Loop W4-04 - Author SPEC-ai-recording.md (spec only, ZERO code, committed before any recording build loop)

GATE: none for authoring. SPEC-ONLY lane, migration-free, zero product code. Must be MERGED before the recording build chain (W4-06 → W4-10) consumes it. Runs in parallel with any one in-flight migration (touches no `packages/db`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Deliverable: **`docs/design/SPEC-ai-recording.md`** — the design source of truth for the Wave 04 AI-recording pipeline. Follow the existing SPEC naming + header precedent (`docs/design/SPEC-<kebab>.md`, e.g. `SPEC-sms-confirmation.md`: a `# SPEC — <title>` heading and a `> **STATUS: SPEC ONLY — NO BUILD THIS LOOP.**` banner). **No product code, no dependency, no route, no schema change, no env/secret** in this loop.

Ground truth (locked infra + product rulings to embed — GREEN runs with ZERO memory):
- Infra spine (DECISIONS 2026-07-06 "AI recording infrastructure"): bucket `osteojp-audio-intake` on André's AWS, **eu-central-1**; vault-delivered scoped IAM key limited to **`s3:PutObject` + `s3:GetObject` on that bucket only**; the OsteoJP backend signs BOTH presigned PUT and presigned GET; direct-to-S3 upload from the client, **never proxied through a Vercel/Next.js route** (CLAUDE.md signed-URL rule + 4.5 MB Vercel body limit); M1 webhook gains **API-key auth**; the contract adds an **`audio_filename`** field.
- Consent (DECISIONS 2026-07-06 "AI recording consent", JP): a **consent checkbox** gates Record; store **actor + timestamp**, minimum-viable (candidate home: `audit_log`, PII-free per CLAUDE.md rule 7).
- Stub patient (DECISIONS 2026-07-06 "visitor stub retention", JP): quick-create at record time, **name required, phone optional**; identity data **human-entered only** (AI never fills identity); 0029 trigger numbers on NULL.
- Clinical lifecycle (CLAUDE.md rule 4): AI ingestion never produces a `locked`/`signed` record directly; it lands in the `ai_review_state` queue (`pending_review`) for human acceptance.

**The SPEC MUST cover, in full:**
- **M1 webhook contract fields:** `audio_url` (presigned GET, **1h expiry**), `audio_filename` (e.g. `consultation.webm`), `patient_id`, `doctor_id`, `consultation_started_at`, `consultation_ended_at`, and the template `osteopathy`.
- **API key header:** `x-make-apikey` (lowercase), sent on **every** webhook fire. **Key lives in vault/env only — never in chat, never in code.**
- **Recording config:** `MediaRecorder` **`webm`/opus, 32 kbps, mono**. Rationale to state explicitly: Azure Whisper **25 MB cap**; ~**14.4 MB/hour** at this bitrate; a **90-minute** session fits under the cap.
- **Chrome-only gate:** deterministic audio format → **Chrome-only**, with a **pt-PT block message** for non-Chrome browsers.
- **Timestamps:** **Record** stamps `consultation_started_at`; **Stop** stamps `consultation_ended_at`. **Never hand-typed** — machine-stamped, because they feed the **idempotency key** for ingestion.
- **Upload path:** the browser **PUTs direct to S3 via the presigned URL**, **NEVER** through a Vercel API route (4.5 MB body limit).
- **Quick-create stub rule:** `patient_id` **must exist before Record** (stub created first, real id returned).
- **Consent:** a **consent checkbox before Record**, storing **actor + timestamp**.
- **Identity vs clinical split:** identity data is **human-entered only**; the AI fills the **twelve clinical fields** (name the split explicitly; the twelve clinical fields are the AI-populated set, identity is never AI-filled).

All copy referenced in the SPEC (block message, consent label) is **pt-PT**. Spec text may be English (design doc), like the existing SPECs; user-facing strings it specifies are pt-PT.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-04-spec-ai-recording origin/main -b osteojp-w4-04-spec-ai-recording`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-04-spec-ai-recording`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon the SPEC precedent:** read `docs/design/SPEC-sms-confirmation.md` (and one other `SPEC-*`) for the heading + STATUS-banner + section structure; mirror it.
3. **Author `docs/design/SPEC-ai-recording.md`** covering EVERY element in Field 1: goal, the full M1 webhook contract table (each field + type + source + the presigned-GET 1h expiry), the `x-make-apikey` header rule (vault-only), the MediaRecorder config + the 25 MB / 14.4 MB-per-hour / 90-min rationale, the Chrome-only gate + pt-PT block message, machine-stamped timestamps feeding the idempotency key, the direct-to-S3 PUT (never via Vercel), the stub-before-Record rule, the consent checkbox (actor + timestamp), and the identity-human / twelve-clinical-fields-AI split. Cross-reference the governing DECISIONS entries and CLAUDE.md rules (4, 7, 8) inline.
4. **Self-check the SPEC against Field 1's checklist** — every bullet present, no secret value written, no code added.

## Field 3. Definition of done (machine-verifiable)
- **Zero-code PROOF:** `git diff --name-only origin/main` shows ONLY `docs/design/SPEC-ai-recording.md` (and, if updated, `docs/design/BACKLOG.md`) — ZERO files under `apps/`, `packages/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Coverage checklist pasted:** each Field 1 element mapped to the SPEC section that covers it (webhook contract incl. 1h GET; `x-make-apikey` vault-only; webm/opus 32 kbps mono + the 25 MB/14.4 MB/90-min rationale; Chrome-only + pt-PT block; machine timestamps → idempotency key; direct-to-S3 never-via-Vercel; stub-before-Record; consent actor+timestamp; identity-human vs twelve-clinical-fields-AI).
- **No secret in the file:** grep the SPEC for any literal key/token value → zero (the `x-make-apikey` VALUE is never written, only the header name and "lives in vault").

## Field 4. Verification (paste evidence)
The zero-code `git diff --name-only origin/main`, the coverage checklist (element → SPEC section), and the no-secret grep result.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-04-spec-ai-recording` off `origin/main`; never edit the primary clone.
- **SPEC ONLY — ZERO CODE:** no product code, no dependency, no route, no Inngest job, no schema change, no env/secret. Docs only.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. One migration may be in flight system-wide; this loop opens none.
- **Secrets never printed:** the `x-make-apikey` value and the scoped IAM key are NEVER written to the SPEC, chat, or code — header name + "vault-delivered" only.
- **Synthetic-data-only** posture is stated in the SPEC (all Wave 04 build + dry-run is synthetic; real-data go-live separately gated, owner ruling 2026-07-06).
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- pt-PT for any user-facing string the SPEC specifies; no emoji.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- Any required contract element is **underspecified or conflicts** with a governing DECISIONS entry (e.g. the webhook field set here disagrees with the 2026-07-06 infra ruling) — surface the conflict and a recommended reconciliation; do NOT invent a value.
- Authoring the SPEC would require **committing a secret value** to satisfy a field — STOP; the value stays in vault, the SPEC names the header only.
- A contract detail (e.g. the exact template identifier, or the twelve clinical field names) is **not derivable** from DECISIONS / CLAUDE.md / the ingestion package and needs an owner or André call — log the question with a recommended default; do not guess.

## Field 7. Report back
The authored SPEC path, the coverage checklist (element → section), the zero-code diff proof, the no-secret grep, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge. A refused or blocked merge is a HALT reported to Ivan.

# Loop W4-08 - Presigned PUT flow: backend signer + direct-to-S3 upload to osteojp-audio-intake (recording chain step 3, migration-free)

GATE: depends on **W4-07 merged** (produces the `webm`/opus blob to upload). Backend signer + client upload lane, migration-free. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Add the backend endpoint that **signs a presigned PUT** so the browser uploads the recorded blob **direct to S3**, never through a Vercel route.

Ground truth (locked infra from DECISIONS 2026-07-06 + SPEC-ai-recording.md — GREEN runs with ZERO memory):
- **Bucket:** `osteojp-audio-intake`, **eu-central-1**, on André's AWS account. EU residency held (audio is processor/sub-processor infra under the signed DPA chain).
- **Scoped IAM key:** the backend signs with the **vault/env-delivered scoped AWS key** limited to **`s3:PutObject` + `s3:GetObject` on `osteojp-audio-intake` only** (no other bucket, no other action). Key comes from **Vercel env vars / vault — NEVER printed, NEVER in code, NEVER committed** (CLAUDE.md environment/secrets rule).
- **Direct-to-S3:** the browser **PUTs direct to S3 via the presigned URL**; the upload **NEVER** proxies through a Vercel/Next.js API route (CLAUDE.md signed-URL rule + the **4.5 MB Vercel body limit** — audio can be ~14.4 MB/hour, far over the limit).
- **CORS is André's side** (his AWS), locked to the EMR origins: **`https://osteojp-platform.vercel.app`, `https://app.osteojp.pt`, `http://localhost:3000`**. The staff app serves **only from `osteojp-platform.vercel.app`** today. CORS config is NOT ours to set; if uploads fail on CORS, that is an André coordination item, not a code fix here.
- **Signing symmetry:** the backend signs BOTH PUT (this loop) and GET (W4-09). This loop signs the **PUT** and proves a subsequent **presigned GET** can read the object back (round-trip proof).

**Scope:** a backend endpoint that returns a **presigned PUT URL** (scoped key, `osteojp-audio-intake`, object key derived server-side — include enough to correlate, e.g. tenant/patient/consultation + a filename like `consultation.webm`), the client uses it to PUT the W4-07 blob direct to S3, and verification does a presigned GET returning 200. **Key never leaves the server; only the presigned URL crosses to the client.**

**Migration-free** — signer + client upload wiring; no schema. All UI copy (errors) **pt-PT via i18n keys**, no hardcoded strings, no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-08-presigned-put-flow origin/main -b osteojp-w4-08-presigned-put-flow`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-08-presigned-put-flow`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building (paste paths + env NAMES only, never values):** the env var NAMES for the scoped AWS key (region, bucket, access key id, secret) as they should be read from Vercel env; where AWS signing belongs (an integrations/backend module — reuse an existing AWS/S3 client if present, else add one scoped to this bucket); confirm W4-07's blob hand-off shape.
3. **Backend PUT signer:** an endpoint/action that, for an authenticated staff user, derives the object key server-side (tenant from JWT — never payload) and returns a **presigned PUT URL** signed with the scoped key (`s3:PutObject` on `osteojp-audio-intake`, eu-central-1). The **key value is never returned** to the client — only the presigned URL and the object key. Set an expiry consistent with the SPEC.
4. **Client direct-to-S3 PUT:** the browser PUTs the W4-07 blob to the presigned URL directly (`fetch`/`PUT`), **not through any Vercel route**. Surface upload errors in pt-PT (incl. a CORS-failure hint pointing to the André coordination item).
5. **Round-trip verification path:** after PUT, obtain a **presigned GET** (this loop may reuse the signer for GET to prove readability) and confirm a **200** fetch of the object. This proves the object landed.
6. **Tests:**
   - the signer returns a presigned PUT URL for the scoped bucket and **does not leak the key** (assert the response contains no secret material — URL + object key only);
   - tenant is derived server-side (a payload-supplied tenant is ignored/rejected);
   - an upload integration test (against a mock/local S3 or a recorded fixture) shows the client PUTs direct (no Vercel-route proxy in the path);
   - a subsequent presigned GET returns 200 for the uploaded object.
7. **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the record→sign→PUT→GET path (S3 mocked as needed).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** env var NAMES (values redacted), the signing module, the W4-07 blob hand-off.
- **A recorded blob uploaded from the browser lands in the bucket:** proven via the **signer response + a subsequent presigned GET returning 200**. Paste the evidence **credential-free** (presigned URL token TRUNCATED; no key printed).
- **Never-via-Vercel proven:** the upload path is direct-to-S3 (state + show the client PUTs to the S3 host, not a Next.js route); note the 4.5 MB body-limit rationale.
- **Key never printed / never in code:** grep the diff for any literal key/secret → zero; the signer reads from env only. State so.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report (env names redacted), migration-free `git diff --name-only origin/main`, the sign→PUT→GET-200 round-trip evidence (credential-free, token truncated), the direct-to-S3 proof, the no-secret-in-diff grep, the tenant-from-JWT test, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-08-presigned-put-flow` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Signer + upload wiring only. Any proven schema need is a HALT. One migration may be in flight system-wide; this loop opens none.
- **Secrets NEVER printed, NEVER in code, NEVER committed:** the scoped AWS key lives in Vercel env / vault; the signer reads it at runtime. Evidence is credential-free (fingerprints/truncated tokens only). A missing env var is logged to QUESTIONS and blocks — never stub/hardcode a key (CLAUDE.md).
- **Direct-to-S3 only:** the audio upload must NEVER pass through a Vercel/Next.js route (4.5 MB limit + signed-URL rule). Only the *signer* (small JSON) is a backend endpoint.
- **Scoped-key discipline:** signing is limited to `PutObject`/`GetObject` on `osteojp-audio-intake`; do not broaden.
- **CORS is André's side** — do not attempt to set bucket CORS; a CORS failure is an André coordination item (surface it), not a code change here.
- **Synthetic-data-only** for build + verify (real-data go-live separately gated, owner ruling 2026-07-06). **LIVE-DATA CAUTION:** never upload audio tied to a real patient/therapist on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`; use synthetic context.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- pt-PT via i18n keys for errors, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- The **scoped AWS key env var(s) are missing** — log to QUESTIONS, block; do NOT stub or hardcode a key (CLAUDE.md secrets rule).
- Direct-to-S3 upload **fails on CORS** (André's bucket not yet configured for our origins) — surface it as the pending André coordination item (supply the exact origins list); do NOT work around it by proxying through Vercel.
- The only way to make the upload work would be to **route audio through a Vercel/Next.js endpoint** (hitting the 4.5 MB limit) — STOP; that violates the infra ruling.
- Signing needs a **broader IAM scope** than `PutObject`/`GetObject` on the one bucket — surface it (the scoped key is deliberate); do not request/assume a wider key.
- Adding an AWS SDK is a **net-new dependency** not already present — that is owner-confirmable; log a QUESTION with a recommended default.

## Field 7. Report back
Recon report (env names redacted), the PUT signer + direct-to-S3 client upload, the sign→PUT→GET-200 round-trip (credential-free), the direct-to-S3 + no-secret proofs, tenant-from-JWT test, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge. A refused or blocked merge is a HALT reported to Ivan.

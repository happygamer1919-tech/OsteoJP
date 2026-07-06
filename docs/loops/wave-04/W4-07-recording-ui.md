# Loop W4-07 - Recording UI: MediaRecorder webm/opus 32 kbps mono, Chrome-only gate, machine-stamped timestamps (recording chain step 2, migration-free)

GATE: depends on **W4-06 merged** (stub patient + consent gate — Record must be reachable only after a valid `patient_id` + consent) AND **`SPEC-ai-recording.md` (W4-04) merged** (the config + timestamp + Chrome-gate contract). UI lane, migration-free. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Build the in-browser recording UI that produces the audio blob the upload chain will PUT to S3. This loop stops at producing the correctly-configured blob + machine-stamped timestamps; **upload (W4-08) and webhook (W4-09) are separate**.

Ground truth (locked contract from SPEC-ai-recording.md + DECISIONS 2026-07-06 — GREEN runs with ZERO memory):
- **Codec/config:** `MediaRecorder` producing **`webm`/opus, 32 kbps, mono**. Rationale (state in code comments): Azure Whisper **25 MB** cap; ~**14.4 MB/hour** at this bitrate; a **90-minute** session fits.
- **Chrome-only gate:** because the audio format must be deterministic, the recorder is **Chrome-only**. Non-Chrome browsers see a **pt-PT block message** and cannot record.
- **Machine-stamped timestamps:** **Record** stamps `consultation_started_at`; **Stop** stamps `consultation_ended_at`. **Never hand-typed** — stamped machine-side, because they feed the ingestion **idempotency key** (SPEC-ai-recording).
- **Reachability:** Record is only reachable after a valid `patient_id` exists and consent is captured (W4-06). This loop consumes that gate; it does not re-implement stub/consent.
- **Upload boundary:** this loop **does not upload**. It yields the blob + the two timestamps + the `patient_id`/`doctor_id` context to hand off to W4-08. (The direct-to-S3 PUT and never-via-Vercel rule are W4-08's.)

**Migration-free** — client recording UI; no schema. All UI copy **pt-PT via i18n keys**, no hardcoded strings, no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-07-recording-ui origin/main -b osteojp-w4-07-recording-ui`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-07-recording-ui`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building (paste paths):** confirm `SPEC-ai-recording.md` is merged and read the exact config/timestamp/gate contract from it; confirm the W4-06 start-consultation gate exposes a valid `patient_id` + consent state that Record consumes; locate where the recording UI mounts in the consultation flow.
3. **Chrome-only gate:** detect Chrome / `MediaRecorder` support for `audio/webm;codecs=opus`; on non-Chrome (or unsupported), render the **pt-PT block message** and disable Record. State the detection method (feature-detect `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')`, not UA-sniff, unless the SPEC dictates otherwise).
4. **Recorder:** `getUserMedia({ audio: ... })` mono, `MediaRecorder` with `mimeType: 'audio/webm;codecs=opus'` and `audioBitsPerSecond: 32000`; **Record** stamps `consultation_started_at` (machine clock), **Stop** stamps `consultation_ended_at` (machine clock); produce a `webm`/opus blob. Release the media stream on stop/unmount.
5. **Hand-off shape:** expose the blob + `consultation_started_at` + `consultation_ended_at` + the `patient_id`/`doctor_id` context for W4-08 to sign+upload. No upload here.
6. **Tests:**
   - the produced blob is `audio/webm;codecs=opus`, mono, at the 32 kbps config (assert the MediaRecorder options / blob type);
   - Record stamps `consultation_started_at` and Stop stamps `consultation_ended_at` **machine-side** (not from any input field), started < ended;
   - non-Chrome / unsupported shows the pt-PT block message and Record is disabled;
   - the media stream is released on stop/unmount.
7. **Full gates for the touched views:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the record→stop flow (MediaRecorder mocked in e2e as needed) + the non-Chrome block.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** SPEC contract read + W4-06 gate consumed + mount location.
- **Blob config proven:** a produced blob is `webm`/opus, mono, 32 kbps (paste the test asserting the MediaRecorder options / blob type).
- **Timestamps machine-stamped:** Record→`consultation_started_at`, Stop→`consultation_ended_at`, neither hand-typed, started < ended (paste the test).
- **Chrome-only gate:** non-Chrome/unsupported renders the pt-PT block message and disables Record (paste the test).
- **Stream released** on stop/unmount (paste the test).
- **No upload in this loop:** state that the blob is handed off, not PUT (W4-08 owns upload); diff shows no S3/signing code.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, the blob-config test, the machine-timestamp test, the non-Chrome block test, the stream-release test, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-07-recording-ui` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Client recording UI only. Any proven schema need is a HALT. One migration may be in flight system-wide; this loop opens none.
- **Config is fixed by SPEC:** webm/opus, 32 kbps, mono, Chrome-only, machine timestamps. Do NOT deviate from `SPEC-ai-recording.md`; a needed deviation is a HALT.
- **No upload here** — this loop must NOT sign or PUT to S3 (that is W4-08). Do not proxy audio through a Vercel route anywhere.
- **Timestamps never hand-typed** — machine-stamped only (they feed the idempotency key).
- **Synthetic-data-only** for build + verify (real-data go-live separately gated, owner ruling 2026-07-06). **LIVE-DATA CAUTION:** never record against a real patient/therapist on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`; use synthetic context.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **Secrets never printed** — fingerprints only.
- pt-PT via i18n keys, no hardcoded strings, no emoji.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- `SPEC-ai-recording.md` (W4-04) or W4-06 is **not merged** — the contract/gate this loop consumes is absent; report the missing dependency.
- The 32 kbps / mono / `audio/webm;codecs=opus` config **cannot be honored by MediaRecorder** in the target Chrome (feature-detect fails) — surface it; do NOT silently pick a different codec/bitrate (it would break the Whisper size budget and the deterministic-format assumption).
- Meeting the config would require a **third-party recording dependency** (net-new vendor) — that is owner-confirmable; log a QUESTION with a recommended default, do not add it.
- A required change forces editing a shared `packages/ui` primitive whose ripple extends beyond recording — surface it.

## Field 7. Report back
Recon report, the recorder + Chrome-gate + machine-timestamp implementation, the blob-config/timestamp/block/stream tests, migration-free proof, e2e summary, suite counts, confirmation that no upload/S3 code was added, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge. A refused or blocked merge is a HALT reported to Ivan.

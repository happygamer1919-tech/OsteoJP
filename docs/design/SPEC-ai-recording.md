# SPEC — AI consultation-recording pipeline

> **STATUS: SPEC ONLY — NO BUILD THIS LOOP.** This document is a design source of
> truth. It adds no product code, no dependency, no route, no Inngest job, no
> schema change, no env/secret. It is the contract the Wave 04 recording build
> chain (W4-06 → W4-10) consumes and MUST be merged before those loops build
> against it. The scoped IAM key and the `x-make-apikey` value live in vault/env
> only and are NEVER written here — this SPEC names headers and env keys, never
> their values.

> **AMENDED 2026-07-06 — André's infra confirmed built and live.** After this SPEC
> merged (#483), André confirmed his AWS side is built and live. This revision folds
> his confirmed terms into the contract the still-QUEUED build chain (W4-06 → W4-10)
> consumes: single dedicated signer (`PutObject`+`GetObject` only, no list/no delete,
> Vercel-env-referenced vault secret); bucket hardening (Block All Public Access ON,
> SSE-S3 — never KMS, 7-day lifecycle auto-delete); **CORS RESOLVED** to exactly three
> origins (`osteojp-api.vercel.app` excluded); `x-make-apikey` from vault key
> `osteojp-m1-webhook-key` (401 on missing/wrong); `audio_filename` read by André's
> transcription module from that field (no longer hardcoded); idempotency key =
> `patient_id` + `consultation_started_at` + `consultation_ended_at`. See DECISIONS
> 2026-07-06 "AI recording spec amended per André's 2026-07-06 confirmation".

Authored by the GREEN runner (W4-04), Wave 04. Aligns with the AI-recording
infrastructure ruling (DECISIONS 2026-07-06 "AI recording infrastructure: bucket,
scoped IAM, CORS, webhook auth"), the consent ruling (DECISIONS 2026-07-06 "AI
recording consent capture", JP), the visitor-stub ruling (DECISIONS 2026-07-06
"Visitor stub patient retention", JP), the clinical two-state-machine rule
(CLAUDE.md rule 4), the PII-free audit rule (CLAUDE.md rule 7), and the EU
data-residency + signed-URL rules (CLAUDE.md rule 8 + "File uploads always go
through signed URLs; never proxy through the Next.js server"). It reuses, and does
not redefine, the existing inbound ingestion contract in
`docs/ai-ingestion/endpoint-contract.md` and the AI-extractable field audit in
`docs/ai-ingestion/ai-extractable-audit.md`.

**Synthetic-data-only posture.** All Wave 04 AI-recording build and the W4-10 dry
run are SYNTHETIC-DATA-ONLY. Real-data go-live is a separately gated step
(pre-real-data gates, DECISIONS 2026-07-01). No real patient or therapist data is
recorded, uploaded, or fired through this pipeline during the build.

## 1. Goal

Let a clinician record a consultation's audio in-browser, upload it directly to
André's AWS audio bucket, and have the post-processing partner (André's Make.com
workflow) transcribe it and return the extracted clinical fields into the OsteoJP
AI review queue as a `pending_review` draft — for human acceptance, never
auto-finalized. The clinician captures **identity** by hand; the AI fills only the
**twelve clinical narrative fields** (§9). This SPEC defines the capture config,
the consent gate, the stub-patient precondition, the machine-stamped timestamps,
the direct-to-S3 upload, and the outbound M1 webhook contract.

## 2. Pipeline overview (end to end)

```
[Clinician] --consent✓--> Record (webm/opus, Chrome)
     |  Record => consultation_started_at (machine)
     |  Stop    => consultation_ended_at   (machine)
     v
[Browser] --presigned PUT--> S3 osteojp-audio-intake (eu-central-1)   ← direct, never via Vercel
     ^  (OsteoJP backend signs the PUT with the scoped IAM key)
     |
[OsteoJP backend] --M1 webhook (x-make-apikey)--> [André Make.com]
        payload: audio_url (presigned GET 1h), audio_filename, patient_id,
                 doctor_id, consultation_started_at/ended_at, template=osteopathy
                                    |
             André transcribes (Azure Whisper) + extracts fields
                                    v
[André] --POST /api/v1/ingestion/clinical-records (HMAC)--> [OsteoJP]
        => clinical_record { record_status=draft, ai_review_state=pending_review }
```

- The **outbound** leg (M1 webhook) is authored in this SPEC (§7).
- The **inbound** leg (draft ingestion) is the EXISTING contract —
  `docs/ai-ingestion/endpoint-contract.md`, endpoint `POST
  /api/v1/ingestion/clinical-records`, HMAC-SHA256 auth (`x-osteojp-signature` +
  `x-osteojp-timestamp`). This SPEC does not redefine it; it is referenced as the
  landing point (§8).

## 3. Recording config (MediaRecorder)

- **Format:** `MediaRecorder` producing **`audio/webm; codecs=opus`**, **32 kbps**,
  **mono** (single channel). Deterministic container/codec is a hard requirement
  for the downstream Whisper step.
- **Size rationale (why these numbers):**
  - Azure Whisper accepts a **25 MB** maximum per file.
  - At 32 kbps mono, audio is ~**14.4 MB per hour** (`32 kbps ÷ 8 = 4 KB/s ×
    3600 s ≈ 14.4 MB/h`).
  - A **90-minute** consultation is ≈ **21.6 MB** — under the 25 MB cap with
    headroom. 90 minutes is therefore the supported single-session ceiling; the
    UI does not need chunk-splitting for a normal consultation.
- **Rendering:** the blob is produced client-side and uploaded direct to S3 (§6).
  It is never posted to a Vercel/Next.js route (4.5 MB body limit; §6).

## 4. Browser gate (Chrome-only) + pt-PT block

- Deterministic `webm/opus` capture is only guaranteed on **Chrome**; the feature
  is **Chrome-only**. Non-Chrome browsers are blocked from recording (the Record
  control is unavailable), not silently degraded.
- Non-Chrome users see a **pt-PT block message** (no emoji, i18n key, per CLAUDE.md
  UI tone). Recommended copy (final string is an i18n key, build-loop):
  > "A gravação de consultas só está disponível no Google Chrome. Abra esta
  > página no Chrome para gravar."
- The gate is a UX affordance, not a security control; the server never trusts the
  client's browser claim for anything.

## 5. Consent gate (before Record)

Per DECISIONS 2026-07-06 "AI recording consent capture" (JP):

- A **consent checkbox** gates the Record action. Recording **cannot start** until
  consent is checked (client-enforced UX + server-enforced at the fire point).
- On consent, store **actor (`actor_user_id`) + timestamp**, minimum-viable — the
  fact, who, and when. No elaborate consent-document workflow this wave.
- **Storage shape is a build-loop decision** (candidate: an `audit_log` entry —
  actor + timestamp + `entity_type`/`entity_id` for the recording — PII-free per
  CLAUDE.md rule 7). This SPEC fixes only "actor + timestamp, minimum-viable,
  gating Record."
- Consent copy is **pt-PT** (i18n key, build-loop). Recommended label:
  > "O paciente consente a gravação áudio desta consulta para apoio clínico."

## 6. Upload — direct-to-S3 presigned PUT (never via Vercel)

Per DECISIONS 2026-07-06 "AI recording infrastructure" + CLAUDE.md ("File uploads
always go through signed URLs; never proxy through the Next.js server"):

- **Bucket:** `osteojp-audio-intake`, **André's AWS**, region **eu-central-1**.
- **Bucket hardening (André-confirmed 2026-07-06, do NOT change):**
  - **Block All Public Access is ON** — the bucket is never public; access is only
    ever via a presigned URL.
  - **Encryption is SSE-S3.** **Never switch the bucket to KMS** — KMS breaks the
    presigned URLs this pipeline depends on.
  - **Lifecycle rule auto-deletes every object at 7 days.** Any presigned GET expiry
    must therefore stay **well under 7 days**; the agreed **1-hour** GET expiry (§7)
    stands with wide margin.
- **Scoped IAM key (one dedicated signer):** vault-delivered, limited to
  **`s3:PutObject` + `s3:GetObject` on `osteojp-audio-intake` only** — **no other
  bucket, no other action, NO list, NO delete.** The secret lives in **vault**,
  **referenced in Vercel env vars only**; never hardcoded or committed. The key value
  never appears in this SPEC, chat, or code.
- **Signing:** the **OsteoJP backend is the ONLY signer**, and it signs **BOTH** the
  presigned PUT (browser upload) and the presigned GET (§7 `audio_url`) with the
  **same key** — same key, both operations. The browser then **PUTs the blob direct
  to S3** using the presigned PUT URL.
- **Never through Vercel:** the audio blob (up to ~21.6 MB) is NEVER posted to a
  Next.js/Vercel route — the Vercel request-body limit is **4.5 MB** and the
  signed-URL rule forbids proxying uploads. Only the small signer request/response
  (URLs, no audio bytes) transits OsteoJP.
- **CORS (RESOLVED, André-confirmed 2026-07-06):** the bucket CORS rule is locked to
  **exactly three** browser-PUT origins:
  - `https://osteojp-platform.vercel.app`
  - `https://app.osteojp.pt`
  - `http://localhost:3000`

  **`osteojp-api.vercel.app` is deliberately EXCLUDED** — no browser PUTs originate
  there. The staff capture page must serve from one of the three allowed origins; if
  it ever serves from another origin, **André must add it first** or uploads fail on
  CORS. CORS config is André's side (his AWS), not ours to set. This supersedes the
  prior PENDING "EMR origins list" coordination item, now CLOSED.
- **EU residency:** eu-central-1 holds EU residency; the audio bucket is
  processor/sub-processor infrastructure under the signed DPA chain (DECISIONS
  2026-07-05), consistent with CLAUDE.md rule 8. No US-region resource stores the
  audio.

## 7. M1 webhook contract (outbound: OsteoJP → André Make.com)

After a successful upload, the OsteoJP backend fires the **M1 webhook** (the
post-processing callback into André's Make.com workflow, module 26). It carries
**API-key auth** on **every** fire — it is no longer unauthenticated.

### 7.1 Auth header

| Header | Value | Notes |
|---|---|---|
| `x-make-apikey` (lowercase) | *(vault key `osteojp-m1-webhook-key`, referenced via env)* | Sent on **every** webhook fire. The **value lives in vault under key `osteojp-m1-webhook-key`** (referenced from env) — never in this SPEC, chat, or code. Only the header **name** and the **vault key name** are specified here, never the value. |

- **Missing or wrong header → `401`** and the audio never enters André's scenario. The
  header is mandatory on every fire (André-confirmed 2026-07-06).
- **All §7.2 payload fields are mandatory on every fire** (André-confirmed 2026-07-06).

### 7.2 Payload fields

| Field | Type | Source | Notes |
|---|---|---|---|
| `audio_url` | string (URL) | OsteoJP backend (presigned GET) | Presigned **GET** for the uploaded object, **1-hour expiry**. Signed with the scoped IAM key. Grants time-boxed read so André can fetch the audio for transcription. |
| `audio_filename` | string | OsteoJP backend | The uploaded object's filename (e.g. `consultation.webm`). **André's transcription module reads the filename from THIS field — it is no longer hardcoded** (André-confirmed 2026-07-06); it is also the **mappable token** André's Make module 26 remaps (DECISIONS 2026-07-06). Must be present and correct on every fire. |
| `patient_id` | uuid | OsteoJP (stub or real) | Must already exist before Record (§8). Human-entered identity, never AI-filled. |
| `doctor_id` | uuid | OsteoJP | The recording clinician's user id. Read-only in the pipeline. |
| `consultation_started_at` | timestamp (UTC, ISO-8601) | **machine** (Record) | Stamped when Record is pressed (§8.1). Never hand-typed. |
| `consultation_ended_at` | timestamp (UTC, ISO-8601) | **machine** (Stop) | Stamped when Stop is pressed (§8.1). Never hand-typed. |
| `template` | string | OsteoJP (fixed) | `osteopathy` — selects the osteopathy extraction template (§9). |

- **`audio_url` expiry is exactly 1 hour** — long enough for André's transcription
  step, short enough to bound exposure of the read grant.
- No clinical data is in the outbound payload — only ids, timestamps, the audio
  read grant, and the template selector. PII is minimal (ids, not names); CLAUDE.md
  rule 7.

## 8. Machine-stamped timestamps → idempotency key

- **`consultation_started_at`** is stamped by the client/backend clock when
  **Record** is pressed; **`consultation_ended_at`** when **Stop** is pressed.
- Both are **machine-stamped, never hand-typed** — they are inputs to the
  **idempotency key** for the eventual inbound ingestion (`endpoint-contract.md`
  §2, `idempotency_key`, unique per `(tenant_id, idempotency_key)`). A hand-typed
  or mutable timestamp would let a re-fire mint a different key and duplicate the
  draft; machine-stamping keeps re-fires idempotent.
- **Idempotency key composition (André-confirmed 2026-07-06, unchanged):**
  `patient_id` + `consultation_started_at` + `consultation_ended_at`. Because two of
  the three components are machine-stamped timestamps, a deterministic re-fire of the
  same consultation reproduces the same key and does not duplicate the draft.
- Stored/compared in **UTC**; displayed in **Europe/Lisbon** (CLAUDE.md date rule).

### 8.1 Stub-patient precondition (`patient_id` must exist before Record)

Per DECISIONS 2026-07-06 "Visitor stub patient retention" (JP):

- A `patient_id` **must exist before Record**. If the visitor is not yet a patient,
  the clinician **quick-creates a stub** first (name **required**, phone
  **optional**); the real id is returned and used as `patient_id`. Record is not
  available until a patient (stub or real) is selected/created.
- **Identity is human-entered ONLY.** The AI never fills identity fields (name,
  phone, NIF, etc.). The 0029 trigger numbers stub patients on NULL (no schema
  change).
- Never-promoted stubs age out at **30 days** via a scheduled cleanup job (Wave 05
  candidate; preserves real/promoted patients and Max's real therapist accounts).
  Out of scope for the recording build.

## 8.2 Landing point (inbound — EXISTING contract, referenced not redefined)

André's Make workflow, after transcription + extraction, POSTs the extracted
fields to the **existing** ingestion endpoint:

- **Endpoint:** `POST /api/v1/ingestion/clinical-records`
  (`docs/ai-ingestion/endpoint-contract.md`).
- **Auth:** HMAC-SHA256 over `${timestamp}.${rawBody}`, headers
  `x-osteojp-signature` + `x-osteojp-timestamp`, 300 s replay window (env
  `AI_INGESTION_HMAC_SECRET`, vault-only). This is a DIFFERENT mechanism from the
  outbound `x-make-apikey` (§7) — inbound is HMAC-body, outbound is API-key header.
- **Result:** a `clinical_record` is created with **`record_status = draft`** and
  **`ai_review_state = pending_review`** (schema `ai_review_state` enum:
  `pending_review` → `in_review` → `approved`/`rejected`). Per **CLAUDE.md rule 4**,
  AI ingestion **never** produces a `locked`/`signed` record directly — a human
  reviewer accepts the payload, after which the record follows the standard
  `record_status` lifecycle. This is the machine-verifiable landing the W4-10 dry
  run asserts (draft lands `pending_review`).

## 9. Identity vs clinical split — the twelve AI-populated fields

The split is explicit and asymmetric:

- **Identity data → human-entered ONLY.** Name, phone, NIF, and every identity
  field are entered by the clinician. The AI never fills identity.
- **Clinical narrative → the AI-populated set = exactly TWELVE fields.** These are
  the `ai_extractable: true` leaves of the **`osteopathy` v2 template**
  (`packages/db/seed/form-templates/osteopathy-v2.json`), reflecting **João
  Pedro's signed-off Group A/B split** (`docs/ai-ingestion/ai-extractable-audit.md`
  §4.1). Narrative free-text the session transcription captures is `true`;
  safety-critical / coded / structured fields stay `false` (27 such fields remain
  human-only). The twelve:

  | # | Field key (osteopathy v2) | pt label |
  |---|---|---|
  | 1 | `consultation_reason` | Motivos da Consulta / Início / Contexto |
  | 2 | `relief_aggravation` | Condições Alívio / Agravamento |
  | 3 | `clinical_history` | Antecedentes Clínicos / Cirurgia / Medicação |
  | 4 | `systems_review.neurological` | Neurológico |
  | 5 | `systems_review.cardiovascular` | Cardiovascular |
  | 6 | `systems_review.respiratory` | Respiratório |
  | 7 | `systems_review.gastrointestinal` | Gastrointestinal |
  | 8 | `systems_review.urological_gynecological` | Urológico / Ginecológico |
  | 9 | `systems_review.endocrine` | Endócrino |
  | 10 | `treatment_objectives` | Objectivos do Tratamento |
  | 11 | `treatment_plan` | Plano de Tratamento |
  | 12 | `observations` | Observações |

- The AI-produced values land as a **`pending_review` draft** (§8.2) and are only
  written into a signable record after human acceptance — never auto-signed.
- **Partner field-mapping (open, André-owed, gates go-live NOT this SPEC):** the
  extractor's output keys → these twelve OsteoJP keys is owed by André
  (`endpoint-contract.md` §7; `docs/ai-ingestion/partner-field-mapping-diff-v0.9.md`;
  ingestion `it.todo` "validates the real AI partner field set — PENDING Andrei's
  field mapping + signed contract"). The **OsteoJP-side target set (these twelve)
  is fixed here**; only the partner's inbound key-remap and per-field validation
  remain to close, and they gate live ingestion, not this SPEC.

## 10. Explicit non-goals (this SPEC / the recording build)

- **No auto-finalize.** The AI never yields a `locked`/`signed` record; human
  acceptance is mandatory (CLAUDE.md rule 4).
- **No merge-patients** flow (roadmap) and **no 30-day stub cleanup** job (Wave 05).
- **No real-data recording.** Build + dry-run are synthetic-only; real-data go-live
  is separately gated.
- **No Jabra dependency.** The W4-10 first fire accepts laptop mic or a generated
  `webm/opus` file; the Jabra Speak 510 re-test is a follow-up, not a blocker
  (DECISIONS 2026-07-06).
- **No secret values.** The scoped IAM key and `x-make-apikey`/HMAC secret live in
  vault/env; this SPEC names headers/env keys only.

## 11. Open coordination items (do not block this SPEC)

1. **CORS EMR origins list — RESOLVED 2026-07-06.** ~~OsteoJP must give André the
   exact origins~~ — CLOSED: André's bucket CORS is locked to the three origins in §6
   (`osteojp-platform.vercel.app`, `app.osteojp.pt`, `localhost:3000`;
   `osteojp-api.vercel.app` excluded). No longer blocks the first live upload. Any
   NEW capture-page origin must be added by André before it can PUT.
2. **Partner inbound field-mapping + signed contract** — André's extractor keys →
   the twelve OsteoJP keys, plus per-field validation and the bodychart
   region→marker mapping (`endpoint-contract.md` §7,
   `partner-field-mapping-diff-v0.9.md`). Gates live ingestion, not this SPEC.

## 12. Build gate (future loops)

This SPEC is consumed by, and must be merged before: **W4-06** (quick-create stub +
consent), **W4-07** (recording UI / MediaRecorder + Chrome gate), **W4-08**
(presigned PUT flow), **W4-09** (post-upload M1 webhook fire), **W4-10** (first
end-to-end dry-run fire; asserts the draft lands `pending_review`). Each build loop
is migration-free and synthetic-data-only.

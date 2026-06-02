# OsteoJP — AI Ingestion Endpoint Contract

**Audience:** AI ingestion partner (Andrei). **Status:** Phase 1 deliverable —
"ingestion endpoint contract finalized." For sign-off alongside
[`our-fields.md`](./our-fields.md).

This describes the endpoint **as built** in PR #85 and hardened in #88. Where it
differs from any earlier contract note, the code is authoritative — divergences are
called out in [§8](#8-divergences-from-prior-contract-notes).

Source of truth in-repo:
`apps/web/app/api/v1/ingestion/clinical-records/route.ts`,
`apps/web/lib/ingestion/{hmac,ingest,ingestion-status,store}.ts`,
`apps/web/proxy.ts`, migration `0008_ai_ingestion_requests.sql`.

---

## 1. Path, method, auth model

### Path and method

```
POST /api/v1/ingestion/clinical-records
Content-Type: application/json
```

Server-to-server only. There is **no Supabase session** on this request. At the
session layer the path is explicitly excluded from the auth proxy (`apps/web/proxy.ts`
matcher excludes `api/v1/ingestion` and all subpaths, same treatment as
`/api/inngest`), so the request reaches the handler instead of being redirected to
`/login`. **The HMAC check is the only auth gate.** Every other route stays
session-gated.

The handler runs on the Node.js runtime (`node:crypto`) and is never cached
(`dynamic = "force-dynamic"`).

### Authentication — HMAC-SHA256

You (the partner) **sign**; we **verify**. Two headers accompany every request:

| Header | Value |
|---|---|
| `X-OsteoJP-Timestamp` | Unix time in **seconds** (integer). |
| `X-OsteoJP-Signature` | Hex-encoded `HMAC-SHA256( secret, "<timestamp>.<rawBody>" )`. |

Key details, exactly as verified server-side:

- **The signed string is `` `${timestamp}.${rawBody}` ``** — the timestamp, a literal
  dot, then the raw request body bytes. It is **not** the body alone. Binding the
  timestamp into the MAC is what makes a captured request un-replayable: the timestamp
  cannot be changed without invalidating the signature.
- **Sign the raw body bytes** exactly as transmitted, before any serialization round-trip
  on our side. We compute the HMAC over `await req.text()` — the literal bytes received.
  Re-serializing/reformatting the JSON after signing will break verification.
- **Replay / clock-skew window: ±300 seconds.** We reject any timestamp whose absolute
  difference from our clock exceeds 300s (past *or* future).
- **Constant-time comparison.** Signatures are compared with `timingSafeEqual` after a
  length check; no early-exit on content.
- **Algorithm:** HMAC-SHA256, lowercase hex digest.
- **Shared secret:** read server-side from env `AI_INGESTION_HMAC_SECRET`. A missing
  secret is treated as an operator misconfiguration and **fails loud → HTTP 500** (we
  never silently accept unverifiable requests). **The production secret has not yet been
  exchanged — placeholder pending sign-off** (see [§7](#7-two-items-the-partner-must-close)).

On any signature failure — missing signature header, missing/malformed timestamp, stale
timestamp, or bad signature — the response is a flat **401** (`{"error":"unauthorized"}`).
We never disclose *which* check failed.

#### Reference signing snippet (illustrative)

```
timestamp = floor(now_unix_seconds)
raw       = the exact JSON body string you will send
signature = hex( hmac_sha256(AI_INGESTION_HMAC_SECRET, timestamp + "." + raw) )

POST /api/v1/ingestion/clinical-records
X-OsteoJP-Timestamp: <timestamp>
X-OsteoJP-Signature: <signature>
<raw>
```

---

## 2. Request envelope

The body is a JSON object. Only the **transport** fields below are read; clinical
content rides along as an opaque `payload`. Wire keys are `snake_case`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `idempotency_key` | string (non-empty) | yes | Dedupe key. Unique **per tenant** — see below. |
| `request_id` | string (non-empty) | yes | Your correlation id; echoed back in every response. |
| `patient_id` | string (**UUID**) | yes | Target patient. Tenant is derived **server-side** from this. |
| `payload` | object (not array, not null) | yes | Clinical content. Opaque to the endpoint today. |

```jsonc
{
  "idempotency_key": "andrei-2026-06-02-abc123",
  "request_id": "req_01H...",
  "patient_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "payload": { /* per our-fields.md, once the field mapping is agreed */ }
}
```

### `idempotency_key` semantics

- Uniqueness is enforced on **`(tenant_id, idempotency_key)`** (DB unique constraint).
  Since the tenant is derived from `patient_id`, in practice: pick a key unique across
  all requests you send for a given patient/tenant.
- **Same key + identical payload** → idempotent replay (HTTP 200), no duplicate record.
- **Same key + different payload** → conflict (HTTP 409). Do not reuse a key for new
  content.
- Equality of payload is determined by a **SHA-256 of the raw body**, stored as
  `payload_hash`.

### `patient_id` and tenancy

- **You never send `tenant_id`.** The envelope type has no tenant field by design. We
  resolve the tenant from the patient row server-side and set it explicitly on every
  write (hard architecture rule #3).
- **Do not place `tenant_id` (or any tenant hint) anywhere in `payload`.** It will be
  ignored; the resolved tenant always wins.
- `patient_id` must be a **well-formed UUID** or the request is rejected as a malformed
  envelope (**400**, not 422). A well-formed UUID that does not resolve to a live patient
  → **422** (see code map).
- A **soft-deleted** patient is treated as unknown → **422**. No ingestion into deleted
  patients.

---

## 3. HTTP status codes

| Status | Body `error` / shape | Meaning |
|---|---|---|
| **201** Created | `{ request_id, status, clinical_record_id, idempotent: false }` | New request accepted; a draft `clinical_record` was created. |
| **200** OK | `{ request_id, status, clinical_record_id, idempotent: true }` | Idempotent replay: same `(tenant, idempotency_key)` with the **same** payload. Returns the original request's ids; no new record. |
| **400** Bad Request | `{"error":"malformed_body"}` | Body is not valid JSON. |
| **400** Bad Request | `{"error":"invalid_envelope"}` | JSON parsed, but the envelope shape is wrong (missing/empty `idempotency_key`/`request_id`, non-UUID `patient_id`, or `payload` not a plain object). |
| **401** Unauthorized | `{"error":"unauthorized"}` | Any signature failure: missing signature, missing/malformed timestamp, stale timestamp (outside ±300s), or bad signature. Reason never disclosed. |
| **409** Conflict | `{"error":"idempotency_key_conflict"}` | Same `(tenant, idempotency_key)` reused with a **different** payload. |
| **422** Unprocessable Entity | `{"error":"unknown_patient"}` | `patient_id` is a valid UUID but resolves to no live patient (nonexistent **or** soft-deleted). |
| **500** Internal Server Error | `{"error":"server_error"}` | Server-side fault: HMAC **secret not configured** (fail-loud), or an unexpected error during persistence. No internals or payload content are ever echoed. |

Notes:
- The two **400** cases are distinct response bodies (`malformed_body` vs
  `invalid_envelope`) — bad bytes vs bad shape.
- Success bodies carry `status`, which is the ingestion status — currently always
  `"accepted"` on the success paths (see [§4](#4-ingestion-state-machine)).
- `clinical_record_id` is the id of the **draft** record created for human review.

---

## 4. Ingestion state machine

Backed by the `ingestion_status` enum (migration 0008) — exactly three values, no others:

```
received ──► accepted   (a draft clinical_record was created and linked)
   │
   └────────► rejected   (refused; no draft)
```

- **`received`** — column default; request logged, no draft yet.
- **`accepted`** — a draft `clinical_record` was created and linked; the request enters
  the human review queue. Successful ingestion drives a request here.
- **`rejected`** — request refused, no draft created.

`received` is the only non-terminal state; `accepted` and `rejected` are terminal within
ingestion. Any further lifecycle belongs to the clinical record, not the ingestion row.

> **`accepted` is an INBOUND state, not clinical approval.** It means "the request was
> accepted into the system as a draft" — it does **not** mean a clinician approved the
> content. Clinical approval is a **separate** state machine on the record itself:
> `clinical_records.ai_review_state` (`pending_review → in_review → approved / rejected`).
> Per hard architecture rule #4, **AI ingestion never produces a `locked` or `signed`
> record directly** — a human reviewer must accept the draft first.

### What a successful ingest writes

In one transaction, as `service_role` with `tenant_id` set explicitly (the request has no
session for RLS to key on; this is the sanctioned service-role path):

- a `clinical_records` row: `source = "ai_ingested"`, `status = "draft"` (unlocked — does
  not trip the immutability trigger), `ai_review_state = "pending_review"`,
  `ai_payload_id = <your request_id>`, and `data = { "_aiIngestionRaw": <your payload> }`
  — your payload is stored **verbatim** under a namespaced key; nothing in it is
  interpreted as form data yet (pending the field mapping);
- an `ai_ingestion_requests` row: `(tenant_id, idempotency_key, request_id, payload_hash,
  clinical_record_id, status = "accepted")`, with the unique constraint on
  `(tenant_id, idempotency_key)` as the real idempotency guarantee (a lost insert race is
  re-read and replayed as 200).

> **As-built note:** in the current shell, a request for a resolvable patient **always**
> creates a draft and therefore always reaches `accepted`. The **`rejected` path is not
> emitted yet** — it activates only once per-field validation lands (see
> [§7](#7-two-items-the-partner-must-close)). The enum value and the legal
> `received → rejected` transition already exist so no migration is needed when it does.

---

## 5. Tenancy & data-residency guarantees

- `tenant_id` is never accepted from you; always derived server-side from `patient_id`
  and set explicitly on every write.
- `ai_ingestion_requests` is RLS-enabled (tenant isolation, fail-closed) for the
  authenticated review queue; the ingestion writer uses the sanctioned `service_role`
  (BYPASSRLS) path because the inbound request carries no tenant context.
- EU data residency applies (Supabase Frankfurt, Vercel `fra1`). No PII is logged; error
  responses never echo payload content.

---

## 6. Field payload (`payload`)

Today `payload` is **opaque** to the endpoint — accepted as any plain JSON object and
stored verbatim for the human reviewer. The agreed field set, per-field shape
(`value` / `fill_source` / `ai_confidence`), template ids, and the bodychart contract
(structured anatomical regions + intensity descriptor, **not** coordinates) are specified
in **[`our-fields.md`](./our-fields.md)**. Per-field validation against that schema is
**stubbed** pending your field mapping (see next).

---

## 7. Two items the partner must close

1. **Shared HMAC secret.** The production `AI_INGESTION_HMAC_SECRET` has not been
   exchanged — current value is a placeholder. We hold the secret and verify; you sign
   with the same secret. Exchange must be out-of-band/secure before go-live.
2. **Per-template field mapping (your field keys → ours).** Provide the mapping from your
   extractor's output keys to our template field keys in
   [`our-fields.md`](./our-fields.md). Two pieces of server logic are **stubbed pending
   this mapping** and are explicitly out of scope of the as-built shell:
   - **per-field payload validation** — until the mapping lands, `payload` is stored raw,
     not validated field-by-field;
   - **bodychart region → marker mapping** — translating your structured anatomical
     regions to our internal marker model.

   When the mapping is agreed, per-field validation failures become the trigger for the
   `rejected` state described in [§4](#4-ingestion-state-machine).

---

## 8. Divergences from prior contract notes

Flagged per the rule that the as-built code is authoritative:

1. **Signed string includes the timestamp.** Some earlier notes describe "HMAC over the
   raw request body." As built, the MAC is over `` `${timestamp}.${rawBody}` `` — the
   timestamp is bound in. Sign the dotted concatenation, not the body alone.
2. **Full path is `/api/v1/ingestion/clinical-records`.** `/api/v1/ingestion` is the proxy
   **exclusion prefix** (covers all subpaths); the actual route is the
   `clinical-records` resource under it.
3. **Envelope carries `request_id` in addition to `idempotency_key` and `patient_id`.**
   `request_id` is your correlation id (echoed back); `idempotency_key` is the dedupe key.
   They are distinct fields — both required.
4. **Two distinct 400 bodies.** `malformed_body` (invalid JSON) vs `invalid_envelope`
   (valid JSON, wrong shape). A non-UUID `patient_id` is `invalid_envelope` (**400**), not
   a 422.
5. **`rejected` is defined but not yet emitted.** The shell always creates a draft for a
   resolvable patient → always `accepted`. `rejected` activates with per-field validation.
6. **`422` covers soft-deleted patients too**, treated identically to nonexistent.

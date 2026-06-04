# Partner Field-Mapping Diff — `osteojp_field_mapping_v0.9.md`

**Date:** 2026-06-04
**Reviewed against:** `osteojp_field_mapping_v0.9.md` (Andrei, partner draft v0.9)
**Our sources (authoritative):**
- `docs/ai-ingestion/our-fields.md`
- `packages/db/seed/form-templates/osteopathy-v2.json`
- `packages/db/seed/form-templates/physiotherapy-v4.json`
- Endpoint code: `apps/web/app/api/v1/ingestion/clinical-records/route.ts`,
  `apps/web/lib/ingestion/ingest.ts`, `.../hmac.ts`, `.../store.ts`

**Authority rule (from the partner doc §Status):** where v0.9 and `our-fields.md`
disagree on field keys or types, **`our-fields.md` + the seed JSON win** and the
partner doc is wrong; this report flags every such case. This document changes **no**
code, flag, schema, seed, or i18n — it is a read-only diff.

> PII note (rule #7): the partner's §8 worked example contains synthetic Portuguese
> clinical narrative. This report references it **structurally only** and reproduces
> no clinical text.

---

## 0. Executive summary

| Area | Verdict |
|---|---|
| §1 6.1 osteopathy key+type parity (12 fields) | ✅ **Full parity** — 12/12 exact key+type matches |
| §1 6.2 physiotherapy key+type parity (5 fields) | ✅ **Full parity** — 5/5 exact key+type matches |
| §1 partner-fills-that-don't-exist | ✅ None |
| §1 our AI-extractable fields he omits | ✅ None (his fill-set == our `true` set, exactly) |
| §2 `systems_review` modeling | ✅ Six flaggable leaves, not one group; nested shape **accepted** (opaque), not yet **mapped** |
| §3 per-field object shape (`value`/`fill_source`/`ai_confidence`) | ✅ Adopts our `§1` shape; ⚠️ one internal confidence-bucket inconsistency in the partner doc |
| §3 bodychart shape | ✅ Region shape matches our **ingestion contract**; ⚠️ diverges from **seed storage** (osteo coords / physio object) — by design, app translates |
| §4 envelope/payload vs endpoint | ✅ Exact: endpoint reads 4 transport fields; **tenant resolved from `patient_id`, never from payload** (structurally enforced) |
| §5 `ai_extractable` flip-list to match 6.1+6.2 | ✅ **EMPTY — 0 flips.** v2/v4 seeds already encode JP's Group A/B sign-off; bodychart already `false` |

**Headline:** v0.9's identity-mapping claim holds. Every field key and type the partner
sends for osteopathy (6.1) and physiotherapy (6.2) matches our seed exactly, and the
seed flags are **already** in the target state — the flip-list JP signs off is a
*confirmation*, not a change set. The remaining work is answering the partner's six
open points (§7), reproduced with our positions in this report's §6.

---

## 1. Field-key + type parity

Method: each partner field (6.1, 6.2) compared key-for-key and type-for-type against
`our-fields.md` and the seed JSON (the seed is the tiebreaker).

### 1.1 `osteopathy` v2 — partner §6.1 (12 AI-filled fields + bodychart)

| # | Partner key | Partner type | Our seed key | Our seed type | Match |
|---|---|---|---|---|---|
| 1 | `consultation_reason` | string (required) | `consultation_reason` | string (required) | ✅ exact |
| 2 | `relief_aggravation` | string \| null | `relief_aggravation` | string \| null | ✅ exact |
| 3 | `clinical_history` | string \| null | `clinical_history` | string \| null | ✅ exact |
| 4 | `systems_review.neurological` | string \| null | `systems_review.neurological` | string \| null | ✅ exact |
| 5 | `systems_review.cardiovascular` | string \| null | `systems_review.cardiovascular` | string \| null | ✅ exact |
| 6 | `systems_review.respiratory` | string \| null | `systems_review.respiratory` | string \| null | ✅ exact |
| 7 | `systems_review.gastrointestinal` | string \| null | `systems_review.gastrointestinal` | string \| null | ✅ exact |
| 8 | `systems_review.urological_gynecological` | string \| null | `systems_review.urological_gynecological` | string \| null | ✅ exact |
| 9 | `systems_review.endocrine` | string \| null | `systems_review.endocrine` | string \| null | ✅ exact |
| 10 | `treatment_objectives` | string \| null | `treatment_objectives` | string \| null | ✅ exact |
| 11 | `treatment_plan` | string \| null | `treatment_plan` | string \| null | ✅ exact |
| 12 | `observations` | string \| null | `observations` | string \| null | ✅ exact |
| — | `bodychart` | array | `bodychart` | array | ✅ type-exact (shape: see §3.2; flag: §5) |

- **Key mismatches:** none.
- **Type mismatches:** none.
- **Partner-fills-that-don't-exist:** none — all 12 keys exist in `osteopathy-v2.json`.
- **Our `ai_extractable: true` fields the partner omits:** none. Our osteopathy `true`
  set is exactly these 12; the partner fills exactly these 12.
- **Partner's "do not fill" set** (`episode_date`, `weight_kg`, `height_cm`,
  `linked_appointment`, `red_flags`, `cid_codes`, all `health_problems.*`) — matches our
  `false` set with no gaps. ✅
- **Note (correct targeting):** the systems-review leaves use the **English machine keys**
  (`neurological`…`endocrine`) that osteopathy v2 declares. (NESA's systems-review uses
  PT keys `neurologico`…`endocrino`, but NESA is deferred — partner §6.4, zero fields —
  so there is no key collision.)

### 1.2 `physiotherapy` v4 — partner §6.2 (5 AI-filled fields + bodychart)

| # | Partner key | Partner type | Our seed key | Our seed type | Match |
|---|---|---|---|---|---|
| 1 | `main_complaints` | string \| null | `main_complaints` | string \| null | ✅ exact |
| 2 | `background` | string \| null | `background` | string \| null | ✅ exact |
| 3 | `treatment_goals` | string \| null | `treatment_goals` | string \| null | ✅ exact |
| 4 | `treatment_plan` | string \| null | `treatment_plan` | string \| null | ✅ exact |
| 5 | `observations` | string \| null | `observations` | string \| null | ✅ exact |
| — | `bodychart` | object/array | `bodychart` | object \| null | ⚠️ declared-type differs (see §3.2) |

- **Key mismatches:** none.
- **Type mismatches:** none among the 5 narrative fields. **bodychart:** our seed declares
  `object | null`; the partner (and our own ingestion contract §2) treat it as an **array**
  of region markers. This is a known, intended divergence — bodychart is not AI-mapped in
  v1 and the app owns region→marker translation; reconcile the declared type when bodychart
  mapping lands. Tracked under partner open point (e) / our §3.2.
- **Partner-fills-that-don't-exist:** none — all 5 keys exist in `physiotherapy-v4.json`.
- **Our `ai_extractable: true` fields the partner omits:** none. Our physiotherapy `true`
  set is exactly these 5.
- **Partner's "do not fill" set** (`episode_date`, `weight_kg`, `height_cm`,
  `linked_appointment`, `cid_codes`, `red_flags`, `medication`, `diagnosis`,
  `private_notes`, `consent_in_report`) — matches our 11 `false` fields with no gaps. ✅
  Good catch on `private_notes` (`x-private`) — correctly excluded.

---

## 2. How `systems_review` is modeled on our side

**Our model (osteopathy v2):** `systems_review` is a **container object that carries no
`value` of its own** and **no `ai_extractable` flag**. Beneath it sit **six independent,
individually-flaggable leaf fields**, each `string | null`, each `ai_extractable: true`:

```
systems_review            (container — no value, no flag)
├── neurological              string|null   ai_extractable: true
├── cardiovascular            string|null   ai_extractable: true
├── respiratory               string|null   ai_extractable: true
├── gastrointestinal          string|null   ai_extractable: true
├── urological_gynecological  string|null   ai_extractable: true
└── endocrine                 string|null   ai_extractable: true
```

So it is **six flaggable leaves, not one group flag.** The partner doc gets this right:
§6.1 enumerates six `systems_review.<leaf>` rows as independent fields rather than one
`systems_review` field.

**Does ingestion accept the nested per-field object shape from the §8 worked example?**
The worked example sends:

```jsonc
"systems_review": { "respiratory": { "value": …, "fill_source": "ai", "ai_confidence": … } }
```

i.e. `systems_review` is a plain object whose **members are per-field objects**, with only
the touched leaf present and the other five omitted (per §4 omission rule).

- **Accepted? Yes — structurally.** The endpoint treats `payload` as **opaque**
  (`Record<string, unknown>`) and stores it verbatim (`store.ts` → `data._aiIngestionRaw`).
  There is **no per-field validation yet** (TODO andrei), so any nested shape is accepted
  without error.
- **Mapped? Not yet.** Nothing currently reads `payload.fields.systems_review.respiratory.value`
  and writes it into the record's `systems_review.respiratory` leaf. The shape is **compatible**
  with our six-leaf model (each leaf ← `systems_review.<leaf>.value`); wiring that projection
  is the per-field mapping work that lands with the contract.
- **Consistency check:** the container-is-not-a-field treatment is correct on both sides —
  the partner wraps each *leaf* (e.g. `respiratory`) as a per-field object and groups them
  under `systems_review`, which itself carries no `value`/`fill_source`/`ai_confidence`.
  This matches our container-vs-leaf split exactly.

---

## 3. Per-field object shape & bodychart shape

### 3.1 Per-field object — `value` / `fill_source` / `ai_confidence`

Partner §4 states it adopts `our-fields.md §1` "exactly." Verified:

| Aspect | `our-fields.md §1` | Partner v0.9 | Verdict |
|---|---|---|---|
| Wrapper | `{ value, fill_source, ai_confidence }` per filled field | same | ✅ match |
| `value` typing | typed per field's declared type; `null` where type allows | same | ✅ match |
| `fill_source` domain | `"ai"` \| `"transcription"` \| `"human"` \| `"unknown"` | only ever emits `"ai"` | ✅ compatible (proper subset) |
| `ai_confidence` range | `[0,1]`; `null` when `fill_source != "ai"` | `[0,1]`, discrete buckets | ✅ in range |
| Unfilled fields | (shape has no "why empty" slot) | **omitted entirely**, not sent as `null` | ✅ acceptable; see open point (c) |

**⚠️ One internal inconsistency in the partner doc (not a conflict with us):** §4 declares
discrete confidence buckets **0.9 / 0.7 / 0.5**, but the §8 worked example emits
`ai_confidence: 0.6` for the `respiratory` leaf. Andrei should reconcile the stated bucket
set with the example (and answer open point (b)). Either is in-range for us; flagging the
self-contradiction so it is resolved before per-field validation pins it down.

### 3.2 Bodychart shape

| Aspect | Our **ingestion contract** (`our-fields.md §2`) | Partner v0.9 §5 | Verdict |
|---|---|---|---|
| Container | array of marker objects | array of marker objects | ✅ match |
| Per-marker keys | `region`, `side`, `marker_type`, `intensity` | `region`, `side`, `marker_type`, `intensity` | ✅ exact |
| `side` domain | `left`/`right`/`midline`/`null` | same | ✅ match |
| `marker_type` enum | 9 osteopathy values | same 9, verbatim | ✅ exact |
| `intensity` | `mild`/`moderate`/`severe`/`null` descriptor (not 0–10) | same | ✅ match |
| Coordinates | never (regions only) | never (regions only) | ✅ match |

The partner's nine `marker_type` values are an exact match for the osteopathy seed enum:
`blockage_dysfunction, scar, hypertonicity, hypotonicity, pain_radiation, pain_location,
paresthesia, rotation_right, rotation_left`.

**⚠️ Divergence — ingestion contract vs seed storage (known, by design):** the region shape
above matches our **ingestion contract**, but **not** how the seeds store bodychart:
- `osteopathy-v2.json`: `bodychart` is an **array of `{ marker_type, x, y, view }`** —
  normalized `x`/`y` (0–1) coordinates + a 4-view enum.
- `physiotherapy-v4.json`: `bodychart` is an **`object | null`** (`x-widget: bodychart`),
  no item schema.

`our-fields.md §2` already calls this out: the partner sends **regions + intensity**, and the
**app translates** regions onto its internal marker model. So this divergence is expected —
the partner is correct to follow §2, not the seed storage shape. It becomes real work only
when bodychart mapping is implemented (and is gated `false` regardless — see §5).

**Open items the partner raises on bodychart (carry to §6):** region vocabulary is undefined
(open point d — our §2 examples double-encode side as both `right_shoulder` *and* a `side`
field; the partner proposes side-free region keys), and the meaning of `ai_extractable: false`
vs the §2 "send regions" expectation (open point e).

---

## 4. Envelope / payload vs what the endpoint actually reads

**Partner envelope (§2):**
```jsonc
{ "idempotency_key", "request_id", "patient_id", "payload" }
```
Partner explicitly states it **never** sends `tenant_id` or any tenant hint, in the envelope
or in `payload`, and validates `patient_id` as a UUID before sending.

**What the endpoint actually reads** (`ingest.ts → parseEnvelope`, current code):

| Wire key | Read as | Validation | 
|---|---|---|
| `idempotency_key` | `idempotencyKey` | non-empty string |
| `request_id` | `requestId` | non-empty string |
| `patient_id` | `patientId` | matches UUID regex |
| `payload` | `payload` | non-null, **non-array** object |

- **Exactly those four transport fields are read.** Anything else in the body is ignored by
  the envelope parser.
- **Tenant is resolved from `patient_id`, never from the payload — and this is structurally
  enforced, not merely conventional:**
  - `ingest()` calls `store.resolvePatientTenant(envelope.patientId)`; unknown patient → `422`.
  - The `IngestionEnvelope` type has **no tenant field at all**, so reading a tenant from the
    wire is impossible by construction. `ingest.ts` header comment: *"tenant_id is NEVER read
    from the payload… resolved from the patient row and then set explicitly on every write."*
  - `store.ts` sets `tenant_id` **explicitly** on every insert from the resolved patient
    (service_role / BYPASSRLS path, CLAUDE.md rule #3). A hostile `payload.tenantId` is inert
    (the existing ingestion tests assert this).
  - ✅ Matches the partner's §2 promise and our hard architecture rules #1–#3.
- **HMAC:** signature is over the **raw body** with a timestamp replay window
  (`hmac.ts`); the secret is read from env (`AI_INGESTION_HMAC_SECRET`) and never logged.
  Matches the partner's transport assumptions.

**Inner `payload` structure (partner §3): accepted-but-opaque today.** The partner nests
clinical content as `payload.fields.<key>` plus `payload.bodychart`, and carries
`schema_version`, `template_key`, `template_version`, `consultation`, `audio_reference`. The
endpoint does **not** read any of these inner keys yet — `payload` is stored verbatim. Two
consequences for the mapping work (not blockers now):
1. The field projection must reach **into `payload.fields`** (and `payload.bodychart`), since
   the partner wraps the actual field objects under a `fields` key rather than at payload root.
2. `template_key` + `template_version` location is **open point (a)** — confirm whether we read
   the template id from `payload` or derive it from appointment context.

---

## 5. `ai_extractable` flag delta + flip-list (the Group A/B sign-off artifact)

**This is the artifact João Pedro signs off.** It reports, for **every field the partner
fills**, the **current** `ai_extractable` value in the seed JSON, and the **exact set of
fields that must flip to `true`** to match partner §6.1 + §6.2.

### 5.1 Current flag state — osteopathy v2 (partner §6.1)

| Partner-filled field | `ai_extractable` in `osteopathy-v2.json` | Target (6.1) | Flip needed? |
|---|---|---|---|
| `consultation_reason` | **true** | true | no |
| `relief_aggravation` | **true** | true | no |
| `clinical_history` | **true** | true | no |
| `systems_review.neurological` | **true** | true | no |
| `systems_review.cardiovascular` | **true** | true | no |
| `systems_review.respiratory` | **true** | true | no |
| `systems_review.gastrointestinal` | **true** | true | no |
| `systems_review.urological_gynecological` | **true** | true | no |
| `systems_review.endocrine` | **true** | true | no |
| `treatment_objectives` | **true** | true | no |
| `treatment_plan` | **true** | true | no |
| `observations` | **true** | true | no |
| `bodychart` | **false** | stays false | no (must stay false) |

### 5.2 Current flag state — physiotherapy v4 (partner §6.2)

| Partner-filled field | `ai_extractable` in `physiotherapy-v4.json` | Target (6.2) | Flip needed? |
|---|---|---|---|
| `main_complaints` | **true** | true | no |
| `background` | **true** | true | no |
| `treatment_goals` | **true** | true | no |
| `treatment_plan` | **true** | true | no |
| `observations` | **true** | true | no |
| `bodychart` | **false** | stays false | no (must stay false) |

### 5.3 Flip-list

> **Fields that must flip `false → true` to match 6.1 + 6.2: NONE (0 fields).**

Both current seed versions **already encode** João Pedro's Group A/B sign-off:
- `osteopathy-v2.json` `_meta.version_note`: *"Group A narrative fields flipped to true:
  consultation_reason, relief_aggravation, clinical_history, systems_review.* (all 6),
  treatment_objectives, treatment_plan, observations."* — 12 fields, matching 6.1 exactly.
- `physiotherapy-v4.json` `_meta.version_note`: *"Group A narrative fields flipped to true:
  main_complaints, background, treatment_goals, treatment_plan, observations."* — 5 fields,
  matching 6.2 exactly.
- `bodychart` is **already `false`** on both and **stays `false`** (narrative-only scope;
  bodychart region pre-fill is governed by partner open point (e), not by flipping this flag).

**So the signable artifact is a confirmation, not a change set.** Nothing in the seed needs
to change for ingestion fill to line up with partner §6.1/§6.2. The flip already happened in
the v1→v2 (osteopathy) and v3→v4 (physiotherapy) bumps; this report verifies that the
already-`true` set is **precisely** the partner's fill-set, with no extra `true` field and no
missing one.

### 5.4 Sign-off block (Group A/B)

```
[ ] Group A — osteopathy v2: the 12 fields in §5.1 are correct as ai_extractable: true   — JP: ____  date: ____
[ ] Group A — physiotherapy v4: the 5 fields in §5.2 are correct as ai_extractable: true  — JP: ____  date: ____
[ ] bodychart stays ai_extractable: false on both (region pre-fill handled via §6 open (e)) — JP: ____  date: ____
[ ] No further flips required for 6.1 / 6.2 parity                                          — JP: ____  date: ____
```

---

## 6. Open points for OsteoJP to answer Andrei (partner §7), with our positions

These are **not** field-mapping discrepancies — they are decisions the partner needs from us.
Carried here so the diff is actionable; none requires a code/flag change in this PR.

| Ref | Partner question | Our position (from sources) | Status |
|---|---|---|---|
| (a) | Put `template_key`+`template_version` in `payload`, or derive from appointment context? | Endpoint reads neither today (`payload` opaque). Decide before per-field mapping; deriving from appointment context avoids trusting partner-declared template id. | **Owner decision** |
| (b) | Confidence representation (discrete 0.9/0.7/0.5)? | In-range for us. **Reconcile §4 buckets vs §8 example's `0.6` first** (§3.1). | **Owner decision + partner fix** |
| (c) | Omit unfilled fields vs send `null`/`unknown`? | Omission is fine — our shape has no "why empty" slot; reviewer sees blanks. | **Acceptable as proposed** |
| (d) | Bodychart region vocabulary (side-free keys + `side`)? | Our §2 examples double-encode side (`right_shoulder` **and** `side`). Partner's side-free proposal is cleaner. **We owe a canonical region-key list.** | **Owner action: send region list** |
| (e) | `bodychart: ai_extractable=false` vs "send regions"? | Read as "don't AI-fill the internal x/y/view coords; the §2 region channel is the sanctioned AI path." Confirm whether v1 wants AI-suggested regions (`fill_source:"ai"`) or clinician-only marking. **Flag stays `false` regardless** (§5). | **Owner decision** |
| (f) | Wrapper `template_key`: wrapper key (e.g. `rpg`) or resolved `physiotherapy`, which version? | Wrappers carry `x-form-ref: physiotherapy` (by key, → v4). `our-fields.md §4` confirms resolution. Tie to (a). | **Owner decision** |

---

## 7. Methodology & scope

- **Read-only.** No code, flag, schema, seed, or i18n was modified. No `provision.ts`,
  dispatch module, staff, `permissions.ts`, or integration module was touched.
- **Tiebreaker honored:** every comparison resolves against the seed JSON + `our-fields.md`;
  where v0.9 differs it is flagged as the partner's to fix (none material in 6.1/6.2 beyond
  the bodychart declared-type note and the confidence-bucket inconsistency).
- **Verified against current `main`** (`packages/db/seed/form-templates/osteopathy-v2.json`,
  `physiotherapy-v4.json`) and the live endpoint code, not a cached description.
- **Pending the partner contract:** per-field validation and bodychart region→marker mapping
  remain unimplemented (TODO andrei); this diff is the input that unblocks them once §6 is
  answered and JP signs §5.4.

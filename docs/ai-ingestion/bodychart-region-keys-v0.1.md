# Bodychart Region Keys — v0.1 (canonical list for partner sign-off)

**Date:** 2026-06-04
**Status:** Draft for OsteoJP (João Pedro / owner) sign-off, then send to Andrei.
**Resolves:** open point (d) of `partner-field-mapping-diff-v0.9.md` / partner
`osteojp_field_mapping_v0.9.md` §7(d) — *"Bodychart region vocabulary is undefined; send
us your canonical region-key list."*

**Sources (existing only — nothing invented):**
- Component: `apps/web/app/clinical/[id]/BodyChart.tsx`
- Seed JSON: `packages/db/seed/form-templates/osteopathy-v2.json`,
  `physiotherapy-v4.json`
- Ingestion contract: `docs/ai-ingestion/our-fields.md` §2,
  `docs/ai-ingestion/partner-field-mapping-diff-v0.9.md`
- Partner draft (external input): `osteojp_field_mapping_v0.9.md` §5, §7(d), §8

**Read-only.** This document changes no code, schema, flag, seed, or i18n. Every region
key below is traced to a line in an existing source; none is invented.

> **Derivation rule applied:** a region key is listed here **only** if it already appears
> in one of the sources above. Anatomically plausible regions with **no** textual basis in
> code, seed, or contract (e.g. `thoracic_spine`, `sacrum`, `knee`, `hip`, `ankle`) are
> **deliberately omitted** — adding them is a clinician (JP) decision, not something this
> derivation can authority-create. See §4.1.

---

## 0. Summary table (the sign-off artifact)

Six region keys have a basis in existing sources. Keys are **side-free** (laterality is
carried in the separate `side` field, per partner §7(d)); `side` values come from the
contract enum `left | right | midline | null`.

| Region key | Lateralizable (`side`) | Status | Source basis | In storage today? |
|---|---|---|---|---|
| `cervical` | midline (left/right possible) | **CONFIRMED** | `our-fields.md` §2 example; partner §7(d) | No¹ |
| `lumbar_spine` | midline | **CONFIRMED** | `our-fields.md` §2 example; partner §7(d) | No¹ |
| `shoulder` | left / right | **CONFIRMED** (normalized) | `our-fields.md` §2 as `right_shoulder`; partner §7(d) as side-free `shoulder` | No¹ |
| `scapula` | left / right | **PROPOSED** | partner §7(d) + §8 worked example only | No¹ |
| `calcaneus` | left / right | **PROPOSED** | partner §7(d) + §8 worked example only | No¹ |
| `trochanter` | left / right | **PROPOSED** | partner §7(d) + §8 worked example only | No¹ |

**CONFIRMED** = the key (or its side-bearing form) is present in our written ingestion
contract. **PROPOSED** = needed for the partner mapping (it appears in the partner draft)
but is not yet attested in our contract or storage.

¹ **No region key exists in storage for any template** — see §1. The CONFIRMED/PROPOSED
axis is about *contract attestation*; the "in storage" column is uniformly **No** because
both storage shapes are non-region (osteopathy = x/y coordinates, physiotherapy = opaque
object). Regions are an **ingestion-layer vocabulary** the app translates on review.

> `shoulder` is **CONFIRMED** as a region (our §2 contract uses `right_shoulder`) but its
> **canonical side-free spelling** is the normalization the partner proposes in §7(d):
> drop the baked-in side, move laterality to `side`. Sign-off on `shoulder` = sign-off on
> that normalization.

---

## 1. Source audit — where region keys do (and do not) exist

The task is to derive keys from existing sources. The audit result is decisive and must
frame the rest of this document:

| Source | What it actually contains | Region keys? |
|---|---|---|
| `BodyChart.tsx` | Markers stored as `{ marker_type, x, y, view }` — normalized 0–1 coordinates placed by click, on one of four `view` planes. | **None.** Purely coordinate-based. |
| `osteopathy-v2.json` `bodychart` | `array` of `{ marker_type (enum, 9 values), x (0–1), y (0–1), view (enum) }`. | **None.** Coordinate-based. |
| `physiotherapy-v4.json` `bodychart` | `object \| null`, `x-widget: bodychart`, **no item schema**. | **None.** Shape unspecified. |
| `nesa-v1.json` `bodychart` | `object \| null`, no item schema. | **None.** (NESA deferred anyway.) |
| `our-fields.md` §2 (ingestion contract) | Region-based marker `{ region, side, marker_type, intensity }`; examples `lumbar_spine`, `right_shoulder`, `cervical`. | **Yes — as the contract + 3 examples.** |
| `partner-field-mapping-diff-v0.9.md` | Echoes the §2 region shape; cites `right_shoulder` as the double-encoding case. | `right_shoulder`. |
| `osteojp_field_mapping_v0.9.md` (partner) | §7(d) proposes side-free `shoulder, scapula, calcaneus, trochanter, lumbar_spine, cervical`; §8 worked example emits `trochanter, scapula, calcaneus`. | **Yes — partner proposal + example.** |

**Confirmed non-region storage vocabulary (for reference, used by §2 reconciliation):**
- `view` enum (in component + osteo seed): `anterior`, `posterior`, `lateral_left`,
  `lateral_right` (osteo seed also allows `null`).
- `marker_type` enum (osteo seed, 9 values): `blockage_dysfunction`, `scar`,
  `hypertonicity`, `hypotonicity`, `pain_radiation`, `pain_location`, `paresthesia`,
  `rotation_right`, `rotation_left`.
- `side` enum (contract): `left`, `right`, `midline`, `null`.
- `intensity` enum (contract): `mild`, `moderate`, `severe`, `null`.

**Conclusion:** region keys live **only** in the ingestion contract and the partner draft —
never in code or seed storage. So the canonical list is bounded by what those documents
attest, and the reconciliation in §2 is necessarily a *translation* spec (region → each
storage shape), because neither storage natively holds regions.

---

## 2. Storage-shape reconciliation

The diff doc flagged two storage shapes; here is how each canonical region key maps to each.
No coordinate is invented — x/y placement is a clinician/app calibration concern and is
explicitly left unspecified (marked *centroid TBD*). The **view** assignment is a proposed
default grounded in the four-view enum that exists in code.

### 2.1 The shapes

- **Osteopathy v2** — `bodychart[] = { marker_type, x, y, view }`. Region-bearing ingest
  markers must be translated to **`(view, x, y)`**: pick the `view` plane the region sits
  on, place an x/y centroid. `marker_type`, `side`, `intensity` carry across (note: osteo
  storage has **no** `side`/`intensity` columns — `side` collapses into the chosen view +
  centroid; `intensity` has no coordinate home and is dropped or annotated by the app).
- **Physiotherapy v4** — `bodychart = object | null`, no item schema. The region marker can
  be stored **as-is** (region/side/marker_type/intensity) inside the opaque object, OR the
  physio object schema is defined to match the contract. Lowest-friction target until physio
  bodychart gets a real schema.

### 2.2 Per-key mapping

| Region key | `side` domain | → Osteopathy v2 (`view`, then centroid) | → Physiotherapy v4 (`object`) |
|---|---|---|---|
| `cervical` | midline / left / right | `view: posterior` default (anterior/lateral for anterior-neck or lateral structures); centroid TBD | stored verbatim in object (region/side/marker_type/intensity) |
| `lumbar_spine` | midline | `view: posterior`; centroid TBD | verbatim |
| `shoulder` | left / right | `view: anterior` default (posterior/lateral admissible); side selects left/right placement; centroid TBD | verbatim |
| `scapula` | left / right | `view: posterior`; side selects left/right; centroid TBD | verbatim |
| `calcaneus` | left / right | `view: posterior`; side selects left/right; centroid TBD | verbatim |
| `trochanter` | left / right | `view: lateral_left` / `lateral_right` (selected by `side`); centroid TBD | verbatim |

> The `view` column is a **PROPOSED reconciliation default**, not a value read from any
> source (no region→view table exists in code). It is anatomically defensible and grounded
> in the existing four-view enum, but JP should confirm. The x/y centroid is intentionally
> not specified — pinning pixel placement is visual calibration the app/clinician owns, and
> inventing numbers here would violate the derive-from-sources-only rule.

**Net:** the ingestion region vocabulary is a clean superset channel; the app performs
region → coordinate translation for osteopathy at review time and stores region markers
near-verbatim for physiotherapy. This matches `our-fields.md` §2 ("the app translates
regions onto its internal marker model") and the diff doc's "known, by design" divergence.

---

## 3. Region key definitions (auditable detail)

Each entry cites the exact source line(s) so sign-off is traceable.

- **`cervical`** — CONFIRMED. `our-fields.md` §2 example list (`…cervical`); partner §7(d)
  proposal. Cervical spine / neck. Typically midline; left/right permissible for
  lateralized findings.
- **`lumbar_spine`** — CONFIRMED. `our-fields.md` §2 example list (`lumbar_spine…`); partner
  §7(d). Lumbar spine. Midline.
- **`shoulder`** — CONFIRMED (normalized). `our-fields.md` §2 example `right_shoulder`;
  partner §7(d) proposes side-free `shoulder` + `side`. Glenohumeral / shoulder region.
  Lateralizable; **sign-off includes dropping the baked-in side** in favor of `side`.
- **`scapula`** — PROPOSED. Partner §7(d) proposal and §8 worked example
  (`{ "region": "scapula", "side": "right"/"left", … }`). Shoulder blade. Lateralizable.
- **`calcaneus`** — PROPOSED. Partner §7(d) and §8 worked example. Heel bone. Lateralizable.
- **`trochanter`** — PROPOSED. Partner §7(d) and §8 worked example. Greater trochanter / lateral
  hip. Lateralizable; lateral view.

No other region keys are listed because no other region has a basis in any existing source
(the partner's §7(d) list ends with "…", explicitly inviting extension — see §4.1).

---

## 4. Open questions for Andrei / owner (not blockers)

### 4.1 Region vocabulary completeness
This list is **bounded by what existing sources attest** (6 keys). Real consultations will
reference regions not in any current source (thoracic spine, sacrum/SIJ, knee, ankle, hip,
elbow, wrist, ribs, TMJ, etc.). **Owner/clinician (JP) action:** decide the full canonical
anatomical region set. This document deliberately does not invent it — extension is a
clinical decision, and the partner has committed to "emit exactly those" once we send a
list. Recommendation: JP ratifies a complete side-free region taxonomy in **v0.2**, built on
the 6 confirmed/proposed keys here.

### 4.2 Confidence-bucket inconsistency (carried from the diff doc)
Independent of regions, flagging for the same sign-off cycle: the partner doc is internally
inconsistent on `ai_confidence`. §4 / §7(b) declare discrete buckets **0.9 (high) / 0.7
(medium) / 0.5 (low)**, but the §8 worked example emits **`0.6`** for
`systems_review.respiratory` — a value outside the declared set. **Open question for
Andrei/owner:** confirm the canonical bucket set and reconcile the example (is `0.6` a
fourth bucket, a typo for `0.5`/`0.7`, or is the bucket scheme not actually discrete?). Not
a blocker for the region-key sign-off; both are in-range `[0,1]` for ingestion today.

### 4.3 Physiotherapy bodychart schema
Physio `bodychart` is `object | null` with no item schema, so region markers would be stored
into an unspecified object (§2.1). **Owner decision:** define the physio bodychart object
schema to match the region contract, or keep it opaque until physio bodychart UI lands. Ties
to partner open point (e) — bodychart stays `ai_extractable: false` regardless.

---

## 5. Sign-off block

```
[ ] CONFIRMED keys correct as region vocabulary: cervical, lumbar_spine, shoulder   — JP: ____  date: ____
[ ] Approve PROPOSED keys (promote to canonical): scapula, calcaneus, trochanter    — JP: ____  date: ____
[ ] Approve side-free normalization (right_shoulder → shoulder + side)               — JP: ____  date: ____
[ ] Approve proposed osteo view defaults in §2.2 (centroid left to app)              — JP: ____  date: ____
[ ] Region taxonomy completeness handled in a v0.2 list (4.1)                        — JP: ____  date: ____
[ ] Confidence-bucket inconsistency (4.2) routed to Andrei                           — owner: ____  date: ____
```

Once §5 is signed, the CONFIRMED + approved-PROPOSED keys are sent to Andrei as the canonical
region list he asked for in §7(d); he then "emits exactly those."

---

## 6. Methodology & scope

- **Read-only**, docs-only: one new file under `docs/ai-ingestion/`. No code, schema, flag,
  seed, or i18n touched. No `provision.ts`, dispatch module, staff, `permissions.ts`,
  integration modules, or the apps/api package modified.
- **Derived from existing sources only.** Every key traces to a cited line in the component,
  seed, contract, or partner draft. No region was invented; absent regions are explicitly
  deferred to a clinician decision (§4.1) rather than guessed.
- **Verified against latest `main`** (`acc23f9`): `BodyChart.tsx`, `osteopathy-v2.json`,
  `physiotherapy-v4.json`, `our-fields.md`, `partner-field-mapping-diff-v0.9.md`.
- **No PII:** only anatomical region tokens and enum values are reproduced; no patient
  narrative from the partner's worked example.

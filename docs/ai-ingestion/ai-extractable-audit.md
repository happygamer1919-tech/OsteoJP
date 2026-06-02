# OsteoJP — `ai_extractable` Audit & Normalization Proposal

**Status:** Audit + proposal. **No flag values are changed by this document.**
Which clinical fields the AI partner (Andrei) may write into is a clinical and
data-governance decision — see [§4](#4-proposed-ai_extractable-flags-pending-clinical-sign-off),
marked **pending clinical sign-off**.

Scope: the six seed templates in `packages/db/seed/form-templates/`. Companion to
[`our-fields.md`](./our-fields.md).

## Summary of findings

1. **Every `ai_extractable` flag across all six templates is currently `false`.** The
   field list we owe Andrei therefore signals nothing as extractable. This is a
   placeholder state, not a deliberate per-field decision.
2. **Placement is inconsistent between osteopathy and NESA** for grouped/object fields
   (detail in [§2](#2-placement-inconsistency-nesa-vs-osteopathy)).
3. **`physiotherapy` v3 is internally consistent** — flat field list, flag on every leaf.
4. **`massagem-terapeutica`, `pilates-terapeutico`, `rpg`** carry no fields of their own;
   they resolve to `physiotherapy` v3 via `x-form-ref`, so they inherit its flags and
   need no separate audit rows.

---

## 1. Field-by-field audit

Columns: **field key** · **template / form-ref** · **flag location** (where the
`ai_extractable` key sits and at what nesting level) · **current value**.

Flag-location legend:
- `field` — flag on the field's own schema node (nesting 0).
- `member` — flag on a member inside a container object (nesting 1).
- `item-prop` — flag on a sub-property of array `items` (nesting 2).
- `container` — flag on the grouping object itself.
- `— (absent)` — no `ai_extractable` key present at that node.

### 1.1 `osteopathy` (osteopathy-v1.json — `osteopathy` v1)

| Field key | Template | Flag location | Current value |
|---|---|---|---|
| `episode_date` | osteopathy | field | false |
| `weight_kg` | osteopathy | field | false |
| `height_cm` | osteopathy | field | false |
| `linked_appointment` | osteopathy | field | false |
| `red_flags` | osteopathy | field | false |
| `cid_codes` | osteopathy | field | false |
| `health_problems` | osteopathy | **container** | **— (absent)** |
| `health_problems.smoker` | osteopathy | member | false |
| `health_problems.pregnancy` | osteopathy | member | false |
| `health_problems.osteoporosis` | osteopathy | member | false |
| `health_problems.anemia` | osteopathy | member | false |
| `health_problems.lupus` | osteopathy | member | false |
| `health_problems.neoplasia` | osteopathy | member | false |
| `health_problems.dementia_alzheimer` | osteopathy | member | false |
| `health_problems.parkinson` | osteopathy | member | false |
| `health_problems.depression` | osteopathy | member | false |
| `health_problems.epilepsy` | osteopathy | member | false |
| `health_problems.multiple_sclerosis` | osteopathy | member | false |
| `health_problems.rheumatoid_arthritis` | osteopathy | member | false |
| `health_problems.food_allergies` | osteopathy | member | false |
| `health_problems.medication_allergies` | osteopathy | member | false |
| `health_problems.hypertension` | osteopathy | member | false |
| `health_problems.hypotension` | osteopathy | member | false |
| `health_problems.diabetes` | osteopathy | member | false |
| `health_problems.respiratory_problems` | osteopathy | member | false |
| `health_problems.covid_19` | osteopathy | member | false |
| `health_problems.other` | osteopathy | member | false |
| `consultation_reason` | osteopathy | field | false |
| `relief_aggravation` | osteopathy | field | false |
| `clinical_history` | osteopathy | field | false |
| `systems_review` | osteopathy | **container** | **— (absent)** |
| `systems_review.neurological` | osteopathy | member | false |
| `systems_review.cardiovascular` | osteopathy | member | false |
| `systems_review.respiratory` | osteopathy | member | false |
| `systems_review.gastrointestinal` | osteopathy | member | false |
| `systems_review.urological_gynecological` | osteopathy | member | false |
| `systems_review.endocrine` | osteopathy | member | false |
| `bodychart` | osteopathy | field (array) | false |
| `bodychart[].marker_type` | osteopathy | **item-prop** | false |
| `bodychart[].x` | osteopathy | **item-prop** | false |
| `bodychart[].y` | osteopathy | **item-prop** | false |
| `bodychart[].view` | osteopathy | **item-prop** | false |
| `treatment_objectives` | osteopathy | field | false |
| `treatment_plan` | osteopathy | field | false |
| `observations` | osteopathy | field | false |

### 1.2 `physiotherapy` (physiotherapy-v1.json — `physiotherapy` v3)

All 16 fields carry the flag at `field` level. Internally consistent.

| Field key | Template | Flag location | Current value |
|---|---|---|---|
| `episode_date` | physiotherapy | field | false |
| `weight_kg` | physiotherapy | field | false |
| `height_cm` | physiotherapy | field | false |
| `linked_appointment` | physiotherapy | field | false |
| `cid_codes` | physiotherapy | field | false |
| `red_flags` | physiotherapy | field | false |
| `main_complaints` | physiotherapy | field | false |
| `background` | physiotherapy | field | false |
| `medication` | physiotherapy | field | false |
| `diagnosis` | physiotherapy | field | false |
| `bodychart` | physiotherapy | field (object) | false |
| `treatment_goals` | physiotherapy | field | false |
| `treatment_plan` | physiotherapy | field | false |
| `observations` | physiotherapy | field | false |
| `private_notes` | physiotherapy | field | false |
| `consent_in_report` | physiotherapy | field | false |

### 1.3 `nesa` (nesa-v1.json — `nesa` v1)

| Field key | Template | Flag location | Current value |
|---|---|---|---|
| `episode_date` | nesa | field | false |
| `weight_kg` | nesa | field | false |
| `height_cm` | nesa | field | false |
| `linked_appointment` | nesa | field | false |
| `cid_codes` | nesa | field | false |
| `health_conditions` | nesa | **container** | **false** |
| `health_conditions.fumador` | nesa | member | **— (absent)** |
| `health_conditions.lupus` | nesa | member | — (absent) |
| `health_conditions.depressao` | nesa | member | — (absent) |
| `health_conditions.gravidez` | nesa | member | — (absent) |
| `health_conditions.neoplasia` | nesa | member | — (absent) |
| `health_conditions.epilepsia` | nesa | member | — (absent) |
| `health_conditions.alergias_alimentares` | nesa | member | — (absent) |
| `health_conditions.alergias_medicamento` | nesa | member | — (absent) |
| `health_conditions.osteoporose` | nesa | member | — (absent) |
| `health_conditions.demencia_alzheimer` | nesa | member | — (absent) |
| `health_conditions.esclerose_multipla` | nesa | member | — (absent) |
| `health_conditions.hipertensao` | nesa | member | — (absent) |
| `health_conditions.covid19` | nesa | member | — (absent) |
| `health_conditions.anemia` | nesa | member | — (absent) |
| `health_conditions.parkinson` | nesa | member | — (absent) |
| `health_conditions.artrite_reumatoide` | nesa | member | — (absent) |
| `health_conditions.hipotensao` | nesa | member | — (absent) |
| `health_conditions.diabetes` | nesa | member | — (absent) |
| `health_conditions.problemas_respiratorios` | nesa | member | — (absent) |
| `health_conditions.outros` | nesa | member | — (absent) |
| `red_flags` | nesa | field | false |
| `consultation_reason` | nesa | field | false |
| `relief_aggravation` | nesa | field | false |
| `clinical_background` | nesa | field | false |
| `systems_review` | nesa | **container** | **false** |
| `systems_review.neurologico` | nesa | member | **— (absent)** |
| `systems_review.cardiovascular` | nesa | member | — (absent) |
| `systems_review.respiratorio` | nesa | member | — (absent) |
| `systems_review.gastrointestinal` | nesa | member | — (absent) |
| `systems_review.urologico_ginecologico` | nesa | member | — (absent) |
| `systems_review.endocrino` | nesa | member | — (absent) |
| `bodychart` | nesa | field (object) | false |
| `treatment_goals` | nesa | field | false |
| `treatment_plan` | nesa | field | false |
| `observations` | nesa | field | false |
| `private_notes` | nesa | field | false |

### 1.4 Wrappers — `massagem-terapeutica`, `pilates-terapeutico`, `rpg`

No `properties`, no `ai_extractable` keys. Each has `x-form-ref: "physiotherapy"` and
inherits the `physiotherapy` v3 field list and flags in [§1.2](#12-physiotherapy-physiotherapy-v1json--physiotherapy-v3).

| Template id | File | Resolves to | `tipo_evento_dinamico` |
|---|---|---|---|
| `massagem-terapeutica` v1 | massagem-terapeutica-v1.json | physiotherapy | `Tratamento terapeutico` |
| `pilates-terapeutico` v1 | pilates-terapeutico-v1.json | physiotherapy | `Pilates` |
| `rpg` v1 | rpg-v1.json | physiotherapy | `Campo - R.P.G.` |

---

## 2. Placement inconsistency: NESA vs osteopathy

The two templates share the same grouped structures (`Problemas de Saúde` checkbox grid,
`Anamnese por Sistemas` free-text section) but place `ai_extractable` at **opposite
nesting levels**, and osteopathy adds a third pattern for the bodychart array.

| Structure | osteopathy | nesa |
|---|---|---|
| Health-problems checkbox grid | flag on **each member** (`health_problems.*`); **absent on container** | flag on the **container** (`health_conditions`); **absent on members** |
| Systems-review section | flag on **each member** (`systems_review.*`); **absent on container** | flag on the **container** (`systems_review`); **absent on members** |
| Bodychart | flag on the **array field** *and* on **each item sub-property** (`bodychart[].marker_type/x/y/view`) | flag on the **single object field** only |

Consequences:
- A consumer reading "is field X extractable?" gets `undefined` in osteopathy when it
  looks at the container, and `undefined` in NESA when it looks at a member — opposite
  blind spots for the same logical field.
- The osteopathy bodychart carries the flag at two nesting levels at once, so there are
  two sources of truth for one logical decision.

### Proposed normalized convention — ONE rule

> **`ai_extractable` lives on every leaf field that holds a writeable value, and only
> there. Grouping/container objects that exist purely to nest children do NOT carry the
> flag. Composite fields written as a single unit (e.g. `bodychart`) carry the flag once,
> on the field itself — never on their internal sub-properties.**

Rationale: the flag answers "can the AI partner write a value here?" The unit the partner
writes is a leaf value (a scalar, an array, or one structured `bodychart` payload). A
container that only groups children is never itself a write target, so a flag there is
ambiguous. One flag, on the write unit, removes both the container/member blind spots and
the double-source-of-truth on bodychart.

Result per structure: leaf checkbox members and systems-review members carry the flag;
their containers do not. `bodychart` carries the flag on the field; `bodychart[].*`
sub-properties carry none.

### Before / after

**A — NESA health-conditions grid** (move flag from container down to each member):

```jsonc
// BEFORE (nesa)
"health_conditions": {
  "type": "object",
  "x-widget": "checkbox_group",
  "properties": {
    "fumador": { "type": "boolean", "x-label": { "pt": "Fumador", "en": "Smoker" } },
    "lupus":   { "type": "boolean", "x-label": { "pt": "Lúpus",  "en": "Lupus" } }
    // ...
  },
  "ai_extractable": false            // ← flag on container
}

// AFTER (normalized)
"health_conditions": {
  "type": "object",
  "x-widget": "checkbox_group",
  "properties": {
    "fumador": { "type": "boolean", "x-label": { "pt": "Fumador", "en": "Smoker" }, "ai_extractable": false },
    "lupus":   { "type": "boolean", "x-label": { "pt": "Lúpus",  "en": "Lupus" },  "ai_extractable": false }
    // ...
  }
  // ← no flag on container
}
```

**B — Osteopathy bodychart** (remove per-item sub-property flags; keep one on the field):

```jsonc
// BEFORE (osteopathy)
"bodychart": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "marker_type": { "type": "string", "enum": [ /* ... */ ], "ai_extractable": false },  // ← item-prop flag
      "x":    { "type": "number", "ai_extractable": false },                                  // ← item-prop flag
      "y":    { "type": "number", "ai_extractable": false },                                  // ← item-prop flag
      "view": { "type": ["string","null"], "ai_extractable": false }                          // ← item-prop flag
    }
  },
  "ai_extractable": false            // ← field flag
}

// AFTER (normalized)
"bodychart": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "marker_type": { "type": "string", "enum": [ /* ... */ ] },   // ← no flag
      "x":    { "type": "number" },                                  // ← no flag
      "y":    { "type": "number" },                                  // ← no flag
      "view": { "type": ["string","null"] }                          // ← no flag
    }
  },
  "ai_extractable": false            // ← single flag, on the field
}
```

Osteopathy's `health_problems` / `systems_review` (members carry the flag, container does
not) and `physiotherapy`'s flat list already match the proposed convention and need no
change. NESA's `health_conditions` / `systems_review` and osteopathy's `bodychart` items
are the only nodes to normalize. **This normalization is a structural placement change
only — it does not alter any `false` value to `true`, and is not applied by this PR.**

---

## 3. Why nothing is flipped here

The audit above and the proposal below are documentation. The `ai_extractable: true`
decision determines which clinical content an external party may pre-populate into a
patient's clinical record — a clinical-safety and data-governance call reserved for owner
sign-off, per CLAUDE.md (clinical data, AI-partner contract). This PR ships **seed JSON
and docs with no flag flipped to `true` and no migration.**

---

## 4. Proposed `ai_extractable` flags — **PENDING CLINICAL SIGN-OFF**

Proposal only. Grouped by template, with a one-line rationale each. The AI partner runs an
ambient-recording → transcription → LLM-extraction pipeline, and every ingested record is
human-reviewed before it is accepted (never written `locked`/`signed` directly). The
proposal leans on that review gate but still keeps safety-critical and coded fields
human-driven until explicitly signed off.

### Three tiers

- **Tier 1 — propose `true`:** narrative free-text the session transcription naturally
  captures; low risk to pre-fill for reviewer editing.
- **Tier 2 — candidate, keep `false` for now:** dictated but safety-critical or coded;
  needs explicit clinical sign-off before flipping.
- **Always `false`:** system/metadata, measured biometrics, spatial, private, or
  legal-toggle fields — app/clinician-driven by design.

### 4.1 `osteopathy` v1

**Tier 1 — propose `true`**

| Field | Rationale |
|---|---|
| `consultation_reason` | Chief complaint / onset / context — the core spoken narrative of the visit. |
| `relief_aggravation` | Patient-reported relieving/aggravating factors; pure narrative. |
| `clinical_history` | History of conditions/surgery/medication as recounted in session. |
| `systems_review.neurological` | Per-system findings discussed verbally; free text. |
| `systems_review.cardiovascular` | Same — narrative per-system note. |
| `systems_review.respiratory` | Same. |
| `systems_review.gastrointestinal` | Same. |
| `systems_review.urological_gynecological` | Same. |
| `systems_review.endocrine` | Same. |
| `treatment_objectives` | Goals stated by the practitioner; narrative. |
| `treatment_plan` | Plan described in session; narrative. |
| `observations` | Catch-all narrative notes. |

**Tier 2 — candidate, keep `false` pending sign-off**

| Field | Rationale |
|---|---|
| `red_flags` | Safety-critical alerts; AI may surface but must not be the sole author. |
| `health_problems.*` (checkbox grid) | Coded intake booleans; high false-positive risk from ambient mentions. |
| `cid_codes` | ICD/CID coding is a clinician decision, not transcription output. |

**Always `false`:** `episode_date`, `weight_kg`, `height_cm`, `linked_appointment`,
`bodychart` (+ items).

### 4.2 `physiotherapy` v3 (also applies to `massagem-terapeutica`, `pilates-terapeutico`, `rpg`)

**Tier 1 — propose `true`**

| Field | Rationale |
|---|---|
| `main_complaints` | Chief complaint as stated; core narrative. |
| `background` | History/antecedents recounted in session. |
| `treatment_goals` | Goals stated; narrative. |
| `treatment_plan` | Plan described; narrative. |
| `observations` | Catch-all narrative notes. |

**Tier 2 — candidate, keep `false` pending sign-off**

| Field | Rationale |
|---|---|
| `medication` | Dictated but safety-relevant; reviewer must verify before trust. |
| `diagnosis` | A clinician judgment; AI may transcribe but should not author unreviewed. |
| `red_flags` | Safety-critical alerts; human-authored/confirmed. |
| `cid_codes` | Coding is a clinician decision. |

**Always `false`:** `episode_date`, `weight_kg`, `height_cm`, `linked_appointment`,
`bodychart`, `private_notes` (explicitly private — `x-private`, never shared),
`consent_in_report` (legal UI toggle).

### 4.3 `nesa` v1

Mirrors osteopathy (NESA was derived from it). Field keys are PT-derived as in the seed.

**Tier 1 — propose `true`**

| Field | Rationale |
|---|---|
| `consultation_reason` | Chief complaint / onset / context; core narrative. |
| `relief_aggravation` | Patient-reported factors; narrative. |
| `clinical_background` | History/surgery/medication recounted in session. |
| `systems_review.neurologico` | Per-system narrative finding. |
| `systems_review.cardiovascular` | Same. |
| `systems_review.respiratorio` | Same. |
| `systems_review.gastrointestinal` | Same. |
| `systems_review.urologico_ginecologico` | Same. |
| `systems_review.endocrino` | Same. |
| `treatment_goals` | Goals stated; narrative. |
| `treatment_plan` | Plan described; narrative. |
| `observations` | Catch-all narrative notes. |

**Tier 2 — candidate, keep `false` pending sign-off**

| Field | Rationale |
|---|---|
| `red_flags` | Safety-critical alerts; human-confirmed. |
| `health_conditions.*` (checkbox grid) | Coded intake booleans; false-positive risk. |
| `cid_codes` | Coding is a clinician decision. |

**Always `false`:** `episode_date`, `weight_kg`, `height_cm`, `linked_appointment`,
`bodychart`, `private_notes` (`x-private`).

> Open item carried from the NESA seed `_meta`: owner must still confirm whether NESA
> needs NESA-specific fields (protocol, stimulation parameters). Any such fields would get
> their own tier assignment when added.

---

## 5. Recommended next steps (post sign-off)

1. Clinical/governance sign-off on the [§4](#4-proposed-ai_extractable-flags-pending-clinical-sign-off) tiers — confirm which Tier 1/Tier 2 fields flip to `true`.
2. Apply the [§2](#2-placement-inconsistency-nesa-vs-osteopathy) normalization (placement only) in the same change, so flags land in one consistent location before any flip.
3. Bump template versions where flags change (templates are immutable once referenced by a record).
4. Regenerate [`our-fields.md`](./our-fields.md) so the partner-facing list reflects the new flags.

# OsteoJP — Clinical Form Fields (AI Ingestion Mapping)

This document is the canonical field mapping for the AI ingestion partner. It lists,
per clinical form template, the **template id** (`key` + `version`) and every field's
**machine key**, **type**, **`ai_extractable` flag**, **PT label**, and **EN label**.

It is generated from the JSON-Schema seed templates in
`packages/db/seed/form-templates/`. It is the contract for matching the partner's
template ids and field keys to ours. **No fields are invented here** — anything not in
the seed JSON is not in this document.

> Source of truth: the seed JSON files. If a field is not listed here, it does not
> exist in our templates. When the templates change, regenerate this document.

---

## 1. Per-field object shape we expect on ingestion

For every field the partner fills, send an object — not a bare scalar — so we can audit
provenance and confidence before a human reviewer accepts the payload:

```jsonc
{
  "<field_key>": {
    "value": <the extracted value, typed per the field's "type" below>,
    "fill_source": "ai" | "transcription" | "human" | "unknown",
    "ai_confidence": 0.0 - 1.0   // model confidence; null when fill_source != "ai"
  }
}
```

- `value` — the extracted value, matching the field's declared type (string, number,
  boolean, array, or the nested object shapes below). `null` is allowed where the type
  permits it.
- `fill_source` — what produced the value. Lets the reviewer triage AI-derived content
  separately from human-entered content.
- `ai_confidence` — model confidence in `[0, 1]` for AI-filled fields; `null` otherwise.

A record arriving through ingestion is never written as `locked`/`signed` directly — a
human reviewer accepts the payload first, after which the resulting `clinical_record`
follows the standard `draft → locked → signed` lifecycle.

### `ai_extractable` — current state

**Every `ai_extractable` flag in every template is currently `false`.** This is
deliberate: the flags are held at `false` pending sign-off of the AI-partner ingestion
contract. Once the contract is signed, we will flip selected narrative fields (e.g.
`consultation_reason`, `clinical_history`, `treatment_plan`, `observations`,
`systems_review.*`) to `true` per template. Structured/coded fields (booleans, dates,
coordinates, coded arrays) will most likely stay app-driven (`false`).

The tables below report the flag **exactly as it stands in the seed JSON** — i.e. `false`
on every field today. Do not treat any field as AI-fillable until this document says so.

---

## 2. Bodychart contract

The partner does **not** send pixel or coordinate data. The bodychart payload is
**structured anatomical regions plus an intensity descriptor**:

```jsonc
"bodychart": [
  {
    "region": "<anatomical region key>",   // e.g. lumbar_spine, right_shoulder, cervical
    "side": "left" | "right" | "midline" | null,
    "marker_type": "<one of the marker enums below>",
    "intensity": "mild" | "moderate" | "severe" | null   // descriptor, NOT a 0–10 number
  }
]
```

- Send **anatomical regions**, not normalized `x`/`y` coordinates. Our app maps each
  region onto its own bodychart marker model.
- `intensity` is a **descriptor** (mild / moderate / severe), not a numeric coordinate
  or pain scale.
- `marker_type` uses the marker vocabulary defined on the osteopathy template (see the
  `bodychart[].marker_type` enum in §3.1): `blockage_dysfunction`, `scar`,
  `hypertonicity`, `hypotonicity`, `pain_radiation`, `pain_location`, `paresthesia`,
  `rotation_right`, `rotation_left`.

> **Internal note (divergence the partner should be aware of):** Our current seed
> storage differs from this ingestion contract. The osteopathy template stores bodychart
> markers as normalized coordinates (`x`, `y` in `0–1`) plus a `view` enum
> (`anterior`/`lateral_left`/`lateral_right`/`posterior`). The physiotherapy and NESA
> templates declare `bodychart` as an unspecified object. The **ingestion contract is
> region-based** regardless; the app is responsible for translating regions to its
> internal marker model. The partner should send regions + intensity, never coordinates.

---

## 3. Templates

Field-bearing templates: `osteopathy`, `physiotherapy`, `nesa`. The remaining three
(`massagem-terapeutica`, `pilates-terapeutico`, `rpg`) are thin wrappers that resolve to
the `physiotherapy` field set — see §4.

Nested object members are shown with dotted / `[]` keys (e.g. `health_problems.smoker`,
`bodychart[].marker_type`). Rows marked *(container)* are object sections that group the
fields beneath them and carry no `value` of their own.

---

### 3.1 `osteopathy` (version 1)

- **Template id:** `osteopathy` v1
- **File:** `packages/db/seed/form-templates/osteopathy-v1.json`
- **Title:** Osteopatia — Avaliação de Episódio / Osteopathy — Episode Evaluation
- **Required:** `episode_date`, `consultation_reason`

| Field key | Type | ai_extractable | PT label | EN label |
|---|---|---|---|---|
| `episode_date` | string (date) | false | Data do Episódio | Episode Date |
| `weight_kg` | number \| null | false | Peso (kg) | Weight (kg) |
| `height_cm` | number \| null | false | Altura (cm) | Height (cm) |
| `linked_appointment` | string \| null | false | Marcação respectiva | Linked Appointment |
| `red_flags` | string \| null | false | Alertas (Red Flags) | Alerts (Red Flags) |
| `cid_codes` | array<string> | false | Códigos CID associados | Associated CID Codes |
| `health_problems` | object *(container)* | — | Problemas de Saúde | Health Problems |
| `health_problems.smoker` | boolean | false | Fumador | Smoker |
| `health_problems.pregnancy` | boolean | false | Gravidez | Pregnancy |
| `health_problems.osteoporosis` | boolean | false | Osteoporose | Osteoporosis |
| `health_problems.anemia` | boolean | false | Anemia | Anemia |
| `health_problems.lupus` | boolean | false | Lúpus | Lupus |
| `health_problems.neoplasia` | boolean | false | Neoplasia | Neoplasia |
| `health_problems.dementia_alzheimer` | boolean | false | Demência / Alzheimer | Dementia / Alzheimer |
| `health_problems.parkinson` | boolean | false | Parkinson | Parkinson's |
| `health_problems.depression` | boolean | false | Depressão | Depression |
| `health_problems.epilepsy` | boolean | false | Epilepsia | Epilepsy |
| `health_problems.multiple_sclerosis` | boolean | false | Esclerose múltipla | Multiple Sclerosis |
| `health_problems.rheumatoid_arthritis` | boolean | false | Artrite reumatóide | Rheumatoid Arthritis |
| `health_problems.food_allergies` | boolean | false | Alergias Alimentares | Food Allergies |
| `health_problems.medication_allergies` | boolean | false | Alergias Medicamentosas | Medication Allergies |
| `health_problems.hypertension` | boolean | false | Hipertensão | Hypertension |
| `health_problems.hypotension` | boolean | false | Hipotensão | Hypotension |
| `health_problems.diabetes` | boolean | false | Diabetes | Diabetes |
| `health_problems.respiratory_problems` | boolean | false | Problemas Respiratórios | Respiratory Problems |
| `health_problems.covid_19` | boolean | false | COVID-19 | COVID-19 |
| `health_problems.other` | string \| null | false | Outros | Other |
| `consultation_reason` | string | false | Motivos da Consulta / Início / Contexto em que ocorre | Reason for Consultation / Onset / Context |
| `relief_aggravation` | string \| null | false | Condições Alívio / Agravamento | Relieving / Aggravating Factors |
| `clinical_history` | string \| null | false | Antecedentes Clínicos / Cirurgia / Medicação | Clinical History / Surgery / Medication |
| `systems_review` | object *(container)* | — | Anamnese por Sistemas | Systems Review |
| `systems_review.neurological` | string \| null | false | Neurológico | Neurological |
| `systems_review.cardiovascular` | string \| null | false | Cardiovascular | Cardiovascular |
| `systems_review.respiratory` | string \| null | false | Respiratório | Respiratory |
| `systems_review.gastrointestinal` | string \| null | false | Gastrointestinal | Gastrointestinal |
| `systems_review.urological_gynecological` | string \| null | false | Urológico / Ginecológico | Urological / Gynecological |
| `systems_review.endocrine` | string \| null | false | Endócrino | Endocrine |
| `bodychart` | array | false | Bodychart | Bodychart |
| `bodychart[].marker_type` | string (enum) | false | Tipo de marcador | Marker type |
| `bodychart[].x` | number | false | — *(normalized X coord 0–1)* | — |
| `bodychart[].y` | number | false | — *(normalized Y coord 0–1)* | — |
| `bodychart[].view` | string \| null (enum) | false | — *(anterior / lateral_left / lateral_right / posterior)* | — |
| `treatment_objectives` | string \| null | false | Objectivos do Tratamento | Treatment Objectives |
| `treatment_plan` | string \| null | false | Plano de Tratamento | Treatment Plan |
| `observations` | string \| null | false | Observações | Observations |

`bodychart[].marker_type` enum: `blockage_dysfunction` (Bloqueio / Disfunção),
`scar` (Cicatriz), `hypertonicity` (Hipertonicidade), `hypotonicity` (Hipotonicidade),
`pain_radiation` (Irradiação da dor), `pain_location` (Local da dor),
`paresthesia` (Parestesia), `rotation_right` (Rotação direita),
`rotation_left` (Rotação esquerda).

> Per the ingestion contract (§2), the partner sends bodychart as anatomical regions +
> intensity descriptor, not the `x`/`y`/`view` coordinate shape stored internally above.

---

### 3.2 `physiotherapy` (version 3)

- **Template id:** `physiotherapy` v3
- **File:** `packages/db/seed/form-templates/physiotherapy-v1.json`
- **Title:** Fisioterapia — Avaliação de Episódio / Physiotherapy — Episode Evaluation
- **Required:** `episode_date`
- **Shared by all physio therapy types** (RPG, massagem terapêutica, pilates
  terapêutico). 16 fields in document order.

| Field key | Type | ai_extractable | PT label | EN label |
|---|---|---|---|---|
| `episode_date` | string (date) | false | Data do Episódio | Episode Date |
| `weight_kg` | number \| null | false | Peso (em kg) | Weight (kg) |
| `height_cm` | number \| null | false | Altura (em cm) | Height (cm) |
| `linked_appointment` | string \| null | false | Marcação respectiva | Linked Appointment |
| `cid_codes` | array<string> | false | Códigos CID associados | Associated ICD Codes |
| `red_flags` | string \| null | false | Alertas (Red Flags) | Red Flags |
| `main_complaints` | string \| null | false | Principais Queixas | Main Complaints |
| `background` | string \| null | false | Antecedentes | Background / History |
| `medication` | string \| null | false | Medicação | Medication |
| `diagnosis` | string \| null | false | Diagnóstico | Diagnosis |
| `bodychart` | object \| null | false | Bodychart | Body Chart |
| `treatment_goals` | string \| null | false | Objectivos do Tratamento | Treatment Goals |
| `treatment_plan` | string \| null | false | Plano de Tratamento | Treatment Plan |
| `observations` | string \| null | false | Observações | Observations |
| `private_notes` | string \| null | false | Notas Pessoais sobre o Utente neste Episódio / Consulta | Personal Notes (this episode) |
| `consent_in_report` | boolean | false | Inserir Consentimento no Relatório | Include Consent in Report |

Notes:
- `main_complaints` label changes to "Queixas Atuais" / "Current Complaints" on
  continuation evaluations (subav).
- `private_notes` is private (`x-private`): not shared with other users of the account.
  Should not be a target for ingestion fill.
- `bodychart` declared as an object (markers: Bloqueio / Disfunção, Cicatriz,
  Hipertonicidade, Hipotonicidade, Irradiação da dor, Local da dor, Parestesia,
  Rotação direita, Rotação esquerda). Ingest as regions + intensity per §2.

---

### 3.3 `nesa` (version 1)

- **Template id:** `nesa` v1
- **File:** `packages/db/seed/form-templates/nesa-v1.json`
- **Title:** NESA — Avaliação de Episódio / NESA — Episode Evaluation
- **Required:** `episode_date`, `consultation_reason`
- Derived from the osteopathy form as closest clinical analogue. **Owner confirmation
  pending** on whether NESA needs added/removed/renamed fields (e.g. NESA protocol /
  stimulation parameters). Field keys here use PT-derived machine keys as in the seed.

| Field key | Type | ai_extractable | PT label | EN label |
|---|---|---|---|---|
| `episode_date` | string (date) | false | Data do Episódio | Episode Date |
| `weight_kg` | number \| null | false | Peso (kg) | Weight (kg) |
| `height_cm` | number \| null | false | Altura (cm) | Height (cm) |
| `linked_appointment` | string \| null | false | Marcação respectiva | Linked Appointment |
| `cid_codes` | array<string> | false | Códigos CID associados | Associated ICD Codes |
| `health_conditions` | object *(container)* | false | Problemas de Saúde | Health Conditions |
| `health_conditions.fumador` | boolean | — | Fumador | Smoker |
| `health_conditions.lupus` | boolean | — | Lúpus | Lupus |
| `health_conditions.depressao` | boolean | — | Depressão | Depression |
| `health_conditions.gravidez` | boolean | — | Gravidez | Pregnancy |
| `health_conditions.neoplasia` | boolean | — | Neoplasia | Neoplasia |
| `health_conditions.epilepsia` | boolean | — | Epilépsia | Epilepsy |
| `health_conditions.alergias_alimentares` | boolean | — | Alergias Alimentares | Food Allergies |
| `health_conditions.alergias_medicamento` | boolean | — | Alergias Medicament. | Drug Allergies |
| `health_conditions.osteoporose` | boolean | — | Osteoporose | Osteoporosis |
| `health_conditions.demencia_alzheimer` | boolean | — | Demência / Alzheimer | Dementia / Alzheimer |
| `health_conditions.esclerose_multipla` | boolean | — | Esclerose múltipla | Multiple Sclerosis |
| `health_conditions.hipertensao` | boolean | — | Hipertensão | Hypertension |
| `health_conditions.covid19` | boolean | — | COVID-19 | COVID-19 |
| `health_conditions.anemia` | boolean | — | Anemia | Anaemia |
| `health_conditions.parkinson` | boolean | — | Parkinson | Parkinson's |
| `health_conditions.artrite_reumatoide` | boolean | — | Artrite reumatóide | Rheumatoid Arthritis |
| `health_conditions.hipotensao` | boolean | — | Hipotensão | Hypotension |
| `health_conditions.diabetes` | boolean | — | Diabetes | Diabetes |
| `health_conditions.problemas_respiratorios` | boolean | — | Problemas Respira. | Respiratory Issues |
| `health_conditions.outros` | string \| null | — | Outros | Other |
| `red_flags` | string \| null | false | Alertas Red Flags | Red Flags |
| `consultation_reason` | string | false | Motivos da Consulta / Início / Contexto em que Ocorre | Consultation Reason / Onset / Context |
| `relief_aggravation` | string \| null | false | Condições Alívio / Agravamento | Relief / Aggravation Conditions |
| `clinical_background` | string \| null | false | Antecedentes Clínicos / Cirurgia / Medicação | Clinical Background / Surgery / Medication |
| `systems_review` | object *(container)* | false | Anamnese por Sistemas | Systems Review |
| `systems_review.neurologico` | string \| null | — | Neurológico | Neurological |
| `systems_review.cardiovascular` | string \| null | — | Cardiovascular | Cardiovascular |
| `systems_review.respiratorio` | string \| null | — | Respiratório | Respiratory |
| `systems_review.gastrointestinal` | string \| null | — | Gastrointestinal | Gastrointestinal |
| `systems_review.urologico_ginecologico` | string \| null | — | Urológico / Ginecológico | Urological / Gynaecological |
| `systems_review.endocrino` | string \| null | — | Endócrino | Endocrine |
| `bodychart` | object \| null | false | Bodychart | Body Chart |
| `treatment_goals` | string \| null | false | Objectivos do Tratamento | Treatment Goals |
| `treatment_plan` | string \| null | false | Plano de Tratamento | Treatment Plan |
| `observations` | string \| null | false | Observações | Observations |
| `private_notes` | string \| null | false | Notas Pessoais sobre o Utente neste Episódio / Consulta | Personal Notes (this episode) |

> In the NESA seed, the `health_conditions` and `systems_review` **container objects**
> each carry `ai_extractable: false`, but their individual member fields do **not**
> declare the flag (shown as `—`). The osteopathy equivalents are the inverse (members
> carry `false`, containers carry no flag). Both are reproduced exactly as in source.
> `private_notes` is private (`x-private`); not an ingestion target.

---

## 4. Wrapper templates (resolve to `physiotherapy`)

These three files carry **no independent field list**. Each is a named scheduler entry
point with `x-form-ref: "physiotherapy"` — booking one of these therapy types associates
the `physiotherapy` v3 field set (§3.2). Therapy type is appointment metadata
(`tipo_evento_dinamico`), not a form selector.

| Template id | File | Resolves to | `tipo_evento_dinamico` |
|---|---|---|---|
| `massagem-terapeutica` v1 | `massagem-terapeutica-v1.json` | `physiotherapy` | `Tratamento terapeutico` |
| `pilates-terapeutico` v1 | `pilates-terapeutico-v1.json` | `physiotherapy` | `Pilates` |
| `rpg` v1 | `rpg-v1.json` | `physiotherapy` | `Campo - R.P.G.` |

---

## 5. Summary — ai_extractable contribution per template

All flags are `false` pending AI-partner contract sign-off, so **every template
contributes 0 `ai_extractable: true` fields today.**

| Template id | Field-bearing | `ai_extractable: true` fields |
|---|---|---|
| `osteopathy` v1 | yes | 0 |
| `physiotherapy` v3 | yes | 0 |
| `nesa` v1 | yes | 0 |
| `massagem-terapeutica` v1 | wrapper → physiotherapy | 0 |
| `pilates-terapeutico` v1 | wrapper → physiotherapy | 0 |
| `rpg` v1 | wrapper → physiotherapy | 0 |

# SPEC - Ficha Medica (unified clinical record)

> **STATUS: SPEC ONLY - NO BUILD THIS LOOP.** This document is a design source of
> truth. It adds no product code, no dependency, no route, no schema change, no
> env/secret. It is the contract the Wave 05 Ficha Medica build chain (W5-13 ->
> W5-14 -> W5-15 -> W5-16 -> W5-17) consumes and MUST be merged before those loops
> build against it. Authored by YELLOW (Wave 05 authoring), from the owner+Rodica
> QA pass and the Ficha Medica redesign decision.

> **Authority.** This SPEC is authoritative for all four Batch-4 loops (W5-13
> ficha-unification, W5-14 ficha-structure, W5-15 mobilidade-component, W5-16
> ficha-signature-consent) and for the W5-17 revisao-consulta-flow that lands the
> AI draft into this form. Where a Batch-4 loop file and this SPEC disagree, this
> SPEC wins; the loop file records the delta.

Design language authority: `docs/design/UI-STYLE.md` (brand tokens teal `#45B9A7`,
magenta `#8B1863`, grey `#98B2C2`; Inter; `@osteojp/ui` primitives; no emoji). All
UI copy is **pt-PT via i18n keys** (`@osteojp/i18n`, keys added to BOTH
`strings.pt.json` and `strings.en.json`). Plain hyphens throughout, never em/en
dashes.

---

## 0. Recon ground truth (read-only, recorded 2026-07-08)

The build loops run with zero memory; the facts they depend on are frozen here.

- **Template storage mechanism.** Form templates are **JSON-Schema-driven** rows in
  the `form_templates` table, upsert-keyed on `(tenant_id, key, version)` (CLAUDE.md
  rule 5: versioned + immutable once referenced by a record). Each row carries
  `key`, `version`, `title {pt,en}`, and a `schema` JSON-Schema body stored
  verbatim. Rows are seeded from `packages/db/seed/form-templates/*.json` via
  `packages/db/seed/form-templates.ts` (idempotent upsert; `x-form-ref` pointer
  wrappers reuse another template's form and are skipped, not upserted).
- **Templates on disk today** (key, latest version, pt title):
  `ficha_geral` v1 "Ficha Geral"; `osteopathy` v2 "Osteopatia - Avaliacao de
  Episodio"; `physiotherapy` v4 "Fisioterapia - Avaliacao de Episodio"; `nesa` v1
  "NESA - Avaliacao de Episodio"; plus `x-form-ref` wrappers `massagem-terapeutica`,
  `pilates-terapeutico`, `rpg` (all point at `physiotherapy`).
- **The `osteopathy` v2 template already holds the entire clinical spine** the
  Ficha Medica needs: `episode_date`, `weight_kg`, `height_cm`,
  `linked_appointment` (appointment_picker), `red_flags`, `cid_codes`,
  `health_problems` (checkbox_group of 19 booleans + `other`), `consultation_reason`,
  `relief_aggravation`, `clinical_history`, `systems_review.*` (6),
  `bodychart` (marker array), `treatment_objectives`, `treatment_plan`,
  `observations`. Seed: `packages/db/seed/form-templates/osteopathy-v2.json`.
- **The record creation flow** at `apps/web/app/clinical/new/page.tsx` currently
  offers a **template picker dropdown** listing every active template (highest
  version per key); `createRecordAction` -> `createDraftRecord(ctx, {...})` inserts a
  `clinical_records` row with `status='draft'`. Business logic:
  `apps/web/lib/clinical/records.ts`.
- **Record immutability** is enforced twice: the DB trigger
  `enforce_clinical_record_immutability` (migration `0001_rls.sql`) raises on any
  UPDATE/DELETE when `status IN ('locked','signed')`; the app guard
  `updateRecordData()` throws `ClinicalError("finalized")` when `status !== 'draft'`.
  **This SPEC never bypasses either.**
- **The live AI pipeline** (SPEC-ai-recording.md, shipped W4-06..W4-10) posts audio
  to Andre's Make.com, which returns extracted fields to
  `POST /api/v1/ingestion/clinical-records` (HMAC-SHA256). The inbound endpoint
  today stores the partner payload **verbatim** under
  `clinical_records.data = { "_aiIngestionRaw": <payload> }` with
  `source='ai_ingested'`, `status='draft'`, `ai_review_state='pending_review'`. It
  does **not** yet map payload keys onto form fields; the partner field-mapping is
  the open item that gates live ingestion (endpoint-contract.md sec 7). The outbound
  M1 webhook fixes `template = osteopathy` and the twelve extracted keys.

---

## 1. DECISION

**One clinical record template per new-patient/new-record workflow, named
"Ficha Medica".** From the moment W5-13 ships, the record creation flow offers a
single template: Ficha Medica. All other templates retire **from the creation
flow**: `ficha_geral` (Ficha Geral), `physiotherapy` (Fisioterapia), `nesa`
(NESA-as-template), and the `x-form-ref` wrappers (massagem, pilates, rpg) are no
longer selectable when creating a new record. The `osteopathy` lineage is not
"retired" but **evolved** into Ficha Medica (see sec 2, compatibility).

**Existing records are untouched.** Every clinical record already written - draft,
locked, or signed - keeps its original `form_template` reference and renders with
its original structure. **Immutability is never bypassed** (sec 0). Retiring a
template from the *creation* flow does not delete the template row or rewrite any
record that points at it; historical fichas render exactly as they were captured.

**NESA disambiguation.** "NESA" names two unrelated things: (a) the `nesa` v1
**template** (`nesa-v1.json`, a full schema whose structure follows the osteopathy
episode form), and (b) the **NESA contraindication booking-warning** system
(migration 0031: `patients.contraindication_epilepsy`,
`patients.contraindication_pregnancy`, `services.contraindication_sensitive`,
driving the W2-08 soft booking warning). This DECISION retires only (a) - the NESA
template - from the record creation flow. The (b) booking-warning system is
**out of scope and stays fully intact**. See QUESTIONS Q-W5-5.

---

## 2. COMPATIBILITY CONSTRAINT (hard)

The live AI recording pipeline is in production and **must not change on Andre's
Make.com side** (zero change). It posts records tied to `template = osteopathy`
carrying **exactly twelve fixed clinical field keys**:

| # | Field key (osteopathy v2) | pt label |
|---|---|---|
| 1 | `consultation_reason` | Motivos da Consulta / Inicio / Contexto |
| 2 | `relief_aggravation` | Condicoes Alivio / Agravamento |
| 3 | `clinical_history` | Antecedentes Clinicos / Cirurgia / Medicacao |
| 4 | `systems_review.neurological` | Neurologico |
| 5 | `systems_review.cardiovascular` | Cardiovascular |
| 6 | `systems_review.respiratory` | Respiratorio |
| 7 | `systems_review.gastrointestinal` | Gastrointestinal |
| 8 | `systems_review.urological_gynecological` | Urologico / Ginecologico |
| 9 | `systems_review.endocrine` | Endocrino |
| 10 | `treatment_objectives` | Objectivos do Tratamento |
| 11 | `treatment_plan` | Plano de Tratamento |
| 12 | `observations` | Observacoes |

**Requirement.** The ingestion endpoint must map `template = osteopathy` to Ficha
Medica **server-side**, and **every one of the twelve keys must map to a Ficha
Medica field with keys unchanged, or translated server-side** so the value lands in
the correct Ficha Medica field. If any single key cannot land in a Ficha Medica
field, that is a **PRODUCT halt** (write the halt file, fire the notification,
stop) - **never an improvisation, never a silent drop**.

**Why this is satisfiable with keys unchanged (recon).** Ficha Medica is built by
**evolving the `osteopathy` template** (sec 0): all twelve keys already exist in
`osteopathy-v2.json` with exactly these key paths, and the authoritative field
sequence (sec 5) reuses them verbatim. The recommended implementation is therefore
a **new `osteopathy` version** (bump to v3 - v2 stays immutable for records that
reference it) that (a) keeps `key = "osteopathy"` and all twelve field keys
unchanged, (b) retitles to "Ficha Medica", and (c) adds the new fields (mobilidade,
testes, diagnostico, tratamento, signature/consent). Under this path the mapping is
**identity** - the outbound `template=osteopathy` selector and the twelve inbound
keys both continue to resolve with zero server-side translation and zero Andre-side
change.

If a build loop instead mints a **new `key` (e.g. `ficha_medica`)**, it MUST add a
server-side alias that maps `template=osteopathy` -> Ficha Medica and each of the
twelve keys -> its Ficha Medica field, proven by the W5-13 test. Either path
satisfies the constraint; the identity path (evolve `osteopathy`) is strongly
recommended because it is the smaller, safer diff and the least coupling to Andre's
mapping work. The key-identity choice is a build decision recorded in W5-13, not a
product decision.

**Proof obligation (W5-13).** A test posts a `template = osteopathy` payload
carrying the twelve keys through the real ingestion path and asserts a correct
draft lands with each of the twelve values reachable in the Ficha Medica field it
belongs to (pending the partner field-mapping that binds `_aiIngestionRaw` keys to
form fields; sec 0). No key silently dropped.

---

## 3. NO-DUPLICATION RULE

The ficha **never re-requests data already in the patient profile.** Identity and
demographic data - nome, NIF, contactos (telemovel, email), morada/localidade,
regiao, **profissao**, data de nascimento, sexo, numero de paciente - live on the
patient record and are entered/edited there, never inside the ficha.

The ficha shows a **read-only patient header strip** pulled from the profile at the
top of the form: name + patient number + the few demographics a clinician needs at
a glance (e.g. data de nascimento / sexo / profissao). The strip is display-only;
editing a demographic is done on the patient profile, not the ficha. Nothing in the
health-status block (sec 5.4) or elsewhere in the ficha duplicates a profile field.

---

## 4. CREATION TIMESTAMP

**No manual created-date picker.** The record's creation instant is auto-stamped
(`created_at`, UTC in DB, Europe/Lisbon for display) and shown in the patient
profile alongside the record. Clinicians never hand-type when the record was made.

**Data do Episodio remains a clinical field** (`episode_date`), **prefilled to
today and editable** - it is a clinical fact (the date the episode/consultation
pertains to), distinct from the record's creation instant. See QUESTIONS Q-W5-1
(recommended default: keep it editable, prefilled today).

---

## 5. FIELD SEQUENCE (authoritative order)

This mirrors the Fisiozero episode form. The order below is binding; W5-14 and
W5-15 implement it exactly. Keys in `code` are the existing osteopathy-v2 keys
(reuse verbatim - sec 2); fields marked **NEW** do not exist in osteopathy-v2 and
are added by Ficha Medica.

**5.0 Patient header strip (read-only).** Pulled from the profile (sec 3). Not a
data-entry field.

**5.1 Header row.** `episode_date` (Data do Episodio, prefilled today, editable),
`weight_kg` (Peso (kg)), `height_cm` (Altura (cm)), `linked_appointment` (Marcacao
respectiva, dropdown / appointment_picker). **Peso and Altura are adjacent, nothing
between them.**

**5.2 Alertas (sinais de alarme).** `red_flags` textarea.

**5.3 Codigos CID associados.** `cid_codes`.

**5.4 Problemas de Saude** - `health_problems`, a **four-column checkbox grid**, in
this membership: Fumador, Lupus, Depressao, Alergias Alimentares, Diabetes,
Gravidez, Neoplasia, Epilepsia, Alergias Medicamentosas, Problemas Respiratorios,
Osteoporose, Demencia / Alzheimer, Esclerose multipla, Hipertensao, COVID-19,
Anemia, Parkinson, Artrite reumatoide, Hipotensao - plus an **inline Outros** text
field. Rules:
  - The current **broken rendering** (only Lupus under the header, the rest orphaned
    below Outros - root cause: the `checkbox_group` renderer in
    `apps/web/app/clinical/[id]/RecordForm.tsx` mixes a full-width `sm:col-span-2`
    text item ("Outros") into the same grid as bare single-column checkboxes,
    disrupting grid flow) is **replaced by this four-column grid**. **Lupus joins the
    grid** as a normal cell.
  - **Outros** is reserved for allergy and medication specifics and for items not
    covered by the grid. It renders after the grid, not interleaved into it.
  - **Nothing here duplicates Anamnese por Sistemas** (5.8).
  - This grid sits **directly adjacent to (above) Anamnese por Sistemas** as one
    health-status block.
  - The 19 grid conditions map 1:1 to the existing `health_problems` boolean
    sub-keys (recon: osteopathy-v2 already carries all 19 + `other`); this is a
    **rendering restructure, not a data-model change**.

**5.5 Motivos da Consulta / Inicio / Contexto em que ocorre** - `consultation_reason`
(**required**). AI key 1.

**5.6 Condicoes Alivio / Agravamento** - `relief_aggravation`. AI key 2.

**5.7 Antecedentes Clinicos / Cirurgia / Medicacao** - `clinical_history` (helper
text: "colesterol, hipertensao, acido urico, diabetes, quedas, acidentes de
viacao"). AI key 3.

**5.8 Anamnese por Sistemas** - `systems_review`: Neurologico, Cardiovascular,
Respiratorio, Gastrointestinal, Urologico / Ginecologico, Endocrino. AI keys 4-9.

**5.9 Bodychart** - the **EXISTING** component
(`apps/web/app/clinical/[id]/BodyChart.tsx`, marker array, 0-1 normalized coords, 4
views), **unchanged**.

**5.10 Mobilidade Activa / Passiva** - **NEW**. Three circle diagrams labeled
**Cervical, Dorsal, Lombar**. The user inserts **unlimited markers per circle**.
Two marker types: **Mobilidade Activa (dot)** and **Mobilidade Passiva (star)**. A
**Limpar marcadores** action clears a circle. Followed by an **Observacoes
Mobilidade Activa / Passiva** textarea.

**5.11 Testes Neurologicos; Testes Especiais** - **NEW**.

**5.12 Diagnostico; Tratamento** - **NEW** (`diagnostico`, `tratamento`). The
existing `treatment_plan` (Plano de Tratamento, AI key 11) and `treatment_objectives`
(Objectivos do Tratamento, AI key 10) fields are placed **after Tratamento**. See
QUESTIONS Q-W5-2 (recommended default: keep both Plano and Objectivos).

**5.13 Observacoes** - `observations`. AI key 12.

**5.14 Signature and consent section** - see sec 7.

---

## 6. EPISODIO FILTER

The Episodio selector in record creation lists **only the selected patient's
episodes**, plus a **Sem episodio** option. (Recon: today the picker
`listEpisodesForPicker` in `apps/web/lib/clinical/records.ts` lists episodes across
**all** patients, labeled "patient - episode"; W5-04 fixes this independently of the
Batch-4 rebuild.)

---

## 7. SIGNATURE AND CONSENT

At the end of the ficha (sec 5.14):

1. **On-screen patient signature.** A button opens a signature page where the
   patient signs on-screen (canvas capture). The signature image saves to the
   patient's **Documentos** (reuse the attachments infrastructure -
   `apps/web/lib/clinical/storage.ts`, Supabase Storage signed URLs, tenant-scoped;
   the W5-10 Documentos surface is the destination). Never public.

2. **Gerar PDF (RGPD print-and-sign).** A **Gerar PDF** action produces an **A4**
   form carrying the **clinic logo**, for print-and-sign, specifically for RGPD.

3. **Consinto block.** Individually confirmable consent items - **RGPD data
   processing**, **SMS reminders acknowledgment**, **data handling** - each rendered
   with an **explicit check or X state, not a bare unchecked box** (the state is
   always affirmatively shown as consented or not).

**Wording.** All consent and RGPD wording ships as **pt-PT placeholders flagged
`PENDENTE-JP`**. **Max drafts 2-3 variants per text** for JP to pick. No consent
string is treated as final until JP selects it. See QUESTIONS Q-W5-3.

---

## 8. Build gate (future loops)

Consumed by, and must be merged before: **W5-13** (unification + ingestion
compatibility test), **W5-14** (field sequence + header strip + auto timestamp +
Problemas de Saude grid restructure + Outros rules), **W5-15** (Mobilidade widget +
Testes + Diagnostico + Tratamento + Observacoes in sequence), **W5-16** (signature
capture -> Documentos, RGPD PDF with logo, Consinto check/X block, all wording
PENDENTE-JP), **W5-17** (Revisao Consulta "Assumir" opens the AI draft inside the
Ficha Medica editor with the twelve AI-filled fields visible + editable). Each
Batch-4 loop is SYNTHETIC-DATA-ONLY (real-data go-live separately gated).

## 9. Non-goals

- **No immutability bypass.** Existing signed/locked records are never rewritten.
- **No change on Andre's side.** The outbound `template=osteopathy` + twelve keys
  are frozen; all adaptation is server-side on OsteoJP.
- **No NESA-warning change.** The 0031 contraindication booking-warning system is
  untouched; only the NESA *template* leaves the creation flow.
- **No manual created-date entry.** `created_at` is machine-stamped (sec 4).
- **No final consent wording.** All consent/RGPD copy is PENDENTE-JP placeholder.

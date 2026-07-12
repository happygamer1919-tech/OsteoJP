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

---

## AMENDMENTS 2026-07-09 (Wave 05 Hotfix, W5-18..W5-23)

> Appended by YELLOW (Wave 05 Hotfix authoring), from the owner QA pass on the
> deployed app plus clinic-staff feedback (six residual items). This section is
> AUTHORITATIVE and SUPERSEDES the earlier body of this SPEC and the Wave 05 / sec 5
> sequence wherever they differ. It is consumed by loops W5-18..W5-23
> (`docs/loops/wave-05/`). Presentation-layer only unless a ruling states
> otherwise; the frozen ingestion contract (`template=osteopathy` + the twelve AI
> keys) does not change. Plain hyphens throughout, pt-PT UI copy.

### A. NAMING RULING - "Ficha Clinica"

The unified template's user-facing name is **"Ficha Clinica"**, superseding "Ficha
Medica" everywhere this SPEC references the presentation layer (record-creation
template selector, record-view header, the patient's Registos clinicos list,
Revisao Consulta).

Internal identifiers are **FROZEN and unchanged**:
- the template key `osteopathy` - the shipped unified template is `osteopathy`
  **v3**, the highest active version. (The hotfix brief's shorthand "osteopathy-v2"
  denotes this frozen osteopathy lineage; the accurate active version is **v3**, and
  **v2 stays immutable** for records that reference it, CLAUDE.md rule 5.)
- the ingestion selector `template=osteopathy` (`M1_TEMPLATE`,
  `apps/web/lib/consultation/m1-webhook.ts`),
- the twelve AI field keys (SPEC sec 2), frozen by identity.

The display name lives ONLY in `form_templates.title` (seeded from
`packages/db/seed/form-templates/osteopathy-v3.json`); there are **ZERO** hardcoded
display-name literals in TSX - every surface reads `title[locale]`. The rename is
therefore a **title-only value change** (`pt "Ficha Medica" -> "Ficha Clinica"`, `en
"Medical Record" -> "Clinical Record"`) re-upserted into the dev DB; the schema body
and key are untouched, so record rendering and rule-5 immutability are unaffected.
Existing records keep their stored template refs and titles. Detailed in loop W5-23.

### B. RULING OVERRIDE (supersedes Q-W5-1) - no Data do Episodio input

Q-W5-1 (Data do Episodio editable, prefilled today) is **SUPERSEDED**. **Data do
Episodio is removed from the creation AND edit form.** Date and time are
auto-stamped at creation (`created_at`) and displayed **read-only** on the record
view and in the patient-profile Registos clinicos list. There is **no date input
anywhere in the ficha**.

Implementation notes (recorded; the executor recons and decides in W5-19):
- `episode_date` is currently the position-1 field in `osteopathy` v3 AND is listed
  in the template `required` array. Removing the input must not break save-time
  required-validation: either populate `episode_date` server-side from `created_at`
  on save (keeps the field valid without an input) OR drop it from the template
  `required`. **Prefer the server-populate path** (migration-free, no template
  version bump, rule-5 safe).
- RecordForm.tsx currently carries `episode_date` in `HEADER_ROW_KEYS` (the header
  grid row) and prefills it to today; both must go.
- Display timezone is Europe/Lisbon (CLAUDE.md); the DB stores UTC.

### C. RULING - "Outros" (renames + restructures the Problemas de Saude section)

The section currently titled **"Problemas de Saude"** is renamed and restructured to
a single section titled **"Outros"**, containing, in order:
1. the checkbox grid **exactly as currently shipped** - Lupus in-grid, four columns
   on desktop, responsive collapse (the W5-14 grid, unchanged);
2. below the grid, the free-text field with placeholder **"Outras condicoes,
   alergias, medicamentos..."** and **no visible label**.

The words "Problemas de Saude" disappear from the form. This is **presentation only -
no data model change**: the `health_problems` key, its nineteen booleans, and the
`other` free-text sub-key are all unchanged. Detailed in loop W5-19.

### D. AUTHORITATIVE FIELD SEQUENCE (supersedes the Wave 05 / sec 5 sequence where they differ)

The Ficha Clinica renders top-to-bottom in exactly this order, on **both** the
creation and edit form. Reordering NEVER alters the twelve AI key bindings - keys
bind to fields, not positions.

1. **Peso (kg)** + **Altura (cm)** + **Marcacao respectiva** as one row - **no date
   field**. Peso and Altura strictly adjacent, nothing between them.
2. **Alertas (sinais de alarme)**
3. **Codigos CID associados**
4. **Outros** - checkbox grid + free-text, per ruling C above
5. **Motivos da Consulta / Inicio / Contexto em que ocorre**
6. **Condicoes Alivio / Agravamento**
7. **Antecedentes Clinicos / Cirurgia / Medicacao**
8. **Anamnese por Sistemas** (Neurologico, Cardiovascular, Respiratorio,
   Gastrointestinal, Urologico / Ginecologico, Endocrino)
9. **Bodychart** - the existing component, untouched
10. **Mobilidade Activa / Passiva** (component spec E below), followed by
    **Observacoes Mobilidade Activa / Passiva** textarea
11. **Testes Neurologicos**, then **Testes Especiais**
12. **Diagnostico**, **Tratamento**, **Plano de Tratamento**, **Objectivos do
    Tratamento**
13. **Observacoes**
14. **Signature and consent** section, as shipped in W5-16

Ground-truth note (recorded 2026-07-09): the shipped `osteopathy` v3 property order
ALREADY realizes this sequence for fields 2-13 (delivered by W5-14/W5-15). The only
deltas this sequence introduces are (a) removal of the position-1 Data do Episodio
input (ruling B) and (b) the Outros rename/restructure at position 4 (ruling C).
W5-19 enforces both and pastes a full top-to-bottom audit.

### E. MOBILIDADE ACTIVA / PASSIVA - component spec

Section header **"Mobilidade Activa / Passiva"** with helper line **"Pode inserir
tantos pontos quantos desejar apos clicar em Inserir marcador"**.

- **Three equal circle diagrams side by side**, labeled **Cervical**, **Dorsal**,
  **Lombar** beneath each circle.
- Each circle renders **reference spokes** as an SVG: vertical top, two upper
  diagonals, full horizontal, vertical bottom.
- **Two marker types with a selectable toggle:** **Mobilidade Activa** (filled dot)
  and **Mobilidade Passiva** (star).
- **Inserir marcador** arms placement; a click or tap on any circle then places a
  marker of the selected type at that point. **Unlimited** markers.
- **Limpar marcadores** clears **all** markers on the record.
- Marker data persists in the record's `data` JSON as a list of **{circle, type, x,
  y}** in normalized 0-1 coordinates. (Implementation note: the shipped W5-15 widget
  persists the equivalent shape keyed by circle - `mobilidade.{cervical,dorsal,lombar}`,
  each an array of `{marker_type, x, y}` - which carries the same four facts, the
  circle being the object key. W5-20 recon decides whether to keep that shipped
  keying - **RECOMMENDED**, to avoid churning any already-stored marker data - or
  flatten to the literal list; either shape satisfies this spec.)
- **Touch-friendly on mobile; toggle controls min 44px.**
- **Read-only render on signed records.**

Ground-truth note: the W5-15 `MobilidadeChart` component (`apps/web/app/clinical/[id]/MobilidadeChart.tsx`)
EXISTS and is MOUNTED at sequence position 10 - RecordForm.tsx renders it via the
`mobilidade` x-widget. It conforms on the three circles, the two marker types
(Activa=dot, Passiva=star), unlimited markers, per-circle persistence, and read-only
gating, but DIVERGES from this spec on: the marker-type control (a `<select>`, not
min-44px toggle buttons), the absence of an explicit "Inserir marcador" arm step (it
places on direct click), a per-circle rather than single record-wide "Limpar
marcadores", and the **missing reference spokes**. W5-20 reconciles these; it does
NOT rebuild from zero.

---

## AMENDMENTS 2026-07-11 (Wave 05 Ficha Final, W5-24..W5-26)

> Appended by YELLOW (Wave 05 Ficha Final authoring), from the owner ruling after a
> read-only layout extraction of the legacy Fisiozero episode form (the clinic staff
> already know that layout). This section is AUTHORITATIVE and SUPERSEDES the earlier
> body of this SPEC and the AMENDMENTS 2026-07-09 rulings wherever they differ (noted
> per ruling). It is consumed by loops W5-24..W5-26 (`docs/loops/wave-05/`). All three
> rulings are **presentation / stored-value-additive only** - the frozen ingestion
> contract (`template=osteopathy` + the twelve AI keys) does not change, the nineteen
> `health_problems` booleans + `other` do not change, and no DB migration is
> introduced. Plain hyphens throughout, pt-PT UI copy.
>
> **Recon verdicts recorded at authoring (read-only, 2026-07-11):**
> - **Outros grid (a):** the `checkbox_group` renderer in
>   `apps/web/app/clinical/[id]/RecordForm.tsx` (case `checkbox_group`) renders the
>   booleans in `grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4` and the `other`
>   free-text in a SEPARATE full-width `<Input>` block AFTER the grid (ruling C
>   below-grid placement), no visible label, placeholder `clinical.healthProblemsOtherPlaceholder`.
>   The `osteopathy` v3 seed (`packages/db/seed/form-templates/osteopathy-v3.json`)
>   `health_problems` property order ALREADY equals the legacy 4x5 reading order
>   one-for-one (the nineteen booleans in the ruling-F sequence, then `other` last).
>   So the W5-24 work is purely the two presentation deltas (strict 4->2 columns; the
>   free-text pulled inline as the 20th cell), NOT a checkbox reorder.
> - **Bodychart markers (b):** the nine marker types are enumerated in the v3 seed
>   (`bodychart.items.properties.marker_type.enum`) and rendered by the `bodychart`
>   x-widget `apps/web/app/clinical/[id]/BodyChart.tsx`. Each marker persists in the
>   record `data` jsonb as `{ marker_type, x, y, view }` (normalized 0-1 coords, view
>   enum). Current visual state: **NO per-type differentiation** - every marker draws
>   as one identical magenta dot (`h-3 w-3 rounded-full bg-brand-magenta`, BodyChart.tsx),
>   type shown ONLY on the hover `title` tooltip and the bottom marker-list text. The
>   differentiation ruling is therefore a real, needed change.
> - **Intensity attribute feasibility (c): YES, migration-free.** The record `data`
>   column is jsonb and markers are free-form JSON objects inside `data.bodychart`;
>   adding `intensity` (a 0-10 number) to a marker object is an extra jsonb key, NOT a
>   schema migration. No DB migration is required and NONE is authorized for this batch.

### F. OUTROS GRID LAYOUT (supersedes the ruling-C free-text placement)

The **Outros** section (the renamed Problemas de Saude section, ruling C) renders its
checkboxes as a **4-column, 5-row grid** in this exact cell order (the legacy Fisiozero
layout the clinic staff know), reading left-to-right then top-to-bottom:

- **row 1:** Fumador, Gravidez, Osteoporose, Anemia
- **row 2:** Lupus, Neoplasia, Demencia / Alzheimer, Parkinson
- **row 3:** Depressao, Epilepsia, Esclerose multipla, Artrite reumatoide
- **row 4:** Alergias Alimentares, Alergias Medicamentosas, Hipertensao, Hipotensao
- **row 5:** Diabetes, Problemas Respiratorios, COVID-19, then the **free-text input
  INLINE as the 20th grid cell**, placeholder **"Outras..."**, no visible label.

The **separate below-grid free-text block from ruling C is removed**; the free-text now
occupies the final (20th) grid cell. Its stored value maps unchanged - it is still the
`health_problems.other` sub-key, same read and same write; only its rendered position
moves (from a full-width block under the grid into the last grid cell). The ruling-C
placeholder ("Outras condicoes, alergias, medicamentos...") is superseded by **"Outras..."**.

**Responsive collapse to 2 columns** preserves this reading order (2-up on narrow
viewports, 4-up on desktop; drop the intermediate 3-column step so the legacy 4x5
reading is exact). The section title stays **"Outros"**. This is **presentation only -
no data model change**: the `health_problems` key, its nineteen booleans, and the
`other` sub-key are unchanged. Ground-truth: the v3 seed property order already realizes
this cell sequence one-for-one, so W5-24 changes the renderer, not the template. Detailed
in loop W5-24.

### G. BODYCHART MARKER DIFFERENTIATION (shape + color + legend)

Each of the nine bodychart marker types renders with a **UNIQUE geometric shape AND a
unique color**. **Shape carries the meaning; color reinforces it - never color alone**
(accessibility: the chart must be legible in greyscale and to color-vision-deficient
users, so the shape alone must disambiguate every type). Authoritative shape mapping
(SVG marker glyphs, keyed by the frozen `marker_type` enum value):

| `marker_type` | pt-PT label | Shape |
|---|---|---|
| `blockage_dysfunction` | Bloqueio / Disfuncao | square |
| `scar` | Cicatriz | cross (X) |
| `hypertonicity` | Hipertonicidade | triangle (apex up) |
| `hypotonicity` | Hipotonicidade | diamond |
| `pain_radiation` | Irradiacao da dor | star |
| `pain_location` | Local da dor | filled circle |
| `paresthesia` | Parestesia | ring (hollow circle) |
| `rotation_right` | Rotacao direita | right-pointing arrow |
| `rotation_left` | Rotacao esquerda | left-pointing arrow |

The two rotation types use directional arrows (right / left) as required. The nine shapes
must be visually distinct at the marker's on-chart size (min ~12px) and each also carries
its own color.

**Palette (design instruction, note the token gap).** UI-STYLE.md is token-only and its
named palette (teal, grey, status green/amber, error red; **magenta is reserved for the
brand lockup**) does NOT supply nine distinct AA-safe hues. W5-25 therefore **extends
UI-STYLE.md in the same PR** with a dedicated nine-entry **bodychart marker palette** of
AA-checked tokens (the UI-STYLE conformance note explicitly permits a surface to extend
that document); no raw hex in components. Because shape is the authoritative carrier, a
palette that is merely *distinguishable* (not necessarily nine textbook-distinct hues) is
acceptable - color reinforces, shape decides. This is a design-doc extension, not a new
vendor and not an owner-confirmable scope change.

**Legend.** A **compact, always-visible legend** renders beside or below the chart,
mapping each shape+color to its pt-PT type name (the same nine labels). It is presentation
chrome, always shown (not a hover/disclosure).

**Unchanged.** Existing stored markers render with the new visuals automatically - the
render is type-driven off the persisted `marker_type`, so no stored data is touched.
Bodychart placement, the four views, the marker array shape `{ marker_type, x, y, view }`,
and read-only gating are all UNCHANGED. This is a **render-only change to `BodyChart.tsx`
plus a UI-STYLE.md palette addition**; the v3 template `bodychart` schema is untouched.
Detailed in loop W5-25.

### H. PAIN SCALE (EVA) on Local da dor markers

When the therapist places a marker of type **Local da dor** (`pain_location`), a **0-10
intensity selector (EVA)** appears. The chosen value stores on that marker in the record
`data` jsonb as **`intensity`** (e.g. `intensity: 7`), alongside the existing
`{ marker_type, x, y, view }`. Rules:

- **Only `pain_location` carries a scale.** Markers of the other eight types carry no
  `intensity` and show no selector.
- **Optional per marker.** If the therapist skips the selector, the marker saves WITHOUT
  `intensity` (a valid, scale-less Local da dor marker). No value is forced.
- **Tap-friendly.** The selector targets are **min 44px** (mobile-usable), consistent with
  the Mobilidade toggle sizing (AMENDMENTS ruling E).
- **Display.** The bottom marker-list entry shows the value - **"Local da dor - EVA 7/10"**;
  the marker's on-chart label or tooltip shows it too (e.g. appended to the existing
  `title`).
- **Editable while draft, read-only on signed records** - the selector follows the same
  `readOnly` gate the bodychart already honors; a signed record shows the stored EVA value
  but no editable control.

**Migration-free.** `intensity` is an additive jsonb key on the marker object (recon
verdict c); **no DB migration and none authorized.** W5-26 recons whether the form save
path preserves unknown/undeclared jsonb keys through the record `data` write: if it does,
store `intensity` component-side with **no template change** (preferred, most rule-5-safe);
if the save path strips keys not declared in the template schema, the migration-free
fallback is to declare an optional `intensity` on the `bodychart` item by seeding
`osteopathy` **v4** and re-upserting (a seed value change, NOT a DB migration - v3 stays
immutable for records that reference it, CLAUDE.md rule 5). Either path is migration-free;
W5-26 picks after recon and records the choice. If W5-26 recon finds the marker `data`
CANNOT carry `intensity` without a DB migration, that is a **HALT** (Field 6), not an
improvisation. Detailed in loop W5-26.

---

## AMENDMENT 2026-07-12 (FF2): canonical sequence v4

> Appended by YELLOW (Ficha Final 2 authoring), from the owner ruling 2026-07-12
> (owner-approved package "Ficha Final 2", FF2). This section is AUTHORITATIVE and
> **SUPERSEDES ALL PRIOR SEQUENCE RULINGS** in this SPEC, including sec 5 (FIELD
> SEQUENCE), AMENDMENTS 2026-07-09 ruling D (AUTHORITATIVE FIELD SEQUENCE), and the
> Fisiozero-mirror ordering referenced anywhere in this document. **The canonical order
> in FF2-A below is the SOLE authority on ficha field sequence.** Any agent finding a
> conflict between this amendment and older SPEC text (sec 5, ruling D, or elsewhere)
> follows THIS amendment and treats the older sequence text as historical. It is
> consumed by loops W5-27..W5-34 (`docs/loops/wave-05/`). The frozen ingestion contract
> (`template=osteopathy` + the twelve AI keys, SPEC sec 2) does NOT change - the twelve
> AI ingestion keys are untouched by this amendment; reordering never alters a key
> binding (keys bind to fields, not positions). The nineteen `health_problems` booleans +
> `other` and the internal Outros grid are unchanged. Plain hyphens throughout, pt-PT UI
> copy.

### FF2-A. CANONICAL SEQUENCE v4 (sole authority)

The Ficha Clinica renders top-to-bottom in exactly this order, on **both** the creation
and edit form. The **in-ficha left navigation panel mirrors this order exactly**.

0. **Paciente summary card** - existing, unchanged.
1. **Peso + Altura** - a **thin card directly under** the Paciente card, carrying `weight_kg`
   (Peso (kg)) and `height_cm` (Altura (cm)) **only**, nothing else on the card.
2. **Alertas (sinais de alarme) + Codigos CID associados** - `red_flags` and `cid_codes`
   as **one row**.
3. **Bodychart** - the existing `bodychart` component (with the W5-25 shape+color+legend
   and the W5-26 EVA scale), untouched by this amendment.
4. **Observacoes** - `observations` (AI key 12).
5. **Mobilidade Activa / Passiva** - the Mobilidade widget (AMENDMENTS ruling E).
6. **Observacoes Mobilidade Activa / Passiva** - the mobilidade observations textarea.
7. **Motivos da Consulta / Inicio / Contexto em que ocorre** - `consultation_reason`
   (**required**, AI key 1).
8. **Tratamento** - `tratamento`.
9. **Plano de Tratamento** - `treatment_plan` (AI key 11).
10. **Objectivos do Tratamento** - `treatment_objectives` (AI key 10).
11. **Diagnostico** - `diagnostico`.
12. **Condicoes Alivio / Agravamento** - `relief_aggravation` (AI key 2).
13. **Anamnese por Sistemas** - `systems_review`, the **six subsystems unchanged**
    (Neurologico, Cardiovascular, Respiratorio, Gastrointestinal, Urologico /
    Ginecologico, Endocrino; AI keys 4-9).
14. **Outros** - the `health_problems` checkbox grid, **internally unchanged** (nineteen
    booleans + `other`), with the AMENDMENTS ruling F column-major 4x5 layout and its
    responsive collapse rule **unchanged**.
15. **Antecedentes Clinicos / Cirurgia / Medicacao** - `clinical_history` (AI key 3).
16. **Testes Especiais** - the Testes Especiais section (its existing key, recon at build).
17. **Signature + consent block** - stays at the **very end** (unchanged position, **NOT
    removed**).

**Info content of every kept section is unchanged - only position moves.** Each kept
field retains its key, sub-keys, helper text, and internal layout verbatim; the sequence
above only relocates it.

### FF2-B. REMOVED FROM THE TEMPLATE

Two items are removed from the active template:

- **Marcacao respectiva** (`linked_appointment`, the appointment picker that lived in the
  old position-1 header row) - **removed**. Not an AI key.
- **Testes Neurologicos** - the **entire section removed**. Not an AI key.

No other field is removed; no other field's information content changes.

### FF2-C. IMPLEMENTATION FACTS (binding)

- **New template version = `osteopathy` v4.** The reorder + the two removals ship as a
  NEW form-template seed `packages/db/seed/form-templates/osteopathy-v4.json`, its
  property order realizing FF2-A, with `linked_appointment` and the Testes Neurologicos
  field(s) absent. **v1/v2/v3 stay immutable** (CLAUDE.md rule 5); records that reference
  them **render their original structure forever**. **New fichas open on v4.** Detailed in
  loop W5-27.
  - **Reconciliation with W5-26:** W5-26 (EVA) may already have introduced an `osteopathy`
    v4 seed under its Path B (an `intensity`-declaring v4 built on the v3 order). If that
    Path-B v4 has merged before W5-27, **W5-27's FF2 v4 is the authoritative v4** and must
    supersede it: adopt the FF2-A order + the FF2-B removals AND retain any optional
    `bodychart.intensity` declaration W5-26 added. If W5-26 took Path A (no v4), W5-27
    creates v4 fresh. Either way there is exactly ONE `osteopathy-v4.json` at the end, in
    the FF2-A shape. W5-27 recons which case holds and records it.
- **Twelve AI keys frozen.** `consultation_reason`, `relief_aggravation`, `clinical_history`,
  the six `systems_review` subsystems, `treatment_objectives`, `treatment_plan`, and
  `observations` keep their keys and identities; `template=osteopathy` maps by identity
  (zero change on the AI partner side). The **W5-13 compatibility test stays green**.
- **created_at.** Auto-stamped at creation, displayed **read-only** (AMENDMENTS ruling B,
  sec 4); no date input anywhere. Unchanged.
- **Display titles.** "Ficha Clinica" (pt) / "Clinical Record" (en) - **unchanged**
  (AMENDMENTS ruling A). The FF2 UI renames (W5-29) touch the Inicio tile / button strings
  and strip version suffixes from display strings only; the template `title` is not
  changed by FF2.
- **Left nav mirrors the order.** The in-ficha left navigation panel lists the sections in
  the FF2-A order exactly (position 0 through 17).

This amendment is consumed primarily by **W5-27** (the v4 template + renderer section
order + in-ficha left nav + the Peso/Altura thin card + the Alertas/CID row). The other FF2
loops (W5-28..W5-34) touch orthogonal surfaces and do **not** re-order the ficha.

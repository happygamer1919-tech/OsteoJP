# Castelo Branco QA record - 2026-07-16 (ground truth for Wave 09 Correcoes CB)

Source of truth for the Castelo Branco (CB) staff-platform QA that scoped **Wave 09
Correcoes CB**. The CB team (Rodica) delivered this on 2026-07-16 as a Word document
("Coisas a Alterar na Nova Plataforma"), a set of WhatsApp messages, and two
screenshots. The owner (Ivan) triaged all 18 items on 2026-07-16 into: Wave 09 loops,
a Wave 10 headline candidate, JP-batch clinical/product questions, a Rodica-batch
config question, and already-sequenced items with no new action.

This file records every item with its classification and routing so the ground truth
lives in the repo, not only in the source artefacts. It is a QA record, not a loop; the
loop files under `docs/loops/wave-09/` are the runnable scope, the board
(`docs/design/BACKLOG.md`) is the live status, and the open questions live in
`docs/design/QUESTIONS.md`.

Wave 08 Dados e KPI closed 2026-07-16 (PRs #585-#593, migration head 0037). Wave 09 is
scoped strictly from this triage.

Standing test-data rule (carried from Wave 08, applies to every Wave 09 loop):
SYNTHETIC-DATA-ONLY for verify; disposable test patients only, never Maria Joao Silva
(`triboimax635+maria@gmail.com`); reference therapist for tests is Tiago Reis.

---

## The 18 items, as triaged

Legend for **Class**: Bug (a defect against intended behaviour) · Display gap (correct
data, wrong or missing rendering) · Root-cause-unknown (needs W9-01 recon before a fix
path is chosen) · Spec-required (a product/clinical decision or a design spec is needed
first) · Recorded (already sequenced elsewhere, no new Wave 09 action).

| # | Item | Class | Routing |
|---|------|-------|---------|
| 1 | Agenda location filter shows LV therapists when OsteoJP CB is selected | Bug | **W9-02** |
| 2 | Declaracao de Presenca: carimbo prints LV on CB declarations, logo missing, auto-downloads even in the manual option | Bug (CB: "erro grave") | **W9-03** |
| 3 | Blocked therapist time not rendered on the agenda | Display gap | **W9-04** |
| 4 | NESA service missing from the booking dropdown at CB | Root-cause-unknown | **W9-01** recon, then **W9-07** |
| 5 | Strikethrough on agenda cards: CB reports it appears for confirmations; Fisiozero convention is strikethrough = cancelled | Root-cause-unknown (verify render mapping) | **W9-01** recon, fix in **W9-05** |
| 6 | Portal privacy invariant: marcacao historico / internal comments must NEVER be visible to patients in the portal | Invariant to verify | **W9-01** recon, guard test in **W9-06** |
| 7 | Therapist name not visible on agenda cards; all cards same colour; want one colour per therapist | Display gap | **W9-05** |
| 8 | Same-hour overlapping cards unreadable, patient name invisible; Fisiozero-style compact rendering requested | Display gap | **W9-05** |
| 9 | Marcacao notes / historico visible on hover in the agenda and in the marcacoes list (staff-side only) | Display gap (CB: "grave") | **W9-06** |
| 10 | Created-by and created-at not visible on marcacoes | Display gap | **W9-06** (schema verification in **W9-01**) |
| 11 | Schedule model: therapists have variable hours per day and per week; current model is one fixed weekly pattern | Spec-required (largest item) | **EXCLUDED from Wave 09** - registered as **Wave 10 headline candidate** |
| 12 | Declaracao editable before generation (acompanhantes case) - patient-facing document content | Spec-required | **JP-gated backlog** (excluded from Wave 09) |
| 13 | Contraindicacoes label NESA -> Gerais on the patient form - clinical semantics | Spec-required | **JP batch** |
| 14 | Dual-therapist booking: CB wants it removed, but Massagem 4 Maos (LV catalog) requires two therapists and dual-participant semantics are a locked model | Spec-required (ruling needed) | **JP batch** (do NOT remove) |
| 15 | Hour-only booking slots (no 9:30): confirm CB-only preference vs platform-wide vs per-location setting | Spec-required (config scope) | **Rodica batch** |
| 16 | Fisioterapeuta Tiago Grilo missing: owner manual data entry (staff account via the Equipa app path), not a loop | Recorded | Owner action; note the mistaken patient record pending owner cleanup |
| 17 | Faturacao must be tested before launch | Recorded | Already sequenced (Stylus API September, payment keys at launch-day flips); no new action |
| 18 | Total Fisiozero history + documentation recovery | Recorded | Already planned as the vendor export migration timed to cutover; no new action |

---

## Item detail (why each was classified this way)

### Wave 09 loop items

1. **Agenda location filter leaks LV therapists (W9-02).** Selecting OsteoJP CB in the
   agenda still shows Linda-a-Velha therapists. The filter must restrict both the
   therapist dropdown and the rendered therapists to the selected location. Root cause
   is confirmed in W9-01 (recon f); the fix is W9-02, E2E-covered (CB selection shows
   zero LV therapists).

2. **Declaracao de Presenca: wrong stamp, missing logo, forced download (W9-03).** CB
   calls this an "erro grave": a CB declaration prints the LV carimbo, the clinic logo
   does not render, and the document auto-downloads even when the user chose the manual
   option. Fixes: per-location carimbo, logo rendered, open-as-preview instead of forced
   auto-download. Document content is otherwise unchanged (JP-approved defaults
   preserved; the editable-fields request is item 12, JP-gated, out of scope). OWNER
   VISUAL GATE: owner inspects a CB and an LV declaration on the preview URL before merge.

3. **Blocked therapist time not on the agenda (W9-04).** Time a therapist has blocked
   (the `time_off` model, which W5-12 confirmed already exists at migration 0006) is not
   rendered on the agenda, so staff can double-book over it. W9-04 renders blocked time
   visibly with distinct non-bookable styling. Display layer, no model change.

4. **NESA missing from the CB booking dropdown (W9-01 recon -> W9-07).** Root cause is
   unknown at triage. W9-01 investigates: services + service-price rows for CB, active
   flags, and the creation dropdown filter (creation is active-only by design). NESA
   exists in the CB catalog (50.00) per the W8-01a seed, so the likely cause is either a
   missing/inactive CB price row or the offered-only-where-priced filter. The three
   frozen legacy rows (Pilates Terapeutico 40.00, NESA 39.00, Massagem Terapeutica 50.00)
   are deactivated and must not be touched or reactivated. Fix is W9-07, conditional on
   the W9-01 verdict: code fix = normal loop; any cloud data write = HALT for owner
   authorization (the cloud DB is read-only by standing rule; Wave 08's single authorized
   write is spent).

5. **Strikethrough mapping (W9-01 recon -> W9-05).** CB reports strikethrough appearing
   on confirmations, but the Fisiozero convention (and the intended one) is strikethrough
   = cancelled. W9-01 documents the exact render mapping of card visual states to the
   lifecycle and confirmation axes (the dual-axis model is locked; this is display only).
   W9-05 corrects the mapping so strikethrough means cancelled.

6. **Portal privacy invariant (W9-01 recon -> W9-06 guard test).** Marcacao historico
   and internal staff comments must NEVER reach a patient in the portal. W9-01 verifies
   whether the portal exposes marcacao notes/comments anywhere (API responses included,
   not just the UI). W9-06 ships an automated guard test asserting the portal API/UI
   never exposes notes.

7. **Therapist name + per-therapist colour on cards (W9-05).** Agenda cards do not show
   the therapist name and are all the same colour; CB wants the therapist name on every
   card and one deterministic colour per therapist. W9-05 delivers per-therapist colour
   tokens meeting AA contrast. Display layer only.

8. **Same-hour overlap legibility (W9-05).** Overlapping same-hour cards are unreadable
   and hide the patient name; CB wants Fisiozero-style compact cards that keep the
   patient name legible. W9-05, display layer only.

9. **Notes/historico leak on the staff side (W9-06).** Marcacao notes/historico show on
   hover in the agenda and in the marcacoes list. This is staff-side (not the portal
   leak of item 6), but CB marks it "grave" because internal notes should be a
   deliberate, contained affordance, not an always-on hover. W9-06 provides a contained
   staff-side hover card and keeps the portal guarded (item 6).

10. **Created-by / created-at on marcacoes (W9-06).** The marcacao detail and list do
    not show who created the appointment or when. W9-06 surfaces created-by and
    created-at. Whether the columns exist (`created_by`, `created_at` or equivalent audit
    columns) is verified in W9-01 (e); if `created_by` is absent, W9-06 becomes
    migration-gated (see the W9-06 loop file).

### Excluded from Wave 09

11. **Variable per-day/per-week schedule model (Wave 10 headline candidate).** The
    biggest item: therapists work variable hours that differ per day and per week, but
    the current `availability_templates` model is one fixed weekly pattern. This needs a
    spec before any build, so it is EXCLUDED from Wave 09 and registered as the Wave 10
    headline candidate in the candidates register.

12. **Declaracao editable before generation, acompanhantes case (JP-gated backlog).**
    A request to edit the declaration content (e.g. for an acompanhante) before it is
    generated. This is patient-facing document content and a clinical/product decision,
    so it is JP-gated and out of scope for Wave 09. W9-03 preserves the JP-approved
    default content and only fixes the stamp/logo/download defects. Recorded as a JP-gated
    backlog item in QUESTIONS.

### JP batch (clinical / product ruling needed)

13. **Contraindicacoes label NESA -> Gerais.** The patient form labels a
    contraindications section "NESA"; CB wants it labelled "Gerais" (general). This is
    clinical semantics (does the relabel change which contraindications apply, or is it a
    pure label change?), so it goes to the JP batch. Related to the 0031 contraindication
    model (`patients.contraindication_*`, `services.contraindication_sensitive`).

14. **Dual-therapist booking ruling (Massagem 4 Maos context).** CB wants dual-therapist
    booking removed. It must NOT be removed: Massagem 4 Maos (2 terapeutas) in the LV
    catalog requires two therapists, and dual-participant semantics (W4-19 secondary
    participants, primary-only everywhere else) are a locked model. JP rules whether CB
    simply should not be shown the secondary control, or whether the workflow needs a
    per-location affordance. JP batch; do not self-decide or remove.

### Rodica batch (config scope)

15. **Hour-only booking slots (no 9:30).** CB wants booking slots on the hour only, no
    :30 half-hour slots. Confirm whether this is a CB-only preference, a platform-wide
    change, or a per-location setting. This is a config-scope question for Rodica. Note:
    the slot grid is a 30-min expansion in `apps/api` (`listOpenSlots`), so a change here
    touches the booking source of truth and must be scoped deliberately.

### Recorded (no new Wave 09 action)

16. **Tiago Grilo missing (owner data entry).** The therapist Tiago Grilo is missing.
    This is owner manual data entry (create the staff account via the Equipa app path,
    the W4-01/W8-02 staff surface), not a loop. Also note a mistaken patient record for
    Tiago Grilo pending owner cleanup. No loop; owner action.

17. **Faturacao pre-launch testing (already sequenced).** Invoicing must be tested before
    launch. Already sequenced: Stylus API in September, payment keys flipped at launch
    day. Recorded, no new Wave 09 action.

18. **Fisiozero history + documentation recovery (already planned).** The full Fisiozero
    history and document recovery is already planned as the vendor export migration timed
    to cutover. Recorded, no new Wave 09 action.

---

## Routing summary

- **Wave 09 loops (8):** W9-01 recon, W9-02 agenda location filter, W9-03 declaracao
  fixes, W9-04 blocked time, W9-05 agenda cards v2, W9-06 marcacao audit + notes, W9-07
  NESA catalog fix, W9-08 project skills. See `docs/loops/wave-09/` and the board.
- **Wave 10 headline candidate:** variable per-day/per-week schedule model (item 11).
- **JP batch (items 13, 14):** contraindicacoes label; dual-therapist ruling. See
  `docs/design/QUESTIONS.md` 2026-07-16.
- **Rodica batch (item 15):** hour-only booking slots. See QUESTIONS 2026-07-16.
- **JP-gated backlog (item 12):** declaracao editable fields for acompanhantes. See
  QUESTIONS 2026-07-16.
- **Owner actions / already sequenced (items 16, 17, 18):** no loop.

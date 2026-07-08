# Loop W5-15 - Mobilidade Activa/Passiva widget + Testes/Diagnostico/Tratamento (Batch 4, per SPEC-ficha-medica.md)

GATE: **Batch 4.** Depends on **SPEC-ficha-medica.md** (authoritative, sec 5.10-5.13) and **W5-14** (field sequence 5.1-5.9 in place). Migration-free (fields live in the Ficha Medica `form_templates` schema + renderer). Runs after W5-14.

## Field 1. Scope and ground truth
Build the **Mobilidade Activa / Passiva three-circle marker widget** plus the **Observacoes Mobilidade, Testes Neurologicos, Testes Especiais, Diagnostico, Tratamento, Observacoes** fields, in the SPEC sec 5 sequence.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory; SPEC sec 5.10-5.13 authoritative):
- **Sequence position (SPEC 5):** after Bodychart (5.9) comes **5.10 Mobilidade Activa/Passiva**, then **5.11 Testes Neurologicos + Testes Especiais**, then **5.12 Diagnostico + Tratamento** with the existing **Plano de Tratamento** (`treatment_plan`, AI key 11) and **Objectivos do Tratamento** (`treatment_objectives`, AI key 10) placed **after Tratamento** (Q-W5-2 default: keep both), then **5.13 Observacoes** (`observations`, AI key 12).
- **Mobilidade widget (SPEC 5.10):** three circle diagrams labeled **Cervical, Dorsal, Lombar**; the user inserts **unlimited markers per circle**; two marker types - **Mobilidade Activa (dot)** and **Mobilidade Passiva (star)**; a **Limpar marcadores** action per circle; followed by an **Observacoes Mobilidade Activa / Passiva** textarea.
- **Precedent to mirror (not reuse blindly):** the existing Bodychart (`apps/web/app/clinical/[id]/BodyChart.tsx`) is the marker-placement precedent - markers `{ marker_type, x, y, view }` at 0-1 normalized coords, click/keyboard placement, absolute-positioned circles, `readOnly` support. The Mobilidade widget is a NEW component with the same interaction model but three labeled circles + two marker types (dot/star) + Limpar. Model markers per circle as an array of `{ marker_type: "activa"|"passiva", x, y }` (0-1 normalized) under a `mobilidade.{cervical,dorsal,lombar}` field, per the SPEC field.
- **New vs existing fields:** Mobilidade, Observacoes Mobilidade, Testes Neurologicos, Testes Especiais, Diagnostico, Tratamento are **NEW** (added to the Ficha Medica schema). Plano de Tratamento / Objectivos do Tratamento / Observacoes are **existing** osteopathy keys (AI-populated) - keep their keys unchanged (SPEC sec 2 compatibility).
- **Immutability + AI-extractable:** the twelve AI keys stay `ai_extractable: true`; the NEW fields are `ai_extractable: false` (clinician-entered structured/observational data, not narrative the transcription fills). Adding fields is a new template version (W5-13 established the Ficha Medica version; extend its schema).
- **RECON FIRST (report BEFORE building):** the Bodychart interaction model to mirror; the Ficha Medica schema (from W5-13/W5-14) so the new fields slot into the authoritative sequence; how the renderer maps a custom widget (the Mobilidade widget likely needs an `x-widget` the renderer routes to the new component - confirm the widget-routing seam in `form-template.ts`/`RecordForm.tsx`).

**Scope (this loop = SPEC 5.10-5.13):** the three-circle Mobilidade widget (unlimited markers/circle, dot=Activa / star=Passiva, Limpar per circle) + Observacoes Mobilidade textarea; Testes Neurologicos; Testes Especiais; Diagnostico; Tratamento; then existing Plano/Objectivos after Tratamento (Q-W5-2 keep both); Observacoes (existing key). All in SPEC order. Migration-free (schema fields + a new renderer widget). pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-15-mobilidade origin/main -b osteojp-w5-15-mobilidade`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the Bodychart interaction model; the Ficha Medica schema slot for 5.10-5.13; the renderer's custom-widget routing seam.
3. **Mobilidade widget (new component):** three labeled circles (Cervical, Dorsal, Lombar); unlimited markers/circle; two marker types dot(Activa)/star(Passiva); Limpar marcadores per circle; `readOnly` support (for finalized records). Markers 0-1 normalized under `mobilidade.{cervical,dorsal,lombar}`. Route it via an `x-widget` the renderer resolves.
4. **Observacoes Mobilidade** textarea after the widget.
5. **Testes Neurologicos; Testes Especiais** (new fields).
6. **Diagnostico; Tratamento** (new), then existing **Plano de Tratamento** + **Objectivos do Tratamento** after Tratamento (Q-W5-2 default keep both - keys unchanged), then **Observacoes** (existing).
7. **Keep the twelve AI keys unchanged** (compatibility); new fields `ai_extractable: false`.
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (place Activa + Passiva markers on each of the three circles; Limpar clears one circle; the 5.10-5.13 fields render in order; a finalized record renders the widget read-only).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows (fields are `form_templates` schema; the widget is a renderer component). Paste it.
- **Recon report pasted:** Bodychart model; the schema slot; the widget-routing seam.
- **Mobilidade widget proven:** an e2e places multiple Activa (dot) + Passiva (star) markers on Cervical, Dorsal, and Lombar; Limpar clears a circle; markers persist to `mobilidade.*` and restore on reload. Paste it.
- **Sequence proven:** 5.10 -> Observacoes Mobilidade -> Testes Neurologicos -> Testes Especiais -> Diagnostico -> Tratamento -> Plano -> Objectivos -> Observacoes, in order. Paste the snapshot/e2e.
- **AI keys unchanged:** `treatment_plan` / `treatment_objectives` / `observations` keys unchanged and still `ai_extractable: true`; new fields `ai_extractable: false`. State + show.
- **Read-only proven:** a finalized (locked/signed) record renders the Mobilidade widget read-only (no marker edits). Paste it.
- **Suite counts** (baseline web 816, ui 42) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the Mobilidade widget e2e (three circles, dot/star, Limpar, persist/restore), the 5.10-5.13 sequence proof, the AI-keys-unchanged proof, the read-only proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md authoritative** (sec 5.10-5.13).
- **Migration-free** (schema fields + renderer widget); if the widget genuinely needs a `packages/ui` primitive, HALT + blast-radius first.
- **Do not change the twelve AI keys** (SPEC sec 2 compatibility) - new fields only; new fields `ai_extractable: false`.
- **Keep both Plano + Objectivos** after Tratamento (Q-W5-2 default) unless the owner rules otherwise.
- **Read-only on finalized records** (immutability, rule 4) - the widget must respect `readOnly`.
- **Do not touch Bodychart** (that is 5.9, W5-14/unchanged) or the 5.14 signature section (W5-16).
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md` with a recommended default. Halt if: the renderer has no seam to route a custom widget without a shared-primitive change (surface the seam + ripple); or Q-W5-2 is answered "drop one of Plano/Objectivos" (a product change from the keep-both default).

## Field 7. Report back
Recon report, the Mobilidade widget + the 5.10-5.13 fields in sequence, the marker/Limpar/persist tests, the AI-keys-unchanged + read-only proofs, migration-free proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

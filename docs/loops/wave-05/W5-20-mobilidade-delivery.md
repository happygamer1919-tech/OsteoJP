# Loop W5-20 - Mobilidade Activa/Passiva delivery + conformance (Wave 05 Hotfix)

GATE: **Wave 05 Hotfix, Batch H (migration-free).** Depends on **SPEC-ficha-medica.md AMENDMENTS 2026-07-09 ruling E** (the Mobilidade component spec) and the shipped W5-15 widget. Migration-free. Composes with W5-19 (which fixes the field ORDER at position 10; this loop owns the WIDGET).

## Field 1. Scope and ground truth

Per recon, the W5-15 Mobilidade component EXISTS and is MOUNTED. Bring it into **conformance** with the AMENDMENTS ruling-E component spec (it is not a from-zero build). Prove placement, persistence, Limpar, and read-only.

Ground truth (recon 2026-07-09, embed - executor runs with ZERO memory; AMENDMENTS ruling E authoritative):
- **W5-15 status: EXISTS-AND-MOUNTED.** Component: `apps/web/app/clinical/[id]/MobilidadeChart.tsx`. It is imported in `RecordForm.tsx` (line ~26) and rendered via the `mobilidade` widget branch of `FieldWidget` (`widgetOf` returns `mobilidade` when a field carries `x-widget: "mobilidade"`). The `osteopathy-v3.json` `mobilidade` field carries that widget and sits at sequence position 10 (immediately after `bodychart`), followed by `mobilidade_observacoes`.
- **What ALREADY conforms:** three labeled circles Cervical / Dorsal / Lombar; two marker types Mobilidade **Activa** (teal filled dot) and **Passiva** (magenta star); unlimited markers per circle; click + keyboard (arrow-cursor + Enter/Space) placement; persistence into the record `data` JSON under `mobilidade.{cervical,dorsal,lombar}` as arrays of `{marker_type, x, y}` in normalized 0-1 coords; `readOnly` gating on finalized records (no placement, no clear).
- **What DIVERGES from ruling E (the conformance work):**
  1. **Marker-type control** is a `<select>` dropdown - ruling E wants a **selectable toggle with min-44px controls** (touch-friendly).
  2. **No explicit "Inserir marcador" arm step** - the widget places on direct click. Ruling E wants an **"Inserir marcador"** action that ARMS placement, then a click/tap places.
  3. **"Limpar marcadores" is PER-CIRCLE** - ruling E wants a **single record-wide** Limpar marcadores that clears ALL markers on the record.
  4. **Reference spokes are MISSING** - each circle is plain. Ruling E wants an SVG with **vertical top, two upper diagonals, full horizontal, vertical bottom** spokes.
  5. **Header + helper line:** ruling E specifies header "Mobilidade Activa / Passiva" and helper "Pode inserir tantos pontos quantos desejar apos clicar em Inserir marcador". The shipped `x-hint` differs; align the helper copy.
- **Persistence shape decision (recon + choose):** ruling E's logical model is `{circle, type, x, y}`. The shipped per-circle keying (`mobilidade.cervical: [{marker_type,x,y}, ...]`) carries the same four facts (circle = object key). **RECOMMENDED: keep the shipped per-circle keying** to avoid churning any already-stored marker data; recon whether any records already hold `mobilidade` data before considering a reshape. Flattening to a literal `{circle,type,x,y}` list would change the stored shape AND the `mobilidade` sub-schema (cervical/dorsal/lombar arrays) - do that ONLY if recon shows zero stored marker data and the owner prefers the flat list; else HALT (Field 6).
- **i18n:** all copy via `@osteojp/i18n` keys (existing `clinical.mobilidade*` keys) in BOTH string files; any new key (Inserir marcador, the helper line) added to both.
- **Bodychart** is a SEPARATE component (`BodyChart.tsx`) - do NOT touch it.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-20-mobilidade-delivery origin/main -b osteojp-w5-20-mobilidade-delivery`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** confirm EXISTS-AND-MOUNTED (component path + the RecordForm mount + the v3 `mobilidade` field at position 10); paste the current persistence shape; confirm whether any records already hold `mobilidade` data (drives the persistence-shape decision).
3. **Reference spokes:** add the SVG spokes (vertical top, two upper diagonals, full horizontal, vertical bottom) inside each circle.
4. **Toggle + Inserir marcador:** replace the `<select>` with a min-44px marker-type toggle; add an "Inserir marcador" action that arms placement; a click/tap then places the selected marker type. Keep keyboard placement accessible.
5. **Record-wide Limpar marcadores:** one Limpar action clearing ALL markers on the record (all three circles), replacing the per-circle clears (or in addition, per the executor's a11y judgment - but a single record-wide clear MUST exist).
6. **Header + helper copy:** header "Mobilidade Activa / Passiva", helper "Pode inserir tantos pontos quantos desejar apos clicar em Inserir marcador".
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (place-and-persist across all three circles in both marker types; reload proves persistence; Limpar clears; read-only on signed records).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it (unless the persistence reshape path is chosen AND owner-approved - then follow the standard migration rules; default is migration-free).
- **Mounted PROOF:** recon shows the component mounted at position 10; paste the RecordForm mount + the v3 field.
- **Place-and-persist E2E:** markers placeable on ALL THREE circles in BOTH types on a fresh record; a reload proves persistence (markers survive). Paste it.
- **Limpar PROOF:** a single record-wide Limpar marcadores clears all markers. Paste the test.
- **Read-only PROOF:** on a signed/finalized record the widget renders read-only (no placement, no Limpar). Paste it.
- **Conformance PROOF:** reference spokes present; min-44px toggle; "Inserir marcador" arms placement; helper copy matches. State the checks.
- **Suite counts** (baseline web 816) with green gates.

## Field 4. Verification (paste evidence)
Recon report (exists-and-mounted + persistence shape + stored-data check), migration-free diff, the place-and-persist E2E, the Limpar test, the read-only test, the conformance checks, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md AMENDMENTS ruling E authoritative.**
- **Reconcile, do NOT rebuild from zero** - the component exists and is mounted; keep what conforms.
- **Migration-free by default.** Keep the shipped per-circle persistence keying unless recon proves zero stored marker data AND the owner prefers the flat list; a reshape that touches stored data follows the standard migration rules or HALTS.
- **Bodychart untouched** (`BodyChart.tsx`).
- **Field ORDER (position 10) is W5-19's remit** - this loop owns the widget, not the sequence.
- pt-PT i18n (both files), no emoji, SVG icons only, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- Recon CONTRADICTS the owner finding in a scope-changing way - e.g. the component is NOT actually mounted, or does NOT persist - such that the loop becomes a from-zero build rather than a conformance pass (surface the delta before building).
- Conforming to ruling E would require reshaping ALREADY-STORED `mobilidade` marker data (recon finds records holding it) - surface the data-migration question with a recommended default (keep the shipped keying).

## Field 7. Report back
Recon report (exists-and-mounted verdict + persistence shape), the conformance changes made, the place-and-persist + Limpar + read-only proofs, migration-free proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

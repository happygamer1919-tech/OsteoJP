# Loop W5-25 - Bodychart marker differentiation (shape + color + legend) (Wave 05 Ficha Final)

GATE: **Wave 05 Ficha Final, migration-free.** Depends on **SPEC-ficha-medica.md AMENDMENTS 2026-07-11 ruling G** (authoritative). Migration-free and template-free (render-only change to `BodyChart.tsx` + a UI-STYLE.md palette addition). Composes with W5-26 (also edits `BodyChart.tsx`, adds the EVA selector for `pain_location`) - EXPECT a file collision on `BodyChart.tsx`; run W5-25 first or rebase W5-26 onto it, and coordinate. No collision with W5-24 (RecordForm renderer only).

## Field 1. Scope and ground truth

Give each of the nine bodychart marker types a **unique geometric shape AND a unique color**, add an **always-visible legend**, per AMENDMENTS ruling G. Shape carries the meaning; color reinforces; never color alone (greyscale-legible). Render-only.

Ground truth (recon 2026-07-11, embed - executor runs with ZERO memory; ruling G authoritative):
- **Component:** `apps/web/app/clinical/[id]/BodyChart.tsx` (the `bodychart` x-widget, mounted by RecordForm.tsx `case "bodychart"`). Props: `markers`, `onChange`, `markerOptions` (`{value,label}` derived from the template enum), `readOnly`, `sex`. Marker type `Marker = { marker_type: string; x: number; y: number; view: string }`.
- **Current visual state (recon-verified):** ALL markers render identically - `inView.map(... <span className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border border-surface bg-brand-magenta" ...>)` (BodyChart.tsx). No per-type shape or color. Type is conveyed ONLY by the hover `title={labelFor(m.marker_type)}` tooltip and the bottom marker-list `<li>` text (`[view] label`). So differentiation does not exist today - this is a real build.
- **Nine types (frozen `marker_type` enum, `osteopathy-v3.json` `bodychart.items.properties.marker_type`):** `blockage_dysfunction` (Bloqueio / Disfuncao), `scar` (Cicatriz), `hypertonicity` (Hipertonicidade), `hypotonicity` (Hipotonicidade), `pain_radiation` (Irradiacao da dor), `pain_location` (Local da dor), `paresthesia` (Parestesia), `rotation_right` (Rotacao direita), `rotation_left` (Rotacao esquerda). Labels already resolve via `markerOptions` / `enumLabel`.
- **Authoritative shape mapping (ruling G):** `blockage_dysfunction` = square; `scar` = cross (X); `hypertonicity` = triangle (apex up); `hypotonicity` = diamond; `pain_radiation` = star; `pain_location` = filled circle; `paresthesia` = ring (hollow circle); `rotation_right` = right-pointing arrow; `rotation_left` = left-pointing arrow. The two rotations use directional arrows. Render as small SVG glyphs (min ~12px on-chart), each in its own color.
- **Palette gap (recon):** UI-STYLE.md is token-only; its named palette (teal, grey, status green/amber, error red; **magenta reserved for the brand lockup**) does NOT provide nine distinct AA-safe hues. Ruling G directs this loop to **extend UI-STYLE.md in the same PR** with a nine-entry bodychart marker palette of AA-checked tokens (the UI-STYLE conformance note permits a surface to extend the doc). No raw hex in components; add the palette tokens, reference them by name. Shape is the authoritative carrier, so merely-distinguishable colors are acceptable.
- **Storage untouched:** markers stay `{ marker_type, x, y, view }`; the render is type-driven off the persisted `marker_type`, so existing markers on a pre-existing draft render with the new visuals automatically. Placement (click + keyboard), the four views, and read-only gating are UNCHANGED. The v3 template `bodychart` schema is NOT edited.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-25-bodychart-marker-legend origin/main -b osteojp-w5-25-bodychart-marker-legend`; assert toplevel ends in `osteojp-w5-25-bodychart-marker-legend`; assert clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** paste the current single-style marker render and confirm the nine enum values are present and unchanged; confirm the UI-STYLE palette lacks nine distinct hues (justifies the palette extension).
3. **UI-STYLE.md palette:** add a nine-entry bodychart marker palette section (AA-checked against the chart surface `bg-surface-muted`), token-named, one color per `marker_type`. Note the shape-primary / color-reinforcing rule.
4. **Shape + color render:** replace the single magenta-dot render with a per-type SVG glyph keyed off `marker_type` (the nine shapes above), each filled/stroked in its palette token. Keep the existing marker position math (`left/top` percentages), the `title` tooltip, and the keyboard-cursor indicator. Shapes must be distinct at ~12px.
5. **Legend:** render a compact, ALWAYS-VISIBLE legend beside or below the chart, mapping each shape+color to its pt-PT type name (the nine `markerOptions` labels). Presentation chrome, not a hover/disclosure. pt-PT via i18n; reuse the enum labels.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (all nine types render distinctly; legend present; a pre-existing draft's markers render correctly).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free + template-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`, and does NOT touch `packages/db/seed/form-templates/osteopathy-v3.json`. Paste it.
- **Nine-distinct PROOF:** an E2E snapshot OR DOM assertion proving all nine marker types render with a DISTINCT shape (and distinct color token) - e.g. place one of each type and assert nine different shape identifiers / nine different color tokens in the DOM. Paste it.
- **Legend PROOF:** a test asserts the legend is present and lists all nine pt-PT type names with their shape+color. Paste it.
- **Existing-markers PROOF:** a test loads a PRE-EXISTING draft carrying markers of several types and asserts they render with the new type-driven visuals (no stored-data change; the marker array shape is still `{ marker_type, x, y, view }`). Paste it.
- **No-placement-change PROOF:** a test asserts marker placement (click/keyboard) and the persisted marker shape are UNCHANGED (still `{ marker_type, x, y, view }`, no new stored key from this loop). Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, migration-free + template-free diff, the nine-distinct snapshot/DOM assertion, the legend proof, the existing-markers-render proof, the no-placement-change proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md AMENDMENTS ruling G authoritative.**
- **Render-only.** Do NOT change marker placement, the four views, the marker array shape `{ marker_type, x, y, view }`, or read-only gating.
- **Migration-free and template-free.** No new column, no `osteopathy-v3.json` edit, no template version bump, no workflow, no vendor.
- **Never color alone** - shape must disambiguate every type in greyscale. No raw hex in components (UI-STYLE tokens only; extend the doc for the marker palette).
- **No new `packages/ui` primitive** - the marker glyphs + legend live in `apps/web` (`BodyChart.tsx`); a `packages/ui` change ripples beyond one surface (HALT and surface the blast radius first per UI-STYLE.md).
- **Do NOT add the EVA `intensity` attribute** - that is W5-26's remit; this loop is shape+color+legend only.
- pt-PT i18n (both files), no emoji, UI-STYLE.md tokens. **Never force-push / `--admin`.** Secrets never printed. Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- Recon finds per-type shape+color+legend ALREADY shipped in BodyChart.tsx (nothing to build) - halt and recommend a docs-only already-shipped close.
- The nine `marker_type` enum values have drifted from ruling G (added/removed/renamed) - surface the mismatch; the shape mapping binds to the frozen enum.
- Achieving distinct colors WITHOUT a UI-STYLE palette extension is impossible AND extending UI-STYLE.md is judged out of scope - surface the palette-gap decision with the recommended default (extend UI-STYLE.md, per ruling G).
- A `packages/ui` primitive change is the only way to render the glyphs/legend - surface the blast radius before touching `packages/ui`.

## Field 7. Report back
Recon report, the nine-distinct proof, the legend proof, the existing-markers-render proof, the no-placement-change proof, migration-free + template-free diff, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

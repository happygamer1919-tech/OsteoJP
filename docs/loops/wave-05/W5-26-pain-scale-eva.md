# Loop W5-26 - Pain scale (EVA) on Local da dor markers (Wave 05 Ficha Final)

GATE: **Wave 05 Ficha Final, migration-free.** Depends on **SPEC-ficha-medica.md AMENDMENTS 2026-07-11 ruling H** (authoritative). Migration-free (`intensity` is an additive jsonb key on the marker object; no DB migration and NONE authorized). Composes with W5-25 (both edit `BodyChart.tsx`) - EXPECT a collision; run AFTER W5-25 or rebase onto it, and coordinate. No collision with W5-24 (RecordForm renderer only).

## Field 1. Scope and ground truth

When a marker of type **Local da dor** (`pain_location`) is placed, show a **0-10 EVA intensity selector**; store the chosen value as **`intensity`** on that marker in the record `data` jsonb; display it in the marker list and on the chart. Optional per marker; editable while draft; read-only on signed records. Per AMENDMENTS ruling H.

Ground truth (recon 2026-07-11, embed - executor runs with ZERO memory; ruling H authoritative):
- **Component:** `apps/web/app/clinical/[id]/BodyChart.tsx` (the `bodychart` x-widget). Marker type `Marker = { marker_type: string; x: number; y: number; view: string }`; add optional `intensity?: number`. Placement today: `place()` (click) and `handleKey()` (keyboard Enter/Space) both `onChange([...markers, { marker_type: markerType, x, y, view }])`. The bottom marker list maps each marker to `<li>[view] {labelFor(marker_type)}</li>`; the on-chart marker carries `title={labelFor(marker_type)}`.
- **Storage (recon-verified feasibility c):** markers persist in the record `data` jsonb array `data.bodychart`; `data` is a jsonb column (JSON-Schema-driven templates, CLAUDE.md rule 5). Adding `intensity` (0-10 number) to a marker object is an additive jsonb key - **no DB migration**. Confirmed migration-free.
- **Template-touch decision (recon in this loop, BEFORE building):** determine whether the form save path preserves undeclared jsonb keys through the record `data` write (recon `apps/web/lib/clinical/records.ts` `updateRecordData()` and any JSON-Schema validate/strip step, `apps/web/lib/clinical/form-template.ts`).
  - **Path A (preferred, most rule-5-safe):** if the save path preserves unknown keys, store `intensity` component-side with **NO template change** - BodyChart.tsx writes/reads `intensity` on `pain_location` markers, and the persisted jsonb carries it through untouched.
  - **Path B (migration-free fallback):** if the save path STRIPS keys not declared in the template schema, declare an optional `intensity` on the `bodychart` item by seeding `osteopathy` **v4** and re-upserting (a seed value change, NOT a DB migration; v3 stays immutable for records that reference it, rule 5). Follow the W5-23 seed-upsert precedent (fetch-and-fast-forward first, scoped upsert, paste before/after row) if a live-DB re-seed is needed - BUT this authoring batch is DOCS-ONLY; the executor loop performs any live-DB step, not the author.
  - Record the chosen path in the PR and DECISIONS. Either path is migration-free.
- **Only `pain_location` carries a scale.** The selector appears ONLY when the placed/selected marker type is `pain_location`; the other eight types get no selector and no `intensity`.
- **Optional:** skipping the selector saves the marker WITHOUT `intensity` (valid, scale-less Local da dor marker).
- **Display:** marker-list entry shows "Local da dor - EVA 7/10" when `intensity` is set; the on-chart `title`/label appends the value.
- **Gating:** the selector honors the existing `readOnly` prop (draft = editable, signed/locked = read-only value shown, no control).
- **Tap targets min 44px** (ruling H; consistent with the Mobilidade toggle, AMENDMENTS ruling E).
- **Twelve AI keys:** untouched (bodychart is `ai_extractable: false`). W5-13 compat test stays green.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-26-pain-scale-eva origin/main -b osteojp-w5-26-pain-scale-eva`; assert toplevel ends in `osteojp-w5-26-pain-scale-eva`; assert clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** paste the marker save path finding (does it preserve undeclared jsonb keys?) and the resulting Path A vs Path B choice; confirm `intensity` needs NO DB migration (else HALT, Field 6).
3. **Marker type + selector:** add optional `intensity?: number` to `Marker`. When the selected/placed marker is `pain_location`, present a 0-10 EVA selector (tap-friendly, min 44px targets); write the chosen value onto that marker. Skipping leaves `intensity` unset. Other types: no selector.
4. **Persist:** ensure `intensity` survives the record `data` write (Path A: verify passthrough; Path B: seed v4 declaring the optional `intensity`, re-upsert). No DB migration.
5. **Display:** marker-list entry shows "Local da dor - EVA {n}/10" when set; the on-chart `title`/label shows it too. Other-type markers unchanged.
6. **Read-only gating:** on signed/locked records the stored EVA value shows but no editable control (reuse the `readOnly` prop).
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (place a Local da dor marker, select 7, reload, value persists and displays; other types unaffected; signed read-only verified).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it. (If Path B: the only seed change is a NEW `osteopathy-v4.json`; v3 is NOT edited - state which path was taken.)
- **Persist-and-display E2E:** place a `pain_location` marker, select **7**, save, RELOAD; assert the stored marker carries `intensity: 7` and the marker list shows "Local da dor - EVA 7/10" and the chart shows it. Paste it.
- **Other-types-unaffected PROOF:** a test places markers of non-`pain_location` types and asserts NO selector appears and NO `intensity` is stored on them. Paste it.
- **Optional PROOF:** a test places a `pain_location` marker and SKIPS the selector; asserts the marker saves without `intensity` and renders as a scale-less Local da dor marker. Paste it.
- **Signed read-only PROOF:** a test on a signed/locked record asserts the EVA value renders but no editable EVA control exists. Paste it.
- **W5-13 compatibility test GREEN:** `ficha-medica-compat.test.ts` passes. Paste the passing run.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report (save-path finding + Path A/B choice), migration-free diff, the persist-and-display E2E, the other-types-unaffected proof, the optional proof, the signed read-only proof, the passing W5-13 compatibility test, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md AMENDMENTS ruling H authoritative.**
- **Migration-free.** `intensity` is an additive jsonb key; **no DB migration and none authorized.** A template `osteopathy-v4` seed (Path B) is the ONLY permitted schema touch, and only if recon proves the save path strips undeclared keys - never edit v3 (rule-5 immutable once referenced).
- **`intensity` only on `pain_location`.** Do not add a scale to any other marker type. Do not touch the other eight types' behavior.
- **Additive only.** Do NOT change the existing marker keys `{ marker_type, x, y, view }` or placement math; `intensity` is the sole new key, and it is optional.
- **Twelve AI keys frozen**; the W5-13 compatibility test stays green.
- **Compose with W5-25** - do not revert or conflict with the shape+color+legend render; run after it or rebase.
- pt-PT i18n (both files), no emoji, UI-STYLE.md tokens, min 44px targets. **Never force-push / `--admin`.** Secrets never printed. Plain hyphens only. SYNTHETIC-DATA-ONLY for any dry-run.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- **Recon finds the marker `data` CANNOT carry `intensity` without a DB migration** (neither Path A passthrough nor a Path B v4 seed works migration-free) - HALT with a recommended default; a migration is NOT authorized for this batch.
- Path B is required AND it would force editing the referenced-v3 template (not a clean v4 bump) - surface the rule-5 blast radius.
- The EVA selector ALREADY ships on `pain_location` markers (nothing to build) - halt and recommend a docs-only already-shipped close.
- Any change would move a twelve-key binding or alter a non-`pain_location` marker's stored shape.

## Field 7. Report back
Recon report (save-path finding + Path A/B choice), the persist-and-display E2E, the other-types-unaffected proof, the optional proof, the signed read-only proof, the passing W5-13 compatibility test, migration-free diff, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

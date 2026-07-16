# Loop W9-08 - Project skills (Wave 09 Correcoes CB)

GATE: **Wave 09 Correcoes CB, DOCS-CLASS, OWNER-MERGE.** Creates two standing agent-governing skill files - `.claude/skills/osteojp-design/SKILL.md` (the locked visual system) and `.claude/skills/osteojp-conventions/SKILL.md` (the loop-discipline summary) - so future terminals load the design system and the loop rules from a skill instead of re-deriving them each session. Runs LAST in Wave 09. Starts from **fresh `origin/main`**; never stacked. **OWNER-MERGE** (same class as workflow files: after this loop these are owner-merge-only and never touched by wave loops).

## Field 1. Scope and ground truth

Author two SKILL.md files under `.claude/skills/`. They are DISTILLATIONS of already-committed authority (they invent nothing): `osteojp-design` mirrors `docs/design/UI-STYLE.md` + `docs/design/W6-06-color-equity-palette-plan.md` + the brand tokens; `osteojp-conventions` mirrors `CLAUDE.md` + the board coordination protocol (`docs/design/BACKLOG.md`) + the loop-file 7-field discipline. Each frontmatter `description` must state PRECISELY when the skill applies, so the harness loads the right one.

Ground truth (recon at authoring 2026-07-16, embed - executor runs with ZERO memory; the executor RE-READS the source docs at execution and mirrors them, never paraphrases from this list alone):
- **`.claude/skills/` does NOT exist yet** (only `.claude/agents/` and `.claude/commands/`). This loop creates the two skill directories + files. Skill files are standing agent-governing files, class-equivalent to `.github/workflows/` for merge policy: OWNER-MERGE, and after this loop wave loops NEVER touch them.
- **Design system source (locked, mirror it faithfully):**
  - Brand tokens (CLAUDE.md): teal `#45B9A7`, magenta `#8B1863`, grey `#98B2C2`; canonical hexes guarded by `packages/ui/src/tokens.test.ts`, never drift; Inter; clinical, generous spacing; NO emoji in product UI.
  - **Colour equity 55/25/20 (W6-06, made perceptible in W7-03):** 55 percent white + grey (structure/surfaces/text), **25 percent CYAN (accent-2) for PRIMARY interaction** (links/CTAs use `accent-2-700 #2F7E72` for text, AA 4.83:1; never the base `#45B9A7` for text), **20 percent PURPLE (accent-1 `#8B1863` + tints) for SECONDARY emphasis** (active tab underline + label `accent-1-700`, empty-state icon badge, section-header left rule, row icon badges, Estatisticas peak bar). Purple is EMPHASIS, not interaction; the green Button variants and the active nav item are deliberately NOT repainted. (Note: the wave briefing shorthand "purple accent per the 55/25/20 equity" is imprecise - the ruling is 55 white/grey + 25 cyan + 20 purple; cyan is primary, purple is secondary. Mirror the ACCURATE ruling.)
  - **AA minimums:** every colour pairing meets WCAG AA (>= 4.5:1); value is always printed as text where colour would otherwise be the only cue (`color-not-only`).
  - **Agenda + card conventions:** card anatomy (`GlassPanel`/`GlassCard`/`KpiCard`, `p-6`/`p-3`), table anatomy (`admin-ui.ts` `adminTh`/`adminTd`/`adminTrBorder`, identity-first columns, Estado badge + Acoes last), spacing 4px grid, Estado badges via `StatusBadge` tones (confirmed/pending/cancelled), row-actions disclosure pattern. Plus the Wave 09 additions once merged (per-therapist agenda colour W9-05, blocked-time band W9-04) - the executor reflects whatever is on `origin/main` at execution.
  - **Empty-state rules (W7-03):** exactly icon badge, title, subtitle, optional action; NOTHING renders above the icon; the `HeritageBand`/azulejo ornament was removed platform-wide and must not return in an empty state.
  - **Bodychart / legend locks (W5-25):** nine `marker_type` values each render with a unique SHAPE + unique COLOUR (shape is the authoritative carrier, colour reinforces, never colour alone); an always-visible legend; the nine-entry `marker-*` palette in `apps/web/app/globals.css` is AA-checked against `#F0F3F6`; magenta is reserved for the brand lockup; the marker array shape `{ marker_type, x, y, view }` and the frozen `osteopathy-v3.json` enum are untouched (render-only).
- **Conventions source (loop discipline, mirror it faithfully):**
  - **Loop files outrank session prompts** (committed docs are authority; ground truth outranks the briefing - the pattern recorded across DECISIONS, e.g. the Wave 07/08 briefing-vs-reality corrections).
  - **The i18n JSON pair is a single point of failure:** every user-facing string is a key in BOTH `strings.pt.json` and `strings.en.json` (`StringKey` is the intersection, a one-file key fails typecheck); JSON.parse BOTH files in every gate.
  - **Required checks read from the checks API, never the banner:** GREEN self-merge only when every required check (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API; never `--admin`, never the bypass box; a refused merge is a HALT.
  - **Halt-loud over improvisation:** on a scope/product/data/reality mismatch, HALT to `~/osteojp-mailbox/escalations` (+ osascript) and record the product/scope question in `docs/design/QUESTIONS.md` with a recommended default; move to the next unblocked loop.
  - **Immutability is never defeated:** the clinical-records lock trigger (rule 4) and `audit_log` append-only (rule 6) are never bypassed; an immutability-bypass claim escalates instantly.
  - **Done is a number / a file / an exit code:** the Definition of Done is machine-verifiable (row counts, a committed file, gates green), never a prose claim.
  - **One migration in flight;** every domain table ships `tenant_id` + RLS + an isolation test in the same PR; DB access only through `packages/db`; money is integer cents; PII never logged; plain hyphens only, no em/en dashes, pt-PT diacritics correct; SYNTHETIC-DATA-ONLY for verify, disposable test patients only (never Maria Joao Silva), reference therapist Tiago Reis.

**Scope:** two committed SKILL.md files with precise `description` frontmatter (when each applies), mirroring the locked design system and the loop-discipline conventions from their source docs. No product code, no migration, no i18n, no workflow file. After this loop the two skill files are owner-merge-only and out of scope for every wave loop.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W9-07's merge; `git worktree add ../osteojp-w9-08-project-skills origin/main -b osteojp-w9-08-project-skills`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Re-read the source docs** at execution (`docs/design/UI-STYLE.md`, `docs/design/W6-06-color-equity-palette-plan.md`, `CLAUDE.md`, `docs/design/BACKLOG.md` coordination protocol, a representative wave-09 loop file) so the skills mirror the CURRENT committed authority, including any Wave 09 additions on main.
3. **Author `.claude/skills/osteojp-design/SKILL.md`:** frontmatter `name` + a `description` that says precisely WHEN it applies (any OsteoJP surface/UI/agenda/card/empty-state/bodychart work), then the locked visual system: brand tokens + canonical-hex lock, the accurate 55/25/20 equity (cyan primary / purple secondary), AA minimums + colour-not-only, agenda + card + table + badge conventions, empty-state rules, bodychart/legend locks. Reference the source docs as authority.
4. **Author `.claude/skills/osteojp-conventions/SKILL.md`:** frontmatter `name` + a `description` that says precisely WHEN it applies (any OsteoJP loop execution / PR / gate / merge decision), then the loop-discipline summary: loop files outrank session prompts, the i18n JSON-pair SPOF + JSON.parse gate, required-checks-from-the-API not the banner, halt-loud over improvisation, immutability never defeated, done-is-a-number/file/exit-code, one-migration-in-flight + RLS-per-table + cents + PII + hyphens + synthetic-data + test-data rule.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still green (adding docs/skill files must not break them); `pnpm test:e2e` unaffected. Confirm `git diff --name-only origin/main` shows ONLY the two `.claude/skills/**/SKILL.md` files (+ the BACKLOG row flip on close); ZERO product code, ZERO migration, ZERO `.github/workflows/`, ZERO i18n files.

## Field 3. Definition of done (machine-verifiable)
- **Files PROOF:** `.claude/skills/osteojp-design/SKILL.md` and `.claude/skills/osteojp-conventions/SKILL.md` exist, each with frontmatter (`name` + a precise `description`) + the content sections above. Paste both paths + their frontmatter `description` lines.
- **Faithfulness PROOF:** the design skill states the ACCURATE 55/25/20 ruling (cyan primary, purple secondary), the AA/colour-not-only rule, the empty-state rule, and the bodychart shape-not-colour + always-visible-legend lock; the conventions skill states the six discipline lines. Cite the source doc each mirrors.
- **Scope PROOF:** `git diff --name-only origin/main` shows ONLY the two SKILL.md files (+ the BACKLOG close flip); ZERO product code / migration / workflow / i18n. Paste it.
- **Gates green** (adding the skill files does not break lint/typecheck/test/build).

## Field 4. Verification (paste evidence)
The two file paths + their `description` frontmatter, the faithfulness citations, the scope diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W9-07). **Docs-class:** the only writes are the two `.claude/skills/**/SKILL.md` files (+ the BACKLOG close flip). NO product code, NO migration, NO i18n, NO `.github/workflows/`.
- **Mirror, do not invent.** The skills distil committed authority (UI-STYLE.md, W6-06 plan, CLAUDE.md, BACKLOG protocol). If the source docs and the briefing conflict, the source docs win (state the accurate 55/25/20 ruling; the briefing shorthand is imprecise).
- **After this loop the two skill files are OWNER-MERGE-ONLY and out of scope for every wave loop** (same class as workflow files). Never edited by a wave loop.
- Plain hyphens only; no emoji; no em/en dashes; pt-PT diacritics correct where quoted. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W9-07's merge.
- The source docs are internally contradictory on a locked value (e.g. a canonical hex) in a way that cannot be mirrored faithfully - HALT to QUESTIONS rather than pick one silently.
- Authoring a skill would require asserting a NEW design or convention not already committed - HALT (the skills mirror committed authority; new rulings are owner-confirmable, not self-authored).

## Field 7. Report back
The two file paths + their `description` frontmatter, the faithfulness citations, the scope diff, gates green, PR number.

## Merge policy (embed, Wave 09 Correcoes CB)
- **W9-08 is OWNER-MERGE (docs-class, standing agent-governing files, same class as workflow files).** All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green, read from the checks API NOT the banner, is NECESSARY; GREEN pushes and HALTs for the owner to merge. GREEN NEVER self-merges standing agent-governing files.
- **Runs LAST in Wave 09**, fresh `origin/main`, never stacked. After merge the two skill files are owner-merge-only and never touched by a wave loop. Workflow files NEVER touched. HALT-LOUD on scope/product/data/reality mismatch.

# W7-03 design audit - per-surface plan (committed BEFORE implementation)

Loop: W7-03 (Wave 07 Correcoes QA, design redo). Owner rejected the W6-06 output on the deployed app: Registos clinicos and Documentos tabs judged worse than before, purple not perceptible, the unwanted line still present.

**`/ui-ux-pro-max` invocation evidence.** Skill invoked via the Skill tool at the start of this loop; `SKILL.md` (44,925 bytes) loaded into context. Its search CLI is NOT runnable in this environment: `skills/ui-ux-pro-max/scripts` and `/data` are symlinks to `../../../src/ui-ux-pro-max/...`, and `/Users/ivan/.claude/src/ui-ux-pro-max` does not exist (dangling symlink), so `python3 scripts/search.py` exits 1. This is the SAME known condition recorded for W6-06a in DECISIONS.md ("the skill's CLI DB was unavailable via a dangling symlink"). The audit and implementation are therefore driven by the skill's EMBEDDED rule set in `SKILL.md`, exactly as W6-06a was. Rules applied are cited per surface below by their skill IDs.

Governing skill rules for this loop:
- §1 `color-contrast`, `color-accessible-pairs` - every purple pairing must hold AA 4.5:1.
- §4 `style-match`, `no-emoji-icons`, `primary-action` - one primary action per surface; decoration is not style.
- §6 `color-semantic`, `visual-hierarchy`, `number-tabular`, `whitespace-balance` - hierarchy via size/spacing/contrast, not color alone.
- §8 `progressive-disclosure`, `destructive-emphasis`, `empty-states` - destructive actions separated and de-emphasised until wanted.
- §10 `trend-emphasis`, `contrast-data`, `color-not-only` - chart colour must never be the sole carrier of meaning.

---

## Surface 1. Empty states, platform-wide (the "unwanted line")

**Current state.** `packages/ui/src/components/EmptyState.tsx:54` renders `{heritage && <HeritageBand className="mb-2" />}`. `HeritageBand` (`packages/ui/src/components/HeritageBand.tsx`) is a 48px-tall band tiling the azulejo motif at 24px, mask-recoloured to `accent-2-200`. It renders ABOVE the empty-state icon badge. Exactly three app call sites pass `heritage`:
- `apps/web/app/patients/[id]/page.tsx:329` - Registos clinicos, "Sem registos clinicos"
- `apps/web/app/patients/[id]/PatientDocuments.tsx:147` - Documentos, "Sem documentos"
- `apps/web/app/patients/page.tsx:149` - patient list first-run

Plus `packages/ui/stories/EmptyState.stories.tsx:41` (`heritage: true`) and `packages/ui/stories/HeritageBand.stories.tsx`. `HeritageBand` has NO other consumer: `EmptyState` is its only non-story importer.

**This is the line the owner still sees.** W6-06b fixed a DIFFERENT line (PatientActions' naked `border-t`) and left this one. The decorative scallop band above the empty-state icon is the ornament being reported.

**Change.** Remove the ornament at the seam, not at the call sites: delete the `heritage` prop from `EmptyState` entirely, delete `HeritageBand.tsx`, its story and its `packages/ui/index.ts` export, and drop `heritage` from all three call sites and the EmptyState story. End state: an empty state is **icon badge, title, subtitle, primary action** - nothing above the icon, anywhere it renders.

**Rationale.** Removing the prop (rather than just not rendering the band) is the only variant that makes the regression unrepeatable: with no prop and no component, no future call site can put the band back. `HeritageDivider`, `HeritageCorners` and `HeritageFrame` are untouched - they serve other surfaces (auth, shell frame) and are not empty-state ornaments. Skill §4 `style-match`: decoration that carries no meaning in a clinical record view is noise; the empty state's job is to invite one action (§8 `empty-states`, §4 `primary-action`).

**Purple, in place of the ornament.** The icon badge moves from neutral `bg-surface-muted` / `text-text-secondary` to `bg-accent-1-50` / `text-accent-1-700`. The removed decoration is replaced by brand colour in a FUNCTIONAL role. AA: `#8B1863` on `#FAF4F8` = **8.43:1** (pass, and the icon is a graphical object needing only 3:1).

---

## Surface 2. Registos clinicos tab

**Current state.** `apps/web/app/patients/[id]/page.tsx` ~308-390. A toolbar row ("Mostrar anulados" link, "Nova ficha" primary), then flat `Card` rows. Each row: a `Link` column stacking template title + "Criado em: <datetime>" + a second bare `<span>` with `updatedAt` and NO label, then a right cluster mixing status chips, an "Nova versao" form-button, and `RecordLifecycleActions`. Three text lines of near-identical weight; two dates, one unlabelled; actions and status compete in one undifferentiated flex row.

**Change.**
- Add a section header: `h2` count-bearing title ("Registos clinicos - N") with a 2px `accent-1-700` left rule, above the toolbar.
- Row hierarchy: title stays `font-medium text-text-primary`; the two dates collapse into ONE meta line, labelled and `tabular-nums` (§6 `number-tabular`), `text-sm text-text-secondary`.
- Right cluster splits into two groups with a visible gap: **status** (chips) then **actions** (buttons), so state is never mistaken for an action.
- Row gets a hover surface tint and the whole card keeps its existing focus ring.

**Rationale.** §6 `visual-hierarchy` (hierarchy by size/spacing/contrast), §6 `number-tabular` (dates in a column must not jitter), §4 `primary-action` (one primary: "Nova ficha"). The owner's "worse than before" reading is the three-equal-lines problem: nothing tells the eye what the row IS before what can be done to it.

---

## Surface 3. Documentos tab

**Current state.** `apps/web/app/patients/[id]/PatientDocuments.tsx`. Upload control + helper text, then `Card` rows (file icon, filename, "size · date", "Abrir" ghost button), or the heritage `EmptyState`. W6-06b had already moved this off a raw table; the owner still judged it weak.

**Change.**
- Same section header treatment as Registos ("Documentos - N", `accent-1-700` left rule) so the two tabs read as one system.
- The file icon becomes a contained badge (`bg-accent-1-50`, `text-accent-1-700`) instead of a bare grey glyph - this is the "secondary accent" purple role, and it gives the row a visual anchor.
- Meta line already `tabular-nums`; keep, and keep "size · date" secondary.
- "Abrir" stays the single row action.

**Rationale.** §6 `visual-hierarchy` + `whitespace-balance`; §4 `icon-style-consistent` (Registos and Documentos rows should share an anchor pattern). The weakness was that every row read as undifferentiated grey text with a grey glyph.

---

## Surface 4. Acoes destrutivas card

**Current state.** `apps/web/app/patients/_components/patient-actions.tsx` renders a bordered card titled "Acoes destrutivas" (W6-06b). It is mounted in `apps/web/app/patients/[id]/page.tsx:440-448` **OUTSIDE every tabpanel**, in `<section className="mt-8">`. Therefore it is permanently expanded at the bottom of **every** tab - Resumo, Registos, Documentos, Faturacao alike - showing Eliminar, the merge form, and (for admins) the gated hard-delete, all open at all times.

**Change (in place, no relocation).** Wrap the card body in a native `<details>` disclosure: collapsed by default, summary row reads "Acoes destrutivas" with a danger-toned heading and a chevron. Border and heading move to the error token (`border-error` at low emphasis / `text-error`) so the section is unmistakably destructive (§8 `destructive-emphasis`). Contents (Eliminar / Juntar / Eliminar definitivamente) are unchanged and still password- and server-gated. The DOM position does not move.

**Rationale.** §8 `progressive-disclosure` - "reveal complex options progressively; don't overwhelm users upfront". The complaint is not that the card is ugly; it is that a permanently-open destructive block sits under every tab. Collapsing contains it without moving it. §8 `confirmation-dialogs` and the server-side password gate are untouched: this is presentation only, no control is weakened.

**PRODUCT QUESTION - NOT SELF-DECIDED (owner ruling required).**
> The destructive block currently renders on **every** tab because it is mounted outside the tabpanels. Arguably it belongs in exactly one place (e.g. only the Resumo tab, or behind an overflow menu in the patient header). **Moving it is a relocation, which this loop forbids me to decide.** I have only contained it in place.
> **Recommended default:** keep it where it is, collapsed (what this PR ships). If you want it to appear on only ONE tab, or behind a "..." menu in the patient header, say which, and it is a one-loop follow-up.
> Logged to `docs/design/QUESTIONS.md` as **Q-W7-03-1**.

---

## Surface 5. Active tab indicator

**Current state.** `packages/ui/src/components/Tabs.tsx`: the selected tab gets `border-accent-1-700` (a 2px purple underline) and `text-text-primary` (near-black label). W6-06b shipped exactly this and the owner reported purple as **not perceptible** - correctly: a 2px hairline under a black label is the entire purple footprint on the surface.

**Change.** The active tab's LABEL also becomes `text-accent-1-700`, keeping the 2px `border-accent-1-700` underline. Inactive tabs unchanged (`text-text-secondary`, transparent border).

**Rationale.** §9 `nav-state-active` (current location must be visually highlighted by colour AND weight), §6 `visual-hierarchy`. Colour is not the only signal - the underline and font-weight still carry the state (§1 `color-not-only`). AA: `#8B1863` on white = **8.72:1** (re-verified below).

---

## Surface 6. Selected states

**Current state.** `Tabs` is the app's selected-state primitive (patient profile). The sidebar nav's active item uses the v2 "Wellness Green" system (`bg-v2-glass-active-bg` + `text-v2-green-800`) with a documented AA rationale in `SidebarAppShell.tsx:31-48` (green-700 fails AA on that tint).

**Change.** Purple is applied to the `Tabs` selected state (Surface 5). The **sidebar nav active state is deliberately NOT repainted**, and neither are the `Button` variants (primary/secondary/ghost are the v2 green system, `Button.tsx:63-76`).

**Rationale + boundary.** Repainting the sidebar active item and the whole button system from v2 green to purple is not a design fix, it is a re-brand of the product's primary interaction colour, well beyond "make purple perceptible on defined roles", and it would invalidate the AA analysis those components carry. The 55/25/20 equity is a USAGE ratio across surfaces, not a mandate to purple every interactive control. Recorded here explicitly so the boundary is visible at the owner gate.

---

## Surface 7. Secondary accents

**Current state.** Section headings are plain `h2` text. Empty-state icon badges and document row icons are neutral grey.

**Change.** Purple takes three contained secondary-accent roles: the empty-state icon badge (Surface 1), the Registos/Documentos section-header left rule (Surfaces 2-3), and the Documentos row icon badge (Surface 3).

**Rationale.** §6 `color-semantic` - purple becomes the brand's *emphasis* token, applied to a small number of repeating structural roles, which is what makes it perceptible without flooding the interface. Keeps the equity near 55% white/grey structure, 25% cyan/green interaction, 20% purple emphasis.

---

## Surface 8. Estatisticas chart

**Current state.** `apps/web/app/estatisticas/bar-chart.tsx` - a dependency-free SVG horizontal bar chart (per Q-W6-05-1, no charting vendor). **Every** bar is filled with `var(--color-brand-teal)` (cyan). Zero purple.

**Change.** The **peak** bar (the max value) fills `accent-1-700` (purple); all other bars stay cyan. The numeric value stays rendered as text beside every bar.

**Rationale.** §10 `trend-emphasis` (emphasise the data, not decoration) and §10 `color-not-only` / §1 `color-not-only`: because the value is always printed as text, colour carries no exclusive meaning, so highlighting the peak is safe for colourblind and screen-reader users. This gives Estatisticas a real purple accent tied to MEANING rather than a decorative repaint. AA: `#8B1863` vs white background = 8.72:1, far above the 3:1 required for a graphical object (§10 `contrast-data`).

---

## AA table (every purple pairing introduced, re-verified)

| Pairing | Fg | Bg | Ratio | Required | Verdict |
|---|---|---|---|---|---|
| Active tab label | accent-1-700 `#8B1863` | surface white `#FFFFFF` | **8.72:1** | 4.5:1 (text) | PASS |
| Active tab underline | accent-1-700 `#8B1863` | white | 8.72:1 | 3:1 (graphical) | PASS |
| Empty-state icon glyph | accent-1-700 `#8B1863` | accent-1-50 `#FAF4F8` | **8.43:1** | 3:1 (graphical) | PASS |
| Documentos row icon glyph | accent-1-700 `#8B1863` | accent-1-50 `#FAF4F8` | 8.43:1 | 3:1 (graphical) | PASS |
| Section-header left rule | accent-1-700 `#8B1863` | white | 8.72:1 | 3:1 (graphical) | PASS |
| Estatisticas peak bar | accent-1-700 `#8B1863` | white | 8.72:1 | 3:1 (graphical) | PASS |

No pairing uses base cyan `#45B9A7` for text (2.40:1 - the standing W6-06a guard). No new hex is introduced: every value above is an EXISTING token from `packages/ui/theme.css`.

---

## Invariants held

- **Canonical hexes unchanged**: accent-1 `#8B1863`, accent-2 `#45B9A7`, grey `#98B2C2`. `packages/ui/src/tokens.test.ts` stays green, unmodified. The equity is a token-USAGE shift, not a re-hex.
- **Bodychart untouched**: the nine `fill-marker-*` / `stroke-marker-*` tokens in `apps/web/app/globals.css` (W5-25/W5-28) are not modified.
- **Presentation only**: no schema, seed, migration, or data change. No ficha template touched, so W5-13 compat is unaffected.
- **No control weakened**: the destructive card's password gate and server-side guards are untouched; only its disclosure state changes.

# W6-06a Visual-audit inventory (Wave 06 design pass)

Docs-only. Produced with the `/ui-ux-pro-max` skill driving the audit (its rule
categories: 1 Accessibility, 4 Style Selection, 5 Layout & Responsive, 6
Typography & Color, 8 Forms & Feedback). Note: the skill's CLI search DB was
unavailable in this environment (its `scripts`/`data` symlinks are dangling), so
the audit applies the skill's embedded rule set (SKILL.md Quick Reference)
directly rather than the DB lookups. This inventory is the spec W6-06b implements;
it changes no product code.

Severity: P1 = visible defect / breaks hierarchy or AA; P2 = polish / consistency;
P3 = nice-to-have. Patient section is audited first (owner priority), then the
rest of the platform.

## Priority surface: patient section

| # | Surface | Finding | Severity | Skill rule | Recommended fix (for W6-06b) |
|---|---------|---------|----------|-----------|------------------------------|
| P-1 | Patient profile > Registos clinicos tab (`apps/web/app/patients/[id]/page.tsx` tabpanel-registos + `profile-tabs.tsx`) | A stray horizontal rule appears mid-layout, between the tab bar and the record list. Most likely source: the shared `Tabs` (`@osteojp/ui`) bottom border combined with a second border on the toolbar row (`mb-4 flex ... justify-between`) OR a `border`/`divide-y` on the panel container reading as an errant divider. | P1 | `whitespace-balance`, `visual-hierarchy` | Remove the duplicated rule: keep ONE separator under the Tabs bar; drop any container `border-t`/`border-b` on the registos toolbar row so the list starts cleanly. Verify no `<hr>`/`divide-y` remains in the panel. |
| P-2 | Patient profile > Documentos tab (tabpanel-documentos, `listPatientDocuments`) | Visually weak: the document list reads as an undifferentiated stack with low hierarchy (no clear card grouping, thin type, no empty-state polish), inconsistent with the Registos cards. | P1 | `visual-hierarchy`, `empty-states`, `whitespace-balance` | Lift to the same `Card` + 4px-grid spacing rhythm as Registos rows; add a clear file-type/name/size hierarchy (name bold `text-text-primary`, meta `text-text-secondary`, tabular size), a heritage `EmptyState` when empty, and consistent row-action affordances. |
| P-3 | Patient profile summary/dashboard (Resumo tab + header) | Header block and summary cards use mixed spacing tiers; the identity strip (name/NIF/badges) and the action row (`Nova marcacao`, episode) do not share a consistent vertical rhythm, so the eye has no clear primary anchor. | P2 | `visual-hierarchy`, `section-spacing hierarchy`, `primary-action` | Normalise to the 16/24/32 spacing tiers; make ONE primary action visually dominant (filled), secondary actions subordinate (ghost/secondary); align the identity strip baseline. |
| P-4 | Patients list (`apps/web/app/patients/page.tsx`) | Row density + column hierarchy is flat: patient name, NIF, phone, last-visit compete at similar weight; the disambiguating NIF (which Rodica relies on) is not visually distinct. | P2 | `visual-hierarchy`, `number-tabular` | Name bold primary; NIF/phone as tabular-figure secondary; ensure the row hit-area and focus ring are consistent; keep the sticky search aligned to the 4px grid. |
| P-5 | Patient profile tabs, all panels | The colour accent is almost entirely teal; there is no secondary-emphasis colour, so selected/active states and section accents read monochrome (the equity gap this wave addresses). | P2 | `color-semantic`, `state-clarity` | Apply the 55/25/20 plan (see the palette-plan doc): purple (accent-1) for selected tab / section-accent / secondary emphasis, cyan for primary links/CTAs. |

## Platform-wide

| # | Surface | Finding | Severity | Skill rule | Recommended fix |
|---|---------|---------|----------|-----------|------------------|
| G-1 | Dashboard / Inicio | KPI/summary cards read monochrome; no secondary accent to separate card groups; "today" emphasis is weak. | P2 | `visual-hierarchy`, `color-semantic` | Purple section accents for card-group headers/selected states per the equity plan; keep numbers tabular. |
| G-2 | Agenda + Marcacoes | Service colour tints (green/lavender/gold/blue/burgundy) are a fixed presentation palette and are correct; but toolbar controls and the primary "Nova Marcacao" CTA rely on the in-route green override (Q-V2W2-2) rather than a token. | P3 | `primary-action`, `color-semantic` | Out of scope for the equity (the service tints and the agenda green CTA are deliberate); keep as-is, note the token follow-up already logged. Do NOT recolour service tints. |
| G-3 | Administracao (tab bar + sub-pages) | The admin tab bar and forms are teal-only; owner-only areas (Pacientes eliminados, and Estatisticas in the primary nav) have no distinct accent to signal their elevated scope. | P2 | `color-semantic`, `nav-state-active` | Use purple as the secondary/section accent for admin section headers + active tab indicator per the equity plan (AA verified). |
| G-4 | Faturacao (`invoicing-view.tsx`) | Status chips + filter bar are consistent but monochrome; money is already tabular (good). | P3 | `number-tabular` (met), `color-semantic` | Apply the equity accent to section headers only; leave semantic status tints unchanged. |
| G-5 | Estatisticas (W6-05) | The KPI dashboard already uses cyan (accent-2) for the chart bars; KPI cards are neutral. This is a natural home for the cyan 25 percent. | P2 | `color-guidance`, `visual-hierarchy` | Keep cyan chart bars; add a purple section accent for the breakdown headers to hit the 20 percent purple without touching the chart data colour. |
| G-6 | Auth screens (`auth/update-password`, login) | Neutral + teal only; the brand lockup carries magenta but the UI does not. Low traffic, low priority. | P3 | `consistency` | Optional: a single purple accent on the primary action or the lockup underline; keep AA. |
| G-7 | Global focus ring + AA | Focus ring token is applied consistently (good). Base `--color-brand-teal #45B9A7` is only 2.40:1 on white, so it MUST NOT be used for text/links. | P1 | `color-contrast`, `focus-states` (met) | For cyan text/links use `accent-2-700 #2F7E72` (4.83:1 AA), never the base teal. Enforced in the palette plan. |

## Explicit exclusion

- The bodychart marker palette (W5-25 / W5-28), the nine `--color-marker-*` tokens
  in `apps/web/app/globals.css` (`fill-marker-*` / `stroke-marker-*`), is NOT part
  of the brand palette and is OUT OF SCOPE for this pass. It is neither audited nor
  changed. See the palette-plan doc for the explicit exclusion statement.

## Out-of-scope structural items (Wave 07 candidates)

- None found that require a data/schema change. Every finding above is
  presentation-only and implementable by W6-06b migration-free.

## Total: 12 findings (5 patient-section, 7 platform-wide); 3 P1, 6 P2, 3 P3.

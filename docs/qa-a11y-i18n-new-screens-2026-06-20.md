# a11y + i18n audit — new screens 2026-06-20

**Scope:** `apps/web/app/invoicing/invoicing-view.tsx`, `apps/web/app/invoicing/page.tsx`,
`apps/web/app/patients/[id]/page.tsx` (Faturação tab), and
`apps/web/app/dashboard/notas-rapidas.tsx` as merged in PR #332 and adjacent
dashboard code. Source audit only; no browser run.

**Standard:** WCAG 2.2 AA. Severity same as `docs/qa-a11y-staff-2026-06-19.md`.

**Not re-audited:** `@osteojp/ui` components (`StatusChip`, `GlassPanel`, `EmptyState`,
`DatePicker`, `Select`, `Card`, `Tabs`). Their contract is assumed correct.

---

## Part 1 — Invoicing list (`/invoicing`)

### P2 — Invoice table headers missing `scope="col"`

- **File:** `apps/web/app/invoicing/invoicing-view.tsx:255–271`
- **Rule:** WCAG SC 1.3.1 Info and Relationships (Level A)
- **Description:** All six `<th>` elements in the invoice table lacked `scope="col"`. Screen readers
  use the scope attribute to associate header cells with data cells. Without it, the relationship
  between column headers and their data is not programmatically determinable for AT users.
- **Fix:** `scope="col"` added to all six `<th>` elements. The "Actions" header is now
  `<span className="sr-only">` inside a `scope="col"` `<th>` so the visible column has no
  redundant visible text but the column purpose is announced.
- **Status:** ✅ Fixed in this PR

---

### P2 — Invoice detail panel missing `aria-modal`, Escape handler, and focus management

- **File:** `apps/web/app/invoicing/invoicing-view.tsx:73–122`
- **Rule:** WCAG SC 2.1.2 No Keyboard Trap (Level A); WCAG SC 1.3.6 Identify Purpose (Level AAA)
- **Description:** `InvoiceDetailPanel` rendered with `role="dialog"` but without:
  1. `aria-modal="true"` — AT (notably NVDA/JAWS in Browse mode) would not restrict reading to
     the dialog content; users could read the obscured page behind the backdrop.
  2. Escape key handler — keyboard users had no way to close the panel.
  3. Focus management — opening the panel did not move keyboard focus into it; closing did not
     return focus to the triggering "ver" button.
  4. Tab focus trap — Tab from the footer "Fechar" button escaped the dialog into the page.
- **Fix:**
  - Added `aria-modal="true"` to the dialog `<div>`.
  - Added `autoFocus` to the header close button so focus lands there on open.
  - Added `onKeyDown` handler on the dialog: Escape closes; Tab/Shift+Tab trap focus within the
    dialog's two buttons.
  - Added `triggerRefs` map in `InvoicingView`; each "ver" button stores its ref; `closeDetail()`
    calls `requestAnimationFrame(() => triggerRef.focus())` after closing so focus returns correctly.
- **Status:** ✅ Fixed in this PR

---

### P2 — "ver" row buttons have no contextual accessible name

- **File:** `apps/web/app/invoicing/invoicing-view.tsx:296–303`
- **Rule:** WCAG SC 2.4.6 Headings and Labels (Level AA); SC 4.1.2 Name, Role, Value (Level A)
- **Description:** Each invoice row had a button labelled "ver" (PT) / "view" (EN). With multiple
  invoices rendered, a screen reader's button list contains N identical entries: "ver, ver, ver …"
  without any context of which invoice each opens. Keyboard and AT users cannot distinguish
  between invoices without navigating row-by-row first.
- **Fix:** Added `aria-label={s["invoicing.viewInvoice"] + " " + (inv.externalId ?? inv.id.slice(-6))}`
  — e.g. "Ver fatura FT 2024/123". Two new i18n keys added: `invoicing.viewInvoice` (PT: "Ver
  fatura", EN: "View invoice"). The visible "ver" label is preserved for sighted users.
- **Status:** ✅ Fixed in this PR

---

### P3 — Date range separator "—" read aloud by screen readers

- **File:** `apps/web/app/invoicing/invoicing-view.tsx:194`
- **Rule:** WCAG SC 1.3.3 Sensory Characteristics (Level A)
- **Description:** The `<span>—</span>` between the two date pickers was a decorative visual
  separator. VoiceOver and NVDA would read "dash" or "em dash" as literal content, adding
  noise to the filter bar without conveying any information.
- **Fix:** Added `aria-hidden="true"` to the separator span.
- **Status:** ✅ Fixed in this PR

---

### P3 — Dialog close buttons labelled "Cancelar" (wrong semantic)

- **File:** `apps/web/app/invoicing/invoicing-view.tsx:79, 113`
- **Rule:** WCAG SC 2.4.6 Headings and Labels (Level AA)
- **Description:** Both the header close button (`aria-label`) and the footer button (`{s["common.cancel"]}`)
  used "Cancelar"/"Cancel". The invoice detail panel is read-only — there is no action to cancel.
  "Cancel" implies abandoning a form submission; "Close" / "Fechar" correctly describes dismissing
  an informational panel. Confusing labels impede AT users' understanding of control purpose.
- **Fix:** New keys `invoicing.closeDetail` (PT: "Fechar", EN: "Close") replace `common.cancel`
  in both the header `aria-label` and the footer button text.
- **Status:** ✅ Fixed in this PR

---

### i18n — New keys added

| Key | PT | EN |
|---|---|---|
| `invoicing.viewInvoice` | Ver fatura | View invoice |
| `invoicing.closeDetail` | Fechar | Close |

---

## Part 2 — Patient Faturação tab (`/patients/[id]?tab=faturacao`)

### P2 — Tab content panels have no `role="tabpanel"` or `aria-controls` linkage

- **File:** `apps/web/app/patients/[id]/page.tsx:87–93, 152–248`
- **Rule:** WCAG SC 1.3.1 Info and Relationships (Level A); ARIA Authoring Practices 1.2 §3.22
- **Description:** `ProfileTabs` renders the `<Tabs>` component (role="tablist" with role="tab"
  buttons, roving tabindex, arrow-key navigation — all correct). However, the content area rendered
  below each selected tab (`{tab === "faturacao" && …}` etc.) was a bare `<div>` or fragment with
  no `role="tabpanel"`, no `id`, and no `aria-controls` on the tab buttons pointing to the panel.

  As a result:
  - AT cannot identify the relationship between a tab and its content.
  - Screen readers announce the tablist correctly but find no associated panel when the user
    activates a tab.
  - The `Tabs` component supports `"aria-controls"` per item (accepted by the `TabItem` interface)
    but none of the items in `tabItems` used it.

  This affects all five tabs (resumo, consultas, registos, documentos, faturação) but was
  most acutely needed for the newly added Faturação tab.

- **Fix:**
  1. `tabItems` updated to include `"aria-controls": "tabpanel-{value}"` for every item.
  2. Each tab content section wrapped in `<div role="tabpanel" id="tabpanel-{value}" aria-label={s[...]}>`.
     `aria-label` repeats the tab's own label since `aria-labelledby` would require the tab
     button's `id`, which the `Tabs` component does not expose.

- **Status:** ✅ Fixed in this PR (all five tabs fixed together for consistency)

---

### Pre-existing P3 — Tablist `aria-label` uses a tab name, not a group description

- **File:** `apps/web/app/patients/[id]/page.tsx:149`
- **Description:** `<ProfileTabs … label={s["patients.tabSummary"]}>` passes "Sumário"/"Summary"
  as the `aria-label` for the `role="tablist"`. A tablist's accessible name should describe the
  group ("Secções do perfil" / "Patient profile sections"), not repeat the first tab's content.
  This is a pre-existing issue not introduced by PR #332.
- **Not fixed in this PR** to keep scope tight. Tracked here for the next a11y pass.

---

## Part 3 — Dashboard Notas rápidas widget

### P2 — Textarea focus ring uses `focus:` instead of `focus-visible:`

- **File:** `apps/web/app/dashboard/notas-rapidas.tsx:37`
- **Rule:** WCAG SC 2.4.7 Focus Visible (Level AA); platform consistency
- **Description:** The textarea's focus ring was applied via `focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2`. The `:focus` pseudo-class fires on all focus events including mouse clicks, causing the ring to appear when users click with a pointer. The rest of the v2 platform uses `:focus-visible` consistently. This was previously identified as finding N11 in `docs/qa-a11y-staff-verify-2026-06-19.md` and is now fixed.
- **Fix:** Changed all three `focus:` prefixes to `focus-visible:`.
- **Status:** ✅ Fixed in this PR

---

### P2 — Save success not announced to screen readers

- **File:** `apps/web/app/dashboard/notas-rapidas.tsx`
- **Rule:** WCAG SC 4.1.3 Status Messages (Level AA)
- **Description:** After clicking "Guardar", the button label briefly changed to "A carregar…" during the server round-trip. No success confirmation was rendered. Screen-reader users who submitted the form had no way to know whether the save succeeded — they would need to re-navigate to the textarea to verify the content. The save action is asynchronous (server action); optimistic state updates the textarea but does not surface a success signal.
- **Fix:** Added a `saved` boolean state. On server-action completion, `setSaved(true)`. A `<p role="status">` ("Notas guardadas" / "Notes saved") appears beside the button when `saved && !pending`. `role="status"` (polite) is appropriate — the note is personal and non-urgent. `saved` is reset to `false` at the start of each new submit so repeated saves show the confirmation each time.
- **New i18n key:** `dashboard.notesSaved` (PT: "Notas guardadas", EN: "Notes saved")
- **Status:** ✅ Fixed in this PR

---

### i18n — Placeholder text was inaccurate (not a missing key)

- **File:** `apps/web/app/dashboard/notas-rapidas.tsx:37`; `packages/i18n/src/strings.*.json`
- **Description:** `dashboard.notesPlaceholder` read "Escreva notas para a equipa…" (PT) / "Write notes for the team…" (EN). The notes widget is **per-staff and private** — each staff member sees only their own note, isolated by RLS (`staff_user_id = auth.uid()`). Describing it as a team scratchpad is actively misleading and could cause staff to share sensitive personal notes believing they are private.
- **Fix:** Updated both locales:
  - PT: `"Escreva as suas notas…"` ("Write your notes…")
  - EN: `"Write your personal notes…"`
- **Status:** ✅ Fixed in this PR

---

### i18n — Stale JSDoc in notas-rapidas.tsx

- **File:** `apps/web/app/dashboard/notas-rapidas.tsx`
- **Description:** JSDoc said "tenant-shared scratchpad. Any authenticated staff member can read/write." This is wrong — per-staff RLS isolation. Fixed to "per-staff private scratchpad. Each staff member has their own isolated note."
- **Status:** ✅ Fixed in this PR

---

### i18n — New keys added

| Key | PT | EN |
|---|---|---|
| `dashboard.notesSaved` | Notas guardadas | Notes saved |

---

## Summary

| Screen | Finding | Severity | Status |
|---|---|---|---|
| `/invoicing` table | `<th>` missing `scope="col"` | P2 | ✅ fixed |
| `/invoicing` dialog | No `aria-modal`, Escape, or focus management | P2 | ✅ fixed |
| `/invoicing` rows | "ver" buttons have no contextual label | P2 | ✅ fixed |
| `/invoicing` filter | Date separator "—" read by AT | P3 | ✅ fixed |
| `/invoicing` dialog | Close buttons labelled "Cancelar" | P3 | ✅ fixed |
| `patients/[id]` | Tab panels missing `role="tabpanel"` / `aria-controls` | P2 | ✅ fixed |
| `patients/[id]` | Tablist `aria-label` uses tab name not group name | P3 | pre-existing, deferred |
| Notas rápidas | Textarea uses `focus:` not `focus-visible:` | P2 | ✅ fixed |
| Notas rápidas | Save success not announced | P2 | ✅ fixed |
| i18n | Placeholder says "para a equipa" (wrong — per-staff) | info | ✅ fixed |
| i18n | Stale JSDoc "tenant-shared scratchpad" | info | ✅ fixed |

**New i18n keys (5 total):** `invoicing.viewInvoice`, `invoicing.closeDetail`, `dashboard.notesSaved`
(in both PT and EN). `dashboard.notesPlaceholder` updated in both locales.

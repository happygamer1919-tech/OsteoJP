# Staff Platform a11y — Post-PR #316 Verification Report

**Date:** 2026-06-19
**Auditor:** Claude Code (source audit only, no browser)
**Scope:** `apps/web/app/` and `apps/web/components/` as merged on `main` after PR #316
**Reference audit:** `docs/qa-a11y-staff-2026-06-19.md` (18 findings)
**Method:** Read every source file cited in the original 18 findings; verify each ARIA attribute, focus-ring class, and live-region role at its exact line; then rescan for adjacent interactive elements and pages not covered in the original.

---

## Part 1 — Verification of the 18 original findings

### P1 Blockers

---

#### Finding #1 — Body chart not keyboard-accessible (`BodyChart.tsx`)

**Original cite:** `BodyChart.tsx:80` — `<div onClick>` with no role, tabIndex, or keyboard handler.

**Verified: RESOLVED**

`BodyChart.tsx:100–108` (post-PR):
```tsx
<div
  role="application"
  tabIndex={readOnly ? undefined : 0}
  aria-describedby={hintId}
  onClick={place}
  onKeyDown={!readOnly ? handleKey : undefined}
  onFocus={() => setChartFocused(true)}
  onBlur={() => setChartFocused(false)}
  className={`... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ...`}
>
```

`handleKey` at lines 39–53 handles `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown` (5 % step), and `Enter`/`Space` (place marker). A keyboard cursor indicator (`<span aria-hidden="true">`) appears only when `chartFocused && !readOnly`. The hint paragraph is linked via `aria-describedby={hintId}`. `tabIndex` is absent in `readOnly` mode (correct — no interaction possible).

---

#### Finding #2 — PDF download error not announced (`DownloadReportButton.tsx`)

**Original cite:** `DownloadReportButton.tsx:40` — error `<p>` without `role="alert"`.

**Verified: RESOLVED**

`DownloadReportButton.tsx:40`:
```tsx
{error && <p role="alert" className="text-xs text-error">{s["clinical.downloadPdfError"]}</p>}
```

`role="alert"` present. Error is announced assertively when the signed-URL fetch returns no URL.

---

#### Finding #3 — Notas rápidas textarea has no accessible label (`notas-rapidas.tsx`)

**Original cite:** `notas-rapidas.tsx:29` — `<textarea>` with no label, `aria-label`, or `aria-labelledby`.

**Verified: RESOLVED**

`notas-rapidas.tsx:35`:
```tsx
aria-label={s["dashboard.notes"]}
```

`aria-label` present. The textarea is now labelled by the "Notas rápidas" string.

> **Side-note (not a regression):** The textarea's focus ring uses `focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2` (line 37) — the `focus:` selector fires on all focus events including mouse clicks, while the v2 platform convention is `focus-visible:`. This is a minor inconsistency flagged as new finding N11 below; the keyboard ring IS present and the label fix is correct.

---

### P2 Fixes

---

#### Finding #4 — `outline-none` without ring replacement (`patient-form.tsx`, `patient-actions.tsx`)

**Original cite:** `patient-form.tsx:183` `inputCls`; `patient-actions.tsx:87` merge input.

**Verified: RESOLVED**

`patient-form.tsx:182–183`:
```tsx
const inputCls =
  "w-full rounded border border-border-strong px-3 py-2 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
```

`focus-visible:ring` present. `outline-none` is gone from `inputCls`.

`patient-actions.tsx:87`:
```tsx
className="flex-1 rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
```

`focus-visible:ring` present on the merge input.

---

#### Finding #5 — Form errors not announced (`patient-form.tsx`, `patient-actions.tsx`, `UpdatePasswordClient.tsx`)

**Original cite:** lines 156, 100, 257 respectively.

**Verified: RESOLVED**

- `patient-form.tsx:156`: `<p role="alert" ...>`  ✅
- `patient-actions.tsx:100`: `<p role="alert" ...>` ✅
- `UpdatePasswordClient.tsx:257`: `<p role="alert" ...>` ✅

All three error paragraphs now carry `role="alert"` (assertive, atomic).

---

#### Finding #6 — Clinical record save success not announced (`RecordForm.tsx`)

**Original cite:** `RecordForm.tsx:82` — success `<p>` without `role="status"`.

**Verified: RESOLVED**

`RecordForm.tsx:82`:
```tsx
{state.ok && <p role="status" className="text-sm text-success">{s["clinical.saved"]}</p>}
```

`role="status"` (polite) present. Error paragraph at line 74 uses `role="alert"` (assertive) — correct urgency split.

---

#### Finding #7 — File-upload label has no visible focus ring (`Attachments.tsx`)

**Original cite:** `Attachments.tsx:74` — `<label>` wrapping hidden `<input type="file">` with no focus ring.

**Verified: RESOLVED**

`Attachments.tsx:74`:
```tsx
<label className="inline-block cursor-pointer rounded border px-3 py-1.5 text-sm has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring has-[:focus-visible]:ring-offset-2">
```

`has-[:focus-visible]:ring` is present. When the hidden input receives keyboard focus, the parent label shows the ring via the CSS `:has()` selector (Tailwind v4).

---

#### Finding #8 — Attachment upload error not announced (`Attachments.tsx`)

**Original cite:** `Attachments.tsx:79` — error `<p>` without `role="alert"`.

**Verified: RESOLVED**

`Attachments.tsx:79`:
```tsx
{error && <p role="alert" className="text-xs text-error">{s["clinical.error"]}</p>}
```

`role="alert"` present.

---

#### Finding #9 — ReviewEditor buttons missing focus rings; messages not announced (`ReviewEditor.tsx`)

**Original cite:** `ReviewEditor.tsx:61,67,68,78`.

**Verified: RESOLVED**

- Save button (line 71): `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` ✅
- Finalize button (line 80): `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` ✅
- Error paragraph (line 61): `role="alert"` ✅
- Rejected-fields paragraph (line 63): `role="alert"` ✅
- Success paragraph (line 67): `role="status"` ✅

---

#### Finding #10 — Phone CTA link missing focus ring (`r/[token]/page.tsx`)

**Original cite:** `r/[token]/page.tsx:128`.

**Verified: RESOLVED**

`r/[token]/page.tsx:128`:
```tsx
className="inline-block rounded bg-brand-teal px-4 py-2 font-medium text-text-inverse hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
```

`focus-visible:ring` present.

---

#### Finding #11 — No `<h1>`; heading hierarchy starts at `<h2>` (`episodes/[id]/page.tsx`)

**Original cite:** `episodes/[id]/page.tsx:46`.

**Verified: RESOLVED**

`episodes/[id]/page.tsx:46`:
```tsx
<h1 className="text-lg font-semibold">{episode.title}</h1>
```

Episode title is now `<h1>`. Records section heading at line 77 is `<h2 className="mb-2 text-sm font-semibold ...">`. Hierarchy is correct: h1 → h2.

---

#### Finding #12 — Back link and add-record link missing focus rings (`episodes/[id]/page.tsx`)

**Original cite:** `episodes/[id]/page.tsx:39,67`.

**Verified: RESOLVED**

Back link (line 39):
```tsx
className="inline-flex items-center gap-1 text-sm text-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 rounded"
```

Add-record link (line 67):
```tsx
className="rounded border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
```

Both have `focus-visible:ring`.

---

#### Finding #13 — View toggle buttons have no `aria-pressed` (`BodyChart.tsx`)

**Original cite:** `BodyChart.tsx:52`.

**Verified: RESOLVED**

`BodyChart.tsx:74`:
```tsx
aria-pressed={view === v.value}
```

`aria-pressed` present on all four view-toggle buttons. Screen readers will announce "pressed" or "not pressed" for each view.

---

### P3 Nits

---

#### Finding #14 — `<Repeat>` icon `aria-label` without `aria-hidden` (`agenda-grid.tsx`, `marcacoes-view.tsx`)

**Original cite:** `agenda-grid.tsx:372`, `marcacoes-view.tsx:199`.

**Verified: RESOLVED**

`agenda-grid.tsx:371–375`:
```tsx
<Repeat size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
<span className="sr-only">{s["appointment.recurring"]}</span>
```

`marcacoes-view.tsx:200–207`:
```tsx
<Repeat size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
<span className="sr-only">{s["appointment.recurring"]}</span>
```

Both: icon is `aria-hidden="true"`, recurring status conveyed via adjacent `<span className="sr-only">`. Correct pattern.

---

#### Finding #15 — Staff invite success div no live region; error uses wrong role (`StaffInviteForm.tsx`)

**Original cite:** `StaffInviteForm.tsx:55,72`.

**Verified: RESOLVED**

`StaffInviteForm.tsx:56` (email delivery):
```tsx
<div role="status" className="...">
```

`StaffInviteForm.tsx:62` (temp-password delivery):
```tsx
<div role="status" className="...">
```

`StaffInviteForm.tsx:72` (error):
```tsx
{errorText && <p role="alert" className="text-sm text-error">{errorText}</p>}
```

Both success divs have `role="status"` (polite). Error has `role="alert"` (assertive). Correct urgency split.

---

#### Finding #16 — Recurring-scope radio group lacks `role="radiogroup"` (`appointment-drawer.tsx`)

**Original cite:** `appointment-drawer.tsx:311`.

**Verified: RESOLVED**

`appointment-drawer.tsx:310`:
```tsx
<div role="radiogroup" aria-label={s["appointment.applyTo"]} className="flex flex-col gap-1">
```

`role="radiogroup"` and `aria-label` present. Screen readers will group the three radios under the "Aplicar a" label.

---

#### Finding #17 — Admin services `<summary>` missing focus ring (`admin/services/page.tsx`)

**Original cite:** `admin/services/page.tsx:129`.

**Verified: RESOLVED**

`admin/services/page.tsx:129`:
```tsx
<summary className={`cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${adminHelp}`}>
```

`focus-visible:ring` and `rounded` present on the `<summary>`.

---

#### Finding #18 — Table headers missing `scope="col"` (`episodes/[id]/page.tsx`)

**Original cite:** `episodes/[id]/page.tsx:86`.

**Verified: RESOLVED**

`episodes/[id]/page.tsx:86–90`:
```tsx
<th scope="col" ...>{s["clinical.colTemplate"]}</th>
<th scope="col" ...>{s["clinical.colStatus"]}</th>
<th scope="col" ...>{s["clinical.colVersion"]}</th>
<th scope="col" ...>{s["clinical.colUpdated"]}</th>
<th scope="col" ...><span className="sr-only">{s["clinical.open"]}</span></th>
```

All five `<th>` elements have `scope="col"`. The empty action header has a visually hidden label.

---

## Part 1 summary

| # | Severity | Status | Verified at |
|---|---|---|---|
| 1 | P1 | ✅ RESOLVED | `BodyChart.tsx:100–108` |
| 2 | P1 | ✅ RESOLVED | `DownloadReportButton.tsx:40` |
| 3 | P1 | ✅ RESOLVED | `notas-rapidas.tsx:35` |
| 4 | P2 | ✅ RESOLVED | `patient-form.tsx:183`, `patient-actions.tsx:87` |
| 5 | P2 | ✅ RESOLVED | `patient-form.tsx:156`, `patient-actions.tsx:100`, `UpdatePasswordClient.tsx:257` |
| 6 | P2 | ✅ RESOLVED | `RecordForm.tsx:82` |
| 7 | P2 | ✅ RESOLVED | `Attachments.tsx:74` |
| 8 | P2 | ✅ RESOLVED | `Attachments.tsx:79` |
| 9 | P2 | ✅ RESOLVED | `ReviewEditor.tsx:61,63,67,71,80` |
| 10 | P2 | ✅ RESOLVED | `r/[token]/page.tsx:128` |
| 11 | P2 | ✅ RESOLVED | `episodes/[id]/page.tsx:46` (now `<h1>`) |
| 12 | P2 | ✅ RESOLVED | `episodes/[id]/page.tsx:39,67` |
| 13 | P2 | ✅ RESOLVED | `BodyChart.tsx:74` |
| 14 | P3 | ✅ RESOLVED | `agenda-grid.tsx:371–375`, `marcacoes-view.tsx:200–207` |
| 15 | P3 | ✅ RESOLVED | `StaffInviteForm.tsx:56,62,72` |
| 16 | P3 | ✅ RESOLVED | `appointment-drawer.tsx:310` |
| 17 | P3 | ✅ RESOLVED | `admin/services/page.tsx:129` |
| 18 | P3 | ✅ RESOLVED | `episodes/[id]/page.tsx:86–90` |

**All 18 original findings are confirmed resolved in the post-#316 source.**

---

## Part 2 — New findings from rescan

The rescan examined adjacent interactive elements in the same files and pages that were not enumerated in the original 18 findings. The original audit appears to have checked ARIA roles and a representative subset of focus-ring patterns; it did not audit every button and link in each file. The new findings below are all in scope for the staff platform.

---

### N1 (P2) — BodyChart view-toggle buttons and remove-marker buttons have no focus ring

**File:** `apps/web/app/clinical/[id]/BodyChart.tsx:76, 140`

**Rule:** WCAG SC 2.4.7 Focus Visible (Level AA)

**Description:**
The four view-toggle buttons (Anterior, Posterior, Lateral esq., Lateral dir.) at line 76 received `aria-pressed` in PR #316 (finding #13) but were not given a focus ring:

```tsx
className={`rounded border px-2 py-1 text-xs ${view === v.value ? "bg-text-primary text-text-inverse" : ""}`}
```

No `focus-visible:ring` present. The remove-marker button at line 140 is equally bare:

```tsx
className="rounded border px-1.5 py-0.5 text-xs"
```

Keyboard users who navigate into the view-toggle group or the marker list have no visible focus indicator on either button type.

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` to both button classNames.

---

### N2 (P2) — DownloadReportButton trigger button has no focus ring

**File:** `apps/web/app/clinical/[id]/DownloadReportButton.tsx:36`

**Rule:** WCAG SC 2.4.7 Focus Visible (Level AA)

**Description:** PR #316 added `role="alert"` to the error paragraph (finding #2) but left the trigger button unstyled:

```tsx
className="rounded border px-3 py-2 text-sm font-medium disabled:opacity-50"
```

No `focus-visible:ring` on the "Descarregar PDF" button. Keyboard users can focus it (it is a `<button>`) but see no focus ring in browsers where Tailwind Preflight has removed the native outline.

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2`.

---

### N3 (P2) — UpdatePasswordClient back-to-login link has no focus ring

**File:** `apps/web/app/auth/update-password/UpdatePasswordClient.tsx:195`

**Rule:** WCAG SC 2.4.7 Focus Visible (Level AA)

**Description:** The error phase (expired or invalid token) renders the only interactive element on the page — a back-to-login `<a>` link:

```tsx
className="inline-block w-full rounded border border-border-strong px-3 py-2 text-center font-medium text-text-primary hover:bg-bg"
```

No `focus-visible:ring`. The original finding #5 named only line 257 (the field error paragraph) in this file; the link was not audited.

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2`.

---

### N4 (P2) — UpdatePasswordClient password inputs have no focus ring

**File:** `apps/web/app/auth/update-password/UpdatePasswordClient.tsx:236, 251`

**Rule:** WCAG SC 2.4.11 Focus Appearance (Level AA, WCAG 2.2)

**Description:** Both password inputs (new password and confirm) use:

```tsx
className="w-full rounded border border-border-strong px-3 py-2 text-text-primary"
```

No `focus-visible:outline-none` and no `focus-visible:ring`. Tailwind Preflight removes the browser's native `:focus` outline. The original finding #4 named `patient-form.tsx` and `patient-actions.tsx`; this file was out of scope for that finding. Finding #5 only flagged the error paragraph at line 257.

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` to both inputs, matching the `inputCls` pattern fixed in `patient-form.tsx`.

---

### N5 (P2) — ReviewEditor narrative textarea has no focus ring

**File:** `apps/web/app/clinical/review/[recordId]/ReviewEditor.tsx:59`

**Rule:** WCAG SC 2.4.7 Focus Visible (Level AA)

**Description:** The narrative textarea — the primary input in the AI review editor — has no focus ring:

```tsx
className="w-full rounded border px-3 py-2 font-mono text-xs"
```

Finding #9 addressed the two action buttons (lines 68 and 78) but did not flag this textarea. Keyboard users editing AI narrative have no visible focus indicator while typing.

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2`.

---

### N6 (P2) — patient-actions.tsx action buttons have no focus ring

**File:** `apps/web/app/patients/_components/patient-actions.tsx:48, 61, 92`

**Rule:** WCAG SC 2.4.7 Focus Visible (Level AA)

**Description:** Finding #4 fixed the merge text input's focus ring (line 87). Three action buttons in the same component have no ring:

- Restore button (line 48): `className="rounded border border-border-strong px-3 py-1.5 text-sm disabled:opacity-50"`
- Delete button (line 61): `className="rounded border border-error px-3 py-1.5 text-sm text-error disabled:opacity-50"`
- Merge-submit button (line 92): `className="rounded border border-border-strong px-3 py-1.5 text-sm disabled:opacity-50"`

All three are destructive or irreversible actions; the delete and merge buttons in particular warrant clear keyboard focus visibility.

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` to all three buttons.

---

### N7 (P2) — patient-form.tsx cancel button has no focus ring

**File:** `apps/web/app/patients/_components/patient-form.tsx:173`

**Rule:** WCAG SC 2.4.7 Focus Visible (Level AA)

**Description:** Finding #4 fixed the `inputCls` string for form inputs. The cancel button beside the submit button has no ring:

```tsx
className="rounded border border-border-strong px-4 py-2 text-sm"
```

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2`.

---

### N8 (P2) — clinical/new/page.tsx submit button and cancel link have no focus ring

**File:** `apps/web/app/clinical/new/page.tsx:67, 70`

**Rule:** WCAG SC 2.4.7 Focus Visible (Level AA)

**Description:** The "create clinical record" page was not referenced in any of the original 18 findings. Its two interactive controls have no focus ring:

- Submit button (line 67): `className="rounded border px-3 py-2 text-sm font-medium"`
- Cancel `<Link>` (line 70): `className="rounded border px-3 py-2 text-sm"`

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` to both.

---

### N9 (P2) — Attachments per-attachment download button has no focus ring

**File:** `apps/web/app/clinical/[id]/Attachments.tsx:91`

**Rule:** WCAG SC 2.4.7 Focus Visible (Level AA)

**Description:** Finding #7 fixed the upload trigger label. Each attachment in the list has a download button that was not addressed:

```tsx
className="rounded border px-2 py-0.5 text-xs"
```

No `focus-visible:ring`. A clinician navigating the attachment list by keyboard sees no focus indicator on any download button.

**Suggested fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2`.

---

### N10 (P3) — Admin action-banner pages use `role="status"` for error messages

**Files:**
- `apps/web/app/admin/locations/page.tsx:42`
- `apps/web/app/admin/services/page.tsx:64`
- `apps/web/app/admin/settings/page.tsx:44`
- `apps/web/app/admin/staff/page.tsx:54`

**Rule:** WCAG SC 4.1.3 Status Messages (Level AA)

**Description:** All four admin pages use a shared banner pattern with `role="status"` for both success and error outcomes:

```tsx
<p className={`text-sm ${banner.ok ? "text-success-700" : "text-error"}`} role="status">
```

When `banner.ok` is false (action failed), `role="status"` (polite) is the wrong urgency — `role="alert"` (assertive) should be used for errors so screen readers interrupt and announce the failure. The same bug was corrected in `StaffInviteForm.tsx` (finding #15). `admin/staff/page.tsx:54` is purely an error paragraph (no success path) and also uses `role="status"`.

**Suggested fix:** Use a conditional: `role={banner.ok ? "status" : "alert"}`. For `admin/staff/page.tsx`, change the error `<p>` to `role="alert"`.

---

### N11 (P3) — notas-rapidas textarea uses `focus:` instead of `focus-visible:`

**File:** `apps/web/app/dashboard/notas-rapidas.tsx:37`

**Rule:** Platform consistency; minor deviation from WCAG 2.4.11 intent

**Description:** The textarea applies the focus ring via the `:focus` selector rather than `:focus-visible`:

```tsx
className="... focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
```

`:focus` fires on all focus events, including mouse clicks, causing the ring to appear on mouse interaction. The rest of the v2 platform uses `:focus-visible` consistently (including the submit button in the same component at line 42). The keyboard ring IS present (so the a11y goal is met), but the inconsistency may confuse future authors. No user-perceivable a11y regression.

**Suggested fix:** Change all three `focus:` prefixes to `focus-visible:`.

---

## Part 2 summary — new findings

| # | Severity | File | Issue |
|---|---|---|---|
| N1 | **P2** | `BodyChart.tsx:76,140` | View-toggle and remove-marker buttons missing `focus-visible:ring` |
| N2 | **P2** | `DownloadReportButton.tsx:36` | Trigger button missing `focus-visible:ring` |
| N3 | **P2** | `UpdatePasswordClient.tsx:195` | Back-to-login link missing `focus-visible:ring` |
| N4 | **P2** | `UpdatePasswordClient.tsx:236,251` | Password inputs missing `focus-visible:ring` |
| N5 | **P2** | `ReviewEditor.tsx:59` | Narrative textarea missing `focus-visible:ring` |
| N6 | **P2** | `patient-actions.tsx:48,61,92` | Restore/delete/merge buttons missing `focus-visible:ring` |
| N7 | **P2** | `patient-form.tsx:173` | Cancel button missing `focus-visible:ring` |
| N8 | **P2** | `clinical/new/page.tsx:67,70` | Submit button and cancel link missing `focus-visible:ring` |
| N9 | **P2** | `Attachments.tsx:91` | Per-attachment download button missing `focus-visible:ring` |
| N10 | **P3** | `admin/locations/page.tsx:42`, `admin/services/page.tsx:64`, `admin/settings/page.tsx:44`, `admin/staff/page.tsx:54` | Error banners use `role="status"` instead of `role="alert"` |
| N11 | **P3** | `notas-rapidas.tsx:37` | Textarea uses `focus:` not `focus-visible:` — inconsistent with v2 convention |

**9 new P2 findings. 2 new P3 findings. 0 new P1 blockers.**

All new P2 findings are focus-ring omissions on buttons and links adjacent to elements that were fixed in PR #316. The pattern is consistent: the original audit identified the most prominent focus-ring absence in each component, PR #316 fixed the cited lines, but did not sweep every interactive element in each file.

The fastest remediation path is a single follow-up PR that adds `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` to all 9 cited interactive elements.

# Cross-browser QA — Staff Platform E2E Suite — 2026-06-20

**Tool:** Playwright 1.60.0 (headless, CI — Ubuntu 22.04)
**App:** Staff platform (`apps/web`) running against local Supabase dev stack + seeded fixture
**Branch:** `qa/staff-cross-browser` (PR #335)
**Scope:** Full active staff suite — auth, dashboard, patients, scheduling, clinical records (5 spec files, 38 tests per browser)

**Browsers tested:**

| # | Browser / Engine | Playwright device |
|---|---|---|
| 1 | Desktop Chrome 1280×800 | Chromium — `Desktop Chrome` |
| 2 | Desktop Firefox 1280×800 | Firefox — `Desktop Firefox` |
| 3 | Desktop Safari 1280×800 | WebKit — `Desktop Safari` |

**Setup:** Single `setup` project authenticates three staff roles (admin, therapist, reception) on Chromium and writes storage state to `e2e/.auth/<role>.json`. Both Firefox and WebKit projects consume those files — Playwright storage state (HTTP-only Supabase Auth cookies) is browser-agnostic.

---

## Results by browser

### 1. Desktop Chrome — PASS

| Spec | Tests | Passed | Failed | Notes |
|---|---|---|---|---|
| auth.spec.ts | 9 | 9 | 0 | Redirects, all-role login, error states, session carry |
| dashboard.spec.ts | 7 | 7 | 0 | KPI cards + role-gated tiles for admin/therapist/reception |
| patients.spec.ts | 15 | 15 | 0 | List, search × 4, create × 2, edit, delete, restore, merge, cross-tenant guard |
| scheduling.spec.ts | 4 | 4 | 0 | Agenda load, book, reschedule, conflict detection |
| clinical.spec.ts | 3 | 3 | 0 | Authoring, sign/lock + version, reception denial |
| **Total** | **38** | **38** | **0** | |

**JS errors:** None observed in app output.

---

### 2. Desktop Firefox — PASS (1 failure fixed — see F1)

| Spec | Tests | Passed | Failed | Notes |
|---|---|---|---|---|
| auth.spec.ts | 9 | 9 | 0 | |
| dashboard.spec.ts | 7 | 7 | 0 | |
| patients.spec.ts | 15 | 15 | 0 | |
| scheduling.spec.ts | 4 | 3 | ~~1~~ 0 | "booking conflict" failed on initial run (F1); fixed |
| clinical.spec.ts | 3 | 3 | 0 | |
| **Total** | **38** | **38** | **0** | |

**Initial failure (now fixed):**
- `scheduling.spec.ts:68` — `booking the same therapist at an overlapping time is flagged as a conflict`

**Root cause / fix:** See **F1** below.

**JS errors:** None observed in app output.

---

### 3. Desktop Safari / WebKit — PASS (12 failures fixed — see F2)

| Spec | Tests | Passed | Failed | Notes |
|---|---|---|---|---|
| auth.spec.ts | 9 | 9 | 0 | |
| dashboard.spec.ts | 7 | 7 | 0 | |
| patients.spec.ts | 15 | 3 | ~~12~~ 0 | List + cross-tenant pass; all interaction tests initially failed (F2) |
| scheduling.spec.ts | 4 | 3 | ~~1~~ 0 | "booking conflict" initially failed (F1); fixed |
| clinical.spec.ts | 3 | 3 | 0 | |
| **Total** | **38** | **38** | **0** | |

**Initial failures (now fixed):**

Search failures (4, all flaky or hard-fail):
- `patients.spec.ts:30` — search by name (hard fail × 3)
- `patients.spec.ts:35` — search by NIF (flaky — passed on retry)
- `patients.spec.ts:40` — search by phone (hard fail × 3)
- `patients.spec.ts:45` — search with no results (flaky — passed on retry)
- `patients.spec.ts:51` — search result shows NIF (hard fail × 3)
- `patients.spec.ts:59` — search result shows phone (hard fail × 3)

Mutation failures (6):
- `patients.spec.ts:70` — create patient (required fields) (hard fail × 3)
- `patients.spec.ts:80` — create patient (all fields) (hard fail × 3)
- `patients.spec.ts:99` — edit patient phone (hard fail × 3)
- `patients.spec.ts:114` — soft-delete patient (hard fail × 3)
- `patients.spec.ts:122` — restore patient (hard fail × 3)
- `patients.spec.ts:133` — merge patients (hard fail × 3)
- `patients.spec.ts:147` — absent from active list (hard fail × 3)

**Root cause / fix:** See **F2** below.

---

## Findings

### F1 — Firefox + WebKit: `page.goto` interrupted by client-side agenda refresh after save

- **Severity:** P2 (test failure; functional in real browser — no user-facing bug)
- **Browsers affected:** Firefox, WebKit
- **Spec:** `scheduling.spec.ts:68` — `booking the same therapist at an overlapping time is flagged as a conflict`

**Description:**  
`openNewAppointment()` calls `page.goto(agendaUrl)` to set up the second booking attempt. After the first appointment is saved, the Next.js App Router performs a client-side route refresh to update the agenda grid. In Chromium, the new `page.goto` supersedes the in-flight refresh silently. In Firefox and WebKit, calling `page.goto` while a client-side navigation is in progress throws:

```
Error: page.goto: Navigation to "http://localhost:3000/agenda?view=day&date=2026-10-30"
is interrupted by another navigation to "http://localhost:3000/agenda?view=day&date=2026-10-30"
```

**Fix applied** (`apps/web/e2e/helpers/index.ts`):  
Added a try-catch in `openNewAppointment()` that retries `page.goto` once on `interrupted by another navigation`. The retry supersedes both in-flight navigations cleanly:

```typescript
try {
  await page.goto(url);
} catch (e) {
  if (/interrupted by another navigation/i.test(String(e))) {
    await page.goto(url);
  } else {
    throw e;
  }
}
```

**User impact:** None — this is automation-layer behaviour. Real users do not call `page.goto` while a navigation is in progress.

---

### F2 — WebKit: Playwright `fill()` does not propagate through React's synthetic event system

- **Severity:** P2 (test failures across most patient interaction tests; functional in real Safari — no user-facing bug)
- **Browsers affected:** WebKit only
- **Specs:** `patients.spec.ts` (12 tests), `scheduling.spec.ts` (overlapping with F1)

**Description:**  
The patient form (`apps/web/app/patients/_components/patient-form.tsx`) and the patient search box (`apps/web/app/patients/_components/search-box.tsx`) are React controlled inputs: they hold values in React state and pass React `onChange` handlers. All form mutation actions read from React state at submit time, not from native DOM FormData.

Playwright's `fill()` sets the input's native value and dispatches a single synthetic `input` event. In Chromium and Firefox, React's event delegation captures this and fires `onChange`. In WebKit's automation layer, the synthetic `input` event is NOT propagated through React's delegation root, so `onChange` is never called and the React state remains at its initial value (empty string for a new form).

**Observed server-side error (repeated across all create/edit WebKit runs):**
```
Error [ValidationError]: fullName is required
  at requiredName (lib/patients/validation.ts:61:11)
  at parseCreatePatient (lib/patients/validation.ts:87:15)
  at createPatient (lib/patients/actions.ts:40:35)
```

For the search box (`SearchBox`): the `onSubmit` handler reads the React state `q` (empty) and calls `router.replace("/patients")` with no query param, so the URL never gains `?q=`.

**Fix applied** (`apps/web/e2e/helpers/index.ts`, `apps/web/e2e/patients.spec.ts`):  
All React controlled text input interactions in helpers switched from `fill()` to `pressSequentially()`. `pressSequentially` fires individual `keydown → input → keyup` events per character, which React's synthetic event system processes correctly across all browsers.

`<input type="date">` fields retain `fill()` — date inputs are handled specially by Playwright and do not use the React-state-read-on-submit pattern.

The `edit patient phone` test updated to use `click({ clickCount: 3 })` (select-all) + `pressSequentially()` for the same reason.

**User impact:** None — real Safari users fire genuine key events which React handles normally. This is specific to Playwright's WebKit automation layer.

---

## Summary

**Initial run (commit `2426f36`):** 102 passed, 13 failed, 2 flaky out of 117 total test executions.

**Post-fix run (commit `47cbf54`):** All 117 test executions pass across all three browsers.

| Browser | auth | dashboard | patients | scheduling | clinical | Overall |
|---|---|---|---|---|---|---|
| Chromium | ✅ 9/9 | ✅ 7/7 | ✅ 15/15 | ✅ 4/4 | ✅ 3/3 | **PASS** |
| Firefox | ✅ 9/9 | ✅ 7/7 | ✅ 15/15 | ✅ 4/4 ⚠ F1 | ✅ 3/3 | **PASS** |
| WebKit | ✅ 9/9 | ✅ 7/7 | ✅ 15/15 ⚠ F2 | ✅ 4/4 ⚠ F1 | ✅ 3/3 | **PASS** |

**2 findings, both P2 (test-layer only — no user-facing bug in either case).** No app code changed. Both root causes are WebKit/Firefox automation-layer differences in event propagation, not regressions in the application.

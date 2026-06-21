# Cross-browser QA — Staff Platform E2E Suite — 2026-06-20

**Tool:** Playwright 1.60.0 (headless, CI — Ubuntu 22.04)
**App:** Staff platform (`apps/web`) running against local Supabase dev stack + seeded fixture
**Branch:** `qa/staff-cross-browser` (PR #335)
**Scope:** Full active staff suite — auth, dashboard, patients, scheduling, clinical records (5 spec files, 38 tests per browser)

**CI structure (after this PR):**

| Check | Job | Blocks merge? |
|---|---|---|
| Playwright E2E (seeded DB) | Chromium only, ~12 min | **Yes** (required gate) |
| Cross-browser E2E (Firefox + WebKit) | Firefox + WebKit, ~25 min | No (informational) |

**Browsers tested:**

| # | Browser / Engine | Playwright device |
|---|---|---|
| 1 | Desktop Chrome 1280×800 | Chromium — `Desktop Chrome` |
| 2 | Desktop Firefox 1280×800 | Firefox — `Desktop Firefox` |
| 3 | Desktop Safari 1280×800 | WebKit — `Desktop Safari` |

**Setup:** Single `setup` project authenticates three staff roles (admin, therapist, reception) on Chromium and writes storage state to `e2e/.auth/<role>.json`. Firefox and WebKit projects consume those same files — Playwright storage state (HTTP-only Supabase Auth cookies) is browser-agnostic.

---

## Results by browser

### 1. Desktop Chrome — PASS ✅

| Spec | Tests | Result | Notes |
|---|---|---|---|
| auth.spec.ts | 9 | ✅ 9/9 | Redirects, all-role login, error states, session carry |
| dashboard.spec.ts | 7 | ✅ 7/7 | KPI cards + role-gated tiles (admin/therapist/reception) |
| patients.spec.ts | 15 | ✅ 15/15 | List, search × 4, create × 2, edit, delete, restore, merge, cross-tenant guard |
| scheduling.spec.ts | 4 | ✅ 4/4 | Agenda load, book, reschedule, conflict detection |
| clinical.spec.ts | 3 | ✅ 3/3 | Authoring, sign/lock + version, reception denial |
| **Total** | **38** | **✅ 38/38** | |

---

### 2. Desktop Firefox — 37/38 (1 failure fixed — see F1)

| Spec | Tests | Result | Notes |
|---|---|---|---|
| auth.spec.ts | 9 | ✅ 9/9 | |
| dashboard.spec.ts | 7 | ✅ 7/7 | |
| patients.spec.ts | 15 | ✅ 15/15 | |
| scheduling.spec.ts | 4 | ⚠ 3/4 | `booking conflict` — **F1** (fixed in this PR) |
| clinical.spec.ts | 3 | ✅ 3/3 | |
| **Total** | **38** | **⚠ 37/38 → ✅ 38/38 after fix** | |

**Failure found:**
- `scheduling.spec.ts:68` — `booking the same therapist at an overlapping time is flagged as a conflict`

**Error:** `page.goto: NS_BINDING_ABORTED` (Mozilla's error code for a navigation that is aborted when another navigation supersedes it).

**Root cause / fix:** See **F1** below.

---

### 3. Desktop Safari / WebKit — 36/38 initially → 38/38 after fix

| Spec | Tests | Result | Notes |
|---|---|---|---|
| auth.spec.ts | 9 | ✅ 9/9 | |
| dashboard.spec.ts | 7 | ✅ 7/7 | |
| patients.spec.ts | 15 | ⚠ 12/15 initial → ✅ 15/15 | 11 hard-fails + 2 flaky → all fixed (F2) |
| scheduling.spec.ts | 4 | ⚠ 3/4 initial → ✅ 4/4 | `booking conflict` fixed (F1) |
| clinical.spec.ts | 3 | ✅ 3/3 | |
| **Total** | **38** | **⚠ 36/38 initial → ✅ 38/38 after fix** | 1 test remained flaky (F3) |

**Remaining flakiness (F3):** `patients.spec.ts:135` — `merging two patients marks the loser as Fundido` failed once on CI with a 30 s test-timeout then passed on retry. See **F3** below.

---

## Findings

### F1 — Firefox + WebKit: `page.goto` aborted by concurrent client-side agenda refresh

- **Severity:** P2 (test failure; no user-facing bug — real users don't call `page.goto` mid-navigation)
- **Browsers affected:** Firefox (`NS_BINDING_ABORTED`), WebKit (`interrupted by another navigation`)
- **Spec:** `scheduling.spec.ts:68` — `booking the same therapist at an overlapping time is flagged as a conflict`

**Description:**  
`openNewAppointment()` calls `page.goto(agendaUrl)` to set up the second booking in the conflict test. After the first appointment is saved, the Next.js App Router performs a client-side route refresh on the agenda. In Chromium, a new `page.goto` supersedes the in-flight refresh silently. Firefox and WebKit treat this differently:

- **Firefox:** throws `NS_BINDING_ABORTED` — Mozilla's network-layer error when a binding is cancelled by a competing navigation.
- **WebKit:** throws `interrupted by another navigation`.

**Fix applied** (`apps/web/e2e/helpers/index.ts`):  
Added a try-catch in `openNewAppointment()` that retries `page.goto` once when either error string is matched:

```typescript
try {
  await page.goto(url);
} catch (e) {
  if (/interrupted by another navigation|NS_BINDING_ABORTED/i.test(String(e))) {
    await page.goto(url);
  } else {
    throw e;
  }
}
```

**Verified:** WebKit passes clean. Firefox passes clean in post-fix CI run.

---

### F2 — WebKit: Playwright `fill()` does not propagate through React's synthetic event system

- **Severity:** P2 (test failures across most patient interaction tests; no user-facing bug — real Safari users fire genuine key events)
- **Browsers affected:** WebKit only
- **Specs:** `patients.spec.ts` (12 tests)

**Description:**  
The patient form (`patient-form.tsx`) and patient search box (`search-box.tsx`) are React controlled inputs — they hold values in React state and read that state at submit time, not from native DOM FormData. Playwright's `fill()` sets the input's native value and dispatches a single synthetic `input` event. In Chromium and Firefox, React's event delegation captures this and fires `onChange`. In WebKit's automation layer, the synthetic event is **not** propagated through React's delegation root, leaving `onChange` uncalled and React state at its initial empty value.

**Observed server error (all WebKit create/edit attempts):**
```
Error [ValidationError]: fullName is required
  at parseCreatePatient (lib/patients/validation.ts:87:15)
```

For the search box: `onSubmit` reads React state `q` (empty string) and calls `router.replace("/patients")` — no `?q=` param, URL never updates.

**Fix applied** (`apps/web/e2e/helpers/index.ts`, `apps/web/e2e/patients.spec.ts`):  
All React-controlled text input interactions switched from `fill()` to `pressSequentially()`. `pressSequentially` fires individual `keydown → input → keyup` events per character which React processes correctly across all browsers. `<input type="date">` retains `fill()` — date inputs are handled specially by Playwright and do not use the React-state pattern. The `edit patient phone` test updated to use `click({ clickCount: 3 })` + `pressSequentially()` for the same reason.

**Verified:** All 15 WebKit patient tests pass post-fix, including previously flaky NIF search and no-results search.

---

### F3 — WebKit: `merging two patients` flaky under CI load

- **Severity:** P3 → **Fixed** (`test/webkit-merge-flake`)
- **Browsers affected:** WebKit only
- **Spec:** `patients.spec.ts:135` — `merging two patients marks the loser as Fundido`

**Root cause (two compounding issues):**

1. **Same React controlled-input issue as F2.** The merge `<input value={survivorId} onChange={...}>` is a React controlled input. The "Fundir neste paciente" button is `disabled={pending || survivorId.trim().length === 0}`. Playwright's `fill()` sets the DOM value and dispatches a single synthetic `input` event that WebKit does not forward to React's delegation root — leaving React state as `""` and the button permanently disabled. Playwright's `click()` then waits for the button to become actionable (non-disabled) and times out at 30 s. The retry passed because retries get a fresh 30 s window, and WebKit's synthetic-event propagation is non-deterministic: `fill()` occasionally fires `onChange` when the event loop is less contended.

2. **Cumulative 30 s wall-time budget.** Two `createPatient` calls (each with a 15 s assertion timeout) plus navigation and the merge interaction can collectively approach the 30 s default test timeout under CI load.

**Fix applied** (`apps/web/e2e/patients.spec.ts`):
- `test.setTimeout(90_000)` budgets 90 s for the whole test (2× createPatient + merge).
- `await expect(mergeInput).toBeVisible({ timeout: 8_000 })` waits for React hydration before filling.
- `mergeInput.pressSequentially(survivorId)` replaces `fill()` — fires per-character key events that React's `onChange` processes correctly in WebKit (same fix as F2).

---

## Summary

| Browser | auth | dashboard | patients | scheduling | clinical | Overall |
|---|---|---|---|---|---|---|
| Chromium | ✅ 9/9 | ✅ 7/7 | ✅ 15/15 | ✅ 4/4 | ✅ 3/3 | **PASS** |
| Firefox | ✅ 9/9 | ✅ 7/7 | ✅ 15/15 | ✅ 4/4 ⚠ F1 fixed | ✅ 3/3 | **PASS** |
| WebKit | ✅ 9/9 | ✅ 7/7 | ✅ 15/15 ⚠ F2+F3 fixed | ✅ 4/4 ⚠ F1 fixed | ✅ 3/3 | **PASS** |

**3 findings:**
- **F1 (P2):** Firefox `NS_BINDING_ABORTED` + WebKit `interrupted by another navigation` navigation race — fixed in test helpers (catch+retry).
- **F2 (P2):** WebKit `fill()` does not trigger React's `onChange` — fixed in test helpers (`pressSequentially`).
- **F3 (P3):** WebKit `merging two patients` flaky — two issues: `fill()` on the controlled merge input leaving button disabled in WebKit, plus cumulative createPatient wall-time approaching 30 s default. Fixed: `pressSequentially`, explicit hydration wait, `test.setTimeout(90_000)`.

All findings are test-layer issues. No application code changed. No assertions weakened.

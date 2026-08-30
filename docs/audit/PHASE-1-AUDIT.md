# PHASE 1 AUDIT, reachability, dead code, messaging wiring

**Terminal:** BLUE (platform lane, resumed from HOLD, read-only dispatch).
**Base:** `origin/main` @ `831a4772`, "board: the last two closures, SR-09, and
the platform lane goes HELD (#1071)", 2026-08-28.
**Date:** 2026-08-30. Go-live: 2026-08-31.
**Branch:** `audit/phase-1-2-prelaunch`, local only, NOT pushed, NOT merged.

> **NOTHING IN THIS REPORT WAS DELETED, CHANGED, MERGED OR PUSHED.** Every list
> below is a candidate list. The only file this dispatch wrote is this one.

## Method, so the numbers can be challenged

Two independent passes, and they are reported separately because they disagree
in useful places.

1. **A purpose-built import graph.** Every `import` / `export … from` / bare
   `import "x"` / `import()` / `require()` specifier in all 1,283 source files,
   resolved against the workspace: relative paths, the `@/*` alias (per-app
   root, from each app's `tsconfig.json`), and the six `@osteojp/*` workspace
   packages via their `exports` maps. Breadth-first from the entry points.
   **The resolver left exactly ONE specifier unresolved across the whole
   repository** (`apps/portal/next-env.d.ts -> ./.next/types/routes.d.ts`, a
   generated Next.js type file), and found **ZERO template-literal dynamic
   imports**. That matters: it means there is no string-built module loading
   for the graph to be blind to, so unreachable really does mean unreachable.
2. **`knip@5` and `depcheck@1`**, run against a full `pnpm install
   --frozen-lockfile` of the tree. Both needed `DATABASE_URL` set to a dummy
   value to load `packages/db/drizzle.config.ts`; no database was contacted.

Entry points seeded (148 app entries): every App-Router `page` / `layout` /
`route` / `error` / `loading` / `not-found` / `template` / `default` /
`global-error` / `icon` / `opengraph-image` / `sitemap` / `robots` / `manifest`
in `apps/web`, `apps/portal`, `apps/api`, `apps/admin`; every app-root
`middleware.ts` / `proxy.ts` / `instrumentation*.ts` / `next.config.ts` /
`sentry.*.config.ts` / `postcss` / `tailwind` config. Server actions and Inngest
functions are NOT separate seeds because they are reached through those files,
the five Inngest serve routes (`app/api/inngest/{,ifthenpay,consultation,
invoicexpress,stripe}/route.ts`) each import a `functions` array, and every
`"use server"` module is imported by the component that calls it. Webhook
handlers are `route.ts` files and are already in the 148.

Separately seeded: 527 test files (vitest + Playwright), and 44 CLI/tool entries
derived mechanically from `package.json` `scripts`, `.github/workflows/*` and
runbook invocations.

---

## TASK 1, REACHABILITY MAP

### The partition, exactly

    total source files (.ts/.tsx/.js/.jsx/.mjs/.cjs, excl. node_modules)   1,283
    reachable from an APP entry point                                        637
    NOT reachable from any app entry point                                   654

The 654 break down into five mutually exclusive groups:

    527   test files themselves (*.test.*, *.spec.*, e2e/, vitest/playwright configs)
     36   CLI/tool entry scripts named in package.json, CI, or a runbook
      4   reachable ONLY from those CLI scripts
     21   reachable ONLY from tests
     66   ORPHANS, reachable from nothing at all
    ---
    654

**CANDIDATES FOR DELETION is the 66 + the 21 = 87 files.** The 527 test files
and the 40 tool files are reached by their own runners and are not candidates.

### The 66 orphans, by area

     41   packages/ui      (39 *.stories.tsx + .storybook/main.ts + .storybook/preview.tsx)
      8   packages/db      (drizzle.config.ts, 5 check-*/w13-04 scripts, 2 wave08 seeds)
      7   apps/web         (eslint config, 2 dashboard files, 3 integration files, 1 script)
      5   docs/board       (board-app.js, board-config.mjs, gen-triage.mjs,
                            render-board.mjs, validate-board.mjs)
      2   apps/admin       (eslint config, lib/supabase/admin.ts)
      2   apps/portal      (eslint config, test/server-only.stub.ts)
      1   apps/api         (eslint config)

Full list:

    apps/admin/eslint.config.mjs
    apps/admin/lib/supabase/admin.ts
    apps/api/eslint.config.mjs
    apps/portal/eslint.config.mjs
    apps/portal/test/server-only.stub.ts
    apps/web/eslint.config.mjs
    apps/web/lib/dashboard/actions.ts
    apps/web/lib/dashboard/notes.ts
    apps/web/lib/integrations/ifthenpay/index.ts
    apps/web/lib/integrations/stripe/fixtures.ts
    apps/web/lib/integrations/stripe/index.ts
    apps/web/scripts/sign-reminder-token.mjs
    docs/board/board-app.js
    docs/board/board-config.mjs
    docs/board/gen-triage.mjs
    docs/board/render-board.mjs
    docs/board/validate-board.mjs
    packages/db/drizzle.config.ts
    packages/db/scripts/check-guest-requests-grant.mjs
    packages/db/scripts/check-migration-columns.mjs
    packages/db/scripts/check-migration-tables.mjs
    packages/db/scripts/check-pending-migrations.mjs
    packages/db/scripts/w13-04-set-patient-bookable.mjs
    packages/db/seed/wave08-catalog.ts
    packages/db/seed/wave08-catalog-dryrun.ts
    packages/ui/.storybook/main.ts
    packages/ui/.storybook/preview.tsx
    packages/ui/stories/AppShell.stories.tsx
    packages/ui/stories/Banner.stories.tsx
    packages/ui/stories/BrandLockup.stories.tsx
    packages/ui/stories/Button.foundation.stories.tsx
    packages/ui/stories/Card.stories.tsx
    packages/ui/stories/Checkbox.stories.tsx
    packages/ui/stories/Combobox.stories.tsx
    packages/ui/stories/DatePicker.stories.tsx
    packages/ui/stories/Dialog.stories.tsx
    packages/ui/stories/Drawer.stories.tsx
    packages/ui/stories/EmptyState.stories.tsx
    packages/ui/stories/ErrorState.stories.tsx
    packages/ui/stories/Field.stories.tsx
    packages/ui/stories/GlassCard.stories.tsx
    packages/ui/stories/GlassKpiCard.stories.tsx
    packages/ui/stories/GlassPanel.stories.tsx
    packages/ui/stories/GlassStatusChip.stories.tsx
    packages/ui/stories/HeritageCorners.stories.tsx
    packages/ui/stories/HeritageDivider.stories.tsx
    packages/ui/stories/HeritageFrame.stories.tsx
    packages/ui/stories/Input.stories.tsx
    packages/ui/stories/KpiCard.stories.tsx
    packages/ui/stories/QuickActionTile.stories.tsx
    packages/ui/stories/ResumoChart.stories.tsx
    packages/ui/stories/SegmentedControl.stories.tsx
    packages/ui/stories/Select.stories.tsx
    packages/ui/stories/SidebarAppShell.stories.tsx
    packages/ui/stories/Skeleton.stories.tsx
    packages/ui/stories/SlotPicker.stories.tsx
    packages/ui/stories/StatusBadge.stories.tsx
    packages/ui/stories/StatusChip.stories.tsx
    packages/ui/stories/Switch.stories.tsx
    packages/ui/stories/Table.stories.tsx
    packages/ui/stories/Tabs.stories.tsx
    packages/ui/stories/Textarea.stories.tsx
    packages/ui/stories/TimeField.stories.tsx
    packages/ui/stories/Toast.stories.tsx
    packages/ui/stories/UserAreaCluster.stories.tsx
    packages/ui/stories/V2Foundation.stories.tsx

### The 21 reachable only from tests

    apps/api/lib/appointments/blocking-status.ts
    apps/api/lib/notify/clients.ts
    apps/api/lib/notify/registry.ts
    apps/web/lib/integrations/ifthenpay/client.ts
    apps/web/lib/integrations/ifthenpay/fixtures.ts
    apps/web/lib/integrations/ifthenpay/mbway.ts
    apps/web/lib/integrations/ifthenpay/multibanco.ts
    apps/web/lib/integrations/invoicexpress/fixtures.ts
    apps/web/lib/integrations/stripe/operations.ts
    apps/web/lib/invoices/actions.ts
    apps/web/lib/reminders/inbound-classify.ts
    apps/web/lib/reminders/reminder-copy.ts
    packages/db/scripts/assert-not-prod.ts
    packages/db/scripts/check-migration-functions.mjs
    packages/db/scripts/check-security-definer-owner.mjs
    packages/db/scripts/import-core.ts
    packages/db/scripts/prod-import.ts
    packages/db/scripts/rehearsal-import.ts
    packages/db/src/migration/sources/fisiozero.ts
    packages/db/tests/fixtures/fisiozero-synthetic.ts
    packages/db/tests/rls-harness.ts

---

## TASK 2, TOOL FINDINGS

### knip: 26 unused files

`knip` agrees with the graph on every substantive file and disagrees only where
it understands a convention the graph does not (it treats `eslint.config.mjs`,
`drizzle.config.ts` and `*.stories.tsx` as entry points, which is why its list
is 26 and not 66). Its 26:

    scripts/generate-pwa-icons.mjs          scripts/perf-seed-loadtest.mjs
    scripts/twilio-smoke.mjs                scripts/import/distinct-keys.mjs
    docs/board/board-app.js                 docs/board/board-config.mjs
    docs/board/gen-triage.mjs               docs/board/render-board.mjs
    docs/board/validate-board.mjs           apps/web/e2e/auth.setup.ts
    packages/db/scripts/check-guest-requests-grant.mjs
    packages/db/scripts/check-migration-columns.mjs
    packages/db/scripts/check-migration-functions.d.mts
    packages/db/scripts/check-migration-tables.mjs
    packages/db/scripts/check-pending-migrations.mjs
    packages/db/scripts/check-security-definer-owner.d.mts
    packages/db/scripts/w13-04-set-patient-bookable.mjs
    packages/db/seed/wave08-catalog.ts      packages/db/seed/wave08-catalog-dryrun.ts
    apps/web/scripts/sign-reminder-token.mjs
    apps/web/lib/dashboard/actions.ts       apps/web/lib/dashboard/notes.ts
    apps/web/lib/integrations/ifthenpay/index.ts
    apps/web/lib/integrations/stripe/index.ts
    apps/web/lib/integrations/stripe/fixtures.ts
    apps/admin/lib/supabase/admin.ts

`apps/web/e2e/auth.setup.ts` is a knip false positive: Playwright loads it by
path from a `setup` project in `playwright.config.ts`, not by import.

### Unused exports: 396 symbols across 181 files

154 value exports + 242 type exports. **This number is misleading and should not
be acted on as-is.** The bulk sits in barrel files whose barrel is itself
unimported, which double-counts:

     33  apps/web/lib/integrations/invoicexpress/index.ts
     21  apps/web/lib/clinical/report/index.ts
     18  apps/web/lib/reminders/index.ts
      7  apps/web/lib/clinical/records.ts
      7  apps/web/lib/admin/services.ts

The five reminder Inngest handlers (`scheduleAppointmentReminders`,
`sendAppointmentReminder`, `sendFollowUpNotification`, `sendNoShowNotification`,
`CONFIRMATION_IDEMPOTENCY_KEY`) appear in this list and are **NOT dead**, they
are consumed as members of the `functions` array that `app/api/inngest/route.ts`
imports. Anyone sweeping this list mechanically would delete the reminder
pipeline. That is the single most dangerous line item in this report.

### Unused dependencies, where both tools agree

| Package | Where | Verdict |
|---|---|---|
| `@sentry/nextjs` | `apps/portal` | **Genuinely zero references.** See finding NV-1. |
| `@osteojp/auth` | `apps/portal`, `apps/admin` | Named in `next.config.ts` `transpilePackages`. Not an import. |
| `tailwindcss`, `@tailwindcss/postcss` | all 4 apps | **FALSE POSITIVE.** Tailwind v4 is loaded through `postcss.config.mjs` and `@import "tailwindcss"` in CSS. |
| `@osteojp/ui` | `apps/api` | **FALSE POSITIVE.** Used as `@import "@osteojp/ui/theme.css"` in `app/globals.css`. |
| `sharp` | root (depcheck "missing") | **FALSE POSITIVE and deliberate.** `scripts/generate-pwa-icons.mjs:7` says in its own header that sharp must not become a dependency; it is installed and removed around a manual regeneration. |

### One-time migration and seed scripts

    packages/db/seed/wave08-catalog.ts          the real services catalog (source of truth)
    packages/db/seed/wave08-catalog-dryrun.ts   local dry-run of the above
    packages/db/scripts/w13-04-set-patient-bookable.mjs   one-shot data flip, W13-04

### Commented-out blocks over 10 lines

**ZERO.** A scan for runs of >10 consecutive `//` lines that are at least 50%
code-shaped (assignment, call, brace, `const`/`return`/`import`/`if`) found none
in 1,283 files. This repository has an unusually high comment density, and all
of it is prose, not commented-out code.

### Duplicate utilities

- **`lib/supabase/admin.ts` exists three times**, `apps/web`, `apps/api`,
  `apps/admin`, and the three bodies are identical apart from the header
  comment. `apps/admin`'s copy has **zero callers**.
- `apps/web/lib/integrations/{ifthenpay,invoicexpress,stripe}/client.ts` are
  three hand-rolled fetch wrappers (123 / 143 / 168 lines) sharing a
  `HttpMethod` / `*ClientOptions` / `RequestOptions` shape. Their headers say
  the separation is deliberate (different auth placement, different body
  encodings). Not a defect; noted only because it recurs three times.
- `apps/web/lib/clinical/declaracao/signature-stamp-asset.ts` is **772 KB of
  base64** and the same two images also exist as PNGs in `declaracao/assets/`
  (590 KB). Only the base64 module is read by code; the PNGs are referenced in
  a comment.

### Env vars in code but absent from `.env.example`

`.env.example` names 27; the code reads 65 distinct names. The gap includes
three that gate whether messages leave the platform:

    OTP_LIVE_SEND          gates ALL patient login OTP SMS   <-- see TASK 4
    INVITES_LIVE_SEND      gates the staff-invite email
    INVITES_EMAIL_FROM     the invite from-address
    REMINDERS_INBOUND      gates the inbound-reply capability

Full list of names in code but not in `.env.example`:

    A4_DISABLE_LOCK, AUDIO_S3_REGION, AUDIO_S3_SECRET_ACCESS_KEY, BASE_URL,
    DATABASE_URL_DEV, FISIOZERO_BACKOFF_BASE_MS, FISIOZERO_BASE_URL,
    FISIOZERO_CHECKPOINT, FISIOZERO_END_ID, FISIOZERO_LIMIT, FISIOZERO_OUT_DIR,
    FISIOZERO_RATE_MAX_MS, FISIOZERO_RATE_MIN_MS, FISIOZERO_RETRIES,
    FISIOZERO_START_ID, FISIOZERO_STORAGE_STATE, FISIOZERO_TIMEOUT_MS,
    IFTHENPAY_ANTIPHISHING_KEY, IFTHENPAY_BASE_URL, IFTHENPAY_MBWAY_KEY,
    IFTHENPAY_MB_KEY, INVITES_EMAIL_FROM, INVITES_LIVE_SEND, M1_WEBHOOK_API_KEY,
    M1_WEBHOOK_URL, NEXT_PUBLIC_API_URL, OTP_LIVE_SEND, PATIENT_SESSION_SECRET,
    PLATFORM_OPERATOR_EMAILS, PORTAL_BASE_URL, PORTAL_TENANT_ID,
    REMINDERS_INBOUND, SEED_DEV_CONFIRM, SEED_TENANT_ID, SHARP_PATH,
    SMOKE_TO_NUMBER, SUPABASE_JWT_SECRET, SUPABASE_URL, TWILIO_SENDER_ID,
    TWILIO_SMOKE_CONFIRM

(`CI`, `NODE_ENV`, `NEXT_RUNTIME` excluded, framework-supplied.
`NEXT_PUBLIC_API_URL` IS present in `apps/portal/.env.example`.)

In `.env.example` but not read by our code: `INNGEST_EVENT_KEY`,
`INNGEST_SIGNING_KEY`. **Not a defect**, the Inngest SDK reads them itself.

`TWILIO_SENDER_ID` is read in exactly one place, `scripts/twilio-smoke.mjs:246`,
and only to warn that `docs/cutover-runbook.md` names the wrong variable. The
code reads `TWILIO_SMS_FROM`. The runbook is still wrong.

### Committed files that belong in .gitignore, build artifacts, caches in git

**NONE.** `git ls-files` returns zero `.log`, `.tsbuildinfo`, `.map`, archive,
`dist/`, `build/`, `.next/`, `.turbo/`, `coverage/`, `node_modules/`,
`test-results/` or `playwright-report/` paths, zero `.bak`/`.orig`/`.rej`, and
the only tracked `.env*` files are the two `.env.example` templates. The root
`.gitignore` is 60 lines and already covers rendered board HTML, RLS gate
artifacts, the filled import mapping config, and extractor session credentials.
**This is the cleanest part of the repository.**

### One stale reference found

`apps/web/playwright.config.ts` lines 98 and 127 both list
`"**/quick-notes.spec.ts"` in a project's `testMatch`. **That file does not
exist** anywhere in the repo. It is the last trace of the dead quick-notes
feature below. It is inert (Playwright silently matches nothing) but it makes
the config claim coverage that is not there.

---

## TASK 3, THE THREE BUCKETS

### SAFE TO DELETE, 3 items (2 files, 1 config entry)

Provably unreachable by the graph, no dynamic reference, and a grep for every
exported symbol name finds nothing outside the file itself.

**1. `apps/web/lib/dashboard/actions.ts` (43 lines)**
**2. `apps/web/lib/dashboard/notes.ts` (17 lines)**

The original "Notas rápidas" implementation, writing to the `quick_notes` table.
It was **superseded by W12-13**: `apps/web/app/dashboard/notas-rapidas.tsx` is
the live component, it is imported by `app/dashboard/page.tsx:50` and rendered at
`:339`, and it writes through `appendPatientNoteAction` /
`appendAppointmentNoteAction` in `lib/patients/actions.ts`, the unified note
store. Evidence that the old pair is dead: `saveQuickNotesAction`,
`saveQuickNotes` and `getQuickNotes` have **zero references** anywhere in
`apps/` or `packages/`; the only mentions of these two files in the whole
repository are `docs/design/STATE.md` and `docs/features/dashboard.md`, both
prose.

**3. The two `"**/quick-notes.spec.ts"` entries in
`apps/web/playwright.config.ts` (lines 98 and 127)**, the spec file does not
exist.

> **The `quick_notes` TABLE is NOT in this bucket.** Migration
> `0018_quick_notes.sql`, its RLS policy `quick_notes_own_row`, and its grants in
> `0021_grants_hardening.sql` are `packages/db` migrations and are DO NOT TOUCH.
> Deleting the two TypeScript files leaves an unused table, which is correct and
> harmless. Do not pair this with a drop.

### NEEDS VERIFICATION, 14 items (63 files)

**NV-1. `@sentry/nextjs` in `apps/portal/package.json` (1 dependency).**
The mechanical rule says SAFE: the string appears in `package.json` and nowhere
else in the app. **I am not putting it there, because the likely correct action
is the opposite of deletion.** `apps/portal` has no `sentry.*.config.ts`, no
`instrumentation.ts`, and no `Sentry` reference of any kind, while `apps/web`
has two Sentry configs plus two instrumentation files and `apps/api` has one.
The handover records that error reporting was proven on 2026-08-22 and calls it
"the last hard block on arming sends", that proof was on `apps/web`
(`/admin/sentry-check`). **The patient portal is the surface patients use and it
appears to have no error reporting at all.** Verify against the Vercel projects
before deciding; do not delete the dependency to make a tool go quiet.

**NV-2. `@osteojp/auth` in `apps/portal` and `apps/admin` (2 dependencies).**
Both tools call it unused. It is named as a string in
`apps/portal/next.config.ts:4` and `apps/admin/next.config.ts:6` under
`transpilePackages`. String-built reference outside the file: NEEDS VERIFICATION.

**NV-3. `packages/ui/stories/*.stories.tsx` + `.storybook/main.ts` +
`.storybook/preview.tsx` (41 files).** Loaded by a glob in `.storybook/main.ts`,
which is itself loaded by the `storybook` / `build-storybook` scripts in
`packages/ui/package.json`. **Storybook is in no CI workflow.** They are live
developer tooling reached only by a string glob, and `docs/design/ui-inventory.md`
depends on them. Also carries 6 Storybook devDependencies and a 460 KB scaffold
PNG (`stories/assets/addon-library.png`).

**NV-4. `docs/board/{board-app.js, board-config.mjs, gen-triage.mjs,
render-board.mjs, validate-board.mjs}` (5 files).** The board pipeline the owner
reads status from. `board:reconcile` is in the root `package.json`; the other
four are invoked by hand and documented across `BOARD-SPEC.md`,
`BOARD-TEMPLATE.md` and `DECISIONS.md`. `gen-triage.mjs` matches **zero** string
references outside itself, yet its own header (line 5) records that it was
committed deliberately in 2026-08-11 precisely because living outside the repo
caused PR #867's hand-fix to be silently reverted. Deleting it would recreate a
failure the project already paid for.

**NV-5. `packages/db/scripts/{check-guest-requests-grant, check-migration-columns,
check-migration-tables, check-pending-migrations}.mjs` +
`{check-migration-functions, check-security-definer-owner}.mjs`/`.d.mts`
(8 files).** Operator tooling for the production migration runbook. Referenced by
name across `docs/runbook-prod-migrations.md`, `docs/migration-apply-005[89]`
through `-0067.md`, `docs/import/REHEARSAL.md`, and
`.github/workflows/db-tests.yml` (which calls `check-security-definer-owner.mjs`).
Adjacent to migrations; not my lane.

**NV-6. `packages/db/seed/wave08-catalog.ts` + `wave08-catalog-dryrun.ts`
(2 files).** One-time seed, **but `wave08-catalog.ts` is cited as the source of
truth for the real clinic catalog** in `docs/design/DECISIONS.md:621`,
`docs/design/QUESTIONS.md:983`, `docs/loops/wave-10/W10-04b-...md:78` and
`docs/loops/wave-12/W12-03-...md:14`, with line anchors. Deleting it breaks four
documents that use it as evidence.

**NV-7. `packages/db/scripts/w13-04-set-patient-bookable.mjs` (1 file).** A
genuine one-shot data script. Cited in `docs/acceptance-session-wave-13.md`,
`docs/notifications-work-notes.md` and `portal-board.json`.

**NV-8. `apps/{web,api,portal,admin}/eslint.config.mjs` (4 files).** Discovered
by filename convention by ESLint's flat-config loader, never imported. `turbo run
lint` executes them. Unreachable by construction, not dead.

**NV-9. `apps/portal/test/server-only.stub.ts` (1 file).** Wired by an alias in
`apps/portal/vitest.config.ts`, a config-string reference, not an import.

**NV-10. `apps/api/lib/appointments/blocking-status.ts` (1 file).** Reachable
only from its own test. Its name also appears in
`packages/db/migrations/0052_conflicts_no_show_releases_slot.sql`,
`apps/web/lib/scheduling/pedido-confirm.test.ts` and `portal-board.json`.
Appointment-blocking semantics tied to a shipped migration: verify before
touching.

**NV-11. `apps/web/lib/clinical/declaracao/assets/signature-stamp-linda-a-velha.png`
and `signature-stamp-castelo-branco.png` (2 files, 590 KB).** Read by no code,
only mentioned in the header comment of `signature-stamp-asset.ts`, which
carries the same two images as base64 and IS what runtime uses. They are almost
certainly the provenance originals for a therapist's signature on a legally
issued clinical declaration. Do not delete to save 590 KB in a repo whose largest
file is already a 1.7 MB JSON board.

**NV-12. `scripts/generate-pwa-icons.mjs`, `scripts/perf-seed-loadtest.mjs`,
`scripts/import/distinct-keys.mjs` (3 files).** knip-only findings; hand-run
operator scripts. `distinct-keys.mjs` is under `scripts/import/` and is
therefore not my lane regardless.

**NV-13. `apps/admin` as a whole (24 files).** Not unreachable, it has its own
pages and builds, but note it is a separate Next.js app whose only orphan is a
service-role client nothing calls (see DNT-1). Flagged so nobody assumes the
superadmin app is exercised by the launch.

**NV-14. `apps/web/e2e/auth.setup.ts` (1 file).** knip false positive; Playwright
loads it by path from a `setup` project. Listed so the knip output is not
re-litigated later.

### DO NOT TOUCH, 34 files + 1 directory tree

By category, per the dispatch. Every one of these is also unreachable or
test-only by the graph, which is exactly why the category rule exists.

**Auth / RLS**

    DNT-1  apps/admin/lib/supabase/admin.ts      service-role factory, BYPASSRLS,
                                                 ZERO callers. Real finding, but it
                                                 is auth infrastructure. Report only.
    DNT-2  packages/db/tests/rls-harness.ts      the RLS test harness
    DNT-3  packages/db/scripts/assert-not-prod.ts  the prod-ref guard

**`packages/db` migrations**

    DNT-4  packages/db/drizzle.config.ts
           (+ every file under packages/db/migrations/ and supabase/migrations/)

**Payment and finance**

    DNT-5  apps/web/lib/integrations/ifthenpay/**   (index.ts, client.ts, mbway.ts,
                                                     multibanco.ts, fixtures.ts)
    DNT-6  apps/web/lib/integrations/stripe/**      (index.ts, fixtures.ts, operations.ts)
    DNT-7  apps/web/lib/integrations/invoicexpress/fixtures.ts
    DNT-8  apps/web/lib/invoices/actions.ts

    Note: the payment integrations ARE partly live. /api/webhooks/ifthenpay and
    /api/v1/integrations/stripe/webhook are real routes, and three of the five
    Inngest serve endpoints belong to ifthenpay / stripe / invoicexpress. Only the
    ifthenpay and stripe BARRELS (index.ts) have no importer; invoicexpress's barrel
    is imported by app/invoicing/page.tsx:7.

**The import pipeline**

    DNT-9   packages/db/scripts/import-core.ts
    DNT-10  packages/db/scripts/prod-import.ts
    DNT-11  packages/db/scripts/rehearsal-import.ts
    DNT-12  packages/db/src/migration/sources/fisiozero.ts
    DNT-13  packages/db/tests/fixtures/fisiozero-synthetic.ts
    DNT-14  tools/fisiozero-extractor/**

**Twilio / Resend sending paths**

    DNT-15  apps/api/lib/notify/clients.ts     the apps/api transport
    DNT-16  apps/api/lib/notify/registry.ts    DELIBERATELY EMPTY, see below
    DNT-17  apps/web/lib/reminders/inbound-classify.ts
    DNT-18  apps/web/lib/reminders/reminder-copy.ts
    DNT-19  apps/web/scripts/sign-reminder-token.mjs

`apps/api/lib/notify/registry.ts` deserves a sentence, because a mechanical
sweep would delete it and a reviewer would agree. It exports an **empty** array.
Its header explains that the two entries it once held went with
`lib/auth/activation.ts` under owner ruling WF-08, and that the empty registry
plus its sender are kept **as the choke point**: `resolveApproved` is fail-closed,
so an empty ledger means `apps/api` can send nothing through any channel under
any flag. Removing them would leave the next outbound body in that app with
nowhere to register and no gate to pass. It is load-bearing precisely because it
is empty.

`inbound-classify.ts` and `reminder-copy.ts` are the same shape: a built-ahead,
`REMINDERS_INBOUND`-gated capability. `app/api/webhooks/twilio/inbound/route.ts`
mentions `inbound-classify.ts` only in a comment (lines 9 and 20), the route
does not import it yet. That is deliberate deferral, not rot.

**Terms acceptance**, nothing in the unreachable set touches it. No candidates.

### Bucket counts

    SAFE TO DELETE        3 items   (2 files + 1 config entry, 60 lines)
    NEEDS VERIFICATION   14 items   (63 files + 3 package.json dependencies)
    DO NOT TOUCH         19 items   (34 files + the fisiozero-extractor tree)
    ---
    TOTAL ADJUDICATED    36 items covering all 87 candidates

---

## TASK 4, MESSAGING WIRING INVENTORY (read-only, NAMES ONLY)

### The architecture, in one paragraph

There is exactly ONE send gate: `createNotifier().dispatch` in
`packages/notify/src/gate.ts`. Nothing else in the platform may construct a
Twilio or Resend client, and the two transport adapters
(`apps/web/lib/reminders/clients.ts`, `apps/api/lib/notify/clients.ts`) make no
policy, they supply provider calls and env reads only. **There is one
exception**, and it is deliberate: patient login OTP SMS goes through
`apps/api/lib/auth/otp-transport.ts`, which builds its own Twilio client and is
gated by its own flag.

### Every env var NAME the Twilio and Resend paths require, and where each is read

| NAME | Read at |
|---|---|
| `TWILIO_ACCOUNT_SID` | `apps/web/lib/reminders/clients.ts:145,167`; `apps/api/lib/notify/clients.ts:90,111`; `apps/api/lib/auth/otp-transport.ts:142`; `scripts/twilio-smoke.mjs:59`; declared in `packages/notify/src/env.ts:30` |
| `TWILIO_AUTH_TOKEN` | `apps/web/lib/reminders/clients.ts:146,167`; `apps/api/lib/notify/clients.ts:91,111`; `apps/api/lib/auth/otp-transport.ts:143`; declared `packages/notify/src/env.ts:30` |
| `TWILIO_SMS_FROM` | `apps/web/lib/reminders/clients.ts:131`; `apps/api/lib/notify/clients.ts:81`; `apps/api/lib/auth/otp-transport.ts:144`; `scripts/twilio-smoke.mjs:124`; declared `packages/notify/src/env.ts:45` |
| `TWILIO_MESSAGING_SERVICE_SID` | same four sites; declared `packages/notify/src/env.ts:46`. Checked as "at least one of" with `TWILIO_SMS_FROM`, never both required |
| `TWILIO_SENDER_ID` | `scripts/twilio-smoke.mjs:246` ONLY, and only to warn that the cutover runbook names the wrong variable. **Not read by any product code.** |
| `RESEND_API_KEY` | `apps/web/lib/reminders/clients.ts:142,155`; `apps/api/lib/notify/clients.ts:87,99`; declared `packages/notify/src/env.ts:29` |
| `REMINDERS_EMAIL_FROM` | `apps/web/lib/reminders/clients.ts:127` (via `emailFromVarFor`); `apps/api/lib/notify/clients.ts:70,87`; mapped from the flag at `packages/notify/src/env.ts:69` |
| `INVITES_EMAIL_FROM` | `apps/web/lib/reminders/clients.ts:126`; mapped from the flag at `packages/notify/src/env.ts:70` |
| `REMINDERS_LINK_SECRET` | `apps/web/lib/reminders/link-token.ts:26`; `apps/web/scripts/sign-reminder-token.mjs:62`; declared `packages/notify/src/env.ts:37` |
| `REMINDERS_RESCHEDULE_BASE_URL` | `apps/web/lib/reminders/dispatch.ts:223`; `apps/web/scripts/sign-reminder-token.mjs:63`; declared `packages/notify/src/env.ts:37` |
| `REMINDERS_LIVE_SEND` | resolved per template via `liveSendFlag`, read in `packages/notify/src/env.ts:22` and `apps/web/lib/reminders/clients.ts:87`; declared in the app flag lists at `clients.ts:38` (web) and `apps/api/lib/notify/clients.ts:36` (api) |
| `INVITES_LIVE_SEND` | `apps/web/lib/invites/email.ts:33`; in the web flag list at `apps/web/lib/reminders/clients.ts:38` |
| `OTP_LIVE_SEND` | `apps/api/lib/auth/otp-transport.ts:61`. **Read through an injected `EnvSource`, not `process.env`**, which is why a naive `process.env.` grep does not find it. |
| `REMINDERS_INBOUND` | `apps/web/lib/reminders/inbound-config.ts:20` |
| `STAFF_INVITE_REDIRECT_URL` | `apps/web/lib/auth/provision.ts:316` |
| `SMOKE_TO_NUMBER`, `TWILIO_SMOKE_CONFIRM` | `scripts/twilio-smoke.mjs` only |
| `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` | read by the Inngest SDK itself; no code site |

### Every Inngest function that sends SMS or email, with its trigger

App `osteojp-reminders` (`apps/web/lib/reminders/inngest/client.ts:52`), served
at `/api/inngest`:

| Function id | Trigger | Sends | Templates |
|---|---|---|---|
| `schedule-appointment-reminders` | event `appointment/scheduled` | nothing, fans out `appointment/reminder.due` |, |
| `send-appointment-reminder` | event `appointment/reminder.due`, `sleepUntil(sendAt)`, idempotency on `appointmentId:offsetId:channel:sendAt`, `cancelOn` supersession | **YES** | `reminder.48h.email`, `reminder.48h.sms`, `reminder.24h.email`, `reminder.24h.sms`, or `reminder.24h.sms.fee_notice` |
| `send-appointment-confirmation` | event `appointment/scheduled` **with trigger filter `event.data.confirmationEligible == true`**, idempotency on `appointmentId:confirmation:startsAt` | **YES** | `confirmation.email`, `confirmation.sms` |
| `send-follow-up-notification` | event `appointment/completed`, `sleepUntil(endsAt + 24h)`, idempotency `appointmentId:follow_up` | **YES** | `follow_up.email`, `follow_up.sms` |
| `send-no-show-notification` | event `appointment/noshow`, idempotency `appointmentId:no_show` | **YES** | `no_show.email`, `no_show.sms` |

The other four Inngest apps send nothing to patients:
`osteojp` consultation (`retryPendingConsultationFires`, **cron**-triggered,
re-fires an internal webhook), ifthenpay (`reconcilePaymentFn`), invoicexpress
(`issueInvoiceFn`), stripe (`recordPaymentFn`).

Non-Inngest send paths: the **staff invite email**
(`apps/web/lib/invites/email.ts`, called from `lib/admin/staff.ts`, template
`staff.invite.email`) and **patient login OTP SMS**
(`apps/api/lib/auth/otp-transport.ts`, no template registry, its own flag).

### Every template used

Registered in `apps/web/lib/reminders/notification-registry.ts`:

    reminder.48h.email          approved  JP 2026-08-05 (WF-02 amendment)
    reminder.48h.sms            approved  JP 2026-08-03
    reminder.24h.email          approved  JP 2026-08-03
    reminder.24h.sms            approved  JP 2026-08-03
    confirmation.email          approved  JP 2026-08-03
    confirmation.sms            approved  JP 2026-08-03
    follow_up.email             approved  JP 2026-08-03
    follow_up.sms               approved  JP 2026-08-03
    no_show.email               approved  JP 2026-08-03
    no_show.sms                 approved  JP 2026-08-03
    reminder.24h.sms.fee_notice NOT APPROVED (approved:false, approvedBy:null)
    staff.invite.email          approved  grandfathered, owner ruling 2026-08-03

Registered in `apps/api/lib/notify/registry.ts`: **none. The array is empty.**

Bodies live in `apps/web/lib/reminders/templates.ts` (pt + en) and
`fee-notice.ts`. Registered body is the pt-PT one; approving PT approved its EN
counterpart.

### Is any sending path gated behind a flag

**Every one of them.** Five gates in `packages/notify/src/gate.ts`, in this
order, and the order decides which reason the suppression log records:

    1. template_unapproved     not registered / wrong channel / approved:false.
                               Fail-closed: an UNKNOWN id is treated as unapproved.
    2. live_send_disabled      the template's own liveSendFlag is not exactly "true".
    3. THE ENV ASSERTION       armed but incomplete -> THROWS NotificationEnvError,
                               naming every missing var at once. Not a suppression.
    4. missing_provider_config the transport reports no credentials.
    5. invalid_recipient       blank destination.

Only the exact string `"true"` arms a flag. `"TRUE"`, `"1"`, `"yes"`, `" true "`
and unset all mean OFF (`packages/notify/src/env.ts:22`).

The env assertion sits at 3 and not 4 deliberately: at 4 an armed-but-broken
deploy would report `missing_provider_config`, the same line a healthy sandbox
deploy writes, and a misconfiguration would look exactly like the safe default.
It also runs inside `dispatch` and not at module scope, that was INC-12 on
2026-08-18, when a module-scope assertion took down `/admin/staff` AND the whole
`/api/inngest` route over one missing variable.

### WHICH FLAGS ARE CURRENTLY REQUIRED FOR REMINDERS TO ACTUALLY SEND IN PRODUCTION

I cannot read production values (standing rule 3: names only). This is what the
code requires. All of it must hold:

1. **`REMINDERS_LIVE_SEND` set to exactly `true`.** It is the `liveSendFlag` on
   all eleven reminder templates. Without it every send returns
   `live_send_disabled` and nothing leaves.
2. **The template must be approved.** Ten are. `reminder.24h.sms.fee_notice` is
   `approved:false` and will be refused `template_unapproved` **even with the
   flag on**, until JP approves the wording and counsel signs off the fee rule.
   `smsTemplateIdFor(offsetId, feeNotice)` picks this id from the same boolean
   that puts the fee line in the body, so a fee-bearing body cannot be sent
   under the plain approved id.
3. **With `REMINDERS_LIVE_SEND` armed, ALL of these must be non-blank or every
   send throws:** `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `REMINDERS_RESCHEDULE_BASE_URL`, `REMINDERS_LINK_SECRET`,
   `REMINDERS_EMAIL_FROM`, and **at least one of** `TWILIO_SMS_FROM` /
   `TWILIO_MESSAGING_SERVICE_SID`.
4. **Per-channel transport config**: email additionally needs the per-template
   from-address var present; SMS needs SID + token + a sender.
5. Non-blank recipient.

**`INVITES_LIVE_SEND` is independent.** Arming reminders does not arm staff
invites and vice versa; each template carries its own flag, and
`INVITES_EMAIL_FROM` is demanded only when `INVITES_LIVE_SEND` is armed.

**`REMINDERS_INBOUND` is a third, separate flag** and is OFF by default. It gates
the inbound-reply capability and the reception review page. Reminders send
without it.

### THE FINDING I WOULD ACT ON FIRST, AND IT IS NOT ABOUT DEAD CODE

**`OTP_LIVE_SEND` gates every patient login SMS, and it was deliberately
disarmed.**

- `apps/api/lib/auth/otp-transport.ts:61`, `otpLiveSendEnabled` returns
  `env.OTP_LIVE_SEND === "true"`. `resolveOtpTransport` (`:198`) hands back a
  no-op sink when it is not armed. Nothing reaches Twilio.
- `docs/acceptance-session-wave-13.md:225`, "**THE FLAG LIVES ON THE API
  PROJECT, NOT THE PORTAL.**"
- `docs/acceptance-session-wave-13.md:1177` and
  `docs/acceptance-session-wave-13-results.md:214`, "`OTP_LIVE_SEND` **IS
  DISARMED AT THE END OF THIS SESSION.**"
- `docs/acceptance-session-wave-13-results.md:160`, item 25, "**DISARM
  `OTP_LIVE_SEND`**", status `UNRECORDED`.
- `docs/board/gen-triage.mjs:75` calls item 25 "still the most urgent blank".
- It is **absent from `.env.example`**.

Patient login is phone-only OTP (gate PG1). If that flag is not `true` on the
**API** Vercel project tomorrow morning, **no patient can log in**, and the
failure is silent: the transport returns `{delivered:false, id:"sink:otp:N"}`
rather than erroring. This is a five-second check with a launch-sized
consequence, and it is not on the open-card inventory in `HANDOVER-STATE.md`.

I have deliberately not tried to read the value. Owner action: confirm
`OTP_LIVE_SEND=true` on the API project before the clinic opens.

---

## Cross-check against HANDOVER-STATE.md

Read in full before starting. **No finding in this report duplicates a known
open card.** The 27 open platform-lane cards, the 6 shipped-and-not-to-be-
reopened, the 4 deferred by SR-01/SR-04, the 3 dormant and the 3
waiting-on-an-event were all excluded by name. The `open_on_purpose`
expiry finding the previous BLUE dispatch left behind is untouched, it remains
the next session's first candidate.

New and not previously carded, in order of consequence:

1. `OTP_LIVE_SEND` disarmed, absent from `.env.example`, item 25 UNRECORDED.
2. `apps/portal` declares `@sentry/nextjs` and wires no Sentry at all.
3. `INVITES_LIVE_SEND` and `INVITES_EMAIL_FROM` absent from `.env.example`.
4. Dead `quick_notes` code pair, superseded by W12-13.
5. Stale `**/quick-notes.spec.ts` in `playwright.config.ts` ×2.
6. `docs/cutover-runbook.md` names `TWILIO_SENDER_ID`; the code reads
   `TWILIO_SMS_FROM`. `scripts/twilio-smoke.mjs:246` already warns about it.
7. `apps/admin/lib/supabase/admin.ts`, an uncalled BYPASSRLS factory.

---

*BLUE, platform terminal. Read-only dispatch. Nothing deleted, nothing merged.*

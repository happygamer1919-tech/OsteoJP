# Loop W8-03 - Estatisticas / Indicadores (KPI) split (Wave 08 Dados e KPI)

GATE: **Wave 08 Dados e KPI, migration-free expected, OWNER VISUAL GATE.** Turns the Estatisticas landing into a two-card chooser (existing dashboard, unchanged + a new KPI section) and builds the KPI reports from existing data, adopting recharts for this section. **Runs AFTER W8-01 (a/b/c) merged**, per the wave order. Starts from **fresh `origin/main`**; never stacked. **OWNER VISUAL GATE:** all checks green is NECESSARY but NOT sufficient; GREEN pushes + pastes the osteojp-platform PREVIEW URL + the surface list, then HALTs; the owner merges.

## Field 1. Scope and ground truth

Keep the Estatisticas nav entry. Make its landing a two-card chooser: "Estatisticas" (the existing dashboard, unchanged) and "Indicadores (KPI)" (new). The KPI section is modeled on the clinic's Fisiozero reference: a report menu + a period picker (Escolher periodo with preset ranges and a custom range), each report rendered as a full visual page. Build only the reports that existing data supports.

Ground truth (recon at authoring 2026-07-15, embed - executor runs with ZERO memory):
- **The Estatisticas route is `apps/web/app/estatisticas/`:** `page.tsx` (owner gate at `~34`, calls `getStatistics`), `estatisticas-view.tsx` (the existing dashboard: revenue/appointments/utilization KPI cards + a revenue-by-month chart + per-therapist/service/location breakdowns + status volume), `bar-chart.tsx` (a hand-rolled dependency-free SVG bar chart; the peak bar is purple accent-1-700 per W7-03, every value printed as text), `bar-chart.test.tsx`, `layout.tsx`. **The existing dashboard = `estatisticas-view.tsx` and is UNCHANGED this wave** (it becomes the "Estatisticas" card target). The existing hand-rolled SVG chart STAYS as-is.
- **Owner-only gate is four points (W6-05 pattern, reuse identically for the new KPI sub-route):** (1) capability `statistics:read` at `packages/auth/permissions.ts:56-58`; (2) owner holds all capabilities `permissions.ts:89-92` (admin/therapist/reception denied); (3) route guard `apps/web/app/estatisticas/page.tsx:34` (`if (!can(actor.role,"statistics:read")) redirect(...)`); (4) query guard `apps/web/lib/statistics/queries.ts:65` (`assertCan(ctx.role,"statistics:read")`). Nav entry: `apps/web/lib/nav/nav-items.ts:30` (`capability: "statistics:read"`), locked by `nav-items.test.ts`. The new KPI sub-route (e.g. `/estatisticas/indicadores` or `/estatisticas/kpi`) reuses ALL FOUR points + the nav test.
- **Charting:** `recharts` is NOT a dependency today (`apps/web/package.json`; the only chart is the hand-rolled SVG). **Adopt recharts for the KPI section** (backlog item, owner-approved; Q-W6-05-1 pre-cleared it as "say the word and it is a one-loop add"). Use recharts ONLY in the new KPI section; leave the existing `bar-chart.tsx` SVG chart untouched.
- **Existing KPI query layer:** `apps/web/lib/statistics/queries.ts` (`getStatistics`, with e.g. `revenueByTherapist` `~89-101`). Extend it (or add a sibling KPI query module) for the new reports; do not weaken the owner gate.
- **Data availability (recon-verified on main - build only what exists):**
  - `appointments` (`schema.ts:452-535`): `practitionerId` (462), `serviceId` (468), `startsAt` (483), `status` (485), `patientId` (459).
  - `invoices` (`schema.ts:980-1009`): `patientId` (987), `appointmentId` (988), `amountCents` (989), `status` (991), `issuedAt` (997). Revenue = issued/paid, integer cents, gross=final (CIVA art. 9). Therapist/service dimensions via the `invoices.appointmentId -> appointments` link.
  - `analytics_events` (`schema.ts:941-978`): only `appointment_status_changed` + `payment_intent.succeeded` event types (financial amount is on invoices, not events).
  - `patients.referralSource` (`schema.ts:379`, 0033) - PRESENT.
  - `patients.dateOfBirth` (`schema.ts:362`) - PRESENT.
  - `patients.city` (`schema.ts:369`) - PRESENT (this resolves the localidade recon question below: it IS captured).
- **Reports BUILDABLE from existing data (build these):** Tipos de marcacao TOP 10 (donut, from `appointments.serviceId` counts); Top terapeutas por marcacoes (`appointments.practitionerId` counts); Evolucao da faturacao (multi-year line, `invoices` by month); Evolucao da faturacao por terapeuta (`invoices -> appointments.practitionerId`); Distribuicao etaria (`patients.dateOfBirth` age buckets); Marcacoes diarias por terapeuta (`appointments` by practitioner + date); Top 10 utentes por pagamentos (`invoices.patientId`); Top 10 utentes por marcacoes (`appointments.patientId`); Origem dos utentes (`patients.referralSource`, 0033); **Top localidades dos utentes (`patients.city`, PRESENT - build it).**
- **Recon-HALT item, DATA ABSENT (do NOT fabricate):** **Evolucao do envio de SMS** - recon confirms reminder/SMS SENDS are NOT persisted anywhere on main. `patients.reminder_sms_enabled` (0019) is a PREFERENCE flag only; there is NO reminders/reminder_sends table and NO `reminder_sent`/`sms_sent` analytics event. This report is therefore NOT buildable from existing data. **Exclude it from this loop and record it in QUESTIONS.md** (a reminder-send persistence model is a backend follow-up); do not invent a data source.
- **Purple chart accents:** apply accent-1 `#8B1863` (and tints) as the chart accent per the 55/25/20 equity, AA preserved (accent-2-700 `#2F7E72` for cyan text where used; never base `#45B9A7` for text). Canonical hexes unchanged (`packages/ui/src/tokens.test.ts` green); bodychart `marker-*` untouched. UI-STYLE.md 7 already documents the equity.
- **Migration-free expected:** all reports are aggregate queries over existing data.
- **i18n:** pt-PT + en for the chooser, the report menu, the period picker, and each report title. JSON.parse both files in the gate.

**Scope:** the two-card Estatisticas chooser (existing dashboard unchanged + new KPI section); the KPI report menu + Escolher periodo period picker (presets + custom); the ten buildable reports above as full visual pages using recharts; owner-only gating identical to W6-05 (capability + route + query + nav) for the new sub-route; purple chart accents toward 55/25/20 with AA preserved. Exclude Evolucao do envio de SMS (data absent -> QUESTIONS). Migration-free.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains the merged W8-01 loops; `git worktree add ../osteojp-w8-03-estatisticas-kpi origin/main -b osteojp-w8-03-estatisticas-kpi`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **RECON:** confirm the four-point owner gate, the existing dashboard component, the data columns above, and that recharts is absent. Paste findings.
3. **Chooser:** Estatisticas landing becomes two cards - "Estatisticas" (routes to the existing unchanged dashboard) and "Indicadores (KPI)" (routes to the new sub-route). Nav entry unchanged (still "Estatisticas").
4. **Owner gate on the new sub-route:** reuse `statistics:read` at all four points (capability already exists) + the nav-items test.
5. **Adopt recharts:** add the dependency (owner-approved, Q-W6-05-1); use it ONLY in the KPI section. Leave `bar-chart.tsx` untouched.
6. **Period picker:** Escolher periodo with preset ranges + a custom range; it scopes every report.
7. **Reports:** build the ten buildable reports as full visual pages (donut for Tipos de marcacao; multi-year line for faturacao; age-bucket, top-10 tables/bars, daily-by-therapist, origem, localidades). Purple accents per 55/25/20, AA preserved, values printed as text where colour would otherwise be the only cue.
8. **Exclude + record:** do NOT build Evolucao do envio de SMS; add a QUESTIONS entry for the missing reminder-send persistence.
9. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. the owner-gate test on the new route + a nav-items owner-only lock + `tokens.test.ts` unchanged), `pnpm build`, `pnpm test:e2e` (owner reaches the KPI section, picks a period, each report renders; a non-owner is redirected and has no nav entry). JSON.parse both i18n files.
10. **OWNER VISUAL GATE:** on all-green, push the branch, paste the osteojp-platform PREVIEW URL + the exact surface list (the chooser, each report page), and HALT for the owner to review + merge. GREEN NEVER self-merges.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Chooser PROOF:** the Estatisticas landing shows two cards; "Estatisticas" opens the UNCHANGED existing dashboard; "Indicadores (KPI)" opens the new section. Paste it.
- **Owner-gate PROOF:** the new KPI sub-route is denied at route + query for admin/therapist/reception, has no nav entry for them, and the nav-items owner-only test passes. Paste it.
- **recharts PROOF:** recharts is used only in the KPI section; `bar-chart.tsx` is unchanged (zero diff). Paste the diff scope.
- **Reports PROOF:** the ten buildable reports render with the period picker scoping them; each pulls only existing data. Paste the report list + a render assertion. Evolucao do envio de SMS is ABSENT with a QUESTIONS entry.
- **Palette PROOF:** purple accents applied, AA preserved, `tokens.test.ts` unchanged, bodychart `marker-*` untouched. Paste it.
- **Suite counts** with all gates green.
- **OWNER VISUAL GATE PROOF:** the preview URL + surface list pasted; the loop HALTED for owner merge (NOT self-merged).

## Field 4. Verification (paste evidence)
The recon report, the migration-free diff, the chooser + owner-gate + recharts-scope + reports + palette proofs, the QUESTIONS SMS-send entry, suite counts, the PREVIEW URL + surface list, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free expected;** if a report needs data not on main, EXCLUDE it + record it in QUESTIONS - do NOT add a migration or fabricate data.
- **The existing dashboard (`estatisticas-view.tsx`) and the existing SVG chart (`bar-chart.tsx`) are UNCHANGED this wave.** recharts is for the NEW KPI section only.
- **Owner-only gating is identical to W6-05** (capability + route + query + nav); never nav-hiding alone.
- **Do NOT build Evolucao do envio de SMS** (no send persistence exists); QUESTIONS it. `patients.city` DOES exist, so Top localidades IS built.
- **Purple accents per 55/25/20, AA preserved; canonical hexes unchanged (`tokens.test.ts` green); bodychart `marker-*` untouched.** Value always printed as text where colour would be the only cue.
- **New third-party dependency:** recharts is owner-pre-approved (Q-W6-05-1); no OTHER new vendor without an owner question. DB access only through `packages/db`.
- pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify.**
- **Standing test-data rule (Wave 08):** never run destructive QA against patient **Maria Joao Silva** (`triboimax635+maria@gmail.com`); use **disposable test patients only**; the reference therapist for tests is **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- A report the briefing lists as buildable turns out to need absent data - EXCLUDE it + QUESTIONS it (do not migrate/fabricate); if MOST reports are unbuildable, HALT with the finding.
- The owner gate cannot be enforced at route + query for the new sub-route without a role-scoped RLS change - HALT (this is capability-gated like W6-05, not RLS).
- Adopting recharts pulls a transitive vendor/policy concern (e.g. a non-EU asset/CDN) - HALT with the finding (EU data residency, rule 8).
- Any purple accent breaks an AA pairing or forces a canonical-hex change - HALT (canonical hexes never drift).

## Field 7. Report back
The recon report, the migration-free diff, the chooser + gate + recharts + reports + palette proofs, the QUESTIONS SMS-send entry, suite counts, the PREVIEW URL + surface list, PR number.

## Merge policy (embed, Wave 08 Dados e KPI)
- **W8-03 is OWNER VISUAL GATE (standing rule for visual-heavy loops since W7-03).** All required checks green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green, read from the checks API NOT the banner, is NECESSARY but NOT sufficient. GREEN pushes the branch, pastes the osteojp-platform PREVIEW URL + the surface list (the chooser + each report page), and HALTs; the owner reviews the preview and merges. **GREEN NEVER self-merges W8-03.** A rejected preview loops back with owner notes.
- **Migration-free expected;** any surfaced migration flips this loop to OWNER-MERGE with live-apply evidence (one migration in flight, fetch-and-fast-forward first) - HALT to convert. **Runs after W8-01 merged**, fresh `origin/main`, never stacked. Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch.

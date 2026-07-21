# Loop W10-05b - Cartoes nome apenas (Wave 10 Dados Reais e Isolamento)

GATE: **Wave 10, MICRO code loop, DISPLAY LAYER, migration-free, OWNER VISUAL GATE.** Simplifies the agenda appointment card face to the PATIENT NAME ONLY (Dia + Semana views), so the name stays readable at overlap widths. Owner ruling after live use. Keeps the W10-05 hover popup (which now carries all detail) exactly as is. Runs AFTER W10-05 merged; fresh `origin/main`; never stacked.

## Field 1. Scope and ground truth

**Defect (owner, live use):** at overlap widths the W10-05 card's extra face rows (the User/note/confirmation icons, the time row, the service line, the therapist-name row, the Sem-nota chip) crowd out the patient name, which then truncates to a few characters - defeating the W10-05 goal of reading the name at a glance.

**Change - agenda cards ONLY (`AppointmentBlock`, `apps/web/app/agenda/agenda-grid.tsx`), Dia + Semana views:**
- The card FACE shows ONLY the patient name, FULL, wrapping to multiple lines before it ever truncates. No icons, no service text, no time text, no therapist-name text, no conflict label text, no Sem-nota chip on the face.
- **Keep:** the service-tint body (`tint` on the button), the therapist stripe (spine) + a therapist-colour dot + colour, strikethrough-cancelled semantics on the name, and the **W10-05 hover popup EXACTLY as is** (`AppointmentHoverPanel`, `agenda-grid.tsx:548-554` sibling; it already carries time+duration, service, therapist, location, lifecycle+confirmation, note, created-by).
- **Overlap:** with 3 simultaneous cards at 1/3 width each, the names must stay readable (wrap, never horizontal-truncate to a few chars).
- **Marcacoes list view UNTOUCHED.** No new i18n strings expected.

Ground truth (recon at authoring 2026-07-21, executor verifies read-only; file:line refs verified at authoring):
- **Current card face (`agenda-grid.tsx:460-541`)** after W10-05: spine (`:465`), conflict label text (`:466-471`), patient-name row with `truncate` + User icon + Repeat icon + `+1` badge (`:475-498`), time row + note icon + confirmation tick (`:499-522`), therapist-name row + dot (`:526-534`), service line (`:535`), Sem-nota chip (`:537-541`). The `data-testid="agenda-card-patient"` is on the name container.
- **The name currently truncates:** the name text span uses `truncate` (`:486`), and the row is `flex ... truncate`; at 1/3 width this clips to a few characters. The fix removes `truncate` and lets the name `break-words` across multiple lines.
- **Therapist colour** (`therapistColor(appt.practitionerId)`, `:430`): the spine uses `tColor.fill`; keep the spine AND a small dot in `tColor.fill` (the ruling keeps "stripe + dot + colour"). No new hex; `tokens.test` stays green.
- **The hover popup is NOT changed** (`AppointmentHoverPanel`, `appointment-hover-card.tsx`) - it already carries every field that leaves the face. Do NOT edit it.
- **Signals that leave the face** (documented consequence, all still reachable): time/service/therapist/location/lifecycle/confirmation/note/created-by are all in the hover; the recurrence marker, the secondary-participant `+1` badge, and the completed-visit Sem-nota chip leave the agenda face (the Sem-nota chip stays on the Marcacoes list + patient tab, both untouched; recurrence + secondary remain in the appointment drawer). Filed as a note, not a blocker - the owner ruling is name-only.

**Scope:** the agenda card face (Dia + Semana) renders the patient name only, wrapping, never truncating; spine + dot + service tint + strikethrough-cancelled kept; the hover popup untouched; Marcacoes untouched. Migration-free, display layer only, no data/axis/query change, no new i18n. The only writes are `agenda-grid.tsx` (+ the affected tests) + the loop file + the board row.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W10-05's merge (#616); `git worktree add ../osteojp-w10-05b-nome-apenas origin/main -b osteojp-w10-05b-nome-apenas`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Strip the card face to name-only:** remove the conflict label text, the time row, the note icon, the confirmation tick, the User + Repeat icons, the `+1` badge, the therapist-name row, the service line, and the Sem-nota chip. Keep the spine; add a small therapist-colour dot; keep the service-tint body and the `ring-warning` conflict ring (non-text). Change the patient-name span from `truncate` to a wrapping `break-words` full name. Keep strikethrough-cancelled on the name (on the `agenda-card-patient` element, so the existing cancelled e2e still reads it).
3. **Do NOT touch** `AppointmentHoverPanel` / `appointment-hover-card.tsx`, the Marcacoes view, `therapist-color.ts`, or any i18n file. Clean up any now-unused imports/vars in `agenda-grid.tsx` (ConfirmationIndicator, StickyNote, User, Repeat, formatTimeOfDay if unused, showTherapist/showService/noteText).
4. **Tests:** update the agenda-grid + agenda-cards tests to the name-only face (patient name present + wrapping/not-truncated; therapist NAME no longer on the face but the dot + spine are; cancelled still strikes the name; the hover popup still renders with all fields). Add/keep a Playwright test that books THREE overlapping appointments and captures a screenshot at 1/3 width proving the names stay readable.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. `tokens.test` green (no new hex). Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files and ZERO i18n changes.
6. **OWNER VISUAL GATE:** push; paste the osteojp-platform PREVIEW URL + the 3-overlap agenda steps (Dia + Semana, a day with 3 simultaneous appointments, a cancelled one) + the Playwright 3-overlap screenshot; HALT for the owner to verify names are readable at overlap before merging. **The three `ttt` appointments currently on the cloud are owner-sanctioned residue for THIS gate only; the owner deletes them right after merge** (no cloud QA data is created by this loop; verification is local synthetic + the owner's own preview check).

## Field 3. Definition of done (machine-verifiable)
- **Name-only PROOF:** the card face renders ONLY the patient name (no time/service/therapist-name/icon/badge/Sem-nota text); a component test asserts the name is present and NOT `truncate` (wraps). Paste it.
- **Overlap PROOF:** a Playwright test books 3 overlapping appointments and screenshots them at 1/3 width; the names are readable (present, wrapped). Paste the test + screenshot path.
- **Kept-cues PROOF:** the therapist spine + a colour dot, the service-tint body, and strikethrough-cancelled on the name are intact; `tokens.test` green (no new hex). Paste the component test.
- **Hover-untouched PROOF:** `AppointmentHoverPanel` / `appointment-hover-card.tsx` and the Marcacoes view are unchanged (`git diff` shows neither touched); the hover still renders all fields.
- **No-i18n / migration-free PROOF:** `git diff --name-only origin/main` shows ZERO i18n, ZERO migration, ZERO workflow files.
- **Suite counts** with all gates green. **OWNER VISUAL GATE:** preview URL + 3-overlap steps pasted; HALTED for owner merge (NOT self-merged).

## Field 4. Verification (paste evidence)
The name-only + overlap + kept-cues + hover-untouched + no-i18n/migration-free proofs, the Playwright 3-overlap screenshot, suite counts, the PREVIEW URL + agenda steps, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W10-05 #616). **Agenda cards only, Dia + Semana.** Marcacoes list view UNTOUCHED. Migration-free, display layer; if a schema change surfaces, HALT.
- **Do NOT touch the W10-05 hover popup** (`AppointmentHoverPanel`) - keep it exactly as is; it carries the detail that leaves the face.
- **Keep:** service-tint body, therapist stripe + dot + colour, strikethrough-cancelled. **No new hex** (`tokens.test` green). **No new i18n strings.**
- The dual axes stay LOCKED; no data/query/model change. Staff-only; the portal is unaffected.
- pt-PT; no emoji; plain hyphens only; no em/en dashes. **Never force-push / `--admin`.**
- **Standing test-data rule (post W10-02):** E2E on local `127.0.0.1` synthetic data ONLY. The three cloud `ttt` appointments are owner-sanctioned residue for the visual gate ONLY; this loop creates NO cloud QA data and the owner deletes them post-merge.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W10-05's merge.
- Making the face name-only cleanly would require a schema/query/model change, a new i18n string, or editing the hover popup - HALT (display layer only; hover untouched).
- The name-only face cannot stay readable at 3-overlap without drifting a canonical hex - HALT to QUESTIONS with a recommended default.

## Field 7. Report back
The name-only + overlap + kept-cues + hover-untouched proofs, the 3-overlap screenshot, suite counts, the PREVIEW URL + agenda steps, PR number.

## Merge policy (embed, Wave 10)
- **W10-05b is the OWNER VISUAL GATE.** All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys green (read from the checks API NOT the banner) is NECESSARY but NOT sufficient. GREEN pushes + pastes the preview URL + the 3-overlap steps + the screenshot, then HALTs; the owner verifies at overlap width and merges. GREEN NEVER self-merges.
- **Runs after W10-05 merged**, fresh `origin/main`, never stacked. Migration-free, no i18n, hover untouched, Marcacoes untouched. Workflow files NEVER touched. HALT-LOUD on scope/product/reality mismatch.

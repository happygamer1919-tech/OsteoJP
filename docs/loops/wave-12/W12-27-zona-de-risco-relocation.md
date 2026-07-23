# Loop W12-27 - Zona de risco relocation (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE. OWNER VISUAL GATE. Migration-free. No control weakened.** Relocate/consolidate the destructive actions into a collapsed "Zona de risco" section, per the owner/Rodica ruling (Q-W7-03-1 closed). Recon shows the destructive block currently lives on the PATIENT profile (not Administracao), which needs a scope confirmation. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Create a collapsed "Zona de risco" section (Rodica: "not too obvious") for destructive actions; keep every password gate + server guard intact. Because the ruling says "bottom of Administracao" but the per-patient destructive controls live on the patient profile and need patient context, this loop confirms the scope (Q-W12-06) and applies the recommended default. Presentation/placement only; no schema.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **The destructive block is on the PATIENT profile, not Administracao:** "Acoes destrutivas" (Eliminar / Juntar / Eliminar definitivamente) is mounted in `apps/web/app/patients/[id]/page.tsx` OUTSIDE every tabpanel (renders at the bottom of every patient tab); W7-03 already made it a collapsed `<details>` disclosure. The password-gated controls: patient hard-delete `apps/web/app/patients/_components/patient-actions.tsx:46-60,200-221`; ficha Eliminar/Anular `record-lifecycle-actions.tsx:29-65,117-122`; permanent delete (admin deleted-patients view) `apps/web/app/admin/pacientes-eliminados/deleted-patients-list.tsx:74-87,137-174`; the delete password is configured in Admin -> Settings (`admin/settings/page.tsx:113-132`).
- **Administracao structure (relocation target):** tab nav `apps/web/app/admin/layout.tsx:11-18` (overview/settings/staff/working-hours/services/locations + owner-only `pacientes-eliminados`); overview `apps/web/app/admin/page.tsx` (4 cards, no destructive block); sub-nav `admin-nav.client.tsx`.
- **The ruling (Q-W7-03-1 CLOSED, DECISIONS 2026-07-23):** relocate the "Acoes destrutivas" block to a collapsed "Zona de risco" section at the BOTTOM of Administracao ("not too obvious"); no control weakened; implementation in Wave 12. There is NO "Zona de risco" section in the code today.
- **Scope tension (register Q-W12-06):** the per-patient destructive controls (delete THIS patient, delete THIS ficha) need a patient context, so they cannot simply move to the global Administracao screen. **Recommended default:** (1) add a collapsed "Zona de risco" section at the bottom of the Administracao overview consolidating the ADMIN-level destructive entry points (link to Pacientes eliminados / permanent delete, the delete-password config), "not too obvious"; (2) relabel the existing patient-profile collapsed block to "Zona de risco" for consistency + keep it at the bottom of the profile (it must stay patient-scoped). No control removed or weakened. Confirm with the owner if a different split is wanted (e.g. move per-patient destructive off the profile entirely).

**Scope:** the Administracao "Zona de risco" collapsed section (admin-level destructive entry points) + the patient-profile block relabel/placement + i18n (both files) + tests; ZERO control weakening; ZERO schema. Verify on local + Preview.

## Field 2. Ordered steps
1. **Scope-confirm:** register/advance Q-W12-06 with the recommended default; proceed on the default unless the owner rules otherwise. **A0 isolation guard** off fresh `origin/main`; worktree; assert clean tree + HEAD == tip.
2. **Administracao Zona de risco:** add a collapsed "Zona de risco" section at the bottom of the Administracao overview holding the admin-level destructive entry points (Pacientes eliminados / permanent delete, delete-password config); "not too obvious".
3. **Patient-profile block:** relabel the existing collapsed destructive block to "Zona de risco" + keep it at the bottom of the profile, patient-scoped; do NOT remove or weaken any control (the scrypt password gate + server guards stay).
4. **i18n:** "Zona de risco" + any helper in BOTH i18n files, same key; JSON.parse both.
5. **Test:** the existing destructive-action E2Es still pass (open the collapsed section first via the helper); a test asserts the Administracao Zona de risco renders collapsed + its controls keep the password gate; a test asserts no control was removed.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Section PROOF:** the Administracao Zona de risco renders collapsed at the bottom of the overview with the admin-level destructive entry points; the patient-profile block reads "Zona de risco". Screenshots.
- **No-weakening PROOF:** every destructive control keeps its scrypt password gate + server guard; a test asserts the controls are present + gated (nothing removed). Paste it.
- **E2E PROOF:** the existing destructive-action specs pass (opening the collapsed section first).
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Gates green** incl. i18n parity.

## Field 4. Verification (paste evidence)
The section screenshots, the no-weakening test, the passing destructive-action E2Es, the no-schema diff, suite counts, the Preview URL (owner sees the collapsed Zona de risco), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Placement/label only, migration-free:** no schema; NO control weakened (the scrypt password gate + all server guards are untouched).
- **Per-patient destructive controls stay patient-scoped** (they need a patient context) - relabelled, not orphaned to a global screen; the recommended-default split is confirmable via Q-W12-06.
- Verify on local `127.0.0.1`; pt-PT + en both; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The owner wants the per-patient destructive controls fully moved OFF the profile (needs a patient picker on Administracao) - HALT to Q-W12-06 with the tradeoff; do not silently strand the per-patient flow.
- Any relocation would remove or weaken a control - HALT (no control weakened is a hard rule).

## Field 7. Report back
The section screenshots, the no-weakening test, the passing E2Es, the no-schema diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-27 is OWNER VISUAL GATE (placement is visual, migration-free).** Required checks + all three Vercel deploys green (checks API not banner) NECESSARY but not sufficient; GREEN pushes the Preview + the collapsed Zona de risco and HALTs; owner confirms ("not too obvious") + merges. NOT `[SELF-MERGE-OK]`.
- Fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on any control weakening or an unresolved scope split.

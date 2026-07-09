# Loop W5-22 - "Ficha do paciente" link from the Agenda marcacao edit view (Wave 05 Hotfix)

GATE: **Wave 05 Hotfix, Batch H (migration-free).** Adds a read-only navigation button from the Agenda marcacao edit view to the patient profile. No data change. No dependency on the other hotfix loops.

## Field 1. Scope and ground truth

In the Agenda marcacao edit view, add a button **"Ficha do paciente"** that navigates directly to the primary patient's profile page. If a Paciente 2 is linked, render a **second** link for them. Read-only navigation - no data changes.

Ground truth (recon 2026-07-09, embed - executor runs with ZERO memory):
- **Edit view:** `apps/web/app/agenda/appointment-drawer.tsx` - component `AppointmentDrawer` (client, `"use client"`). Renders in both create and edit modes; edit mode is active when the drawer holds an existing appointment (`editing !== null`, `state.mode === "edit"`). Existing precedent for an edit-only bottom action: the password-gated hard-delete block.
- **Patient fields on the appointment** (`apps/web/lib/scheduling/types.ts`, `AgendaAppointment`): primary `patientId: string` + `patientName: string`; secondary (Paciente 2, optional) `patientTwoId: string | null` + `patientTwoName: string | null`. In the drawer's edit state these are `editing.patientId` / `editing.patientName` and `editing.patientTwoId` / `editing.patientTwoName`.
- **Patient profile route:** `/patients/[id]` (`apps/web/app/patients/[id]/page.tsx`). Link construction used across the app: `` href={`/patients/${patientId}`} ``.
- **Navigation idiom:** the drawer is a client component and does NOT currently import next/link; the client-component idiom in this area is `useRouter().push(...)` from `next/navigation`. `Button` is already imported from `@osteojp/ui`. Either a `Button` with `onClick={() => router.push(`/patients/${id}`)}` OR a `Link`-wrapped control is acceptable; match the drawer's existing button styling.
- **E2E:** existing Agenda/marcacao edit specs at `apps/web/e2e/marcacoes-tab-edit.spec.ts` and `apps/web/e2e/scheduling.spec.ts` (helpers `openNewAppointment` / `fillAppointment` / `fillTime`; run as admin). Add the new assertion alongside.
- **Secondary participant note:** W4-19 shipped secondary participants as create-only + primary-column rendering; a secondary link here is a read-only convenience and does not touch that model.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-22-marcacao-to-patient-link origin/main -b osteojp-w5-22-marcacao-to-patient-link`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** confirm the edit-view component + the primary/secondary patient fields + the profile route pattern.
3. **Primary link:** in the marcacao EDIT view (edit mode only), add a "Ficha do paciente" button navigating to `/patients/${editing.patientId}`.
4. **Secondary link:** when `editing.patientTwoId` is set, render a second link (e.g. "Ficha do paciente 2" / labeled with `patientTwoName`) to `/patients/${editing.patientTwoId}`.
5. **i18n:** the button label(s) via `@osteojp/i18n` keys in BOTH `strings.pt.json` and `strings.en.json`.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (from an Agenda marcacao the button lands on the correct patient profile).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Read-only PROOF:** the diff touches only the drawer + i18n (and the e2e); NO server action, NO appointment mutation. Paste the `git diff --stat`.
- **E2E PROOF:** a Playwright test that opens an Agenda marcacao edit view, clicks "Ficha do paciente", and asserts it lands on the correct primary patient profile (`/patients/{primaryId}`). Paste the passing run.
- **Secondary-link PROOF:** with a Paciente 2 linked, a second link renders and lands on the correct secondary profile; with no Paciente 2, no second link renders. Paste the test.
- **i18n parity:** the label key(s) in BOTH string files.
- **Suite counts** (baseline web 816) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, read-only `git diff --stat`, the primary-link E2E, the secondary-link test, i18n parity, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free, read-only navigation.** No data changes, no server action, no appointment mutation - only a link out of the edit view.
- **Primary patient always; secondary only when `patientTwoId` is set.**
- Match the drawer's existing button styling and the app's `/patients/[id]` link pattern.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- The Agenda marcacao edit view is NOT where recon expected (component/fields differ from the ground truth above in a way that changes scope).
- Adding the link would require a data change or a server-action change (it must be pure read-only navigation) - surface why.

## Field 7. Report back
Recon report, the primary + secondary link implementation, the E2E proof, migration-free + read-only proofs, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

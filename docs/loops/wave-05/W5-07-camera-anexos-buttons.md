# Loop W5-07 - Camera anexos: two primary actions + fix first-open error (Batch 1, migration-free)

GATE: none. UI + storage-wiring lane, migration-free. Reuses the W4-05 anexos infra; preserves the W4-05 zero-gallery-persistence behavior.

## Field 1. Scope and ground truth
Rework the camera attachment flow to **exactly two primary actions - Tirar foto and Transferir (download to device)**. Once a photo exists, an **Abrir** action appears. Remove any other button. **Preserve the W4-05 zero-gallery-persistence behavior.** Reproduce and fix the **error reported on first open** (check console and Sentry during recon).

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- Camera component: `apps/web/app/clinical/[id]/CameraCapture.tsx`; helpers `apps/web/lib/clinical/camera-capture.ts`.
- **Current buttons: four** - "Tirar foto" (capture during preview), "Confirmar" (attach the still), "Tentar novamente" (retake), "Cancelar" (close). **There is no "Transferir" (download) on the camera today** - download currently lives only on the attachments list below.
- `startCamera()` uses `getUserMedia({ video: { facingMode: "environment" }, audio: false })` and **catches all exceptions** (permission denied / no camera / device-in-use), returning `{ ok: false, reason: "denied" | "unsupported" }` without rethrowing; `stopStream()` calls `track.stop()` on every track (releases the camera LED) on confirm/cancel/unmount. This is the W4-05 in-page-only capture (never writes to the device gallery) - **the zero-gallery behavior to preserve**.
- Anexos infra (reuse, do not reinvent): `apps/web/lib/clinical/storage.ts` (`createAttachmentUploadUrl` signed PUT -> Supabase Storage `ATTACHMENTS_BUCKET`, tenant-scoped path `${tenantId}/${recordId}/...`; `confirmAttachment` inserts the `attachments` row + audit; `createAttachmentDownloadUrl` 60s signed GET). Signed URLs only, never public, never proxied through Next.js (CLAUDE.md rule 8).
- **RECON FIRST (report BEFORE building):** the four buttons + their handlers; **reproduce the first-open error** - open the camera on a ficha, read the browser console (and Sentry, PII-free) for the error thrown on first open; state the root cause. Common candidates: a `getUserMedia` call before user gesture, a stream started but not attached to the `<video>`, an autoplay/permissions-policy issue, or a null-ref on first mount. Do NOT guess-fix; reproduce first.

**Scope:** collapse the camera controls to **two primary actions** (Tirar foto, Transferir) with **Abrir** appearing only after a photo exists; remove the extra buttons (fold retake/confirm semantics into the two-action model, e.g. Tirar foto re-arms capture, Transferir downloads the current still to the device, Abrir opens/attaches it - final wiring per the reproduced flow); **Transferir downloads the in-page still to the device** (a deliberate user-initiated download, distinct from the silent gallery persistence W4-05 forbids); preserve zero-gallery-persistence for the capture path; **fix the reproduced first-open error**; keep the anexos upload/serve on the existing signed-URL path. pt-PT i18n (both files), no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-07-camera origin/main -b osteojp-w5-07-camera`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the four current buttons + handlers; the anexos signed-URL path; and the **reproduced first-open error** (console + Sentry, PII-free) with a stated root cause.
3. **Fix the first-open error** at its root cause (attach stream to `<video>`, gate `getUserMedia` behind the user gesture, null-guard first mount - whatever the repro shows). Add a regression test for the fixed path.
4. **Two-action model:** reduce to **Tirar foto** + **Transferir**; show **Abrir** only once a photo exists; remove all other buttons. Preserve capture -> attach via the existing `createAttachmentUploadUrl` -> `confirmAttachment` path.
5. **Transferir = device download** of the current still (user-initiated), separate from attach; the **capture path still never persists to the gallery silently** (W4-05 requirement).
6. **Stream hygiene:** `stopStream()` still releases the camera on confirm/cancel/unmount (no leaked camera).
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` (camera mocked) for: two-action UI, Abrir-appears-after-photo, first-open no longer errors, stream released.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Recon report pasted:** the four buttons, the anexos path, and the **reproduced first-open error + root cause** (console/Sentry excerpt, PII-free).
- **First-open error fixed:** a regression test proves the camera opens cleanly on first open (no thrown error). Paste it.
- **Exactly two primary actions:** the UI shows only Tirar foto + Transferir, with Abrir after a photo; e2e asserts no other button is present. Paste it.
- **Zero-gallery preserved:** state that the capture path is unchanged getUserMedia in-page (no gallery write); the stream-release test still passes. Paste it.
- **Signed-URL attach intact:** a captured photo still attaches via the existing signed-URL path and serves via signed GET. Paste it.
- **Suite counts** (baseline web 816) with green gates.

## Field 4. Verification (paste evidence)
Recon report incl. the reproduced first-open error, migration-free diff, the error-fix regression test, the two-action + Abrir e2e, the stream-release test, the signed-URL attach test, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free;** reuse the W4-05 anexos storage + `attachments` relation (no parallel backend).
- **Signed-URL storage only** (CLAUDE.md rule 8): never public, never proxied through Next.js, EU region.
- **Preserve zero-gallery-persistence** on the capture path; Transferir is an explicit user download, not silent gallery persistence.
- **PII-free Sentry** (CLAUDE.md rule 7) - never paste patient data from Sentry into the report; fingerprints only.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md`. Halt if: the first-open error's root cause sits in a shared `@osteojp/ui` primitive or a storage helper whose fix ripples beyond the camera; or the two-action model cannot express the necessary capture/attach flow without dropping a required step (surface the tradeoff, do not silently drop attach).

## Field 7. Report back
Recon report (incl. reproduced first-open error + root cause), the two-action implementation, the error fix + regression test, the stream-release + signed-URL tests, migration-free proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

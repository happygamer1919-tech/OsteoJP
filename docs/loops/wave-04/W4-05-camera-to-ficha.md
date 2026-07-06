# Loop W4-05 - Camera-to-ficha: in-page photo capture into a ficha's anexos (Rodica request, JP-approved, recon-first, migration-free)

GATE: none. UI + storage-wiring lane, migration-free. Recon-first: what "Adicionar anexo" does TODAY before building anything. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Rodica needs to attach a **photo taken in-page** to a patient's ficha (clinical record) — without the photo ever being saved to her phone's gallery. JP has **approved photos in fichas** (DECISIONS 2026-07-06 "Photos in fichas approved").

Ground truth (locked rulings to embed — GREEN runs with ZERO memory):
- **Photos in fichas are APPROVED** (DECISIONS 2026-07-06, JP). Clinical records may carry photo attachments.
- **Storage rule (CLAUDE.md rule 8):** file uploads go through **Supabase Storage signed URLs only — NEVER public**; uploads never proxy through the Next.js server. EU residency (Frankfurt).
- **The "never saved on her phone" requirement is the design driver.** A file-input camera shortcut (`<input type="file" accept="image/*" capture>`) is device-dependent and on many phones **persists the shot to the gallery** — which violates the requirement. **`getUserMedia` (in-page `<video>` → capture a frame → upload the blob)** keeps the image in the page and off the device gallery. **Prefer `getUserMedia` over the file-input shortcut** for exactly this reason.
- The attachment lands in the **ficha's anexos** (attachments) relation — recon determines the existing anexos storage backend and write path; **reuse it**, do not invent a parallel one.

**RECON FIRST (report BEFORE building, paste findings):**
- What **"Adicionar anexo"** does today: the component + route/action, the **storage backend** (is it already Supabase Storage signed-URL, or something else?), and **whether upload even works today** (if it is broken/stubbed, that is a finding that changes scope — surface it).
- Where **anexos** attach to a ficha (the relation / table, tenant-scoped), and how existing attachments are listed and signed-URL-served for viewing.

**Scope:** add **in-page camera capture** to the ficha attachment flow: `getUserMedia` opens the camera in-page, the user captures a still, the resulting image blob is uploaded via the **existing signed-URL anexos path** and attached to the ficha. **Synthetic patient only** for the build/verify. **Migration-free** unless recon PROVES the anexos relation is missing (that would be a HALT, not a silent migration).

All UI copy **pt-PT via i18n keys**, no hardcoded strings, no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-05-camera-to-ficha origin/main -b osteojp-w4-05-camera-to-ficha`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-05-camera-to-ficha`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building (paste paths):** the "Adicionar anexo" component + action, the storage backend + whether upload works today, the ficha↔anexos relation and the signed-URL serve path. State whether the existing path is reusable as-is for a captured blob.
3. **In-page camera capture (getUserMedia):** add a "Tirar foto" action that opens the camera in-page (`getUserMedia({ video: true })` → `<video>` preview → capture a frame to a `<canvas>` → export a blob, e.g. `image/jpeg` or `image/webp`). Provide capture + retake + confirm. **Stop the media stream** on confirm/cancel/unmount (release the camera). No device-gallery write.
4. **Upload + attach via the existing signed-URL path:** upload the captured blob through the reused anexos signed-URL upload (never proxied through the Next.js server) and attach it to the synthetic patient's ficha; it then lists + serves like any other anexo (signed URL, never public).
5. **Graceful fallbacks:** if `getUserMedia` is unavailable/denied (permission blocked, no camera), show a pt-PT message; do not fall back to a gallery-persisting file input silently (that would violate the requirement — if a fallback is needed, surface it as a Field 6 decision).
6. **Tests:**
   - a captured blob attaches to a **synthetic** patient's ficha anexos and appears in the anexos list, served via signed URL;
   - the media stream is stopped after capture/cancel (no leaked camera);
   - permission-denied shows the pt-PT message and does not crash.
7. **Full gates for the touched ficha views:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the capture→attach flow (camera mocked in e2e as needed).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** current "Adicionar anexo" behavior + storage backend + whether upload works today + the ficha↔anexos relation.
- **In-page capture lands in anexos:** an in-page (`getUserMedia`) captured photo attaches to a **synthetic** patient's ficha anexos and is served via signed URL (not public). Paste the test + e2e summary.
- **getUserMedia used, not a gallery-persisting file input:** state the chosen approach and why (the "never in her gallery" requirement).
- **Stream released** after capture/cancel: paste the test.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.
- **Human close-out noted (relayed, not blocking merge-gate):** the final real-device check — Rodica captures on **her actual phone**, the photo appears in the ficha, and **nothing appears in her gallery** — is relayed by Ivan and closes the loop. Record it as an AWAITING-EXTERNAL close-out item in the report.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, the capture→attach test + e2e summary, the stream-release test, the permission-denied pt-PT message test, suite counts, and the AWAITING-EXTERNAL note for Rodica's phone check.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-05-camera-to-ficha` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Reuse the existing anexos storage + relation; if it genuinely does not exist, that is a HALT (Field 6), not a silent migration. One migration may be in flight system-wide; this loop opens none.
- **Signed-URL storage only (CLAUDE.md rule 8):** never public; uploads never proxy through the Next.js server; EU region.
- **Prefer `getUserMedia`** over a file-input `capture` shortcut (the "never in her gallery" requirement). No silent gallery-persisting fallback.
- **Synthetic patient only** for build + verify (real-data go-live separately gated, owner ruling 2026-07-06). **LIVE-DATA CAUTION:** never attach to or mutate a real patient/therapist record on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **Secrets never printed** — fingerprints only if any storage credential surfaces.
- pt-PT via i18n keys, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- Recon finds the **anexos relation or the signed-URL upload path does not exist** (so attaching would need a schema change or a new storage backend) — surface the blast radius and recommend build-vs-defer; do NOT open a migration silently.
- The existing "Adicionar anexo" upload is **broken/stubbed** such that fixing it is a larger job than adding capture — surface it and recommend scope.
- `getUserMedia` **cannot meet the "never in gallery" requirement** on the target device without a fallback that DOES persist to the gallery — surface the tradeoff (do not silently pick the gallery-persisting path).
- A required change would force editing a shared `packages/ui` primitive or a storage helper whose ripple extends beyond attachments — surface it.

## Field 7. Report back
Recon report, the getUserMedia capture + signed-URL attach implementation, the capture/stream-release/permission tests, migration-free proof, e2e summary, suite counts, the AWAITING-EXTERNAL Rodica-phone close-out note, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge. A refused or blocked merge is a HALT reported to Ivan.

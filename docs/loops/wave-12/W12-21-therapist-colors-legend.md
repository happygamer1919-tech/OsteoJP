# Loop W12-21 - Therapist colors (per location) + agenda legend footer (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE + DATA. OWNER VISUAL GATE. Migration-free (consumes the W12-15(e) color storage). Color-data seed owner-gated.** Apply the stored per-location therapist colors (replacing the FNV-1a hash) to the agenda, add an always-visible per-location therapist-colour legend at the agenda footer, and seed Rodica's fixed historical color assignments. Also reconciles the carried "patient name in therapist colour" register item. Starts from **fresh `origin/main`**; never stacked.

## Preconditions (hard gate)
1. **W12-15(e) merged** (the per-location therapist-color storage + editing in the Equipa panel exist). If the color storage is not yet built, this loop HALTs (or, if the owner sequences it earlier, it carries a minimal color-storage migration itself under the W12-14 spec - but the DEFAULT is to consume W12-15(e)).

## Field 1. Scope and ground truth

Swap the agenda therapist colour from the hardcoded hash to the stored per-location colour, render a per-location legend footer, and seed Rodica's exact color list. Colour is never the ONLY cue (the name stays authoritative). Presentation + a color-data seed; migration-free.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Colours are a hardcoded FNV-1a hash today:** `apps/web/lib/scheduling/therapist-color.ts` - `THERAPIST_COLORS` (7 tokens at `-700`) indexed by `hashId(therapistId) % length` (`:53-71`); NOT stored, NOT editable, NOT per-location. Consumed by the agenda name colour (`agenda-grid.tsx:264,271`, `.text`) + the hover dot (`appointment-hover-card.tsx:51,90`, `.fill`).
- **W12-15(e) provides the storage:** a per-location therapist colour keyed by (therapist, location), editable in the merged Equipa panel. This loop CONSUMES it: the agenda reads the stored colour for the appointment's therapist + location; absent a stored colour, fall back to the existing hash (so no therapist is ever colourless).
- **Rodica's fixed historical colours (duplicates across locations ACCEPTED) - DATA to seed:**
  - **CB:** Bernardo Calmeiro green, Clinica OsteoJP purple, Isaac Fonseca orange, Jeison Oliveira yellow-green, Jp bright purple, Mafalda Toscano magenta, NESA cyan, Rita Isabel Valentim brick red, Samuel dark grey-green, Tiago Grilo blue.
  - **LVA:** Catarina Vieira black, Clinica OsteoJP LX dark green, Durbis Brito red, Externos cyan, Filipa Rocha teal, Fran wine, jp dark blue, NESA green, Nuno Martins dark brown, Pedro mustard, Rodica pink, Samuel Roux purple, Tiago Reis orange.
  These map to therapist + location rows in the color storage; the exact token/hex per named colour is resolved against the approved palette (any new hex needs token approval - see restrictions).
- **Legend footer:** an always-visible per-therapist colour legend at the agenda footer, scoped to the location's team (name + swatch); colour-not-only (the name is the authoritative cue). This is an already-registered feature.
- **Reconcile the carried "patient name in therapist colour (keep stripe+dot)" register item:** W11-00 v3 ALREADY made the agenda face a name-only list coloured in the therapist hue, and REMOVED the stripe + dot from the face (the dot now lives in the hover). So "name in therapist colour" is effectively shipped; "keep stripe+dot" is moot on the v3 face. This loop confirms the name is coloured by the STORED colour (not the hash) and does NOT re-introduce a face stripe/dot (that would re-open the name-only ruling). Record the reconciliation.

**Scope:** the agenda + hover read the stored per-location colour (hash fallback) + the legend footer + the owner-gated color-data seed of Rodica's list + tests. Migration-free (storage is W12-15(e)); the color seed is a real-prod data write, owner-gated + rehearsed on local. AA contrast must hold for the coloured name on its background.

## Field 2. Ordered steps
1. **Precondition check** (W12-15(e) merged). **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-21-colors-legend`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Consume the storage:** the agenda name colour + the hover dot read the stored (therapist, location) colour; fall back to the existing hash when absent. Update `therapist-color.ts` consumers accordingly; keep the hash as the fallback only.
3. **Legend footer:** render the per-location therapist-colour legend at the agenda footer (name + swatch), scoped to the current location's team; colour-not-only.
4. **AA check:** verify the coloured patient name meets AA on its background for every seeded colour; if a colour fails, it is stored but the on-face rendering uses an AA-safe variant (or the name keeps a neutral colour + the swatch carries the hue) - never ship a failing pairing.
5. **Seed Rodica's colours (DATA, owner-gated):** map the CB + LVA lists to (therapist, location) color rows; rehearse on local; apply to prod ONLY under the owner authorization phrase, with before/after counts. Any name that does not resolve to a real therapist/location HALTs to a Q (do not guess).
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` shows presentation + tests + any color-map doc - ZERO migration (unless the owner sequenced the storage here).

## Field 3. Definition of done (machine-verifiable)
- **Stored-colour PROOF:** an e2e/unit shows the agenda name + hover dot use the STORED (therapist, location) colour, with the hash only as fallback. Paste it.
- **Legend PROOF:** the per-location legend footer renders name+swatch for the location's team; a test asserts it is scoped to the location.
- **AA PROOF:** each seeded coloured-name pairing passes AA (or falls back to an AA-safe rendering). Paste the contrast check.
- **Seed PROOF (owner-gated):** the CB + LVA colour rows applied to prod under the owner phrase, before/after counts; unresolved names HALTed, not guessed.
- **Reconcile PROOF:** a note recording that "name in therapist colour" was shipped by W11-00 v3 + that the face stripe/dot are NOT re-introduced.
- **No-migration PROOF:** `git diff --name-only origin/main` ZERO migration (default path). 
- **Gates green.**

## Field 4. Verification (paste evidence)
The stored-colour test, the legend test, the AA contrast checks, the owner-gated seed counts, the reconciliation note, the no-migration diff, suite counts, the Preview URL (owner sees each therapist's colour + the legend), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free** (consumes W12-15(e)); the ONLY data write is the owner-gated colour seed.
- **Colour is never the only cue** - the patient name stays the authoritative identifier; the legend + AA-safe rendering back the colour.
- **Do NOT re-introduce the agenda face stripe/dot** (W11-00 v3 removed them; the name-only ruling stands); the dot stays in the hover.
- **No new hex without token approval** - map Rodica's named colours to approved palette tokens; if a required colour has no token, HALT to a Q (do not add raw hex silently). Duplicates across locations are accepted (Rodica).
- The colour seed is a REAL-PROD data write - owner-gated, rehearsed on local `127.0.0.1`, before/after counts, HALT-on-unresolved-name. Cloud is REAL DATA ONLY.
- pt-PT + en both; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR W12-15(e) is not merged (and the owner did not sequence the storage here).
- A named colour has no approved palette token - HALT to a Q (recommended default: add the token via the tokens process, then seed); do not add raw hex.
- A name in Rodica's list does not resolve to a real (therapist, location) - HALT to a Q; do not guess the mapping.
- A coloured-name pairing cannot meet AA even with a safe variant - HALT to a Q on the fallback (neutral name + swatch).

## Field 7. Report back
The stored-colour test, the legend test, the AA checks, the owner-gated seed counts, the reconciliation note, the no-migration diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-21 is OWNER VISUAL GATE (colours + legend are visual) + an owner-gated colour-data seed.** NOT `[SELF-MERGE-OK]`. Required checks + all three Vercel deploys green (checks API not banner) NECESSARY but not sufficient; GREEN pushes the Preview + per-therapist colour/legend screenshots and HALTs; the owner authorizes the colour seed + merges.
- **GATED on W12-15(e)**. Fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on a missing token / unresolved name / AA failure.

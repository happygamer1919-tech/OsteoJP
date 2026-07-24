# Loop W12-32 - Declaração de Presença location stamps (CB carimbo)

GATE: **Wave 12, OWNER VISUAL GATE.** Owner supplied the two carimbo assets (2026-07-23). Fills the Castelo Branco stamp slot left open by W9-03 and refreshes the Linda-a-Velha stamp with the owner's official carimbo. No migration, frontend/asset only.

## Field 1. Scope and ground truth
Owner: "two image assets (CB stamp, LVA stamp+signature) placed in the repo; wire the location-appropriate stamp: CB declarations get the CB stamp, LVA declarations get the LVA stamp. Resize for print only, never alter content. Visual assertion: correct stamp per location, absence of the other, no stamp outside the declaracao."

Ground truth (re-verified):
- W9-03 already built the per-location carimbo plumbing: `resolveStampLocationKey` -> `signatureStampBytesForLocation(key)` keyed by `normalizeLocationKey` (`castelo-branco`, `linda-a-velha`). The CB slot was `null` (blank area) - that is how the CB "erro grave" (LV stamp on a CB declaration, QA item 2) was neutralised.
- The stamp renders in the carimbo/signature area of `declaracao-pdf.ts` (bottom, above the responsável line), auto-scaled to `maxW=300` preserving aspect - so any asset aspect renders without layout break. There is NO separate address block in the OsteoJP render (unlike the Fisiozero template); the carimbo sits in the signature zone.
- The stamp asset is imported ONLY by `declaracao-model.ts` - structurally guaranteeing "no stamp on any surface outside the declaracao".

Owner assets (do NOT swap): `stamp_signed.png` = LVA (1210x402, JP signature), `stamp.png` = CB (962x476). Both present -> both ship live (no CB HALT).

## Field 2. Ordered steps
1. Copy `stamp.png` -> `assets/signature-stamp-castelo-branco.png`; `stamp_signed.png` -> `assets/signature-stamp-linda-a-velha.png` (refresh).
2. Regenerate `signature-stamp-asset.ts`: add `SIGNATURE_STAMP_CASTELO_BRANCO_PNG_BASE64`, refresh the LVA blob, wire `"castelo-branco"` to the CB blob (was `null`).
3. Update `declaracao-model.test.ts`: CB now embeds ITS carimbo (non-null), CB bytes != LV bytes, unknown/empty/null -> blank. Keep the tenant stamp-off switch + LV no-regression.

## Field 3. Definition of done (machine-verifiable)
- `signatureStampBytesForLocation("castelo-branco")` non-null + distinct from `"linda-a-velha"`; unknown/empty/null -> null.
- `buildDeclaracaoModel` with the CB key embeds CB bytes (not LV); tenant `signatureStamp:false` still blanks it.
- The stamp asset has ONE importer (`declaracao-model.ts`) - no stamp leaks to any other surface.
- Gates green.

## Field 4. Verification (owner visual gate on preview)
Generate a CB declaration (CB marcação) -> CB carimbo; an LVA declaration (LVA marcação) -> LVA carimbo; confirm neither shows the other's stamp, and no stamp appears outside the Declaração.

## Field 5. Restrictions
- Never alter stamp content; resize for print only (the renderer auto-scales).
- Do NOT fall back to another location's stamp; a missing slot stays blank.
- Frontend/asset only, no migration, no workflow files.

## Field 6. Halt loud if
- Only one asset were supplied: ship the present one, HALT the empty slot with the exact target filename/path. (N/A here - both supplied.)

## Field 7. Report back
The asset paths, the per-location test proof, the preview URL + CB/LVA role steps, PR number.

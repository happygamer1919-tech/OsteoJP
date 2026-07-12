# Loop W5-33 - Final consent texts (Wave 05 Ficha Final 2)

GATE: **Wave 05 Ficha Final 2 (FF2).** Replaces every `PENDENTE-JP` consent placeholder with the final owner-delegated texts (verbatim, no rewording) and removes the Q-W5-3 placeholder markers. **Migration-free, template-free** (i18n / consent-copy change). Starts from **fresh `origin/main`**; never stacked. **Zero em dashes or en dashes anywhere.**

## Field 1. Scope and ground truth

Replace every `PENDENTE-JP` consent/RGPD placeholder with the FINAL texts below, **verbatim, no rewording by any agent**. pt-PT is authoritative; author **faithful en-GB translations** (application work). Remove the `Q-W5-3` placeholder markers. Consent wording is owner-delegated (DECISIONS 2026-07-12) with JP's one-time read-through before real-patient use.

Ground truth (recon at authoring 2026-07-12, embed - executor runs with ZERO memory):
- **Placeholder sites (recon-confirmed at authoring, `PENDENTE-JP` present):** `apps/web/lib/clinical/consent.ts` (+ `consent.test.ts`), `apps/web/app/clinical/[id]/SignatureConsent.tsx` (+ `SignatureConsent.test.tsx`), `apps/web/app/clinical/[id]/actions.ts`, `apps/web/lib/clinical/rgpd/rgpd-model.ts`, `apps/web/lib/clinical/rgpd/rgpd-pdf.ts`, `apps/web/lib/clinical/rgpd/generate.ts`, and `packages/i18n/src/strings.pt.json` + `strings.en.json`. Recon-sweep for ALL `PENDENTE-JP` occurrences before editing so none is missed.
- **Recording consent step:** `apps/web/app/consultation/StartConsultation.tsx` (keys `consultation.consentLabel`, `consultation.consentRequired`) - the Iniciar consulta flow's recording consent (TEXT 3).
- **Three placements:**
  - **TEXT 1 -> the ficha Consinto block** (treatment consent).
  - **TEXT 2 -> the RGPD consent block AND the RGPD PDF** (`rgpd-model.ts` / `rgpd-pdf.ts`).
  - **TEXT 3 -> the recording consent step of the Iniciar consulta flow** (`StartConsultation.tsx`).
- **Verbatim; no rewording.** Copy the pt-PT below character-for-character. Author faithful en-GB translations for the paired `strings.en.json` keys (translation is the only authored copy; keep it faithful, plain, zero em/en dashes).
- **Remove Q-W5-3 markers** (the placeholder markers flagging the pending pick); the texts are now final. Keep the i18n KEY names; only the VALUES change from placeholder to final.
- **Twelve AI keys untouched;** W5-13 `ficha-medica-compat.test.ts` stays green. No migration, no template change (consent copy is not a template field).

### FINAL TEXTS (verbatim, pt-PT authoritative, no rewording)

TEXT 1 - Consinto block (ficha, treatment consent):
```
Declaro que fui informado/a, de forma clara e compreensivel, sobre a natureza, os objetivos e os possiveis efeitos do tratamento proposto, tendo tido oportunidade de colocar questoes e de obter resposta as mesmas. Consinto, de forma livre e esclarecida, a realizacao do tratamento proposto. Posso retirar este consentimento a qualquer momento, sem necessidade de justificacao e sem prejuizo dos cuidados que me venham a ser prestados.
```

TEXT 2 - RGPD block and RGPD PDF:
```
Nos termos do Regulamento Geral sobre a Protecao de Dados (Regulamento (UE) 2016/679) e da Lei n. 58/2019, autorizo o tratamento dos meus dados pessoais e de saude por esta clinica, com a finalidade exclusiva de prestacao de cuidados de saude, gestao clinica e administrativa e cumprimento de obrigacoes legais. Os meus dados sao conservados pelo periodo legalmente exigido para registos clinicos e nao sao partilhados com terceiros, salvo obrigacao legal ou servicos estritamente necessarios a prestacao de cuidados. Posso exercer, a qualquer momento, os direitos de acesso, retificacao, apagamento (nos limites legais aplicaveis aos registos de saude), limitacao e oposicao, contactando a clinica.
```

TEXT 3 - recording and AI analysis consent (Iniciar consulta flow):
```
Autorizo a gravacao de audio desta consulta e o seu processamento por sistemas de inteligencia artificial, com a finalidade exclusiva de apoiar a elaboracao do meu registo clinico. A gravacao e processada de forma segura no Espaco Economico Europeu e e eliminada automaticamente apos o processamento. O conteudo resultante e sempre revisto e validado pelo profissional de saude antes de integrar o meu processo clinico. Este consentimento e facultativo: a recusa nao afeta, de forma alguma, a prestacao dos cuidados de saude. Posso retirar este consentimento a qualquer momento.
```

> Note on accents: the verbatim pt-PT above is recorded in plain ASCII as delivered by the owner. The executor renders it with the correct pt-PT diacritics in the app copy (e.g. "compreensivel" -> "compreensível", "saude" -> "saúde") WITHOUT changing wording, matching how the existing pt strings carry accents. This is orthographic rendering, not rewording. Never introduce an em dash or en dash.

**Scope:** replace all `PENDENTE-JP` consent placeholders with TEXT 1/2/3 at their three placements (verbatim pt-PT + faithful en-GB), remove the Q-W5-3 markers, keep i18n keys + template + twelve AI keys frozen. Migration-free, template-free. Zero em/en dashes.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w5-33-consent-texts-final origin/main -b osteojp-w5-33-consent-texts-final`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** grep every `PENDENTE-JP` occurrence + every Q-W5-3 marker; map each to TEXT 1/2/3 (ficha Consinto / RGPD block + PDF / recording step). Paste the site list.
3. **Replace (verbatim):** TEXT 1 -> Consinto block; TEXT 2 -> RGPD block + RGPD PDF; TEXT 3 -> recording consent step. pt-PT verbatim (correct diacritics, no rewording); author faithful en-GB translations for the paired en keys. Remove Q-W5-3 markers. Keys unchanged.
4. **Sweep:** assert ZERO `PENDENTE-JP` and ZERO Q-W5-3 markers remain in code/i18n; assert ZERO em/en dashes in the changed copy.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. `consent.test.ts`, `SignatureConsent.test.tsx`, W5-13 compat), `pnpm build`, `pnpm test:e2e` (the ficha Consinto shows TEXT 1; the RGPD block + generated RGPD PDF show TEXT 2; the Iniciar consulta recording step shows TEXT 3).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free + template-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`, and no `osteopathy-*.json` edit. Paste it.
- **No-placeholder PROOF:** `grep -rn "PENDENTE-JP" apps packages` returns ZERO matches; the Q-W5-3 markers are removed. Paste both greps.
- **Verbatim PROOF:** an assertion that the rendered pt-PT of TEXT 1/2/3 matches the owner text word-for-word (diacritics aside), no rewording. Paste it.
- **Placement PROOF:** E2E/DOM asserting TEXT 1 in the ficha Consinto block, TEXT 2 in the RGPD block AND the RGPD PDF, TEXT 3 in the recording consent step. Paste it.
- **Zero-dash PROOF:** `grep -rn` for the em dash and en dash characters across the changed files returns ZERO. Paste it.
- **i18n parity PROOF:** both `strings.pt.json` + `strings.en.json` parse and carry the paired final values (pt authoritative, en faithful). Paste it.
- **W5-13 compat GREEN.** Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon site list, the migration-free/template-free diff, the zero-PENDENTE-JP + zero-Q-W5-3 greps, the verbatim proof, the three-placement E2E, the zero-dash grep, the i18n parity proof, passing W5-13 compat, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Verbatim, no rewording** of the pt-PT texts by ANY agent - only orthographic diacritics + faithful en-GB translation are authored. Do NOT paraphrase, shorten, or "improve" the legal wording.
- **Zero em dashes or en dashes anywhere** in the consent copy (pt or en).
- **Remove the Q-W5-3 placeholder markers;** the texts are final (owner-delegated, DECISIONS 2026-07-12, JP one-time read-through before real-patient use).
- **Keys + template + twelve AI keys frozen;** W5-13 compat stays green. Migration-free, template-free.
- pt-PT authoritative, en-GB faithful, no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- A `PENDENTE-JP` site does not map cleanly to TEXT 1/2/3 (an ambiguous or extra placeholder) - surface it to `docs/design/QUESTIONS.md`; do not guess which text belongs.
- Replacing a placeholder would require a template/schema change (consent copy should be i18n/consent-module copy, not a template field) - surface it.
- The owner's verbatim text cannot be represented without an em/en dash or without changing wording - it can (the texts use none); if a tool inserts one, fix it, never ship it.

## Field 7. Report back
Recon site list, the migration-free/template-free diff, the zero-PENDENTE-JP + zero-Q-W5-3 greps, the verbatim proof, the three-placement E2E, the zero-dash grep, the i18n parity proof, passing W5-13 compat, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12):** GREEN self-merge permitted once ALL required checks are green AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green. The cross-browser E2E lane is non-required and is ignored, never waited on. Live-apply verification evidence (W5-27 seed, W5-30 migration 0035) must be pasted in the loop report before merge regardless (not applicable to this copy-only loop, which has no live-DB step). Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.

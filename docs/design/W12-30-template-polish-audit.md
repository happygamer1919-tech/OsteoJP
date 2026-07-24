# W12-30 — Template-polish audit (LIST ONLY)

> Deliverable for loop **W12-30 (template polish, scope-first, owner visual gate)**.
> This document is an **inventory + ranked polish list only**. No template was
> edited in this branch. Every item is tagged **[PRESENTATION-ONLY]** or
> **[LEGAL/FISCAL-WORDING -> OUT OF SCOPE]**. Legal/fiscal wording items are
> flagged, never proposed (JP/owner only, per the loop spec Field 5 and the
> repo CLAUDE.md owner-gate on invoicing/fiscal).

## Standard audited against

- **Print-branding rule** (CLAUDE.md, Brand section): every report, declaration,
  and invoice must carry **logo + location contacts + fiscal info**.
- **Brand tokens** (`docs/brand-tokens.md`): teal `#45B9A7`, magenta `#8B1863`,
  grey-blue `#98B2C2`. Magenta is an accent used **sparingly, never a dominant
  surface color**; grey-blue is the wordmark/chrome color; teal is the primary
  accent. Print/document face is **Source Serif 4**; UI face is **Inter**.
- **Brand voice** (`docs/brand-voice.md`): serious, precise, no emoji, formal
  "voce" register, pt-PT (not pt-BR). Email opens "Caro(a) [Nome]," and signs
  off as the clinic with contacts (section 6.7).
- **pt-PT correctness + diacritics.** SMS is intentionally accent-free (GSM-7).

## Template surface inventory

| Surface | Live? | Render path | Logo | Contacts | Fiscal |
|---|---|---|---|---|---|
| Clinical report PDF | yes | `apps/web/lib/clinical/report/pdf.ts` | drawn stand-in | yes | yes (name + NIF) |
| RGPD consent PDF | yes | `apps/web/lib/clinical/rgpd/rgpd-pdf.ts` | drawn stand-in | yes | yes (name + NIF) |
| Declaracao de Presenca PDF | yes | `apps/web/lib/clinical/declaracao/declaracao-pdf.ts` | real raster | **no** | **no** |
| Appointment emails (48h/24h/confirmation/follow-up/no-show) | yes | `apps/web/lib/reminders/templates.ts` (plaintext) | n/a (text) | partial | no |
| Appointment SMS (all kinds) | yes | `apps/web/lib/reminders/templates.ts` (GSM-7) | n/a | partial | no |
| Staff-invite email | yes | `apps/web/lib/invites/email.ts` (plaintext, staff-facing) | n/a | no | no |
| Invoice (fatura-recibo) | **no in-repo renderer** | InvoiceXpress (external API) `apps/web/lib/integrations/invoicexpress/*` | external | external | external |
| Declaracao de Tratamento | **no code renderer** | design reference only (`docs/pdf-templates/declaration-tratamento.html`) | n/a | n/a | n/a |
| Reference design templates | not live | `docs/pdf-templates/*.html`, `*.pdf` | design intent | design intent | design intent |

Notes on scope:
- The three **pdf-lib** renderers are the only live printed documents in the repo.
  The report and RGPD share near-identical header/location code; the Declaracao
  uses a separate, simpler layout.
- **Emails are sent as plaintext** (`text: msg.body` via Resend, confirmed in
  `reminders/clients.ts` and `invites/email.ts`). There is no HTML email
  template to style; email polish is copy/register only.
- **Invoices are issued by InvoiceXpress**, not rendered in-repo. The invoice
  branding + fiscal content live in InvoiceXpress config, not in this codebase.
  The `docs/pdf-templates/invoice-fatura-recibo.html` is a Phase-4 design
  reference (per its README, "Ivan to wire into InvoiceXpress").
- Observation for the whole set: the **reference HTML templates already encode
  the correct brand system** (Source Serif 4, full token palette, teal header
  rule), i.e. the shipped pdf-lib renderers lag their own design reference.

---

## Group A — Clinical report PDF (`apps/web/lib/clinical/report/pdf.ts`)

- **A1 — [HIGH] [PRESENTATION-ONLY].** Header draws a stand-in mark (teal square +
  magenta bar + Helvetica "OsteoJP" wordmark, lines 129-138) instead of the real
  embedded logo the Declaracao already ships. Inconsistent brand identity across
  the three printed documents.
  *Fix:* embed the real logo via `clinicLogoBytes()` / `doc.embedJpg(...)` in the
  header, matching `declaracao-pdf.ts`.

- **A2 — [MED] [PRESENTATION-ONLY].** The drawn "OsteoJP" wordmark is rendered in
  magenta `#8B1863` (line 137). Brand token for the wordmark is grey-blue
  `#98B2C2`; magenta is an accent, not a wordmark color.
  *Fix:* recolor the wordmark to grey-blue `#98B2C2` (moot if A1 replaces the
  drawn mark with the raster).

- **A3 — [MED] [PRESENTATION-ONLY].** Every section heading (Patient, Record,
  Signature) is magenta (lines 204, 211, 227). Repeating the accent as the
  standing heading color contradicts "magenta sparingly, never dominant".
  *Fix:* set section headings to ink/grey-blue and reserve magenta for one accent
  (e.g. the header rule).

- **A4 — [MED] [PRESENTATION-ONLY].** Body/heading font is Helvetica (pdf-lib
  `StandardFonts`, lines 191-192). Brand print face is Source Serif 4.
  *Fix:* embed Source Serif 4 (via `@pdf-lib/fontkit`) for document text.
  *Tradeoff:* larger function bundle + font subsetting; this is the heaviest item
  in the set and can be deferred to its own pass. Applies equally to B and C.

- **A5 — [LOW] [PRESENTATION-ONLY].** Hairline rules use an ad-hoc grey
  `rgb(0.85, 0.85, 0.85)` (line 120) rather than a brand neutral.
  *Fix:* map rule/hairline color to `neutral-200` `#E2E8EE`.

## Group B — RGPD consent PDF (`apps/web/lib/clinical/rgpd/rgpd-pdf.ts`)

The RGPD form shares the report's header/location code, so it carries the same
issues. Fixing A1-A4 in a shared helper fixes these too.

- **B1 — [HIGH] [PRESENTATION-ONLY].** Same drawn stand-in mark as A1 (lines
  116-124). *Fix:* embed the real raster logo.
- **B2 — [MED] [PRESENTATION-ONLY].** Magenta wordmark + magenta consent/section
  headings (lines 124, 171, 207, 222). *Fix:* same recolor as A2/A3.
- **B3 — [MED] [PRESENTATION-ONLY].** Helvetica, not Source Serif 4 (same as A4).

## Group C — Declaracao de Presenca PDF (`apps/web/lib/clinical/declaracao/declaracao-pdf.ts`)

- **C1 — [HIGH] [PRESENTATION-ONLY].** **Print-branding-rule gap.** The
  declaration carries logo + responsavel + localidade only. It has **no
  location-contacts block and no clinic fiscal identification**, which the rule
  requires on every declaration and which the report and RGPD already render.
  *Fix:* add a branded contacts + fiscal footer, reusing the existing
  `resolveLocationContact()` (`report/location-contacts.ts`) and
  `resolveClinicFiscal()` (`report/clinic-fiscal.ts`) data sources, matching the
  report/RGPD chrome.
  *Boundary:* the declaration **body** (`declaracaoParagraph1` /
  `DECLARACAO_PARAGRAPH_2`) is verbatim Fisiozero legal wording. Do NOT touch it;
  only add the surrounding branded block. The fiscal name/NIF values themselves
  are owner-gated placeholders (see F1/F2).

- **C2 — [MED] [PRESENTATION-ONLY].** The declaration is a different visual system
  from the report/RGPD (centered layout, real logo, no header rule/fiscal). Once
  C1 lands, align the header/footer chrome so all three documents read as one
  family. *Fix:* extract a shared header/footer helper for the three renderers.

- **C3 — [LOW] [PRESENTATION-ONLY].** Helvetica, not Source Serif 4 (same as A4).
  The declaration is the most formal document of the set, so it benefits most
  from the serif print face.

- **C4 — [LOW] [PRESENTATION-ONLY].** The logo is embedded as JPG
  (`doc.embedJpg`, line 79); JPG cannot carry transparency, so a non-white logo
  background would print as a box on the page.
  *Fix:* confirm the asset sits on white, or migrate to a transparent PNG lockup.

## Group D — Appointment emails (`apps/web/lib/reminders/templates.ts`, plaintext)

- **D1 — [MED] [PRESENTATION-ONLY].** PT emails open "Ola {{patient_first_name}},"
  (e.g. lines 59, 85, 258). Brand-voice section 6.7 documents the formal open
  "Caro(a) [Nome],". EN already uses "Dear".
  *Fix:* change the PT open to "Caro(a) {{patient_first_name}},".

- **D2 — [MED] [PRESENTATION-ONLY].** Sign-off is bare "-- OsteoJP" on every
  email. Brand-voice section 6.7 wants the clinic sign-off with location +
  contacts ("OsteoJP -- Clinica de [localidade]" + phone). The data is already in
  `ReminderContext` (`clinicLocation`, `clinicPhone`).
  *Fix:* extend the sign-off with clinic location + phone.
  *Note:* these are transactional plaintext emails, not reports/declarations/
  invoices, so the logo/fiscal print-rule does not apply; this is voice-guide
  alignment only.

- **D3 — [LOW] [PRESENTATION-ONLY].** The confirmation email uses space-padded
  label alignment ("  Data:      {{...}}", lines 262-264, 277-279) that only
  aligns in a monospace font and renders ragged in proportional mail clients.
  *Fix:* drop the padded alignment; use plain "Label: value" lines.

- **D4 — [LOW] [PRESENTATION-ONLY].** Em-dash characters in email subjects and
  sign-off vs plain hyphens in SMS. The loop guidance (Field 5) calls for plain
  hyphens, while brand-voice examples currently show em-dashes.
  *Fix (needs owner ruling):* standardize the house style on a plain hyphen
  across email + SMS, and reconcile brand-voice to match.

## Group E — Appointment SMS (`apps/web/lib/reminders/templates.ts`, SMS section)

- **E1 — [LOW] [PRESENTATION-ONLY] — NO ACTION (documented so it is not "fixed" by
  mistake).** SMS copy is intentionally accent-free GSM-7 ("amanha", "Marcacao",
  "as", "nao", "proxima"). This is correct and enforced by `assertSmsCompliant`.
  Adding diacritics would force UCS-2 and break the single-segment guarantee. Do
  not change.

## Group F — Owner-gated data surfaced by the audit (flag only, not polish)

These are **[LEGAL/FISCAL-WORDING -> OUT OF SCOPE]**. They degrade the printed
output today but are owner/JP decisions; do not invent values.

- **F1 — [HIGH] [OUT OF SCOPE].** Clinic fiscal identity is a placeholder:
  `FISCAL_NAME_PLACEHOLDER = "OsteoJP (nome fiscal por confirmar)"` and
  `FISCAL_NIF_PLACEHOLDER = "000000000"` (`report/clinic-fiscal.ts`). This prints
  on the report/RGPD header now, and would print on the Declaracao once C1 lands.
  Owner must supply the registered fiscal name + NIF.

- **F2 — [MED] [OUT OF SCOPE].** Primary clinic email is a placeholder
  `osteojp.geral@gmail.com` (BUG-13, `report/location-contacts.ts`). Owner to
  confirm the exact address.

- **F3 — [N/A] [OUT OF SCOPE].** Live invoices are issued by InvoiceXpress
  (external); their fiscal content (0% IVA exemption art. 9.o CIVA, ATCUD, SAF-T)
  is legal/fiscal and configured outside this repo. The in-repo
  `invoice-fatura-recibo.html` is a design reference only. No in-repo invoice
  presentation to polish.

- **F4 — [N/A] [OUT OF SCOPE].** The Declaracao body is verbatim Fisiozero legal
  wording (`declaracao-pdf.ts` constants). Do not edit.

## Group G — Reference design templates (`docs/pdf-templates/`, not live)

- **G1 — [LOW] [PRESENTATION-ONLY] — reference, no edit needed.** The reference
  HTML/PDF templates already encode the correct brand system (Source Serif 4,
  full token palette, teal header rule). Use them as the **visual target** when
  applying A1-A4 / C1-C3, rather than editing the references themselves.

- **G2 — [LOW] [PRESENTATION-ONLY].** The reference invoice HTML loads Google
  Fonts over the network (`fonts.googleapis.com`). If these templates are ever
  wired to a live Puppeteer path, the font must be self-hosted/embedded for an
  EU-residency, offline-safe pipeline. Not live today; flag only.

---

## Item count by priority

| Priority | Presentation-only | Out-of-scope flags | Total |
|---|---|---|---|
| High | A1, B1, C1 (3) | F1 (1) | 4 |
| Med | A2, A3, A4, B2, B3, C2, D1, D2 (8) | F2 (1) | 9 |
| Low | A5, C3, C4, D3, D4, E1, G1, G2 (8) | — | 8 |
| N/A | — | F3, F4 (2) | 2 |

Presentation-only actionable items: **19** (High 3, Med 8, Low 8). Out-of-scope
flags: **4** (F1-F4).

---

## Recommended first-pass scope pick (owner chooses)

Top presentation-only items, no legal/fiscal wording impact, highest brand
payoff first. The owner can pick any subset.

1. **Real logo on all printed documents (A1 + B1).** Replace the drawn stand-in
   mark in the clinical report AND RGPD PDFs with the real embedded logo raster
   the Declaracao already uses. One brand identity across every printed document.
   *[HIGH, presentation-only, low effort — the asset and embed path already exist.]*

2. **Bring the Declaracao up to the print-branding rule (C1).** Add the branded
   location-contacts + fiscal-identity footer, reusing the report's existing data
   sources. Structure only; the legal body is untouched.
   *[HIGH, presentation-only. Note: the fiscal values are the F1/F2 owner
   placeholders, so the block reads fully "real" only once the owner supplies
   them; the layout can ship now with the placeholders visible.]*

3. **Restrain the magenta (A3 + B2).** Move the repeated section headings off
   magenta to ink/grey-blue and reserve the accent. Brings the documents in line
   with the "sparingly" token rule.
   *[MED, presentation-only, low effort.]*

4. **Email register + sign-off (D1 + D2).** PT open "Caro(a) ..." and a clinic
   sign-off with location + phone, per brand-voice 6.7.
   *[MED, presentation-only, low effort, copy-only.]*

5. **Small cleanups (A5 + D3).** Brand-token hairline color on the report rules;
   drop the monospace label padding in the confirmation email.
   *[LOW, presentation-only, trivial.]*

Deferred / needs a decision, not recommended for the first pass:
- **Source Serif 4 embedding (A4 / B3 / C3)** is the correct brand typography but
  carries a bundle-size + font-subsetting cost. Best as its own typography pass.
- **Hyphen vs em-dash house style (D4)** needs an owner ruling (loop guidance says
  plain hyphen; brand-voice currently shows em-dashes).
- **F1-F4** are owner/JP legal-fiscal decisions, not polish.

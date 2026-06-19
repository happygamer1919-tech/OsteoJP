# PDF Templates — Rendering Spec

> **Owner:** Ivan (PDF rendering wiring)
> **Templates:** `invoice-fatura-recibo.html`, `declaration-presenca.html`, `declaration-tratamento.html`, `clinical-report.html`
> **Status:** HTML layouts complete, awaiting wire-up to PDF renderer.

---

## Rendering approach

Use **Puppeteer** (headless Chrome) or a React → PDF library (e.g. `@react-pdf/renderer`).

These HTML templates target **Puppeteer's `page.pdf()`** with the following options:

```ts
// invoice-fatura-recibo.html
await page.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
});

// declaration-presenca.html, declaration-tratamento.html
await page.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '25mm', right: '25mm', bottom: '25mm', left: '25mm' },
});

// clinical-report.html
// Top margin must be enlarged to accommodate the fixed page header (~28mm header height)
await page.pdf({
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: false, // page header/footer handled via position:fixed CSS
  margin: { top: '48mm', right: '20mm', bottom: '20mm', left: '20mm' },
});
```

**Google Fonts note:** Puppeteer loads external resources by default. Ensure the render environment has internet access, or bundle the WOFF2 files (see Font loading section below).

---

## Placeholder index

All `{{double_brace}}` placeholders across the four templates:

| Placeholder | Template(s) | Type | Source |
|---|---|---|---|
| `{{location_name}}` | all | string | `locations.name` |
| `{{location_address}}` | all | string | `locations.address_line1` |
| `{{location_postal}}` | all | string | `locations.postal_code` |
| `{{location_city}}` | all | string | `locations.city` |
| `{{location_phone}}` | all | string | `locations.phone_primary` |
| `{{location_email}}` | all | string | `locations.email` |
| `{{invoice_number}}` | invoice | string | `invoices.number` (format: `FR AAAA/NNNN`) |
| `{{issue_date}}` | invoice | date | `invoices.issued_at` (formatted `DD/MM/AAAA`) |
| `{{due_date}}` | invoice | date | `invoices.due_date` — same as `issue_date` for fatura-recibo |
| `{{status}}` | invoice | string | `invoices.status` → `'PAGA'` or `'PENDENTE'` |
| `{{patient_name}}` | all | string | `patients.full_name` |
| `{{patient_nif}}` | all | string | `patients.nif` |
| `{{patient_address}}` | invoice | string | `patients.address` (full formatted address) |
| `{{patient_dob}}` | clinical-report | date | `patients.date_of_birth` (formatted `DD/MM/AAAA`) |
| `{{line_items}}` | invoice | array/HTML | Rendered by template engine; see Line items rendering below |
| `{{subtotal}}` | invoice | money | Computed sum of line items, formatted `0,00 €` |
| `{{total}}` | invoice | money | Same as `subtotal` while IVA = 0%; formatted `0,00 €` |
| `{{payment_method}}` | invoice | string | `invoices.payment_method` (e.g. `Multibanco`, `MBWay`, `Numerário`) |
| `{{payment_reference}}` | invoice | string | `invoices.payment_reference` — conditional; see below |
| `{{notes}}` | invoice | string | `invoices.notes` — conditional; see below |
| `{{appointment_date}}` | declaration-presenca | date | `appointments.date` (formatted `DD/MM/AAAA`) |
| `{{appointment_time}}` | declaration-presenca | string | `appointments.start_time` (formatted `HH:MM`) |
| `{{service_name}}` | declaration-presenca, declaration-tratamento | string | `services.name` |
| `{{practitioner_name}}` | all | string | `users.full_name` (therapist) |
| `{{practitioner_title}}` | clinical-report | string | `users.professional_title` |
| `{{signature_date}}` | declaration-presenca, declaration-tratamento | date | Current date at time of generation, formatted `DD de mês de AAAA` |
| `{{session_count}}` | declaration-tratamento | integer | Count of sessions in the treatment plan |
| `{{treatment_start_date}}` | declaration-tratamento | date | First session date, formatted `DD/MM/AAAA` |
| `{{treatment_end_date}}` | declaration-tratamento | date | Last session date, formatted `DD/MM/AAAA` |
| `{{diagnosis_or_reason}}` | declaration-tratamento | string | `episodes.diagnosis` or `episodes.reason` — conditional; see below |
| `{{diagnosis_display}}` | declaration-tratamento | string | Computed: `'block'` if `diagnosis_or_reason` non-empty, else `'none'` |
| `{{episode_id}}` | clinical-report | string | `episodes.id` or human-readable reference |
| `{{consultation_date}}` | clinical-report | date | `consultations.date` (formatted `DD/MM/AAAA`) |
| `{{consultation_reason}}` | clinical-report | string | `consultations.reason` |
| `{{background}}` | clinical-report | string | `consultations.background` |
| `{{main_complaints}}` | clinical-report | string | `consultations.main_complaints` |
| `{{diagnosis}}` | clinical-report | string | `consultations.diagnosis` |
| `{{treatment_goals}}` | clinical-report | string | `consultations.treatment_goals` |
| `{{treatment_plan}}` | clinical-report | string | `consultations.treatment_plan` |
| `{{observations}}` | clinical-report | string | `consultations.observations` |
| `{{locked_at}}` | clinical-report | date | `consultations.locked_at` (formatted `DD/MM/AAAA HH:MM`) |
| `{{page_number}}` | clinical-report | integer | Current page number — inject via Puppeteer `footerTemplate` or template engine |
| `{{total_pages}}` | clinical-report | integer | Total page count — inject via Puppeteer `footerTemplate` or template engine |

### Line items rendering (`{{line_items}}` in invoice)

The `{{line_items}}` placeholder should be replaced with one `<tr>` per invoice line, using this structure:

```html
<tr>
  <td>Consulta de osteopatia</td>
  <td>01/06/2026</td>
  <td class="right">1</td>
  <td class="right">50,00 €</td>
  <td class="right">50,00 €</td>
</tr>
```

Money values must be formatted in Portuguese locale: comma decimal separator, Euro symbol after the number, e.g. `50,00 €`.

---

## Conditional fields

| Field | Condition | Behaviour |
|---|---|---|
| `{{payment_reference}}` (invoice) | Omit entire `<div class="payment-block__row">` if `payment_reference` is null or empty | Applies when payment method has no reference (e.g. cash) |
| `{{notes}}` (invoice) | Omit entire `<div class="notes-block">` if `notes` is null or empty | |
| `{{diagnosis_or_reason}}` (declaration-tratamento) | Omit `.diagnosis-block` element if `diagnosis_or_reason` is null or empty | Set `{{diagnosis_display}}` to `'none'` as CSS fallback, or conditionally exclude the element in the template engine |

---

## JP-gated items — do NOT implement yet

The following features are reserved for future owner decision. HTML comments mark the relevant positions in the templates.

| Item | Template | Comment anchor | Notes |
|---|---|---|---|
| **Discount line** | `invoice-fatura-recibo.html` | `<!-- JP-GATED TODO: discount line -->` | Requires `discount_label` + `discount_amount` fields and business rules for when discounts apply |
| **IVA rate override** | `invoice-fatura-recibo.html` | `<!-- JP-GATED TODO: IVA rate override -->` | Currently always 0% (art. 9.º n.º 1 CIVA). If services ever become VAT-taxable, a configurable IVA rate must be wired here |
| **Protocolo / convenção label** | `invoice-fatura-recibo.html` | `<!-- JP-GATED TODO: protocolo/convenção label -->` | For insurers or employer agreements; requires `protocol_name` field |

---

## Location routing

Each document carries location-specific contact data via `{{location_name}}`, `{{location_address}}`, `{{location_postal}}`, `{{location_city}}`, `{{location_phone}}`, and `{{location_email}}`.

The caller must inject the correct row from the `locations` table based on the appointment or session being documented. Do not hardcode location data in the templates — the HTML fiscal footer contains static fallback text for the two confirmed locations only (see Montemor-o-Novo TODO below).

Current confirmed locations:

| Location | Address | Postal | City | Phone | Email |
|---|---|---|---|---|---|
| OsteoJP Linda-a-Velha | Praça Central Plaza, n.º 1 – A | 2795-246 | Linda-a-Velha | 969 472 111 / 214 191 988 | clinica.osteojp@gmail.com |
| OsteoJP Castelo Branco | R. Fernando Namora, n.º 6 | 6000-140 | Castelo Branco | 969 877 553 / 272 328 221 | geral.castelobranco@osteojp.pt |
| OsteoJP Montemor-o-Novo | pending (BUG-13) | pending | Montemor-o-Novo | pending | pending |

---

## Montemor-o-Novo TODO

The fiscal footer in all four templates contains an HTML comment placeholder for Montemor-o-Novo:

```html
<!-- TODO (BUG-13): Montemor-o-Novo address, phone and email pending owner confirmation — update once confirmed -->
<!-- <p><strong>Montemor-o-Novo:</strong> [endereço pendente] · Tel: [pendente] · [email pendente]</p> -->
```

Once the owner confirms the address, phone, and email (tracked in BUG-13 / `docs/architecture.md` open item 7), uncomment and populate the `<p>` tag in all four templates.

---

## Logo placeholder

All four templates contain a teal-bordered box rendering `[LOGO: OsteoJP]` in place of the brand mark:

```html
<!-- TODO: replace this placeholder with the actual OsteoJP SVG logo once the vector asset is available -->
<div class="header__logo">[LOGO: OsteoJP]</div>
```

Once the vector asset is available, replace the `<div>` with an `<img src="..." alt="OsteoJP">` or inline SVG. The placeholder box is sized at 56pt × 40pt; the real logo should fit within those dimensions or the surrounding flex layout will accommodate it.

---

## Font loading

All templates import **Source Serif 4** from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..900;1,8..60,300..900&display=swap" rel="stylesheet" />
```

**Self-hosted / air-gapped environments:** Download the WOFF2 files from Google Fonts, host them under `/public/fonts/`, and replace the `<link>` tag with a local `@font-face` declaration:

```css
@font-face {
  font-family: 'Source Serif 4';
  src: url('/fonts/SourceSerif4-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
/* Add further weights/styles as needed */
```

`font-display: block` is recommended for print templates to avoid FOUT during headless rendering.

---

## Clinical report — repeating page header & footer

`clinical-report.html` uses `position: fixed` for the page header and footer, which causes them to repeat on every printed page in Puppeteer's CSS paged media implementation.

If switching to Puppeteer's native `displayHeaderFooter` + `headerTemplate`/`footerTemplate` approach, extract the header markup into `headerTemplate` and inject `{{page_number}}`/`{{total_pages}}` via Puppeteer's built-in `<span class="pageNumber">` / `<span class="totalPages">` tokens. Remove the fixed-position elements from the body in that case and reduce the top margin accordingly.

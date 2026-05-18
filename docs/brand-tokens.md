# Brand Tokens — OsteoJP Platform

> Single source of truth for OsteoJP visual identity and voice. All product UI, marketing assets, and documents must reference these values.
>
> Source for color values: `Logotipo_OsteoJP_2023.pdf` (sampled at 300 DPI).
> Source for voice: https://osteojp.pt (institutional copy).

---

## 1. Color palette

### Brand colors (from logo)

| Token | Hex | RGB | Use |
|---|---|---|---|
| `brand-teal` | `#45B9A7` | 69, 185, 167 | Primary brand color. Right hand of the logo. Use for primary actions, links, key UI accents. |
| `brand-magenta` | `#8B1863` | 139, 24, 99 | Secondary brand color. Left hand of the logo. Use sparingly: highlights, secondary CTAs, decorative accents. Avoid as dominant surface color. |
| `brand-grey` | `#98B2C2` | 152, 178, 194 | Wordmark, figure, and tagline grey. Cool, slightly blue-tinted. Use for the wordmark and supporting brand elements only — **not** for body text. |

> **Note for the lead:** the hex values sampled from the official logo PDF differ slightly from the values listed in the operating context doc (`#3DAEB3` teal, `#8E2C7A` magenta). The values above are what's actually in the file. Please confirm which set is canonical.
>
> Also: the issue spec assumed two distinct greys (wordmark vs spine/figure). The logo uses a single grey — `#98B2C2` — for figure, spine, wordmark, and tagline.

### Neutrals (recommended)

Neutral scale designed to support the brand colors without competing. Slightly cool to harmonize with `brand-grey`.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#F7F9FB` | Page background (soft cool grey, not pure white) |
| `surface` | `#FFFFFF` | Cards, modals, elevated panels |
| `surface-muted` | `#F0F3F6` | Disabled states, secondary panels, inactive list rows |
| `border` | `#E2E8EE` | Hairline borders, dividers, table lines |
| `border-strong` | `#C7D1DA` | Input borders, emphasized dividers |
| `text-primary` | `#1A2733` | Body text, headings (high contrast — not pure black, to soften the clinical feel slightly) |
| `text-secondary` | `#56697A` | Captions, helper text, metadata |
| `text-muted` | `#8A98A6` | Placeholders, deemphasized labels |
| `text-inverse` | `#FFFFFF` | Text on `brand-teal` or `brand-magenta` backgrounds |

### Semantic colors (recommended)

Tuned for clinical context: muted, professional, never alarming for non-critical states.

| Token | Hex | Use |
|---|---|---|
| `success` | `#2F8F6B` | Confirmations, completed states, healthy indicators |
| `success-bg` | `#E6F4EE` | Success banner backgrounds |
| `warning` | `#B47A14` | Caution states, pending review, attention needed |
| `warning-bg` | `#FBF1DD` | Warning banner backgrounds |
| `error` | `#B23A3A` | Validation errors, destructive actions, failed states |
| `error-bg` | `#F8E5E5` | Error banner backgrounds |
| `info` | `#2E6FA8` | Informational notices, neutral system messages |
| `info-bg` | `#E4EEF7` | Info banner backgrounds |

---

## 2. Typography

### Primary font family

**Inter** — open-source, highly legible, neutral, designed for screen UI. Available via Google Fonts and Next.js `next/font`.

Fallback stack:
```
'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
```

Rationale: clinical, modern, neutral. Pairs well with the slightly soft osteojp wordmark without competing with it. Wide weight range, excellent at small sizes (important for forms and dense clinical data).

### Type scale

Base size 16px. Modular scale roughly 1.2–1.25.

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `display` | 40px / 2.5rem | 48px | 600 | Marketing hero, large dashboards (rare in app) |
| `h1` | 32px / 2rem | 40px | 600 | Page titles |
| `h2` | 24px / 1.5rem | 32px | 600 | Section titles |
| `h3` | 20px / 1.25rem | 28px | 600 | Subsection titles, card headers |
| `h4` | 18px / 1.125rem | 26px | 500 | Minor headings, form group labels |
| `body` | 16px / 1rem | 24px | 400 | Default body text |
| `body-sm` | 14px / 0.875rem | 20px | 400 | Dense UI, table cells, secondary content |
| `small` | 13px / 0.8125rem | 18px | 400 | Helper text, metadata |
| `caption` | 12px / 0.75rem | 16px | 500 | Labels, badges, tags |

### Weights

- **400** — body text (default)
- **500** — labels, captions, slight emphasis
- **600** — headings, button labels, strong emphasis
- **700** — reserved for rare cases (avoid; use 600 by default for headings)

---

## 3. Spacing scale

4px base unit. All padding, margin, and gap values should snap to this scale.

| Token | Value | Use |
|---|---|---|
| `space-1` | 4px | Hairline gaps, icon-to-text spacing inside compact components |
| `space-2` | 8px | Tight grouping (form label to input, badge padding) |
| `space-3` | 12px | Default component internal padding (buttons, inputs) |
| `space-4` | 16px | Standard gap between related elements |
| `space-6` | 24px | Section internal spacing, card padding |
| `space-8` | 32px | Spacing between distinct sections within a screen |
| `space-12` | 48px | Major section separation, page-level vertical rhythm |
| `space-16` | 64px | Top-level page padding on desktop, hero spacing |

Guidelines:
- Stick to the scale. Never invent values like `10px` or `18px`.
- Use `space-3` or `space-4` for most internal component spacing.
- Reserve `space-12` and `space-16` for page-level layout.

---

## 4. Brand voice anchor

### Tone summary

OsteoJP's voice is **clinical, confident, and quietly authoritative**. The clinic positions itself as *"o padrão ouro em cuidados de saúde"* — the gold standard. Copy emphasizes excellence, personalization, and a holistic, evidence-aware approach. The tone is warm in intent (the work is patient-centered) but not warm in register — no slang, no emojis, no exclamation-driven enthusiasm. It reads like a senior clinician who is thorough and unhurried, not a wellness brand.

In both PT and EN, the voice should:
- Lead with what the patient gets, not what the clinic feels
- Use precise clinical terminology when it adds clarity, plain language when it doesn't
- Stay measured even when describing strong outcomes (avoid superlatives)
- Treat the patient as an informed adult

### "Do" examples (words and phrases that fit)

1. **"Avaliação"** / "Assessment" — clinical, precise, expected.
2. **"Plano de tratamento personalizado"** / "Personalised treatment plan" — confident, patient-centered.
3. **"Equipa qualificada"** / "Qualified team" — verifiable, professional.
4. **"Reabilitação"** / "Rehabilitation" — clinical, accurate.
5. **"Abordagem integrativa"** / "Integrative approach" — signals breadth without overpromising.

### "Don't" examples (words and phrases that don't fit)

1. **"A sua jornada de bem-estar"** / "Your wellness journey" — too warm, lifestyle-brand register.
2. **"Mágico"**, **"transformador"** / "Magical", "transformative" — overpromises, breaks clinical trust.
3. **"Olá!"** with emoji / "Hey there!" — too casual for a clinical product.
4. **"Não perca!"** / "Don't miss out!" — sales-driven urgency clashes with clinical tone.
5. **"Família OsteoJP"** / "OsteoJP family" — over-familiar; patients are patients, not family.

---

## Appendix — quick CSS variable export

For convenience, here are the brand colors as CSS variables (final Tailwind config will live in `packages/ui`):

```css
:root {
  --brand-teal: #45B9A7;
  --brand-magenta: #8B1863;
  --brand-grey: #98B2C2;

  --bg: #F7F9FB;
  --surface: #FFFFFF;
  --surface-muted: #F0F3F6;
  --border: #E2E8EE;
  --border-strong: #C7D1DA;

  --text-primary: #1A2733;
  --text-secondary: #56697A;
  --text-muted: #8A98A6;
  --text-inverse: #FFFFFF;

  --success: #2F8F6B;
  --warning: #B47A14;
  --error: #B23A3A;
  --info: #2E6FA8;
}
```
# Staff Platform Copy & i18n Audit — 2026-06-18

**Scope:** `apps/web/app/` (all screens) + `packages/i18n/src/strings.pt.json`
**References:** `docs/brand-voice.md`, `packages/i18n/src/strings.pt.json`
**Auditor:** Claude Code (automated + manual review)
**Date:** 2026-06-18

---

## Executive Summary

The staff platform is broadly well-structured: nearly all visible strings go through `s[key]` i18n lookups, no "utente" was found in any JSX, no "você/tu" mixing was found in user-facing copy, and no invoice misnaming (recibo/nota) was found. The findings below are concentrated in the i18n strings file itself (wrong PT vocabulary for existing keys) and a small number of hardcoded fallbacks that reach the UI.

**5 P2 findings. 5 P3 findings. 10 total.**

---

## P2 Findings

### P2-01 — `common.signOut` value is "Sair", not the brand term "Terminar sessão"

| Field | Detail |
|---|---|
| **File** | `packages/i18n/src/strings.pt.json:25` |
| **Used in** | `apps/web/components/app-shell.tsx:79` (sign-out button visible to all staff) |
| **Offending string** | `"common.signOut": "Sair"` |
| **Rule** | brand-voice.md §3.5: "Sign out → Terminar sessão (Not 'logout')" |
| **Fix** | `"common.signOut": "Terminar sessão"` |

**Why it matters:** "Sair" is casual and inconsistent with the portal's own sign-out button ("Terminar sessão") as well as the canonical brand-voice vocabulary table. The label appears in the persistent shell for every authenticated staff user.

---

### P2-02 — `appointment.rescheduled` uses "reagendada" (forbidden verb root)

| Field | Detail |
|---|---|
| **File** | `packages/i18n/src/strings.pt.json:174` |
| **Offending string** | `"appointment.rescheduled": "Marcação reagendada."` |
| **Rule** | brand-voice.md §3.1: "To reschedule → Remarcar (prefer over 'reagendar')" |
| **Fix** | `"appointment.rescheduled": "Marcação remarcada."` |

**Why it matters:** "Reagendar" is the term the brand guide explicitly calls out as the inferior form, listing "remarcar" as the canonical verb. This is a success toast used after an appointment is rescheduled and is visible to staff. The guide's §6.5 pattern is past-participle + object: "Marcação remarcada."

---

### P2-03 — `clinicalRecord.save` / `clinicalRecord.saveEpisode` use "Gravar" instead of "Guardar"

| Field | Detail |
|---|---|
| **File** | `packages/i18n/src/strings.pt.json:113-114` |
| **Offending strings** | `"clinicalRecord.save": "Gravar"` · `"clinicalRecord.saveEpisode": "Gravar Episódio"` |
| **Rule** | brand-voice.md §3.5: "Save → Guardar (Not 'salvar' (PT-BR))" |
| **Fix** | `"clinicalRecord.save": "Guardar"` · `"clinicalRecord.saveEpisode": "Guardar Episódio"` |

**Why it matters:** "Gravar" is archaic and inconsistent with every other save string across the platform (`common.save`, `clinical.save`, `appointment.save`, `admin.staff.save`, etc. all use "Guardar"). The brand-voice rule lists the canonical term. These keys appear in the patients and clinical record UIs.

---

### P2-04 — `patients.editRecord` label used for demographic-data edit (wrong semantic)

| Field | Detail |
|---|---|
| **File** | `packages/i18n/src/strings.pt.json:51` |
| **Used in** | `apps/web/app/patients/[id]/page.tsx:143` (pencil link inside "Dados pessoais" card, href `/patients/${id}/edit`) |
| **Offending string** | `"patients.editRecord": "Editar Ficha"` |
| **Rule** | "Ficha" in the platform context means clinical record (ficha clínica). The link opens the patient demographic/contact form, not a clinical record. |
| **Fix** | `"patients.editRecord": "Editar dados"` (or add a new key `patients.editProfile`) |

**Why it matters:** "Editar Ficha" on the personal-data card will confuse staff — a therapist reading "Ficha" will expect a clinical record form. "Editar dados" (edit data) correctly names the action without borrowing clinical terminology.

---

### P2-05 — Hardcoded English `"Error"` fallback rendered to users

| Field | Detail |
|---|---|
| **File** | `apps/web/app/patients/_components/patient-form.tsx:63` |
| | `apps/web/app/patients/_components/patient-actions.tsx:35` |
| **Offending string** | `setError(err instanceof Error ? err.message : "Error")` |
| **Rule** | brand-voice.md §6.3: errors must be in PT; §5 (Context — in-app system messages): concise, neutral, one short sentence. |
| **Fix** | Replace `"Error"` with `s["errors.generic"]` ("Ocorreu um erro. Tente novamente.") in both files |

**Why it matters:** When a thrown error carries no `.message` (e.g., an opaque rejection), the bare English word "Error" is rendered in an otherwise fully Portuguese UI. This is visible to staff users and violates the brand register.

---

## P3 Findings

### P3-01 — Systemic: Button/action strings use Title Case, brand guide requires sentence case

| Field | Detail |
|---|---|
| **File** | `packages/i18n/src/strings.pt.json` (multiple keys) |
| **Rule** | brand-voice.md §6.1: "Buttons: Infinitive verb + object in PT" with examples in **sentence case** ("Nova marcação", "Guardar registo"). Standard PT-PT UI convention is sentence case for labels. |

Affected strings:

| Key | Current value | Corrected value |
|---|---|---|
| `agenda.newAppointment` | "Nova Marcação" | "Nova marcação" |
| `appointment.newTitle` | "Nova Marcação" | "Nova marcação" |
| `appointment.editTitle` | "Editar Marcação" | "Editar marcação" |
| `patients.new` | "Novo Paciente" | "Novo paciente" |
| `patients.create` | "Criar Paciente" | "Criar paciente" |
| `clinical.new` | "Nova Ficha" | "Nova ficha" |
| `clinical.newTitle` | "Nova Ficha Clínica" | "Nova ficha clínica" |
| `clinicalRecord.newEpisode` | "Novo Episódio" | "Novo episódio" |
| `clinicalRecord.saveEpisode` | "Gravar Episódio" | "Guardar episódio" *(also P2-03)* |
| `invoicing.newInvoice` | "Nova Fatura" | "Nova fatura" |
| `dashboard.tile.newAppointment` | "Nova Marcação" | "Nova marcação" |
| `dashboard.tile.newPatient` | "Novo Paciente" | "Novo paciente" |
| `dashboard.tile.clinicalRecord` | "Ficha Clínica" | "Ficha clínica" |
| `dashboard.tile.viewAgenda` | "Ver Agenda" | "Ver agenda" |

**Note:** Navigation section names ("Pacientes", "Agenda", "Marcações") use Title Case as proper noun labels — that is correct. Only button labels and action strings are affected.

---

### P3-02 — Back links use bare `←` Unicode arrow instead of Lucide `ChevronLeft`

| Field | Detail |
|---|---|
| **Files** | `apps/web/app/patients/new/page.tsx:11` |
| | `apps/web/app/patients/[id]/page.tsx:88` |
| | `apps/web/app/clinical/episodes/[id]/page.tsx:39` |
| **Offending pattern** | `← {s["patients.back"]}` (bare Unicode LEFT ARROW U+2190) |
| **Contrast** | The dashboard and all v2-glass screens use `<ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />` from Lucide |
| **Fix** | Replace `←` with `<ChevronLeft>` icon, import from `"lucide-react"` |

**Why it matters:** Visual inconsistency between older screens and the v2-glass redesign. The Unicode arrow is also not screen-reader-hidden (no `aria-hidden`), so some assistive technology may announce it.

---

### P3-03 — Hardcoded brand markup in two public pages instead of `<BrandLockup>`

| Field | Detail |
|---|---|
| **Files** | `apps/web/app/auth/update-password/UpdatePasswordClient.tsx:275-278` |
| | `apps/web/app/r/[token]/page.tsx:41-43` |
| **Offending pattern** | `<span className="text-brand-teal">Osteo</span><span className="text-brand-magenta">JP</span>` |
| **Contrast** | Every authenticated screen (and the portal) uses the `<BrandLockup>` component from `@osteojp/ui` |
| **Fix** | Replace inline markup with `<BrandLockup variant="lockup" />` |

**Why it matters:** If the brand name is ever updated in the `BrandLockup` component, these two pages will diverge silently. Also a copy-quality signal: the brand name should never be spelled out as raw JSX.

---

### P3-04 — `agenda.conflictRoomDoubleBooked` uses non-idiomatic "duplo-marcada"

| Field | Detail |
|---|---|
| **File** | `packages/i18n/src/strings.pt.json:38` |
| **Offending string** | `"agenda.conflictRoomDoubleBooked": "Sala duplo-marcada"` |
| **Fix** | `"agenda.conflictRoomDoubleBooked": "Sala com dupla marcação"` |

**Why it matters:** "Duplo-marcada" is not idiomatic PT-PT (it reads as a literal calque of "double-booked"). "Sala com dupla marcação" follows the noun-phrase pattern used throughout the conflict strings and is immediately clear to a reception-team user.

---

### P3-05 — Hardcoded `"A, B, C"` English placeholder in the string-list widget

| Field | Detail |
|---|---|
| **File** | `apps/web/app/clinical/[id]/RecordForm.tsx:172` |
| **Offending string** | `placeholder="A, B, C"` |
| **Rule** | All visible strings must go through i18n; hardcoded JSX text strings are out of contract. |
| **Fix** | Add `"clinical.stringListPlaceholder": "A, B, C"` to strings.pt.json and reference as `placeholder={s["clinical.stringListPlaceholder"]}` |

**Why it matters:** "A, B, C" is language-neutral but still bypasses the i18n layer. Any future string sweep (W4-09) will miss it. The fix is mechanical.

---

## Terminology checklist

| Rule | Status | Notes |
|---|---|---|
| "utente" never used | ✅ Pass | Zero occurrences in all `apps/web/app/` files |
| "recibo" / "nota" not used for invoice | ✅ Pass | All invoice references use "fatura" |
| "remarcar" used correctly (not "reagendar") | ⚠️ Fail (P2-02) | `appointment.rescheduled` value uses "reagendada" |
| "terapeuta" used as generic role label | ✅ Pass | `appointment.therapist`, `agenda.filterTherapists`, etc. all use "terapeuta" for the platform role; specific titles used in clinical contexts |
| "você" register throughout | ✅ Pass | No "tu" forms found in any user-facing string |
| "guardar" not "salvar" | ⚠️ Fail (P2-03) | Two `clinicalRecord.*` keys use "Gravar" |
| "terminar sessão" not "sair/logout" | ⚠️ Fail (P2-01) | `common.signOut` value is "Sair" |
| PT-PT vocabulary (not PT-BR) | ✅ Pass | "equipa", "definições", "a carregar" all correct |

---

## Files with no findings

The following screens were fully audited and contain no copy/i18n violations:

- `apps/web/app/login/page.tsx` — all strings through i18n ✓
- `apps/web/app/dashboard/page.tsx` — all strings through i18n ✓
- `apps/web/app/agenda/page.tsx` and `agenda-view.tsx` — all strings through i18n ✓
- `apps/web/app/clinical/page.tsx`, `new/page.tsx`, `review/page.tsx` — all strings through i18n ✓
- `apps/web/app/clinical/[id]/page.tsx` and `RecordForm.tsx` — except P3-05 above ✓
- `apps/web/app/patients/page.tsx` — all strings through i18n ✓
- `apps/web/app/patients/[id]/page.tsx` — except P2-04 and P3-02 above ✓
- `apps/web/app/invoicing/page.tsx` — all strings through i18n ✓
- `apps/web/app/admin/` (all sub-pages) — all strings through i18n ✓
- `apps/web/app/marcacoes/marcacoes-view.tsx` — all strings through i18n ✓
- `apps/web/app/auth/update-password/UpdatePasswordClient.tsx` — all copy strings through i18n (except P3-03 brand markup) ✓
- `apps/web/app/r/[token]/page.tsx` — all copy strings through i18n (except P3-03 brand markup) ✓

---

## Recommended fix order

1. **P2-01** `common.signOut` → 1-line strings.pt.json change. High visibility (persistent shell).
2. **P2-05** `"Error"` fallback → 2 JS files, replace string literal with `s["errors.generic"]`.
3. **P2-04** `patients.editRecord` label → 1-line strings.pt.json change. Avoids clinical/demographic confusion.
4. **P2-02** `appointment.rescheduled` → 1-line strings.pt.json change.
5. **P2-03** `clinicalRecord.save` / `saveEpisode` → 2-line strings.pt.json change.
6. **P3-01** Title Case sweep → strings.pt.json, ~14 keys. Bundle with a W4-09 strings pass.
7. **P3-02** `←` arrows → 3 files, replace with Lucide `ChevronLeft`.
8. **P3-03** Brand markup → 2 files, swap inline HTML for `<BrandLockup>`.
9. **P3-04** `conflictRoomDoubleBooked` → 1-line strings.pt.json change.
10. **P3-05** `"A, B, C"` placeholder → add strings key + update RecordForm.tsx.

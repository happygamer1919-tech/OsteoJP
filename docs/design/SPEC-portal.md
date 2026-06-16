# SPEC-portal — Wave 3 patient portal screen specifications

Status: ready for implementation
Consumed by: the design loop, Wave 3 (bound to apps/portal)
Sources of truth, in priority order: docs/brand-tokens.md, docs/design/SPEC-foundation.md, docs/brand-voice.md, docs/design/ui-inventory.md, this file.

## 0. Hard scope rules

1. Presentation only. Same endpoints, same two-path data design, same auth flows the portal has today. No API, schema, or permission changes. Missing data for a layout element: omit the element, log in QUESTIONS.md.
2. Mobile-first PWA: design at 390px, scale up. Desktop centers content at max-width 640px. Touch targets minimum 44px everywhere.
3. **Heritage gate**: the portal is patient-facing. No heritage motifs anywhere in apps/portal until QUESTIONS Q6 item (b) is resolved by JP. The EmptyState heritage prop stays false on every portal screen. The design reviewer treats portal heritage usage as a blocker.
4. Patient-submitted forms always land in pending_review; the UI must never imply a submitted form is final.
5. Every visible string is an i18n key, pt-PT default, en-GB secondary, register per brand-voice.md (você, paciente, no exclamation marks). Zero emoji: every emoji in the current portal is replaced by the lucide mapping from SPEC-foundation section 3.
6. Reschedule deep links are email-only (SMS token overflow rule); the UI never promises an SMS link.

## 1. W3-01 migration gate (hard gate for the wave)

Before any screen work:
1. apps/portal consumes packages/ui/theme.css as its token source; delete the portal's local color system.
2. Migrate all 53 hardcoded hex values across the 19 files to tokens (grep proof of zero #hex literals in apps/portal components in the PR body, excluding any generated files).
3. Replace every emoji used as UI (tab bar, body icons, arrows) with lucide icons per the canonical mapping.
4. Adopt the packages/ui AppShell portal layout: top bar 56px (BrandLockup mark sm + screen title), bottom tab bar with the existing five destinations (Início=Calendar home stays Home icon, Marcações=Calendar, Formulários=FileText, Clínicas=MapPin, Conta=User), active `accent-2-700`, inactive `text-muted`, 44px targets.
5. Load Inter via next/font with latin and latin-ext subsets, same wiring pattern as apps/web.
6. Visual regression is expected and intended here; behavior regression is not. The existing e2e portal flows must stay green.

## 2. Shared portal patterns

**Screen header**: title h2 in the top bar region; sub-screens get a ChevronLeft back icon button (44px) left of the title.
**Section labels**: caption weight 500 `text-secondary`, uppercase avoided (sentence case per voice doc).
**List rows**: Card-less list inside one Card per group: rows 56px min, body-sm, bottom border `border` except last, leading 20px icon `text-secondary`, trailing ChevronRight `text-muted` when navigable.
**Primary actions**: full-width Button md (44px min height) pinned in flow, never floating.
**Status language**: appointment chips per the SPEC-foundation 4.5 mapping with the pt-PT terms from brand-voice.md.

## 3. Screen: Login (W3-02)

Single column, vertically centered, px space-6.
1. BrandLockup full variant, height 64px, centered, `space-12` above the form.
2. Card: h2 "Entrar", the existing credential fields as Field+Input (email autocomplete username, password with show toggle ghost icon button), full-width primary "Entrar" with loading state.
3. Below the card: the existing secondary links (recover access, activate account) as ghost-styled text links, body-sm, centered, stacked gap space-3.
4. Errors: invalid credentials render as a Field-level or single error Banner per what the current flow returns, plain language, no codes in the headline.
5. Footer: small `text-muted` clinic identity line + language switcher (PT | EN) as two ghost text buttons.

## 4. Screen: Activate account (W3-02)

Same centered single-column frame as Login.
1. BrandLockup full, then h2 "Ativar conta" and one body-sm `text-secondary` line explaining the step, copy per voice doc.
2. The existing activation fields (token-carried identity, password set, confirm) as Fields with inline validation; password requirements as a small `text-secondary` list that flips items to `success` with Check icons as they pass.
3. Full-width primary "Ativar conta" with loading; success routes per current flow with a success Toast.
4. Expired or invalid token: ErrorState in place of the form, plain-language message, action linking to the recover path the app already has.

## 5. Screen: Dashboard / Início (W3-03)

Order, top to bottom:
1. Greeting line: h3 with the patient's first name, sub-line small `text-secondary` with the date. No KPI cards here; patients are not operators.
2. **Next appointment card** (the hero, only when one exists): Card with a 3px `accent-2-700` left edge, caption label "Próxima consulta", h3 date and time, body-sm service + therapist, small `text-secondary` clinic line with MapPin icon, footer row of two buttons sized half-width: secondary "Remarcar" (routes to the existing email-link explanation or flow as currently implemented) and ghost "Detalhes".
3. Pending forms: when the existing data shows pending forms, ONE warning Banner: "Tem n formulários por preencher", action "Preencher" routing to Formulários. Never more than this one banner on the screen.
4. Quick actions: 2-up grid of interactive Cards (icon 24px, body-sm label): Marcar consulta, As minhas marcações, Documentos, Clínicas.
5. Recent activity only if the data already exists; otherwise omit.

States: skeleton mirrors blocks 1-4; empty (no upcoming appointment) swaps the hero for an EmptyState (Calendar icon, "Sem consultas marcadas", guidance, primary "Marcar consulta", heritage stays off); ErrorState with retry.

## 6. Screen: Appointments / Marcações (W3-04)

1. SegmentedControl: Próximas | Histórico.
2. Próximas: list of appointment Cards: date block left (caption month, h3 day number, 48px wide), then time + service body-sm weight 500, therapist + clinic small `text-secondary`, StatusChip right. Tap opens the detail.
3. Histórico: same rows, `text-secondary` date block, newest first, pagination per current data layer.
4. **Detail** (sub-screen): summary Card (all fields read-only label-value rows), then actions strictly per current rules: cancel allowed only outside the 24-hour cutoff via destructive-confirm Dialog (the existing cutoff check decides; inside the cutoff the action renders disabled with a small `text-secondary` line stating the 24h rule per voice doc); reschedule per the existing email-link mechanism only.
5. States: SkeletonText rows; EmptyState per segment (upcoming empty gets primary "Marcar consulta"); ErrorState.

## 7. Screen: Booking flow (W3-05)

Multi-step, one decision per screen, progress as a caption "Passo n de 4" plus a 2px `accent-2-700` progress bar under the top bar. Back always via the header back button; state survives back navigation. Uses only the existing booking endpoints and availability logic.

1. **Step 1 Clínica**: list rows of available clinics (name body-sm weight 500, address small `text-secondary`, MapPin icon). Skipped automatically if only one clinic is bookable for the patient today.
2. **Step 2 Serviço**: list rows grouped by category if the data has categories: name, duration + price small `text-secondary` when present.
3. **Step 3 Data e hora**: DatePicker rendered inline (not popover) at top with unavailable days disabled per existing availability; below, SlotPicker for the selected day. If therapist choice exists in the current flow, a Select above the calendar with "Sem preferência" default.
4. **Step 4 Confirmar**: summary Card (clinic, service, therapist if chosen, date, time), Notas Textarea if the flow supports it, full-width primary "Confirmar marcação" with loading.
5. **Success**: full-screen confirmation: 48px Check in a `success-bg` circle, h2 confirmation line, body-sm summary, secondary "Ver as minhas marcações" + ghost "Voltar ao início". Status shown honestly: if the backend creates the booking as pending confirmation, say pending, per voice doc.
6. Failures: slot taken between selection and confirm = inline error Banner on step 4 with action "Escolher outra hora" returning to step 3 with the day preserved; generic failure = ErrorState with retry that does not lose entered state.

## 8. Screens: Clinics and Account (W3-06)

**Clínicas**: one Card per clinic: name h3, address body-sm with MapPin, phone row with Phone icon as a tel: link, hours as label-value rows if the data exists, ghost "Abrir no mapa" external link. Static data per current implementation is acceptable; log in QUESTIONS.md if it should come from the tenant data already available.

**Conta**: grouped list rows. Group 1 Dados pessoais: view-then-edit rows for whatever the patient can already edit (edit opens a Drawer with Fields; non-editable data renders without chevron). Group 2 Preferências: Idioma row (PT | EN via SegmentedControl in a Drawer or inline), notification preferences only if they exist in data. Group 3: Terminar sessão as a destructive-styled text row with confirm Dialog. Footer: app version small `text-muted`.

## 9. Screen: Documents (W3-07)

List rows: FileText icon, document name body-sm weight 500, date + type small `text-secondary`, trailing Download icon button (44px, aria-label). Grouped by year when the list spans years. Tap = the existing view or download behavior. States: SkeletonText rows; EmptyState (FileText icon, "Sem documentos disponíveis", no action); ErrorState.

## 10. Screen: Forms / Formulários (W3-07)

1. List: pending forms first as Cards with a warning StatusChip "Por preencher", completed below with neutral chip "Enviado" and date. Tap pending opens the form.
2. **Form filling**: the existing form engine restyled with Field components, one section per screen segment with the same progress pattern as booking when multi-section, autosave indicator if the flow already autosaves.
3. Submit: full-width primary "Enviar" with confirm Dialog stating, per voice doc, that the team will review the answers. Success screen mirrors the booking success pattern and the status language MUST reflect pending_review ("Enviado para revisão"), never "concluído".
4. Completed forms open read-only with disabled Fields.

## 11. Out of scope for Wave 3

Heritage anywhere in the portal (gated on JP), online payments UI, WhatsApp anything, push notifications, offline PWA behavior changes, and any new patient capability not already served by an existing endpoint.

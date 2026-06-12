# Brand Voice Guide — OsteoJP Platform

> The reference for how OsteoJP sounds in writing. Every email, SMS, in-app message, error state, button label, and document the platform produces should be checked against this guide before shipping.
>
> Sources: institutional copy across https://osteojp.pt (homepage, sobre-nos, osteopatia, fisioterapia, contactos) — March 2026, re-verified against the live site June 2026.
> Companion to: [`brand-tokens.md`](./brand-tokens.md) (visual identity).

---

## 1. Tone summary

OsteoJP's voice is **clinical, confident, and quietly authoritative**. The clinic positions itself as *"o padrão ouro em cuidados de saúde de elevada qualidade"* — the gold standard in high-quality healthcare. The tone is warm in *intent* (every line is patient-centered) but never warm in *register*: no slang, no emojis, no exclamation-driven enthusiasm, no wellness-brand softness.

The voice reads like a **senior clinician who is thorough, unhurried, and respects the patient's intelligence**. It assumes the reader wants to be informed, not flattered. It cites formal regulation when relevant (e.g. Portaria 207-B/2014 on the osteopathy page) and lists conditions with clinical precision. When the clinic describes itself, the language is institutional ("os nossos princípios", "a nossa equipa", "a nossa abordagem") — never first-person singular, never casual.

The same voice must hold across PT and EN. EN translations should match the clinical register of PT — not soften it for an Anglophone audience used to lighter healthcare copy.

In five adjectives, each grounded in what the site actually sounds like:

| Adjective | Definition |
|---|---|
| **Preciso** (precise) | Names things exactly. The site lists conditions and modalities specifically ("Reabilitação Desportiva", "Neuromodulação Não Invasiva"), never vaguely. |
| **Respeitador** (respectful) | Formal address without exception: "Estamos aqui para cuidar de si", never "tu". Mirrors the stated value "Respeito pelo Paciente". |
| **Sério** (serious) | Clinical register, no jokes, no emoji, no diminutives. The brand promise is "padrão ouro em cuidados de saúde de elevada qualidade"; the copy must sound like it. |
| **Tranquilizador** (reassuring) | Calm even about problems. The site frames care as a solvable path ("Na OsteoJP, acreditamos que a recuperação é possível"); errors state the issue and the next step, never alarm. |
| **Direto** (direct) | Action first. The site's CTAs are bare verb phrases ("Fazer marcação", "Contactar", "Saber mais"); UI copy leads with the action, not with framing. |

---

## 2. Voice principles

### 2.1 Treat the patient as an informed adult
The patient is a partner in their care, not a passive recipient. Explain conditions and procedures precisely. Don't oversimplify. Don't condescend.

### 2.2 Clinical, not clinical-cold
Precision matters more than friendliness. Use accurate clinical terms ("avaliação", "reabilitação musculoesquelética") when they add clarity. Add plain-language explanation only when the term would genuinely confuse a layperson — and even then, the technical term comes first, the explanation second.

### 2.3 Measured even when describing strong outcomes
Avoid superlatives ("incrível", "transformador", "magical"). Real clinical outcomes speak for themselves; superlatives make the brand sound like a lifestyle product. State what the treatment does, who it's for, and what conditions it addresses — let the patient draw the conclusion.

### 2.4 Address the patient formally ("você", never "tu")
All patient-facing copy in Portuguese uses the **formal "você"** register, expressed through "a sua / o seu" possessives and third-person verbs ("agende", "contacte", "descubra"). Never use "tu" or its conjugations. This is consistent across the entire osteojp.pt site and is non-negotiable.

In English, default to "you" (which is already neutral on formality) but keep sentence construction professional ("Please confirm your appointment" — not "Hey, just confirm your appointment!").

### 2.5 Institutional voice, not personal
When the clinic speaks, it speaks as "nós" / "we" or as "OsteoJP" — never as a named individual unless the message genuinely is from one (e.g. a specific osteopath signing off). Avoid "I" / "eu" in system-generated messages.

### 2.6 Brevity over filler
No throat-clearing ("We are delighted to inform you that..."). No padding ("Please be advised that your appointment is scheduled for..."). State the thing. The patient's time is respected by saying less, well.

### 2.7 Action verbs lead CTAs
Booking, scheduling, and contact CTAs lead with the verb: **"Agende a sua consulta"**, **"Contacte-nos"**, **"Saber mais"**. Never "Click here", never "Learn more about how we can help you on your wellness journey".

### 2.8 Staff UI: neutral imperative, no courtesy padding
Staff-facing strings address the task, not the person. Buttons and menu actions use the **infinitive** (standard PT-PT software convention, and the site's own CTA pattern: "Fazer marcação", "Saber mais"). Instructions use the impersonal imperative. No "por favor" inside the staff apps: courtesy words are reserved for patient-facing copy, where they carry the formal register.

- PT button: "Guardar registo" · PT instruction: "Selecione o paciente antes de criar a marcação."
- EN button: "Save record" · EN instruction: "Select the patient before creating the booking."

---

## 3. PT/EN vocabulary

Preferred terminology for common platform copy, in both languages. Where multiple PT terms exist, the row reflects what osteojp.pt actually uses.

### 3.1 Clinic and services

| English | Portuguese (preferred) | Notes |
|---|---|---|
| Appointment | Consulta | Default for any scheduled session. |
| Booking | Marcação | Used in "Fazer marcação" CTA. |
| To book / schedule | Agendar / marcar | Both used; "agendar" slightly more formal. |
| Treatment | Tratamento | |
| Session | Sessão | Use for ongoing/recurring care; "consulta" for individual visits. |
| Assessment | Avaliação | First-visit clinical assessment. |
| Diagnosis | Diagnóstico | |
| Rehabilitation | Reabilitação | |
| Treatment plan | Plano de tratamento | Often "plano de tratamento personalizado". |
| Clinical record | Registo clínico | Singular. "Histórico clínico" for the full longitudinal history. |
| Practitioner / clinician | Profissional de saúde | Generic. Specific roles ("osteopata", "fisioterapeuta") preferred when known. |
| Therapist | Terapeuta | Platform role label covering osteopaths and physiotherapists (matches the permission matrix). Use the specific title when the discipline matters clinically or on printed reports. |
| Patient | Paciente | Canonical. The site mixes "paciente", "utente" and "cliente"; the product does not. "Paciente" leads the site's own values copy ("Respeito pelo Paciente") and matches the `patients` table. "Utente" is SNS/public-sector register: never use it to address a patient, acceptable only when quoting official documents. "Cliente" only in clearly commercial contexts (e.g. invoicing). |
| Team | Equipa | Note: "equipa" (PT-PT), not "equipe" (PT-BR). |
| Clinic | Clínica | |
| Location (clinic site) | Clínica de [localidade] | The site says "clínicas em Linda-a-Velha e Castelo Branco". Refer to a location as "clínica de Linda-a-Velha", never "local", "unidade" or "instalação". |
| Invoice | Fatura | Legal term. "Fatura-recibo" only when that is literally the fiscal document type issued. Never "recibo" or "nota" for an invoice. |
| To reschedule | Remarcar | One word; prefer over "alterar a marcação". |

> **Rule (binding): the UI never displays "utente".** No label, no column header,
> no button, no helper text, no empty-state copy uses "utente". The word for a
> patient is **"paciente"** everywhere in the product (it matches the `patients`
> table and the site's own "Respeito pelo Paciente" values copy). "Utente" is
> SNS/public-sector register, acceptable only when quoting an official document
> verbatim, never to address or label a patient. Legacy strings that still say
> "utente" (e.g. "Novo utente", "Adicionar utente") exist in the codebase and are
> being swept to "paciente" in Wave 4 (PLAN.md W4-03 and the W4-09 i18n sweep).

### 3.2 Treatments (proper-noun list — capitalize, do not translate)

These are the official service names. Do not translate to English; surface in both PT and EN UI with their Portuguese names. EN UI can include a short EN gloss in parentheses on first mention.

- **Osteopatia** (Osteopathy)
- **Fisioterapia** (Physiotherapy)
- **Massagens** (Massage therapy)
- **Pilates Terapêutico** (Therapeutic Pilates)
- **Neuromodulação Não Invasiva** / **NESA** (Non-invasive neuromodulation)
- **Formação** (Training / continuing education) — third brand pillar; never translate as "formation"

Osteopathy sub-types follow the same rule: **Osteopatia Estrutural**, **Osteopatia Visceral**, **Osteopatia Pediátrica**, **Sacro-Craniana**, **Uro-Ginecológica**, **Posturologia**, **Kinesiologia**, **Fisioenergética**, **Somato Emocional**.

### 3.3 Locations (proper nouns — exact spelling, exact order)

- **Linda-a-Velha** (hyphenated, lowercase "a")
- **Castelo Branco**
- **Montemor-o-Novo** (opening soon, per project context)

When both primary locations are mentioned together, the established order across osteojp.pt is **Linda-a-Velha e Castelo Branco**. Maintain that order in all institutional copy.

### 3.4 Brand and recurring phrases

| Phrase | Use |
|---|---|
| Padrão ouro em cuidados de saúde | Brand positioning statement. Use sparingly, never as filler. |
| Tratamentos personalizados | Default phrase for personalized care. |
| Abordagem holística | Use when discussing treatment philosophy. |
| Alívio da dor | Use for pain-relief outcomes. |
| Vida sem limitações / vida sem dor | Aspirational phrasing tied to outcomes. Already overused on the site — use sparingly in product copy. |
| Bem-estar | Default for "wellness" — but never paired with "journey" (see don'ts). |

### 3.5 Common UI copy

| English | Portuguese | Notes |
|---|---|---|
| Save | Guardar | Not "salvar" (PT-BR). |
| Cancel | Cancelar | |
| Confirm | Confirmar | |
| Submit | Submeter / Enviar | "Enviar" for forms, "submeter" for clinical/legal documents. |
| Next | Seguinte | Not "próximo" (acceptable but less institutional). |
| Back | Anterior | |
| Search | Pesquisar | |
| Loading… | A carregar… | Note: PT-PT gerund construction. |
| Required field | Campo obrigatório | |
| Optional | Opcional | |
| Sign in | Iniciar sessão | Not "fazer login". |
| Sign out | Terminar sessão | Not "logout". |
| Settings | Definições | Not "configurações" (PT-BR). |

---

## 4. Words and phrases to avoid

Each entry includes *why* — so the principle generalizes beyond the specific phrase.

### 4.1 Wellness-brand / lifestyle register

| Avoid | Why |
|---|---|
| "Jornada de bem-estar" / "wellness journey" | Wellness-brand cliché. Treatment isn't a "journey"; it's a clinical course. |
| "Família OsteoJP" / "OsteoJP family" | Patients are not family. Breaks professional distance. |
| "Equipa amiga" / "friendly team" | Already implicit in patient-centered care. Saying it makes it sound performative. |
| "Espaço de cura" / "healing space" | Therapeutic, but vague and unverifiable. Prefer "ambiente clínico" or specific facility descriptors. |

### 4.2 Overpromise and superlatives

| Avoid | Why |
|---|---|
| "Mágico" / "magical" | Breaks clinical credibility. |
| "Transformador" / "transformative" | Vague, overpromising. Describe specific outcomes instead. |
| "Milagre" / "miracle" | Same. |
| "100% eficaz" / "100% effective" | Clinically unsupportable. Avoid even when results are strong. |
| "Cura" (as a promise of healing) | Use "tratamento" or "alívio". Reserve "cura" for contexts where it is clinically accurate. |

### 4.3 Over-casual / over-familiar

| Avoid | Why |
|---|---|
| "Olá!" with emoji as opener | Too casual for a clinical product. Use "Olá" without emoji, or open with the actionable content directly. |
| "Não perca!" / "Don't miss out!" | Sales-driven urgency. Breaks clinical tone. |
| "Faz-te bem" / "tu / contigo" forms | Wrong register — always "você" (see Principle 2.4). |
| "🙂 / ❤️ / 💆" or any emoji | No emojis in patient-facing copy. Internal staff comms can be more relaxed. |
| "Adoramos ter-te connosco!" | Wrong register, wrong tone — saccharine. |

### 4.4 Filler / hedging

| Avoid | Why |
|---|---|
| "Apenas queríamos lembrar..." / "We just wanted to remind you..." | Padding. Say the reminder directly. |
| "Gostaríamos de informar que..." / "We would like to inform you that..." | Same. Replace with the information itself. |
| "Por favor, note que..." / "Please note that..." | If it's important enough to flag, lead with it. |

---

## 5. Tone by context

The principles are constant; the register adjusts slightly across contexts.

| Context | Register | Notes |
|---|---|---|
| **Marketing pages, About, treatment descriptions** | Institutional, slightly elevated | "Padrão ouro" tier. Slightly longer sentences, more formal vocabulary. |
| **Clinical reports and notes** | Strictly clinical, technical | Precise terminology, no embellishment. Patient is named in third person ("o paciente apresenta..."). |
| **Appointment confirmations, reminders (email/SMS)** | Direct, utility-focused | Lead with the actionable information (date, time, location). One sentence of context max. No marketing copy bolted on. |
| **In-app system messages, success/error states** | Concise, neutral | One short sentence. State what happened or what to do. No apology theatre. |
| **Buttons, labels, microcopy** | Verb-first, 1–3 words | "Agende", "Confirmar", "Ver detalhes". No sentences. |
| **Forms (field labels, helper text, error messages)** | Functional, polite, brief | "Campo obrigatório", "Formato inválido", "Verifique o número de telefone". Helpful but not chatty. |
| **Declarations and formal documents** | Formal, document-style | Standard Portuguese institutional phrasing. Headers, dates, signatures, footer with NIF and fiscal data. |

---

## 6. Microcopy patterns

Concrete patterns per surface, with one PT and one EN example each. Vocabulary follows §3 (consulta = the appointment/encounter, marcação = the booking).

### 6.1 Buttons
Infinitive verb + object in PT, bare verb + object in EN. Two words is the target, four the ceiling.

| Context | PT | EN |
|---|---|---|
| Primary action | Guardar registo | Save record |
| Booking | Nova marcação | New booking |
| Destructive | Cancelar marcação | Cancel booking |
| Billing | Emitir fatura | Issue invoice |

### 6.2 Empty states
One line saying what is not here yet, plus the action that fills it. No apology, no illustration-driven whimsy.

- PT: "Sem consultas hoje." + botão "Nova marcação"
- EN: "No appointments today." + button "New booking"
- PT: "Este paciente ainda não tem registos clínicos."
- EN: "This patient has no clinical records yet."

### 6.3 Error messages
What failed + what to do next. Never blame the user, never expose technical detail or PII, never bare "Erro".

- PT: "Não foi possível guardar o registo. Verifique a ligação e tente novamente."
- EN: "The record could not be saved. Check your connection and try again."
- PT (validation): "Indique a data de nascimento no formato DD/MM/AAAA."
- EN (validation): "Enter the date of birth in DD/MM/YYYY format."

### 6.4 Confirmation dialogs
Title states the action as a question, body states the consequence, buttons repeat the verb. Never "Sim/Não", never bare "OK". For irreversible clinical actions, name the irreversibility.

- PT: título "Cancelar esta marcação?" · corpo "O paciente será notificado por SMS." · botões "Cancelar marcação" / "Voltar"
- EN: title "Cancel this booking?" · body "The patient will be notified by SMS." · buttons "Cancel booking" / "Go back"
- PT (irreversible): "Assinar este registo? Depois de assinado, o registo fica imutável. Alterações futuras criam uma adenda."
- EN (irreversible): "Sign this record? Once signed, the record becomes immutable. Future changes create an addendum."

### 6.5 Success toasts
Past participle + object. Short, factual, no celebration.

- PT: "Marcação criada." · "Registo assinado." · "Fatura emitida."
- EN: "Booking created." · "Record signed." · "Invoice issued."

### 6.6 SMS
Hard constraint: **one GSM-7 segment, 160 characters**. PT accented characters (ã, õ, á, í, ó, ú, â, ê, ô…) are not in GSM-7; a single one forces UCS-2 encoding and cuts the segment to 70 characters. SMS copy is therefore written **accent-free by design**. Full rules and the approved template set live in [`sms-templates.md`](./sms-templates.md); never author SMS copy outside that file's constraints. Always include clinic name, date, time, location, and one action path.

- PT (110 chars): `OsteoJP: lembrete da sua consulta amanha, 19/03, as 10h00, clinica de Linda-a-Velha. Para alterar: 214 191 988`
- EN (106 chars): `OsteoJP: reminder of your appointment tomorrow, 19/03, 10:00, Linda-a-Velha clinic. To change: 214 191 988`

### 6.7 Email reminders
Full diacritics, formal address, no marketing content in transactional email. Subject carries the facts (what, when, where); body gives logistics and one reschedule path; sign-off as the clinic, with contacts.

- PT: assunto "Lembrete: consulta de Osteopatia, 19 de março às 10h00, Linda-a-Velha" · corpo abre "Caro(a) [Nome]," e fecha "Com os melhores cumprimentos, OsteoJP — Clínica de Linda-a-Velha".
- EN: subject "Reminder: Osteopathy appointment, 19 March at 10:00, Linda-a-Velha" · body opens "Dear [Name]," and closes "Kind regards, OsteoJP — Linda-a-Velha clinic".

---

## 7. Do / don't

Five of each. Every rewrite shows the PT fix and the EN fix.

### Do

1. **Lead with the action.** ✗ "Para criar uma nova marcação, clique aqui" → ✓ PT "Nova marcação" / ✓ EN "New booking"
2. **Use the canonical term, every time.** ✗ "A sua sessão de osteopatia foi agendada" → ✓ PT "A sua consulta de Osteopatia foi marcada." / ✓ EN "Your Osteopathy appointment has been booked."
3. **State the next step in every error.** ✗ "Erro ao emitir fatura" → ✓ PT "Não foi possível emitir a fatura. Tente novamente ou contacte o administrador." / ✓ EN "The invoice could not be issued. Try again or contact the administrator."
4. **Name consequences in confirmations.** ✗ "Tem a certeza?" → ✓ PT "Eliminar este rascunho? Esta ação não pode ser anulada." / ✓ EN "Delete this draft? This action cannot be undone."
5. **Keep formal address with patients everywhere, including SMS.** ✗ "Não te esqueças da tua consulta" → ✓ PT (SMS, accent-free) "Lembrete da sua consulta amanha as 10h00" / ✓ EN "Reminder of your appointment tomorrow at 10:00"

### Don't

1. **Don't use "tu" or emoji, ever.** ✗ "Olá! Tens uma consulta amanhã 😊" → ✓ PT "Lembrete: tem uma consulta amanhã às 14h30." / ✓ EN "Reminder: you have an appointment tomorrow at 14:30."
2. **Don't import marketing flourish into product UI.** ✗ "Parabéns! A sua jornada para uma vida sem limitações começou!" → ✓ PT "Marcação confirmada." / ✓ EN "Booking confirmed."
3. **Don't mix terms for the same concept on one screen.** ✗ "Cancelar consulta" num ecrã intitulado "As suas marcações" → ✓ PT "As suas marcações" / "Cancelar marcação" / ✓ EN "Your bookings" / "Cancel booking"
4. **Don't expose internals or blame the user.** ✗ "Introduziu dados inválidos (FK violation: tenant_id)" → ✓ PT "Não foi possível guardar. Verifique os campos assinalados." / ✓ EN "Could not save. Check the highlighted fields."
5. **Don't pad staff UI with filler courtesy.** ✗ "Por favor, aguarde um momento enquanto processamos o seu pedido…" → ✓ PT "A guardar…" / ✓ EN "Saving…"

---

## 8. Examples — before and after

### 8.1 Appointment reminder (SMS, PT)

**Before (too casual, too long):**
> Olá Maria! 🙂 Só queríamos lembrar que tens uma marcação connosco amanhã às 10h00. Mal podemos esperar para te ver! Qualquer coisa, é só dizer. ❤️ Equipa OsteoJP

**After (on brand):**
> OsteoJP: lembrete da sua consulta amanhã, 19/03, às 10h00 em Linda-a-Velha. Para alterar, ligue 214 191 988.

**Why:** drops the emoji and "tu" form, leads with the actionable info, gives a single direct channel to act, signed by the clinic not a "team".

### 8.2 Appointment confirmation (email subject + body, EN)

**Before:**
> Subject: Yay! Your appointment is booked 🎉
> Hi Maria! We're so excited to have you joining the OsteoJP family. Your wellness journey starts soon!

**After:**
> Subject: Appointment confirmed — 19 March, 10:00, Linda-a-Velha
> Dear Maria, your appointment is confirmed for 19 March at 10:00 at our Linda-a-Velha clinic. The address is Praça Central Plaza, 1-A. Please arrive 10 minutes early to complete your intake form. To reschedule, reply to this email or call 214 191 988. — OsteoJP

**Why:** subject line carries the four facts that matter (what, when, where). Body gives logistics, not feeling.

### 8.3 Form validation error (in-app, PT)

**Before:**
> Ups! Algo correu mal. Por favor, verifique se preencheu todos os campos corretamente e tente novamente.

**After:**
> Verifique os campos assinalados em baixo.

**Why:** an error message is not the place for "ups". The user already knows something went wrong — they need to know what to fix. Point them at the fields.

### 8.4 Clinical record entry header (PT, internal)

**Before:**
> Sessão da Maria — 19 de março, dia super produtivo!

**After:**
> Consulta de seguimento — 19/03/2026, 10:00. Osteopatia estrutural. Profissional: [Nome].

**Why:** clinical records are formal documents. Date format standardized, modality named, practitioner identified. No commentary.

### 8.5 Marketing CTA (homepage, PT)

**Before:**
> Vem descobrir o teu caminho para uma vida incrível sem dor! Junta-te à família OsteoJP hoje!

**After:**
> Agende a sua consulta e descubra o caminho para uma vida sem limitações.

**Why:** "você" form, single action verb, drops the "family" framing, keeps the existing brand phrase "vida sem limitações" which is already established on osteojp.pt.

---

## 9. Quick checklist before publishing copy

Run any new string through this list:

- [ ] Uses "você" form (PT) — no "tu" anywhere
- [ ] No emojis (patient-facing)
- [ ] No superlatives ("incrível", "transformador", "magical")
- [ ] No wellness-brand phrases ("journey", "family", "tribe")
- [ ] No padding ("we just wanted to", "we would like to inform you")
- [ ] CTAs lead with a verb
- [ ] Treatment names are correctly capitalized and untranslated where listed in §3.2
- [ ] "Linda-a-Velha e Castelo Branco" order preserved when both mentioned
- [ ] PT-PT vocabulary, not PT-BR ("equipa", "guardar", "definições", "a carregar")
- [ ] "Paciente" everywhere — never "utente" in any label, header, or button (§3.1 rule)
- [ ] Length: as short as the content allows, no shorter

---

## 10. Open questions for the lead / owner

Items that need a decision from the lead or the clinic owner before they're locked in:

1. **First-person mode in clinician-authored messages** — when a specific osteopath sends a message (not the system), do we allow "eu / I" or do we keep institutional "we" throughout? Recommendation: allow "eu" with the clinician's name in the signature, since suppressing it would feel artificial. *Pending JP.*
2. ~~**Patient nickname use**~~ — **Resolved:** first name in friendly contexts (reminders, in-app greetings), full name in formal contexts (declarations, invoices). Confirmed in practice across all i18n templates.
3. ~~**Multilingual fallback**~~ — **Resolved:** show PT to EN users when a string is only translated in PT. Implemented in `packages/i18n`. Confirmed.
4. **Marketing tone vs product tone** — this guide leans product-tone. The marketing pages have slightly more flourish ("padrão ouro", "vida sem limitações"). Confirm whether product UI should suppress that flourish entirely or echo it in moderation. *Pending JP.*

---

## 11. Future work

- **Social media voice (Instagram, LinkedIn)** — separate register, not in scope for v1. Add a §10 in a future version once social presence is reviewed.
- **Voice samples per practitioner** — if individual clinicians sign clinical reports, capture each one's habitual phrasing so AI-drafted reports sound consistent per-author.
- **Translation review cycle** — once EN strings are authored in `packages/i18n/strings.en.json`, schedule a native-speaker pass against this guide.
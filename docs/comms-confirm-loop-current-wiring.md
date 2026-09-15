# Estado on Lembretes SMS, and whether a patient's confirmation reaches the agenda

Card `COMMS-04-confirm-loop-current-wiring` (BLUE R3, B-T4). Read and docs only: no code changed.

Measured on 2026-09-15. Code at origin/main `0f25736f`. Production facts from one read-only
database transaction at 17:26 UTC, and from the owner-only **Administração > Teste de envio**
page on https://app.osteojp.pt, read at about 17:35 UTC without pressing anything.

## The short answer

- **Estado on Comunicações > Lembretes SMS is about the MESSAGE, never the appointment.**
  "Entregue" means the phone network reported the SMS delivered. It does not mean the patient
  read it, and it does not mean they confirmed.
- **A patient CAN confirm from the SMS today, and it DOES reach the agenda.** The 24h reminder
  carries a link (`osteojp.pt/c/...`). Pressing **Confirmar** on that page sets the appointment to
  **Confirmada**, which the agenda, the hover card and Marcações all show. Production has
  recorded **31** such confirmations. The latest was at 17:03 UTC on 2026-09-15.
- **A patient CANNOT confirm by REPLYING to the SMS.** The sender is the name `OsteoJP`, which is
  one-way: a reply never reaches the clinic. **Zero** replies have ever been stored.

So "a confirmation by SMS is not connected to the agenda" is **wrong for the link** and **right for
a text reply**.

## 1. Code paths that set an appointment to confirmed from an SMS

| Path | Triggered by | Writes | Live on production |
|---|---|---|---|
| Confirm link. `apps/web/app/c/[code]/actions.ts` calls `apps/web/lib/reminders/confirm-redeem.ts` (update at line 160) | The patient presses Confirmar on the page the 24h SMS links to | `status = confirmed`; audit `appointment.confirm.sms_code`. It does **not** write `confirmation_state` or `confirmation_channel`. | **Yes.** `REMINDERS_CONFIRM_LINK_ENABLED` is exactly "true" (Teste de envio page). 31 audit rows. |
| Text reply. `apps/web/app/api/webhooks/twilio/inbound/route.ts` calls `apps/web/lib/reminders/inbound-reply.ts` (update at line 409) | The patient replies to the SMS | `status = confirmed`, `confirmation_state = confirmed`, `confirmation_channel = sms` | **No.** The route answers 404 unless both conditions in section 3 hold. |
| Reception acting on a filed reply. `apps/web/lib/reminders/inbound-store.ts` `resolveReviewItem`, "Marcar como confirmada" (line 259) | A receptionist, on a reply in the review queue | `status = confirmed`, `confirmation_channel = sms_review` | **No.** There are no replies to act on. |

Not from an SMS, listed so neither is mistaken for one: the Estado selector in the appointment
drawer and Aceitar pedido (`apps/web/lib/scheduling/actions.ts`) are staff actions. The older
`/r/` link (`apps/web/lib/reminders/redeem.ts`) writes `confirmation_state` only, never `status`.

**Why the link reaches the agenda.** `deriveEstado` (`apps/web/lib/scheduling/estado.ts`) shows
Confirmada when `status` is confirmed OR `confirmation_state` is confirmed. The agenda grid
(`agenda-grid.tsx:810`), the hover card (`appointment-hover-card.tsx:54`) and Marcações
(`marcacoes-view.tsx:273`) all read it.

**A gap, not a defect in this dispatch.** Because the link writes `status` only, the agenda cannot
tell "the patient confirmed" from "reception confirmed": both read Confirmada, and
`confirmation_channel` stays empty. Separately, 16 production appointments carry
`confirmation_state = confirmed` with no channel; which path wrote them is not established here.

## 2. Replies stored

`sms_inbound_events`: **0 rows, all time.**

## 3. The sender, and the inbound route's two conditions

- **`TWILIO_SMS_FROM` is `OsteoJP`**, an alphanumeric sender. Source: the running production app's
  Teste de envio page, which prints "Remetente em uso: OsteoJP" and "TWILIO_SMS_FROM is set but is
  not an E.164 number". Vercel lists the variable on osteojp-platform Production, last changed 12
  days ago. Its value was not read from Vercel: it is encrypted there, and pulling it would write
  every production secret to disk.
- **Condition 1, `REMINDERS_INBOUND` is exactly "true": NOT KNOWN.** The variable exists on
  Production (last changed 14 days ago). Its value was not read.
- **Condition 2, the sender is an E.164 phone number: NOT SATISFIED.** `OsteoJP` is not one.
- **Result: the route is off today, whatever condition 1 holds.** `remindersInboundEnabled()`
  (`apps/web/lib/reminders/inbound-config.ts`) needs both, and a non-number sender is a hard
  refusal that no flag opens (SR-47).

## 4. Every value Estado on Lembretes SMS can show

Enumerated from `statusOf` and `reasonLabel` in `apps/web/lib/reminders/reminder-log-core.ts`,
with the words from `packages/i18n/src/strings.pt.json`.

| Estado | Means |
|---|---|
| Enviado | Handed to Twilio. No delivery report yet, or the report says only queued, sent or accepted. |
| Entregue | Twilio's delivery report says delivered to the handset. |
| Não entregue | The delivery report says undelivered or failed. |
| Falhou no fornecedor | Twilio refused it when it was sent. The Código de erro column says why. |
| Não enviado: *motivo* | The platform decided not to send. *motivo* is one of the 14 below. |
| Estado não reconhecido (*código*) | An outcome the page was not built for. It should never appear. |

The 14 reasons: número inválido; telefone fixo, não recebe SMS; número inválido ou telefone fixo
(older rows only); envio real desligado; SMS desligado para este paciente ou para a clínica;
antecedência não selecionada nas definições; canal errado para este lembrete; paciente sem
contacto; a marcação já não estava ativa; pedido de marcação ainda não aceite; marcação não feita
pelo paciente; mensagem recusada antes do envio; paciente eliminado; marcação não encontrada. A
reason the page does not know shows as "motivo não reconhecido (*código*)".

**What Estado does NOT mean.** Not read. Not confirmed. Not cancelled. No value says anything about
the appointment: its own Estado (Agendada, Confirmada, Concluída, Cancelada, Falta) is on the agenda
and on Marcações. The page lists only messages that reached the send step, and the phone number it
shows is the patient's number today, which may differ from the one used.

## 5. Confirm codes

- **168** codes in the table now. The first was created 2026-09-03 16:07 UTC, the latest
  2026-09-15 17:00 UTC.
- **2 consumed.** Only "Pedir remarcação" consumes a code (2 audit rows,
  `appointment.reschedule_request.sms_code`). Confirmar deliberately does not, so the 31
  confirmations are 31 audit rows and 0 consumptions.
- **All-time minted is at least 168 and cannot be counted exactly from the database.** A code
  minted for an SMS that then did not send is withdrawn, and withdrawal DELETES the row
  (`withdraw_confirm_code`, migration 0074).

For scale: `reminder_dispatches` holds 110 SMS rows, all 24h reminders, 97 sent and 13 not sent.

## What must happen, in order, for a text REPLY to confirm an appointment

The link already confirms. This list is only for a patient replying to the SMS.

1. **Clinic decision (owner and JP): every SMS patients receive would come from a phone number
   instead of "OsteoJP".** Nothing below starts without it. Cards `W14-twilio-two-way-sender` and
   `SEC-twilio-inbound-not-armable-while-the-sender-is-alphanumeric`.
2. **Copy decision: the 24h SMS has room for the confirm link OR the reply instruction, not both.**
   The worst-case body is 99 characters and the link line 33, of 160. The reply line does not fit
   beside the link, and the renderer refuses rather than sending a second paid segment
   (`apps/web/lib/reminders/templates.ts`). Keep the link, replace it with the reply instruction, or
   have JP approve shorter wording.
3. **Buy a two-way-capable Portuguese number in Twilio,** and point its incoming-message webhook at
   https://app.osteojp.pt/api/webhooks/twilio/inbound.
4. **Set `TWILIO_SMS_FROM` on osteojp-platform Production to that number in +351 form,** redeploy,
   send one message from Teste de envio and check what the handset shows.
5. **Check `REMINDERS_INBOUND` is exactly "true", and that `REMINDERS_INBOUND_TENANT_ID`,
   `REMINDERS_INBOUND_BASE_URL` and `TWILIO_AUTH_TOKEN` are set on Production,** then redeploy. The
   first three exist today; their values were not verified here.
6. **Decide who watches the review queue** (`/reminders/review`). Replies the classifier cannot
   read, or that match no single appointment, wait there for reception.
7. **Owner acceptance on production.** Book a test appointment more than 24 hours ahead. After its
   24h reminder arrives and before it starts, reply with a confirming word. Expect Confirmada on the
   agenda, and one row in `sms_inbound_events`.

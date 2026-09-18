# JP duplicate bookings: the list reception works from

**This is a worklist for a person, not a script.** No stage of the STAFF-10 data
operation cancels, moves or edits a single appointment. The schedule rows are
fixed by the script; the bookings below are fixed by reception, one at a time,
on the screen.

**Why it is done by hand, and not automated.** It was checked rather than
assumed: a cancel in this system sends the patient **nothing** (no SMS, no
email; no cancellation template exists), and a reminder already scheduled is
suppressed when it wakes, because the dispatcher re-reads the appointment's
status before sending. So silence was never the obstacle. The obstacle is that
each row below is a real person's visit, and deciding which of two bookings
stands is a diary decision. Nine or so rows is work a human can do properly.

**Ids only. No patient names appear in this file, ever.** Reception looks each
id up on the screen.

---

## How to produce the list

The rows are **not written down here**, because a list typed into a document is
stale the moment somebody books. They come from stage 1 of the data op, which
reads them live:

```
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-1-preview.sql
```

Stage 1 writes nothing. Two of its sections are this list:

| Section | What it lists |
|---|---|
| `4. RECEPTION LIST A` | the same patient booked on **both** JP rows at the **same start time** |
| `4b. RECEPTION LIST B` | two **different** patients booked over each other on **one** JP row |

The columns to copy off the screen, and nothing else:

| Column | What it is |
|---|---|
| `patient_id` | the patient, as an id. Look it up on the screen; no name is printed here |
| `cb_row_appointment` / `lv_row_appointment` | the two bookings of list A, one per JP row |
| `appointment_one` / `appointment_two` | the two overlapping bookings of list B |
| `cb_row_clinic` / `lv_row_clinic` | which clinic each booking is at. This is what decides which one stands |
| `starts_lisbon` | the date and time, already in Lisbon time |
| `verdict` | list A only: whether both sides are still live |

Section 4's last column, `verdict`, already separates the rows that need a
decision (`BOTH STILL SCHEDULED`) from the ones where one side is already
cancelled or a no-show, which need nothing.

---

## Instruções para a receção

**Lista A — o mesmo paciente em duas marcações à mesma hora.**

Isto é uma marcação só, registada duas vezes: uma em cada linha do JP. O
paciente só vai ser visto uma vez.

1. Abre as duas marcações pelo `id` (Agenda, ou a ficha do paciente).
2. Confirma que são a mesma consulta: mesmo paciente, mesma hora, mesmo dia.
3. Vê a **clínica** de cada uma (colunas `cb_row_clinic` e `lv_row_clinic`).
   Fica com a que está na clínica onde o paciente vai ser visto.
4. Cancela a outra. **Cancelar → fica no histórico, nunca é apagada.**
5. Se as duas estiverem em clínicas diferentes e não souberes qual é a certa,
   **não canceles nenhuma** e pergunta antes de decidir.

**Lista B — dois pacientes diferentes à mesma hora, no mesmo terapeuta.**

Isto é uma sobreposição real: duas pessoas marcadas ao mesmo tempo para a mesma
pessoa. Uma delas tem de mudar de hora.

1. Abre as duas marcações pelo `id`.
2. Decide qual se mantém (normalmente a que foi marcada primeiro).
3. **Remarca** a outra para uma hora livre, e avisa o paciente pelo meio
   habitual. Remarcar não envia nada ao paciente automaticamente.

**Regra que não muda:** nunca apagues uma marcação. Cancelar e remarcar deixam
histórico; apagar não.

---

## What this list does not cover

- **Appointments in the past.** They are never touched, by anyone, in any stage.
  A duplicate that already happened stays exactly as it is.
- **The schedule rows themselves.** Those are the data op's job
  (`docs/data-op-staff-10.md`). Reception changes no working hours.
- **The reminders already sent.** Three reminders had already reached patients on
  duplicate pairs when this was measured. Nothing recalls a message that has been
  delivered; if a patient asks, the booking that stands is the one reception kept.

## A number in this file would be a lie by the time you read it

The dispatch that commissioned this work measured 9 pairs booked on both rows, 1
pair split across Castelo Branco and Linda-a-Velha, and 2 real double bookings at
Linda-a-Velha. Those figures are **history**: they were true at the hour they
were read. This file deliberately carries none of them, and stage 1 is the only
authority for what is true now.

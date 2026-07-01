# Demo script — week ending 2026-07-01

> Loom script, English (team comms are English). Target: 3 minutes, under 450
> spoken words at normal pace. `[SHOW: ...]` lines are stage directions, not
> spoken — they are not counted toward the word budget.

## Opening (15s)

[SHOW: Início dashboard, logged in as Admin]

This week's demo covers three things: dashboard and navigation cleanup, four
new fields on the patient profile, and a batch of terminology and
accessibility fixes under the hood.

## Segment 1 (45s) — Dashboard and nav changes

[SHOW: Início dashboard — point to the two-panel row where "Resumo semanal"
now sits alone]

First, Início. We removed the "Próximas marcações" card — it was duplicating
what's already on Agenda, so now Resumo semanal has the row to itself.

[SHOW: Click into the sidebar nav, hover over "Revisão Consulta"]

Second, we renamed "Revisão" to "Revisão Consulta" in the nav and page title,
so it reads clearly as the AI-review queue, not a generic review screen. Same
route, just a clearer label.

## Segment 2 (60s) — Patient profile fields

[SHOW: Open a patient profile with data filled in, scroll to "Dados
pessoais" card]

On Pacientes, the profile now surfaces four fields we didn't have before:
Profissão, Localidade, Região, and Notas — all under Dados pessoais.

[SHOW: Point to a patient missing one of these fields]

If a field's empty, the row just doesn't render — no blank placeholders
cluttering the card.

[SHOW: Scroll up to where NIF sits, point to empty space beside it]

One thing still open: patient ID is not shown yet. That's waiting on JP to
confirm the ID format — sequential, prefixed, whatever the clinic needs —
before we generate real values.

## Segment 3 (45s) — Quality work (summarize, do not screen-share JSON)

[SHOW: Stay on camera / face, no screen share]

A few quality passes, no screen-share needed. i18n standardization: PT copy
now consistently says "registo clínico," not "ficha," and we fixed a couple
of PT/EN term mismatches and one English anglicism — "Red Flags" is now
"Sinais de Alarme." Accessibility: dialogs and drawers now expose proper
roles and visible titles for screen readers. And docs: we refreshed the
staff FAQ, the in-app help text reference, and added plain-English test
scenarios for QA.

## Closing (15s)

[SHOW: Back to Início or face camera]

Next up: this week landed the backend migrations for confirmation state,
therapist-service mapping, and availability, so items four through six move
to my queue next. Items seven through nine still need Ivan's lifecycle and
batch-engine work.

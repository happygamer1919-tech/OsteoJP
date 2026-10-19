---
id: pacientes.alterar-terapeuta
title: Alterar o terapeuta de uma marcação na ficha
goal: Passar uma marcação para outro terapeuta sem mudar a hora.
roles: rececao, proprietario
order: rececao 9, proprietario 11
capability: appointments:delete
screens: ficha-paciente
---
## Alterar o terapeuta de uma marcação na ficha

1. Na ficha do paciente, abra o separador **Marcações**.
2. Numa marcação **Agendada** ou **Confirmada**, clique em **Gerir marcação**.
3. Em **Terapeuta**, escolha o novo nome. A lista mostra quem pode ser marcado na clínica dessa marcação, e o terapeuta atual.
4. Clique em **Alterar terapeuta**. Guardada a alteração, aparece **Terapeuta alterado.**

A hora, a clínica e o pacote da marcação não mudam. A alteração fica no registo de auditoria. Numa marcação do portal já confirmada, o paciente pode receber outra mensagem de confirmação.

A plataforma faz as mesmas verificações que a **Agenda** e recusa a alteração quando:

* o terapeuta tem horário nessa clínica e não trabalha a essa hora: por baixo do campo aparece o horário desse terapeuta nesse dia;
* outra marcação do terapeuta ou da sala, ou uma ausência do terapeuta, choca com esta: aparece o aviso da agenda, por exemplo **Conflito de terapeuta**, com a hora em causa;
* a hora fica fora do horário de marcação da clínica (o último início é uma hora antes do fecho) ou dentro do fecho ao almoço.

Aqui não há **Guardar mesmo assim**: um conflito recusa a alteração. Para mudar também a hora, use **Reagendar**.

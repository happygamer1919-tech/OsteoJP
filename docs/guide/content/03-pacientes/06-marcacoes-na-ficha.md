---
id: pacientes.marcacoes-na-ficha
title: Marcar, cancelar ou corrigir um estado a partir da ficha
goal: Gerir as marcações de um paciente sem passar pela agenda.
roles: rececao, terapeuta, proprietario
order: rececao 3, terapeuta 3, proprietario 6
capability: appointments:write
screens: ficha-paciente
---
## Marcar, cancelar ou corrigir um estado a partir da ficha

Marcar a próxima consulta:

1. Na ficha, abra o separador **Marcações**.
2. Na marcação que quer repetir, clique em **Marcar novamente**, escolha a **Data** e a **Hora** e clique em **Marcar**. Em alternativa, use **Nova marcação** no topo da ficha.

Cancelar uma marcação:

1. No separador **Marcações**, na marcação certa, clique em **Gerir marcação**.
2. Clique em **Cancelar marcação**, escreva o **Motivo do cancelamento** se quiser e confirme em **Cancelar marcação**.

Em **Gerir marcação** também encontra **Reagendar** e a mudança de **Estado**, com **Aplicar**.

::: terapeuta
Só pode cancelar marcações em que é **Terapeuta** ou **Terapeuta 2**.
:::

::: rececao proprietario
Se uma consulta ficou com o estado final errado (por exemplo **Falta** em vez de **Concluída**), em **Gerir marcação** escolha o estado certo em **Corrigir estado** e clique em **Corrigir**. A correção fica no registo de auditoria.
:::

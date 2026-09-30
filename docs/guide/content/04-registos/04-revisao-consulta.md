---
id: registos.revisao-consulta
title: Rever e finalizar um registo da Revisão Consulta
goal: Corrigir o que veio da gravação ou do formulário e finalizar.
roles: terapeuta, proprietario
order: terapeuta 3, proprietario 1
capability: clinical_records:review
screens: revisao-consulta
review: CARE-02a
---
## Rever e finalizar um registo da Revisão Consulta

**Revisão Consulta** é a fila dos registos que vêm das gravações (origem **IA**) e dos formulários dos pacientes (origem **Paciente**). O **Estado** é **Por rever** ou **Em revisão**.

1. Se a fila for longa, procure o paciente em **Pesquisar por paciente**.
2. Clique em **Assumir** num item **Por rever**, ou em **Abrir** num item **Em revisão**. Abre **Rever e finalizar**.
3. Corrija o que for preciso. Numa gravação, clique em **Guardar**; num formulário de paciente, corrija **Campos narrativos (texto livre)** e clique em **Guardar narrativa**.
4. Quando estiver certo, clique em **Finalizar (assinar e bloquear)**.

**Finalizar (assinar e bloquear)** não pede confirmação e não guarda as alterações por si: guarde primeiro. Para sair sem finalizar, clique em **Voltar à fila**. Se aparecer **Campos não reconhecidos**, verifique esses dados antes de finalizar. Nos formulários, os campos codificados e os sinais de alarme preenchem-se à mão.

::: terapeuta
Pacientes visíveis: a fila mostra só os registos dos pacientes da sua lista **Pacientes**.
:::

::: proprietario
Como Proprietário, vê a fila da clínica inteira.
:::

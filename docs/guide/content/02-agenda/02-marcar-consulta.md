---
id: agenda.marcar-consulta
title: Marcar uma consulta
goal: Criar uma marcação para um paciente que já tem ficha.
roles: rececao, terapeuta, proprietario
order: rececao 1, terapeuta 3, proprietario 2
capability: appointments:write
screens: agenda
shots: agenda.marcar-consulta
faq: marcar-consulta
review: CARE-02a
---
## Marcar uma consulta

1. Clique em **Nova marcação**. No computador, também pode clicar num espaço livre da grelha, que já traz o dia e a hora.
2. Em **Paciente**, escreva parte do nome e escolha o paciente na lista.
3. Escolha o **Terapeuta**. O **Serviço** fica preenchido com o serviço habitual desse terapeuta; mude se a consulta for de outro serviço.
4. Se trabalhar com mais de uma clínica, escolha a **Localização**.
5. Confirme **Data**, **Hora** e **Duração**. O quadro **Disponibilidade** mostra os **Horários livres** do terapeuta; clique num deles para preencher a hora.
6. Escreva uma nota em **Notas**, se precisar, e clique em **Guardar**.

::: terapeuta
O campo **Terapeuta** já traz o seu nome; se a clínica tiver um equipamento partilhado, pode escolhê-lo no mesmo campo. A pesquisa de **Paciente** só encontra os pacientes da sua lista **Pacientes**.
:::

A janela não cria pacientes: quem ainda não tem ficha regista-se primeiro em **Pacientes**, **Novo paciente**.

Se houver conflito (terapeuta ou sala ocupados, ou uma ausência), aparece um aviso e o botão passa a **Guardar mesmo assim**: use-o só com certeza. Uma hora fora do horário do terapeuta ou com a clínica fechada é sempre recusada.

![Marcar uma consulta no telemóvel](../../../../apps/web/public/ajuda/agenda/marcar-consulta-390.png)
![Marcar uma consulta no computador](../../../../apps/web/public/ajuda/agenda/marcar-consulta-desktop.png)

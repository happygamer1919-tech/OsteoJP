---
id: portal.confirmacao-ao-paciente
title: A confirmação que o paciente recebe
goal: Saber que mensagem segue quando um pedido é confirmado, e o que fazer quando nenhuma pode seguir.
roles: rececao, proprietario
order: rececao 6, proprietario 8
capability: appointments:write
screens: notificacoes
---
## A confirmação que o paciente recebe

Quando um pedido de marcação do portal é confirmado, ou quando marca um pedido de novo cliente a partir de **Criar paciente e marcar**, o paciente recebe uma única mensagem:

* por email, se a ficha tiver **Email**: a data, a hora, o serviço, o terapeuta, o local, a morada e o telefone do local;
* por SMS, só quando a ficha não tem email: a data, a hora, o local e o telefone do local.

Nunca recebe as duas. A mesma marcação, à mesma hora, só recebe uma confirmação.

Quando nenhuma mensagem pode seguir, quem confirmou vê um aviso: em **Notificações** e em **Respostas SMS**, por cima da lista, com o nome do paciente e a hora; na **Agenda** e na ficha, numa mensagem breve. Nesse caso, ligue ao paciente.

* **Paciente sem email: avise por telefone**: não há email, e não há um telemóvel português válido ou os SMS estão desligados para a clínica ou para o paciente.
* **Confirmação não enviada: o local não tem morada ou telefone. Avise o paciente por telefone.**
* **Confirmação não enviada: a marcação não tem serviço. Avise o paciente por telefone.** Só acontece quando a mensagem seguiria por email.

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

Quando confirma um pedido do portal, ou marca um pedido de novo cliente com **Criar paciente e marcar**, o paciente recebe uma única mensagem:

* por email, se a ficha tiver **Email**: a data, a hora, o serviço, o terapeuta, o local, a morada e o telefone do local;
* por SMS, só quando a ficha não tem email: a data, a hora, o local e o telefone do local.

Confirmar o mesmo pedido outra vez, para a mesma hora, não envia segunda confirmação.

Quando, ao confirmar, já se sabe que nenhuma mensagem pode seguir, quem confirmou vê um aviso: em **Notificações** e em **Respostas SMS**, por cima da lista; na **Agenda** e na ficha, numa mensagem breve.

* **Paciente sem email: avise por telefone**: sem email, e sem telemóvel português válido ou com os SMS desligados para a clínica ou para o paciente.
* **Confirmação não enviada: o local não tem morada ou telefone. Avise o paciente por telefone.**
* **Confirmação não enviada: a marcação não tem serviço. Avise o paciente por telefone.** Só acontece quando a mensagem seguiria por email.

Uma falha no envio não mostra aviso: sem aviso, a mensagem pode não ter chegado.

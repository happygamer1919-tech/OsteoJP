---
id: pacotes.marcar-com-pacote
title: Marcar com um pacote que o paciente já tem
goal: Descontar a sessão do pacote certo quando aparece o aviso.
roles: rececao, terapeuta, proprietario
order: rececao 2, terapeuta 1, proprietario 3
capability: appointments:write
screens: agenda
---
## Marcar com um pacote que o paciente já tem

Quando o paciente tem sessões pagas por usar, a janela **Nova marcação** avisa logo que o escolhe.

1. Em **Nova marcação**, escolha o **Paciente**.
2. Se aparecer **Este utente tem sessões por usar**, veja cada pacote e as sessões que restam.
3. Clique em **Marcar com este pacote** no pacote certo. O **Pacote** e o **Serviço** ficam preenchidos, mas a consulta ainda não fica marcada.
4. Por baixo aparece **Sessões restantes** com o saldo desse pacote.
5. Escolha o **Terapeuta**, a **Data** e a **Hora**, e clique em **Guardar**. A sessão fica descontada do pacote.

Um pacote vale para um só serviço. Com um serviço já escolhido, o aviso mostra só os pacotes desse serviço; sem serviço, mostra todos. Se o aviso não aparece, o paciente não tem sessões por usar para esse serviço.

Também pode escolher o pacote diretamente no campo **Pacote**. Se o pacote não tiver sessões suficientes, a marcação é recusada com uma mensagem que indica onde ver o saldo.

# Guia da plataforma: esboço por perfil

> **Esboço, não é o guia.** O texto completo espera por três coisas: o CARE-02 (quem acompanha cada paciente e o que cada terapeuta vê da ficha), o filtro por serviço na agenda (já no main, #1450) e a decisão do proprietário sobre o formato do guia. Até lá, este ficheiro tem só a lista de ecrãs de cada perfil, uma linha por ecrã e o nome das capturas.

Como ler este esboço:

* Cada perfil lista os ecrãs a que tem acesso, pela ordem do menu lateral (com os ecrãs que se abrem a partir deles), e depois os dois que se abrem a partir do topo da página.
* O que cada perfil vê vem da matriz de permissões da plataforma (`packages/auth/permissions.ts`) e do menu (`apps/web/lib/nav/nav-items.ts`). O menu só mostra o que o perfil pode abrir.
* Cada ecrã tem duas capturas: telemóvel (390 por 844) e computador (1440 por 900), em `screens/<perfil>/`.
* As capturas foram feitas numa instalação local, com dados fictícios. Nenhum nome nas imagens é de uma pessoa real.
* O perfil Administrador não entra neste esboço.

## Receção

Menu: Início, Agenda, Pacientes, Marcações, Comunicações, Faturação, Horários. No topo: Notificações e O meu perfil.

* **Início** (`/dashboard`): o resumo do dia, com as marcações de hoje e os acessos rápidos. Capturas: [telemóvel](screens/rececao/inicio-390.png), [computador](screens/rececao/inicio-desktop.png).
* **Agenda** (`/agenda`): as marcações de todos os terapeutas da unidade, por dia ou por semana, onde se marca, muda e cancela. Capturas: [telemóvel](screens/rececao/agenda-390.png), [computador](screens/rececao/agenda-desktop.png).
* **Pacientes** (`/patients`): a lista de pacientes, com pesquisa por nome, NIF ou telefone. Capturas: [telemóvel](screens/rececao/pacientes-390.png), [computador](screens/rececao/pacientes-desktop.png).
* **Novo paciente** (`/patients/new`): o registo de um paciente que chega pela primeira vez. Capturas: [telemóvel](screens/rececao/novo-paciente-390.png), [computador](screens/rececao/novo-paciente-desktop.png).
* **Ficha do paciente** (`/patients/<id>`): dados pessoais, marcações, notas, documentos e faturação de um paciente, sem registos clínicos. Capturas: [telemóvel](screens/rececao/ficha-paciente-390.png), [computador](screens/rececao/ficha-paciente-desktop.png).
* **Marcações** (`/marcacoes`): a lista de marcações com filtros por datas, local, estado, serviço e terapeuta. Capturas: [telemóvel](screens/rececao/marcacoes-390.png), [computador](screens/rececao/marcacoes-desktop.png).
* **Comunicações, Recuperação** (`/recuperacao`): pacientes que estiveram em tratamento e não têm marcação futura, para contactar. Capturas: [telemóvel](screens/rececao/recuperacao-390.png), [computador](screens/rececao/recuperacao-desktop.png).
* **Comunicações, Lembretes SMS** (`/comunicacoes/lembretes-sms`): cada SMS enviado a um paciente e o que lhe aconteceu. Capturas: [telemóvel](screens/rececao/lembretes-sms-390.png), [computador](screens/rececao/lembretes-sms-desktop.png).
* **Faturação** (`/invoicing`): emitir e consultar faturas. Capturas: [telemóvel](screens/rececao/faturacao-390.png), [computador](screens/rececao/faturacao-desktop.png).
* **Horários** (`/horarios`): horários de trabalho e ausências dos terapeutas da unidade. Capturas: [telemóvel](screens/rececao/horarios-390.png), [computador](screens/rececao/horarios-desktop.png).
* **Notificações** (`/notificacoes`): pedidos de remarcação, pedidos de marcação do portal e de novos clientes, gravações por processar, pacientes sem SMS e alterações feitas pelos pacientes. Capturas: [telemóvel](screens/rececao/notificacoes-390.png), [computador](screens/rececao/notificacoes-desktop.png).
* **O meu perfil** (`/perfil`): o nome e a palavra-passe da própria conta. Capturas: [telemóvel](screens/rececao/perfil-390.png), [computador](screens/rececao/perfil-desktop.png).

## Terapeuta

Menu: Início, Agenda, Pacientes, Marcações, Comunicações, Revisão Consulta, Horários. No topo: Notificações e O meu perfil.

* **Início** (`/dashboard`): o resumo do dia, com as suas marcações de hoje e os acessos rápidos. Capturas: [telemóvel](screens/terapeuta/inicio-390.png), [computador](screens/terapeuta/inicio-desktop.png).
* **Agenda** (`/agenda`): as suas marcações, por dia ou por semana. Capturas: [telemóvel](screens/terapeuta/agenda-390.png), [computador](screens/terapeuta/agenda-desktop.png).
* **Pacientes** (`/patients`): os pacientes que acompanha, com pesquisa. Capturas: [telemóvel](screens/terapeuta/pacientes-390.png), [computador](screens/terapeuta/pacientes-desktop.png).
* **Ficha do paciente** (`/patients/<id>`): dados, marcações, notas, registos clínicos, documentos e faturação de um paciente seu. Capturas: [telemóvel](screens/terapeuta/ficha-paciente-390.png), [computador](screens/terapeuta/ficha-paciente-desktop.png).
* **Nova ficha clínica** (`/clinical/new`): abrir uma ficha clínica nova para um paciente. Capturas: [telemóvel](screens/terapeuta/nova-ficha-390.png), [computador](screens/terapeuta/nova-ficha-desktop.png).
* **Iniciar consulta** (`/consultation`): começar a gravação de uma consulta, que dá origem a um registo por rever. Capturas: [telemóvel](screens/terapeuta/iniciar-consulta-390.png), [computador](screens/terapeuta/iniciar-consulta-desktop.png).
* **Marcações** (`/marcacoes`): a lista das marcações dos seus pacientes, com filtros. Capturas: [telemóvel](screens/terapeuta/marcacoes-390.png), [computador](screens/terapeuta/marcacoes-desktop.png).
* **Comunicações, Recuperação** (`/recuperacao`): os seus pacientes que não voltaram a marcar. Capturas: [telemóvel](screens/terapeuta/recuperacao-390.png), [computador](screens/terapeuta/recuperacao-desktop.png).
* **Revisão Consulta** (`/clinical/review`): registos vindos das gravações e formulários de pacientes, à espera da sua revisão. Capturas: [telemóvel](screens/terapeuta/revisao-consulta-390.png), [computador](screens/terapeuta/revisao-consulta-desktop.png).
* **Horários** (`/horarios`): o seu horário de trabalho e as suas ausências. Capturas: [telemóvel](screens/terapeuta/horarios-390.png), [computador](screens/terapeuta/horarios-desktop.png).
* **Notificações** (`/notificacoes`): pedidos de remarcação e de marcação, gravações por processar, pacientes sem SMS e alterações feitas pelos pacientes. Capturas: [telemóvel](screens/terapeuta/notificacoes-390.png), [computador](screens/terapeuta/notificacoes-desktop.png).
* **O meu perfil** (`/perfil`): o nome e a palavra-passe da própria conta. Capturas: [telemóvel](screens/terapeuta/perfil-390.png), [computador](screens/terapeuta/perfil-desktop.png).

## Proprietário

Menu: Início, Agenda, Pacientes, Marcações, Comunicações, Faturação, Revisão Consulta, Estatísticas, Horários, Administração. No topo: Notificações e O meu perfil. O Proprietário abre também Nova ficha clínica e Iniciar consulta, que estão descritos em Terapeuta.

* **Início** (`/dashboard`): o resumo do dia da clínica, com as marcações de hoje e os acessos rápidos. Capturas: [telemóvel](screens/proprietario/inicio-390.png), [computador](screens/proprietario/inicio-desktop.png).
* **Agenda** (`/agenda`): as marcações de toda a equipa, em todos os locais, por dia ou por semana. Capturas: [telemóvel](screens/proprietario/agenda-390.png), [computador](screens/proprietario/agenda-desktop.png).
* **Pacientes** (`/patients`): todos os pacientes da clínica, com pesquisa. Capturas: [telemóvel](screens/proprietario/pacientes-390.png), [computador](screens/proprietario/pacientes-desktop.png).
* **Ficha do paciente** (`/patients/<id>`): tudo sobre um paciente, incluindo registos clínicos e faturação. Capturas: [telemóvel](screens/proprietario/ficha-paciente-390.png), [computador](screens/proprietario/ficha-paciente-desktop.png).
* **Marcações** (`/marcacoes`): a lista de todas as marcações, com filtros. Capturas: [telemóvel](screens/proprietario/marcacoes-390.png), [computador](screens/proprietario/marcacoes-desktop.png).
* **Comunicações, Recuperação** (`/recuperacao`): pacientes que não voltaram a marcar, para contactar. Capturas: [telemóvel](screens/proprietario/recuperacao-390.png), [computador](screens/proprietario/recuperacao-desktop.png).
* **Comunicações, Lembretes SMS** (`/comunicacoes/lembretes-sms`): cada SMS enviado a um paciente e o que lhe aconteceu. Capturas: [telemóvel](screens/proprietario/lembretes-sms-390.png), [computador](screens/proprietario/lembretes-sms-desktop.png).
* **Faturação** (`/invoicing`): emitir e consultar faturas. Capturas: [telemóvel](screens/proprietario/faturacao-390.png), [computador](screens/proprietario/faturacao-desktop.png).
* **Revisão Consulta** (`/clinical/review`): registos vindos das gravações e formulários de pacientes, à espera de revisão. Capturas: [telemóvel](screens/proprietario/revisao-consulta-390.png), [computador](screens/proprietario/revisao-consulta-desktop.png).
* **Estatísticas, Painel** (`/estatisticas/painel`): receita e volume das marcações. Capturas: [telemóvel](screens/proprietario/estatisticas-painel-390.png), [computador](screens/proprietario/estatisticas-painel-desktop.png).
* **Estatísticas, Indicadores** (`/estatisticas/indicadores`): os indicadores da clínica (KPI). Capturas: [telemóvel](screens/proprietario/estatisticas-indicadores-390.png), [computador](screens/proprietario/estatisticas-indicadores-desktop.png).
* **Horários** (`/horarios`): horários de trabalho e ausências de toda a equipa. Capturas: [telemóvel](screens/proprietario/horarios-390.png), [computador](screens/proprietario/horarios-desktop.png).
* **Administração, Resumo** (`/admin`): a entrada da gestão da clínica. Capturas: [telemóvel](screens/proprietario/admin-resumo-390.png), [computador](screens/proprietario/admin-resumo-desktop.png).
* **Administração, Definições da Clínica** (`/admin/settings`): dados da clínica, preferências, lembretes e faturação. Capturas: [telemóvel](screens/proprietario/admin-definicoes-390.png), [computador](screens/proprietario/admin-definicoes-desktop.png).
* **Administração, Equipa** (`/admin/staff`): utilizadores, funções, acessos e horários de cada pessoa. Capturas: [telemóvel](screens/proprietario/admin-equipa-390.png), [computador](screens/proprietario/admin-equipa-desktop.png).
* **Administração, Serviços** (`/admin/services`): serviços, durações e preços. Capturas: [telemóvel](screens/proprietario/admin-servicos-390.png), [computador](screens/proprietario/admin-servicos-desktop.png).
* **Administração, Locais** (`/admin/locations`): os locais da clínica e os seus contactos. Capturas: [telemóvel](screens/proprietario/admin-locais-390.png), [computador](screens/proprietario/admin-locais-desktop.png).
* **Administração, Pacientes eliminados** (`/admin/pacientes-eliminados`): recuperar pacientes eliminados ou marcados como duplicados. Capturas: [telemóvel](screens/proprietario/admin-pacientes-eliminados-390.png), [computador](screens/proprietario/admin-pacientes-eliminados-desktop.png).
* **Administração, Teste de envio** (`/admin/messaging-check`): enviar um SMS de teste para confirmar que os envios funcionam. Capturas: [telemóvel](screens/proprietario/admin-teste-envio-390.png), [computador](screens/proprietario/admin-teste-envio-desktop.png).
* **Notificações** (`/notificacoes`): pedidos de remarcação, pedidos de marcação do portal e de novos clientes, gravações por processar, pacientes sem SMS e alterações feitas pelos pacientes. Capturas: [telemóvel](screens/proprietario/notificacoes-390.png), [computador](screens/proprietario/notificacoes-desktop.png).
* **O meu perfil** (`/perfil`): o nome e a palavra-passe da própria conta. Capturas: [telemóvel](screens/proprietario/perfil-390.png), [computador](screens/proprietario/perfil-desktop.png).

# Textos de ajuda — Plataforma de Equipa

> Referência de copy para tooltips e texto de ajuda expandida da plataforma de
> equipa (`apps/web`). Cada entrada inclui o label do campo (tal como aparece na
> interface), o tooltip (máximo 80 caracteres, visível ao passar o rato) e o
> parágrafo de ajuda expandida (2-3 frases, visível ao clicar em "?").
>
> Tom: clínico, direto, sem cortesia supérflua. Segue `docs/brand-voice.md §2.8`
> (interface de equipa) e §5 (registo de formulários). Não usa "por favor" nem
> "você" — o texto de ajuda é impessoal, orientado à tarefa.

---

## 1. Agenda — nova marcação

### Paciente

| | |
|---|---|
| **Label** | Paciente |
| **Tooltip** | Pesquise pelo nome, NIF ou telefone do paciente. |
| **Ajuda** | Escreva pelo menos dois caracteres para pesquisar. O campo aceita nome completo, NIF ou número de telefone — o sistema usa o índice combinado para devolver resultados em tempo real. Apenas pacientes registados na plataforma aparecem na lista; para registar um paciente novo, aceda a Pacientes → Novo paciente antes de criar a marcação. |

### Serviço

| | |
|---|---|
| **Label** | Serviço |
| **Tooltip** | Tipo de consulta — define a duração padrão automaticamente. |
| **Ajuda** | Selecione o serviço prestado nesta consulta (ex.: Osteopatia, Fisioterapia, NESA). A duração é preenchida automaticamente com o valor configurado em Definições → Serviços; pode ajustá-la no campo Duração sem alterar o padrão global. O campo é opcional: a marcação pode ser guardada sem serviço selecionado, mas a ausência impede a geração automática de linhas de fatura. |

### Terapeuta

| | |
|---|---|
| **Label** | Terapeuta |
| **Tooltip** | Profissional de saúde responsável por esta consulta. |
| **Ajuda** | Selecione o profissional que realiza a consulta. A lista inclui apenas os membros da equipa com a função Terapeuta ou Administrador. Campo obrigatório — a marcação não pode ser guardada sem terapeuta atribuído. |

### Clínica

| | |
|---|---|
| **Label** | Clínica |
| **Tooltip** | Clínica onde a consulta se realiza. |
| **Ajuda** | Selecione a clínica — Linda-a-Velha, Castelo Branco ou Montemor-o-Novo. A verificação de conflitos de sala é feita dentro da mesma clínica: salas com o mesmo nome em clínicas diferentes são tratadas como espaços distintos. Campo obrigatório. |

### Sala

| | |
|---|---|
| **Label** | Sala |
| **Tooltip** | Sala ou gabinete onde a consulta decorre. |
| **Ajuda** | Indique a sala ou gabinete onde a consulta se realiza (ex.: "Gabinete 1", "Sala NESA"). Este campo é opcional, mas necessário para a deteção automática de conflitos de dupla marcação por sala. Se a sala não for preenchida, a plataforma não verifica disponibilidade de espaço. |

### Data e hora

| | |
|---|---|
| **Label** | Data / Hora |
| **Tooltip** | Data e hora de início da consulta (fuso de Lisboa). |
| **Ajuda** | Todos os horários são guardados em UTC e apresentados no fuso horário de Lisboa (Europe/Lisbon), incluindo as transições de verão/inverno em março e outubro. Campos obrigatórios — a duração da consulta é calculada a partir da hora de início e do campo Duração. |

### Duração

| | |
|---|---|
| **Label** | Duração |
| **Tooltip** | Duração da consulta em minutos. |
| **Ajuda** | O valor padrão é definido pelo serviço selecionado; pode alterá-lo para esta marcação sem afetar o padrão global. As opções disponíveis são 30, 45, 60 e 90 minutos; durações fora deste intervalo podem ser introduzidas manualmente se o serviço assim o exigir. |

### Notas

| | |
|---|---|
| **Label** | Notas |
| **Tooltip** | Informação interna sobre esta marcação (não enviada ao paciente). |
| **Ajuda** | Utilize este campo para notas operacionais internas — preferências de acesso, alterações de última hora ou instruções específicas para a consulta. O conteúdo das notas não é partilhado com o paciente nem incluído nos relatórios clínicos; serve exclusivamente a equipa. |

### Estado

| | |
|---|---|
| **Label** | Estado |
| **Tooltip** | Estado atual da marcação no ciclo de vida da consulta. |
| **Ajuda** | Os estados disponíveis são: **Pendente** (criada mas ainda sem confirmação), **Confirmada** (confirmada com o paciente), **Concluída** (consulta realizada), **Cancelada** (cancelada antes de ocorrer) e **Não compareceu** (paciente não apareceu). A transição para "Cancelada" envia uma notificação ao paciente se as notificações estiverem ativas. |

---

## 2. Agenda — aviso de conflito

### Conflito detetado

| | |
|---|---|
| **Label** | Conflito detetado |
| **Tooltip** | Terapeuta, sala ou clínica já ocupados no horário selecionado. |
| **Ajuda** | A plataforma detetou pelo menos uma marcação já existente no mesmo horário para o terapeuta, a sala ou a clínica selecionados. É possível guardar a marcação na mesma selecionando "Guardar na mesma" — útil quando o conflito é intencional (ex.: dois terapeutas partilham secretária em horários sobrepostos). Conflitos não resolvidos ficam assinalados na agenda com um indicador visual. |

---

## 3. Agenda — marcação recorrente

### Marcação recorrente

| | |
|---|---|
| **Label** | Marcação recorrente |
| **Tooltip** | Cria várias consultas com o mesmo horário e terapeuta. |
| **Ajuda** | Ative esta opção para criar uma série de consultas repetidas com a mesma configuração. Defina a frequência (diária, semanal, bissemanal ou mensal) e o número de ocorrências. Cada consulta da série pode ser editada ou cancelada individualmente, ou pode aplicar alterações à série completa ou às consultas seguintes. |

### Frequência

| | |
|---|---|
| **Label** | Frequência |
| **Tooltip** | Intervalo entre consultas na série recorrente. |
| **Ajuda** | Selecione a periodicidade da repetição: diária, semanal (mesma semana), bissemanal (de duas em duas semanas) ou mensal (mesmo dia do mês). O padrão é semanal — o mais comum em reabilitação contínua. |

### Ocorrências

| | |
|---|---|
| **Label** | Ocorrências |
| **Tooltip** | Número total de consultas a criar nesta série. |
| **Ajuda** | Indique o número total de consultas a criar, incluindo a primeira. Valor mínimo: 2; máximo: 52. As marcações são criadas de imediato e aparecem na agenda; conflitos em datas futuras são assinalados mas não impedem a criação da série. |

---

## 4. Ficha do paciente — episódio vs. registo

### Episódio clínico

| | |
|---|---|
| **Label** | Episódio clínico |
| **Tooltip** | Agrupador de consultas por queixa ou fase de tratamento. |
| **Ajuda** | Um episódio clínico representa um ciclo de tratamento com uma queixa ou objetivo definido — por exemplo, "Lombalgia aguda, março 2026" ou "Reabilitação pós-cirurgia, 2.º semestre". Cada episódio contém um ou mais registos clínicos individuais e permite acompanhar a evolução do paciente ao longo do tempo sem misturar queixas distintas num único documento. |

### Registo clínico

| | |
|---|---|
| **Label** | Registo clínico |
| **Tooltip** | Documento da avaliação e notas de uma consulta específica. |
| **Ajuda** | O registo clínico documenta uma consulta individual — anamnese, avaliação, plano de tratamento e notas de evolução. É criado dentro de um episódio e segue o seu próprio ciclo de estados: Rascunho → Bloqueada → Assinada. Depois de assinado, o registo torna-se imutável; futuras correções criam uma adenda versionada associada ao registo original. |

---

## 5. Ficha do paciente — "Assinar e bloquear"

### Assinar e bloquear

| | |
|---|---|
| **Label** | Assinar e bloquear |
| **Tooltip** | Finaliza o registo clínico. Esta ação é irreversível. |
| **Ajuda** | Ao assinar e bloquear, o profissional confirma que o conteúdo do registo é clinicamente correto e assume a responsabilidade pelo mesmo. O registo passa ao estado "Assinada" e fica permanentemente imutável — não pode ser editado, eliminado nem revertido. Qualquer correção posterior deve ser feita através de uma adenda, que fica associada ao registo original e preserva o histórico completo. |

---

## 6. Ficha do paciente — fundir duplicados

### Fundir duplicado

| | |
|---|---|
| **Label** | Fundir duplicado |
| **Tooltip** | Une dois perfis do mesmo paciente. Esta ação é irreversível. |
| **Ajuda** | Utilize esta função quando o mesmo paciente foi registado duas vezes por engano. Selecione o ID do perfil a manter (sobrevivente): todo o histórico clínico, marcações e documentos do duplicado são transferidos para esse perfil. O perfil duplicado é marcado como "Fundido" e fica inacessível — esta ação não pode ser anulada. |

---

## 7. Registos clínicos — extração por IA

### Extração automática de dados

| | |
|---|---|
| **Label** | Extração automática de dados |
| **Tooltip** | Envia o registo para revisão assistida por IA. Dados de saúde incluídos. |
| **Ajuda** | Quando ativada, a plataforma envia o conteúdo do registo clínico para o parceiro de IA para extração estruturada de dados (diagnósticos, procedimentos, parâmetros clínicos). O registo fica no estado "Para revisão" até um profissional validar ou rejeitar o resultado; apenas após validação o registo pode ser assinado. Os dados são tratados nos termos do contrato de subcontratação de dados vigente e nunca utilizados para treino de modelos sem autorização expressa da clínica. |

---

## 8. Registos clínicos — ficha bloqueada

### Ficha bloqueada

| | |
|---|---|
| **Label** | Bloqueada |
| **Tooltip** | Registo finalizado e imutável. Alterações criam uma adenda. |
| **Ajuda** | O indicador de cadeado no topo do formulário significa que o registo foi assinado e está permanentemente bloqueado. Não é possível editar, eliminar nem alterar o conteúdo. Para corrigir informação, utilize a ação "Criar adenda" — a adenda fica associada ao registo original e ambos são apresentados juntos no relatório clínico. |

---

## 9. Registos clínicos — assinatura

### Assinatura

| | |
|---|---|
| **Label** | Assinatura |
| **Tooltip** | Identifica o profissional que finalizou o registo e a data. |
| **Ajuda** | O bloco de assinatura regista automaticamente o nome do profissional e a data e hora em que o registo foi assinado. Este bloco é gerado pelo sistema e não pode ser alterado manualmente. Aparece nos relatórios clínicos impressos conforme exigido pela regulamentação vigente; é a evidência legal de autoria do documento. |

---

## 10. Faturação — tipo de documento

### Tipo de documento

| | |
|---|---|
| **Label** | Tipo de documento |
| **Tooltip** | Fatura (a receber) ou fatura-recibo (pago no momento). |
| **Ajuda** | Uma **fatura** documenta uma prestação de serviços com pagamento diferido — o paciente paga posteriormente. Uma **fatura-recibo** combina a fatura e o comprovativo de pagamento num único documento, emitido quando o pagamento é efetuado no momento da consulta. A distinção tem implicações fiscais: emita sempre o tipo correspondente ao momento real do pagamento. Em caso de dúvida, consulte o contabilista da clínica. |

---

## 11. Faturação — NIF

### NIF

| | |
|---|---|
| **Label** | NIF |
| **Tooltip** | Número fiscal do paciente. Obrigatório para despesas dedutíveis no IRS. |
| **Ajuda** | O NIF do paciente é obrigatório sempre que este pretenda deduzir a despesa de saúde no IRS. Sem NIF, a fatura é emitida em nome do "Consumidor final" e não pode ser posteriormente associada ao contribuinte — esta situação não é reversível após a emissão. Verifique sempre a intenção do paciente antes de emitir a fatura. |

---

## 12. Faturação — estados MB WAY

### Estado MB WAY

| | |
|---|---|
| **Label** | Estado MB WAY |
| **Tooltip** | Estado do pedido de pagamento enviado para o telemóvel do paciente. |
| **Ajuda** | Após enviar o pedido MB WAY, o paciente tem 4 minutos para confirmar na aplicação. Os estados possíveis são: **Pendente** — aguarda confirmação; **Confirmado** — pagamento concluído com sucesso; **Expirado** — o prazo terminou sem resposta; **Recusado** — o paciente recusou o pagamento. Em caso de expiração ou recusa, reenvie o pedido ou utilize um método alternativo; a fatura permanece em aberto até o pagamento ser registado. |

---

## 13. Definições — duração do serviço

### Duração

| | |
|---|---|
| **Label** | Duração (min) |
| **Tooltip** | Duração padrão das consultas deste serviço, em minutos. |
| **Ajuda** | A duração configurada aqui é aplicada automaticamente ao criar uma nova marcação com este serviço. Pode ser substituída marcação a marcação sem afetar este valor global. Alterar a duração padrão não afeta marcações já criadas — apenas as novas. |

---

## 14. Definições — sala e clínica

### Clínica / Sala

| | |
|---|---|
| **Label** | Clínica / Sala |
| **Tooltip** | Espaço físico onde o serviço é prestado. |
| **Ajuda** | A atribuição de clínica e sala define onde o serviço é prestado por defeito. A plataforma verifica conflitos de sala automaticamente ao criar marcações: se dois serviços partilharem a mesma sala na mesma clínica no mesmo horário, é apresentado um aviso de dupla marcação. Salas com o mesmo nome em clínicas diferentes são tratadas como espaços distintos. |

---

## 15. Definições — funções de utilizador

### Rececionista

| | |
|---|---|
| **Label** | Rececionista |
| **Tooltip** | Gere marcações, pacientes e faturação. Sem acesso a registos clínicos. |
| **Ajuda** | A rececionista pode criar e gerir marcações, registar e atualizar fichas de pacientes, emitir faturas e gerir documentos administrativos. Não tem acesso ao conteúdo de registos clínicos nem pode criar ou assinar episódios e fichas clínicas. Esta é a função recomendada para pessoal administrativo e de secretariado. |

### Terapeuta

| | |
|---|---|
| **Label** | Terapeuta |
| **Tooltip** | Acede aos registos clínicos dos seus pacientes. Não emite faturas. |
| **Ajuda** | O terapeuta tem acesso completo aos registos clínicos dos pacientes atribuídos às suas consultas. Pode criar, editar e assinar episódios e fichas clínicas. Não tem acesso à faturação nem às definições de administração. Esta função abrange osteopatas, fisioterapeutas e outros profissionais de saúde da clínica. |

### Administrador

| | |
|---|---|
| **Label** | Administrador |
| **Tooltip** | Acesso total: marcações, clínica, registos clínicos e faturação. |
| **Ajuda** | O administrador tem acesso a todas as funcionalidades da plataforma: gestão de marcações, pacientes, registos clínicos, faturação e definições da clínica (serviços, clínicas, membros da equipa). Atribua esta função apenas a utilizadores de confiança, dado o acesso a dados sensíveis de saúde. |

---

## Notas de implementação

- **Tooltips**: apresentados num `<Tooltip>` ao passar o rato sobre o ícone `?`
  junto ao label do campo. Máximo 80 caracteres incluindo espaços e pontuação.
- **Ajuda expandida**: apresentada num painel colapsável (clique em `?`) ou num
  `<HelpPanel>` modal, com largura máxima de 400 px. Admite negrito (`**termo**`)
  para destacar conceitos-chave.
- **Strings i18n**: os textos acima devem ser adicionados a
  `packages/i18n/src/strings.pt.json` sob o prefixo `help.*` e ao
  `strings.en.json` correspondente (tradução EN pendente de revisão nativa).
  Exemplo: `help.appointment.patient.tooltip`, `help.appointment.patient.body`.
- **Versão**: os textos de ajuda expandida para as secções de IA (§7) e
  fatura-recibo (§10) estão sujeitos a revisão quando a funcionalidade
  correspondente for ativada. Marcar com `// TODO: review on Phase 4 activation`.

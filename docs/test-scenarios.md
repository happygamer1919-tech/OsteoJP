# Cenários de Teste — Plataforma OsteoJP

Guia de teste manual em linguagem simples para a plataforma de staff (`apps/web`). Cada cenário está fundamentado no código atual (rotas, ações de servidor, `packages/auth/permissions.ts` e `packages/i18n/src/strings.pt.json`) e nas especificações Playwright em `apps/web/e2e/`. Onde uma funcionalidade está limitada por permissão, por configuração em falta, ou ainda não implementada, isso é indicado na Precondição ou no Resultado esperado — não é descrito como se estivesse disponível.

Terminologia usada neste documento: **"registo clínico"** (não "ficha clínica") e **"marcação"** (não "consulta") para o conceito de agendamento, seguindo a convenção do produto. Onde o texto real do ecrã ainda usa um termo diferente (por exemplo, o botão "Criar ficha" ou o estado vazio "Sem consultas"), esse texto é citado tal como aparece — é uma inconsistência de cópia existente no produto, não um erro deste documento.

---

## Pacientes

### Scenario: Registo de novo paciente
Actor: receptionist
Precondition: Utilizador com sessão iniciada e função com `patients:write` (receção, terapeuta, administrador ou proprietário). Está na aplicação (qualquer página).
Steps:
1. Navegar para "Pacientes" e clicar em "Novo paciente".
2. Preencher "Nome completo" (único campo obrigatório).
3. Opcionalmente preencher "Data de nascimento", "Sexo", "NIF", "Telemóvel", "Email", "Localidade", "Código postal", "Morada", "Notas".
4. Clicar em "Criar paciente".
Expected result: Redirecionamento para `/patients/{id}`, com o nome do paciente no cabeçalho e os dados preenchidos visíveis nos cartões "Dados pessoais" e "Contactos".
Edge cases:
- Submeter apenas com "Nome completo" preenchido — deve criar o paciente com sucesso (único campo obrigatório no formulário).
- Deixar "Nome completo" vazio — o botão "Criar paciente" não avança (validação nativa do campo obrigatório).
- Criar dois pacientes com o mesmo NIF ou telefone — o formulário não impede duplicados; a deduplicação é feita depois, por via da função "Fundir duplicado" no perfil do paciente (ver histórico/fusão, não coberto aqui).

---

### Scenario: Pesquisar paciente por nome
Actor: receptionist
Precondition: Existe pelo menos um paciente ativo (não eliminado) cujo nome corresponde à pesquisa.
Steps:
1. Navegar para "Pacientes".
2. No campo com o placeholder "Pesquisar por nome, NIF ou telefone", escrever o nome (ou parte do nome) do paciente.
3. Pressionar Enter.
Expected result: A URL passa a `/patients?q=<termo>` e a lista mostra apenas os pacientes cujo nome corresponde. Na vista de tabela (ecrã largo), a linha do resultado mostra o NIF por baixo do nome e o telefone na coluna de telefone.
Edge cases:
- Pesquisa sem correspondências — mostra "Sem resultados para esta pesquisa" (sem lista).
- Pesquisa por um paciente eliminado (soft-delete) — não aparece nos resultados.
- Termo de pesquisa apenas com dígitos — a pesquisa também tenta corresponder por NIF/telefone, pelo que um nome que contenha dígitos pode devolver resultados inesperados.

---

### Scenario: Pesquisar paciente por NIF
Actor: receptionist
Precondition: Existe um paciente ativo com NIF preenchido.
Steps:
1. Navegar para "Pacientes".
2. No campo "Pesquisar por nome, NIF ou telefone", escrever o NIF completo do paciente (9 dígitos).
3. Pressionar Enter.
Expected result: A lista mostra o paciente correspondente; a linha exibe "NIF <número>" por baixo do nome.
Edge cases:
- NIF parcial (poucos dígitos) — o comportamento de correspondência parcial não está documentado nos testes; validar manualmente se um NIF incompleto ainda devolve o paciente certo.
- NIF que também coincide como substring do telefone de outro paciente — a pesquisa é um único campo partilhado entre nome/NIF/telefone, pelo que pode haver falsos positivos entre pacientes.

---

### Scenario: Ver o histórico de marcações de um paciente
Actor: receptionist
Precondition: Utilizador com sessão iniciada, no perfil de um paciente (`/patients/{id}`).
Steps:
1. Abrir o perfil do paciente.
2. Clicar no separador "Marcações".
Expected result: **Não implementado.** O separador "Marcações" está presente e é navegável, mas neste momento renderiza sempre o estado vazio "Sem consultas" / "As consultas deste paciente aparecem aqui." — não existe ainda uma consulta real ao histórico de marcações do paciente nesse separador (ao contrário do separador "Registos clínicos", que já lista dados reais). Confirmar este comportamento como o estado atual, não como um erro de teste.
Edge cases:
- Paciente com marcações passadas e futuras registadas no sistema — o separador continuará a mostrar o estado vazio até esta funcionalidade ser implementada.
- Nota de terminologia: o texto do estado vazio usa "consultas", não "marcações" — inconsistência de cópia a resolver quando a funcionalidade for implementada.

---

### Scenario: Ver o histórico de registos clínicos de um paciente
Actor: therapist
Precondition: Utilizador com `clinical_records:read` (administrador, terapeuta ou proprietário — receção não tem acesso). Paciente tem pelo menos um registo clínico criado.
Steps:
1. Abrir o perfil do paciente em `/patients/{id}`.
2. Clicar no separador "Registos clínicos" (só visível para quem tem `clinical_records:read`).
Expected result: Lista dos registos clínicos do paciente, cada um mostrando o título do modelo (ou "Registo clínico" por omissão) com uma ligação "Abrir registo". Se não houver nenhum, mostra o estado vazio "Sem registos clínicos" / "Inicie um registo a partir de uma consulta."
Edge cases:
- Utilizador com função "receção" — o separador "Registos clínicos" não aparece de todo (gate de permissão `clinical_records:read`).
- Paciente sem registos — estado vazio, sem erro.
- Registo com várias versões (adendas) — confirmar que a listagem mostra a versão correta/mais recente de cada registo.

---

## Agenda

### Scenario: Criar uma marcação para um paciente existente
Actor: receptionist
Precondition: Utilizador com `appointments:write` (todas as funções de staff têm esta permissão). Existe pelo menos um paciente, um terapeuta e uma localização ativos.
Steps:
1. Navegar para "Agenda".
2. Clicar em "Nova marcação".
3. No campo "Paciente" (combobox de pesquisa), escrever o nome do paciente e selecionar a opção correspondente.
4. Selecionar "Terapeuta" na lista.
5. Selecionar "Localização" na lista.
6. Preencher a data e a hora.
7. Clicar em "Guardar".
Expected result: O diálogo fecha e a nova marcação aparece na grelha da agenda, no bloco correspondente ao horário escolhido, com o nome do paciente visível.
Edge cases:
- Marcar o mesmo terapeuta em dois horários sobrepostos — surge um aviso "Conflito de terapeuta" dentro do diálogo, com um botão "Guardar mesmo assim" (não é bloqueado automaticamente, é uma sobreposição explícita).
- Não selecionar paciente, terapeuta ou localização — o formulário não avança (campos obrigatórios).
- Marcação recorrente — campos adicionais de "Repetir" e "Ocorrências" aparecem quando se ativa a repetição; o âmbito de aplicação ("Esta marcação" / "Esta e seguintes" / "Toda a série") só é relevante em edições posteriores.

---

### Scenario: Remarcar uma marcação
Actor: receptionist
Precondition: Existe uma marcação futura já criada.
Steps:
1. Na "Agenda", clicar no bloco da marcação existente.
2. No diálogo "Editar marcação", alterar a hora (ou a data, o terapeuta, ou a localização).
3. Clicar em "Guardar".
Expected result: O diálogo fecha e o bloco da marcação passa a aparecer no novo horário na grelha.
Edge cases:
- Remarcar para um horário onde o mesmo terapeuta já tem outra marcação — mesmo aviso de conflito ("Conflito de terapeuta") com opção "Guardar mesmo assim".
- Marcação recorrente — o campo "Aplicar a" ("Esta marcação" / "Esta e seguintes" / "Toda a série") aparece e determina se a alteração de horário afeta só esta ocorrência ou a série.
- Alterar apenas o terapeuta ou a localização sem alterar a data/hora — ainda conta como reagendamento e passa pelo mesmo caminho de verificação de conflitos.

---

### Scenario: Cancelar uma marcação
Actor: receptionist
Precondition: Existe uma marcação futura já criada (função com `appointments:delete` ou `appointments:write` — receção e administrador têm `appointments:delete`; terapeuta não).
Steps:
1. Na "Agenda", clicar no bloco da marcação a cancelar.
2. No diálogo "Editar marcação", no campo "Estado", selecionar "Cancelada".
3. Opcionalmente, escrever uma nota no campo de notas.
4. Clicar em "Guardar".
Expected result: O diálogo fecha; a marcação passa a refletir o estado "Cancelada" na agenda (não existe um botão dedicado "Cancelar marcação" — o cancelamento é feito através do campo "Estado").
Edge cases:
- Cancelar uma marcação recorrente — o campo "Aplicar a" determina se só esta ocorrência, as seguintes, ou toda a série são canceladas.
- Terapeuta a tentar cancelar — não tem `appointments:delete`; confirmar manualmente se o campo "Estado" permite ou bloqueia esta transição para a função terapeuta.
- Não existe (neste momento) uma notificação automática ao paciente por SMS/email associada só ao cancelamento manual desta marcação — confirmar contra `reminders.spec.ts`, que documenta o cancelamento de lembretes agendados via Inngest como checklist manual, não como comportamento automatizado testado.

---

### Scenario: Marcar uma marcação como concluída
Actor: therapist
Precondition: Existe uma marcação já decorrida ou em curso.
Steps:
1. Na "Agenda", clicar no bloco da marcação.
2. No diálogo "Editar marcação", no campo "Estado", selecionar "Concluída".
3. Clicar em "Guardar".
Expected result: O diálogo fecha; o estado da marcação passa a "Concluída".
Edge cases:
- Marcar como concluída uma marcação futura (ainda não decorreu) — o formulário não impede esta transição; não há validação de que a data já passou.
- Marcação recorrente — mesmo campo "Aplicar a" determina o âmbito da alteração de estado.

---

### Scenario: Ver a agenda semanal de um terapeuta específico
Actor: reception
Precondition: Utilizador com sessão iniciada numa função que não seja "terapeuta" — para a função "terapeuta" o filtro de terapeuta fica bloqueado na própria pessoa (`lockTherapist`), pelo que este cenário é para administrador ou receção a consultarem a agenda de outra pessoa.
Steps:
1. Navegar para "Agenda".
2. No controlo de alternância "Dia" / "Semana", selecionar "Semana".
3. No filtro "Terapeutas" (visível apenas para funções sem bloqueio), selecionar o terapeuta pretendido em vez de "Todos os terapeutas".
Expected result: A grelha da agenda passa à vista semanal, mostrando apenas as marcações do terapeuta selecionado nesse período.
Edge cases:
- Utilizador com função "terapeuta" — o filtro "Terapeutas" não é apresentado; a agenda mostra sempre só as suas próprias marcações, sem opção de ver as de outro terapeuta.
- Terapeuta sem marcações na semana — mostra "Sem marcações neste período".
- Navegar entre semanas com os botões "Período anterior" / "Período seguinte" mantendo o filtro de terapeuta selecionado.

---

## Registos Clínicos

### Scenario: Criar um registo clínico após uma marcação
Actor: therapist
Precondition: Utilizador com `clinical_records:author` (terapeuta ou proprietário — administrador tem apenas leitura). Existe pelo menos um modelo de formulário ativo e, idealmente, o paciente da marcação já existe no sistema.
Steps:
1. Navegar para "Registos Clínicos" e clicar em "Nova ficha" (ou aceder diretamente a `/clinical/new`).
2. Selecionar o "Paciente" na lista.
3. Selecionar o "Modelo" — o seletor só apresenta a versão atual de cada modelo (versões substituídas, ex. v1 quando existe v2, não aparecem).
4. Opcionalmente selecionar um "Episódio".
5. Clicar em "Criar ficha".
Expected result: Redirecionamento para `/clinical/{id}`, mostrando "Versão 1" e o estado "Rascunho". O formulário está editável.
Edge cases:
- Função "administrador" — não tem `clinical_records:author`; não deve conseguir criar um registo (verificar bloqueio no servidor, não só na UI).
- Função "receção" — sem qualquer acesso a `/clinical`; é redirecionada para `/dashboard` ao tentar aceder.
- Nenhum modelo ativo disponível — o seletor "Modelo" fica sem opções válidas; confirmar o comportamento do botão "Criar ficha" nesse caso.

---

### Scenario: Editar um registo clínico guardado (não bloqueado)
Actor: therapist
Precondition: Existe um registo clínico em estado "Rascunho", da autoria do próprio terapeuta (ou de qualquer terapeuta com `clinical_records:author`, conforme a regra de negócio aplicada).
Steps:
1. Abrir o registo clínico em `/clinical/{id}`.
2. Alterar os campos do formulário (ex. observações, plano de tratamento).
3. Clicar em "Guardar".
Expected result: O registo é gravado; o estado permanece "Rascunho" e as alterações ficam visíveis ao reabrir a página.
Edge cases:
- Função "administrador" a tentar editar — mesmo um registo em "Rascunho" é sempre só de leitura para administrador (`readOnly` depende também de `clinical_records:author`, que administrador não tem), não apenas do estado do registo.
- Deixar campos obrigatórios do modelo vazios — comportamento de validação depende do modelo JSON-Schema específico; validar por modelo.

---

### Scenario: Tentar editar um registo clínico bloqueado (finalizado)
Actor: therapist
Precondition: Existe um registo clínico já assinado ("Assinar e bloquear" foi executado), ou seja, com estado diferente de "Rascunho".
Steps:
1. Abrir o registo clínico em `/clinical/{id}`.
2. Observar o formulário.
Expected result: Todos os campos do formulário aparecem desativados (disabled), cada secção com um ícone de cadeado. O botão "Guardar" não é apresentado. É mostrado o aviso "Ficha finalizada e imutável. Crie uma nova versão para alterações." O único caminho para alterar conteúdo é o botão "Nova versão (adenda)", que cria um novo registo em "Versão 2", estado "Rascunho".
Edge cases:
- Tentar submeter uma alteração diretamente à ação do servidor (contornando a UI) — deve ser rejeitada com a mensagem "Ficha já finalizada; não pode ser alterada." (defesa em profundidade, não só no cliente).
- Função "administrador" — já era só de leitura antes de bloquear; o bloqueio reforça a mesma barreira mas não é a única razão para não conseguir editar.

---

### Scenario: Emitir uma declaração de presença
Actor: receptionist
Precondition: **Funcionalidade não implementada no lado do staff.** Não existe nenhuma rota, botão ou ação chamada "declaração de presença" em `apps/web`. Existem apenas as strings `declaration_presence` ("Declaração de presença") e `declaration_treatment` ("Declaração de tratamento") em `packages/i18n/src/portal/strings.pt.json`, sob um separador `tab_declarations` ("Declarações") do **portal do paciente** — mas nenhum componente em `apps/portal` ou `apps/api` lê ou renderiza essas chaves; são strings órfãs de um separador ainda por construir. A funcionalidade mais próxima que existe e funciona é o download do "Relatório Clínico" (PDF completo) a partir de um registo clínico já bloqueado ou assinado, no lado do staff.
Steps:
1. Abrir um registo clínico já finalizado (bloqueado ou assinado) em `/clinical/{id}`.
2. Clicar em "Transferir PDF".
Expected result: O browser navega para um URL assinado (de curta duração) do Supabase Storage e transfere o PDF do "Relatório Clínico" — contém dados do paciente, do registo, corpo clínico (motivo da consulta, antecedentes, diagnóstico, plano de tratamento, etc.) e assinatura do profissional. Não é um documento de presença isolado.
Edge cases:
- Registo ainda em "Rascunho" — o botão "Transferir PDF" não é apresentado (gate: só aparece quando `record_status` é bloqueado ou assinado, conforme comentário no código-fonte).
- Falha ao gerar o URL assinado — mostra o erro "Não foi possível gerar o PDF."
- Se a intenção de negócio é um documento de presença simples e separado (sem o conteúdo clínico completo), isto deve ser registado como pedido de funcionalidade a construir no separador "Declarações" do portal, não testado como comportamento existente hoje.

---

## Administração

### Scenario: Adicionar um novo membro da equipa
Actor: admin
Precondition: Utilizador com `users:manage` (administrador ou proprietário). Pelo menos uma função atribuível existe (proprietário só pode ser atribuído por outro proprietário).
Steps:
1. Navegar para "Administração" → "Equipa".
2. No formulário "Convidar novo membro", preencher "Nome completo", "Email" e selecionar "Função".
3. Clicar em "Convidar".
Expected result: Mensagem de sucesso "Membro convidado." Se o envio de email funcionar, é mostrada a mensagem "Convite enviado por email. O novo membro define a própria palavra-passe através da ligação." Se o envio falhar, é mostrada uma palavra-passe temporária com a instrução para a entregar ao novo utilizador por um canal seguro, junto do aviso "Não foi possível enviar o email de convite."
Edge cases:
- Função "terapeuta" ou "receção" a tentar aceder a "Administração" — nem sequer chega a este formulário (ver cenário de acesso bloqueado).
- Convidar com um email já usado por outro membro da equipa — erro "Esse email já é usado por outro membro da equipa."
- Administrador (não proprietário) a tentar convidar como "Proprietário" — a opção "Proprietário" nem aparece na lista de funções atribuíveis (`assignableRoles` exclui "owner" para quem não é proprietário).

---

### Scenario: Alterar a função de um membro da equipa
Actor: admin
Precondition: Utilizador com `users:manage`. Existe pelo menos um outro membro da equipa cuja função pode ser gerida (ver regra de proprietário abaixo).
Steps:
1. Navegar para "Administração" → "Equipa".
2. Na linha do membro pretendido, no seletor de "Função" (rótulo acessível, sem legenda visível na linha), escolher a nova função.
3. Clicar em "Aplicar".
Expected result: A função do membro é atualizada e refletida imediatamente na coluna "Função" da tabela.
Edge cases:
- Administrador (não proprietário) a tentar alterar a função de um utilizador que já é "Proprietário", ou a tentar promover alguém a "Proprietário" — bloqueado com "Apenas um proprietário pode atribuir ou alterar a função de proprietário." (a linha desse utilizador nem mostra os controlos de gestão — aparece "—" na coluna de ações).
- Tentar remover a função de proprietário do único proprietário ativo da clínica — bloqueado com "A clínica tem de manter pelo menos um proprietário ativo."
- Alterar a função de si próprio — comportamento não coberto explicitamente pelos testes; confirmar manualmente.

---

### Scenario: Adicionar um novo serviço
Actor: admin
Precondition: Utilizador com `services:write` (administrador ou proprietário).
Steps:
1. Navegar para "Administração" → "Serviços".
2. No formulário superior, preencher "Nome", "Duração (min)" e opcionalmente "Preço (€)".
3. Clicar em "Adicionar serviço".
Expected result: Mensagem "Serviço guardado." e o novo serviço aparece na tabela, com o preço base indicado (ou "sem preço base" se não preenchido).
Edge cases:
- O formulário de criação **não tem campo de localização** — um serviço novo aplica-se por omissão a todas as localizações (`locationId = null`). "Adicionar a uma localização específica" não é uma opção na criação; é feito depois, como um passo separado (ver abaixo).
- Definir um preço específico por localização: expandir a secção "Preços por local" na linha do serviço já criado, preencher o preço para a localização pretendida (deixar vazio usa o preço base — "Usa o preço base") e clicar em "Guardar preços". Isto só é possível se existir pelo menos uma localização ativa; caso contrário mostra "Ainda não há locais ativos."
- Arquivar um serviço existente em vez de o eliminar — botão "Arquivar" (reversível via "Restaurar").

---

## Faturação

### Scenario: Ver a lista de faturas
Actor: receptionist
Precondition: Utilizador com `invoices:read` (todas as funções de staff têm esta permissão, incluindo terapeuta em modo só de leitura).
Steps:
1. Navegar para "Faturação".
2. Observar a lista de faturas no período selecionado por omissão.
3. Opcionalmente ajustar "Data de início" / "Data de fim" e o filtro "Estado".
Expected result: Lista de faturas do período, ou o estado vazio "Sem faturas no período selecionado" se não existirem faturas nesse intervalo.
Edge cases:
- **O botão "Nova fatura" está atualmente sempre ausente** neste ambiente — a emissão de faturas depende de credenciais InvoiceXpress configuradas (`credentialsConfigured()`), que não estão definidas. Isto não é um bloqueio de permissão; é uma integração externa por configurar. Não descrever "emitir fatura" como um fluxo disponível até essa configuração existir.
- Função "terapeuta" — vê a lista (tem `invoices:read`) mas nunca vê "Nova fatura" (não tem `invoices:issue`), independentemente da configuração do InvoiceXpress.
- Separador "Faturação" no perfil de um paciente específico — mostra as faturas desse paciente isoladamente; mesmo estado vazio "Sem faturas" quando não existem.

---

## Sessão

### Scenario: Log out e log in novamente
Actor: receptionist
Precondition: Utilizador com sessão iniciada em qualquer função.
Steps:
1. No menu da aplicação, clicar em "Terminar sessão".
2. Confirmar o redirecionamento para "Iniciar sessão" (`/login`).
3. Preencher "Email" e "Palavra-passe".
4. Clicar em "Iniciar sessão".
Expected result: Após terminar sessão, o acesso a páginas protegidas (ex. `/patients`, `/agenda`) redireciona para `/login`. Após novo login com credenciais válidas, o utilizador é redirecionado para `/dashboard`.
Edge cases:
- Palavra-passe incorreta — mostra "Não foi possível iniciar sessão. Verifique o email e a palavra-passe." e permanece em `/login`.
- Email desconhecido — mesma mensagem de erro (não distingue "email não existe" de "palavra-passe errada", por design de segurança).
- Submeter o formulário vazio — permanece em `/login` (validação nativa dos campos obrigatórios).
- Aceder a `/login` já com sessão iniciada — é reencaminhado de volta para a aplicação, não vê o formulário de login novamente.

---

### Scenario: Tentar aceder a uma secção que a função do utilizador não permite
Actor: therapist
Precondition: Utilizador com sessão iniciada como "terapeuta" (sem `settings:read`).
Steps:
1. Com sessão iniciada como terapeuta, navegar diretamente para `/admin` (por URL, já que o separador "Administração" nem aparece no menu para esta função).
Expected result: Redirecionamento silencioso para `/dashboard` — sem mensagem de erro, sem página 403 visível. O gate está no layout de `/admin`: qualquer função sem `settings:read` é reencaminhada antes de qualquer conteúdo administrativo ser renderizado.
Edge cases:
- Função "receção" a tentar aceder a `/clinical` — mesmo padrão: reencaminhada para `/dashboard` (gate no layout de `/clinical`, por não ter `clinical_records:read`).
- Utilizador sem sessão (não autenticado) a aceder a qualquer rota protegida (ex. `/patients`, `/agenda`) — reencaminhado para `/login`, não para `/dashboard` (distinção entre "não autenticado" e "autenticado mas sem permissão").
- Tentar aceder a um paciente de outro tenant diretamente pelo ID (`/patients/{id-de-outro-tenant}`) — devolve 404, não um redirecionamento; a barreira aqui é RLS ao nível da base de dados, não apenas um gate de UI.

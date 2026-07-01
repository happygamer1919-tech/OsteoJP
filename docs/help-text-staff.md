# Textos de ajuda — Plataforma de equipa (staff)

> Fonte da verdade para todo o texto de ajuda e tooltips em apps/web (plataforma
> de equipa: Início, Agenda, Pacientes, Fichas Clínicas, Marcações, Faturação,
> Revisão Consulta, Administração). Cada entrada corresponde a um elemento de
> interface real, verificado no código-fonte e nas strings de
> `packages/i18n/src/strings.pt.json` nesta data.
>
> Tom: clínico, direto, sem cortesia supérflua. Sem "por favor" nem "você" —
> impessoal, orientado à tarefa (ver `docs/brand-voice.md`).
>
> Formato de cada entrada: Screen / Element / Help text (máx. 120 caracteres) /
> Tooltip (máx. 80 caracteres, ou NONE quando não se justifica um tooltip
> separado do texto de ajuda).
>
> `[A CONFIRMAR COM JP]` marca algo que depende de uma decisão clínica ou fiscal
> que não é possível confirmar a partir do código.

---

## Início (Dashboard)

Screen: Início
Element: Notas rápidas (campo de texto)
Help text: Bloco de notas pessoal, visível só para si. Não é partilhado com a equipa. Guarda ao clicar em Guardar.
Tooltip: NONE

Screen: Início
Element: Cartão "Pacientes ativos"
Help text: Total de pacientes ativos (exclui eliminados e fundidos). "+N esta semana" conta os registos criados nos últimos 7 dias.
Tooltip: Pacientes ativos, excluindo eliminados e fundidos.

Screen: Início
Element: Cartão "Marcações hoje"
Help text: Número de marcações não canceladas no dia selecionado. "Próxima" mostra a hora da próxima marcação a partir de agora.
Tooltip: Marcações não canceladas do dia.

Screen: Início
Element: Cartão "Novas fichas"
Help text: Fichas clínicas criadas nos últimos 7 dias. Só visível para quem tem acesso a registos clínicos.
Tooltip: Fichas clínicas criadas nesta semana.

Screen: Início
Element: Cartão "Receita (mês)"
Help text: Soma das faturas emitidas e pagas no mês corrente. Mostra "Sem dados" se a faturação falhar ou não estiver configurada.
Tooltip: Faturas emitidas + pagas no mês atual.

Screen: Início
Element: Gráfico "Resumo semanal"
Help text: Número de marcações não canceladas por dia, de segunda a domingo, na semana corrente.
Tooltip: NONE

Screen: Início
Element: Acessos rápidos (Nova marcação, Novo paciente, Ficha clínica, Ver agenda, Administração)
Help text: Atalhos para as ações mais comuns. Só aparecem os atalhos para os quais tem permissão.
Tooltip: NONE

---

## Agenda

Screen: Agenda
Element: Escolher data (calendário)
Help text: Seleciona o dia (ou a semana, na vista Semana) a mostrar na grelha da agenda.
Tooltip: Escolher data.

Screen: Agenda
Element: Filtro Terapeutas
Help text: Filtra a grelha por terapeuta. Selecione "Todos os terapeutas" para ver a agenda completa da clínica.
Tooltip: Filtrar por terapeuta.

Screen: Agenda
Element: Botão "Nova marcação"
Help text: Abre o formulário para criar uma marcação. Paciente, terapeuta e clínica são obrigatórios para guardar.
Tooltip: Criar nova marcação.

Screen: Agenda
Element: Aviso de conflito ao guardar
Help text: Indica sobreposição com o terapeuta, a sala, o horário de disponibilidade ou uma ausência já registada.
Tooltip: NONE

Screen: Agenda
Element: Botão "Guardar mesmo assim"
Help text: Guarda a marcação apesar do conflito assinalado. Use apenas quando a sobreposição é intencional.
Tooltip: Guardar ignorando o conflito.

---

## Pacientes

Screen: Pacientes
Element: Campo de pesquisa
Help text: Pesquisa por nome, NIF ou telefone. Os resultados atualizam-se automaticamente enquanto escreve.
Tooltip: Pesquisar por nome, NIF ou telefone.

Screen: Pacientes
Element: Fundir pacientes (ficha do paciente)
Help text: Indique o ID do paciente a manter (sobrevivente). O histórico do duplicado é transferido; a ação não é reversível.
Tooltip: Fundir este paciente no sobrevivente indicado.

Screen: Pacientes
Element: Indicador "Fundido"
Help text: Este registo foi identificado como duplicado; o histórico clínico foi transferido para outro paciente.
Tooltip: NONE

Screen: Pacientes
Element: Indicador "Eliminado"
Help text: Paciente eliminado (soft delete). Pode ser restaurado a qualquer momento pelo botão Restaurar.
Tooltip: NONE

---

## Fichas Clínicas

Screen: Fichas Clínicas
Element: Botão "Guardar" (rascunho)
Help text: Guarda o conteúdo atual sem finalizar. A ficha continua em Rascunho e pode ser editada livremente.
Tooltip: Guardar como rascunho.

Screen: Fichas Clínicas
Element: Botão "Assinar e bloquear"
Help text: Finaliza a ficha de forma permanente: fica bloqueada e assinada. Alterações depois disto exigem uma nova versão.
Tooltip: Assinar e bloquear (ação permanente).

Screen: Fichas Clínicas
Element: Indicador de ficha bloqueada
Help text: Ficha finalizada e imutável (Bloqueada ou Assinada). Para alterar, crie uma nova versão (adenda).
Tooltip: NONE

Screen: Fichas Clínicas
Element: Bodychart (diagrama corporal)
Help text: Clique no diagrama para colocar um marcador clínico. A figura (masculina/feminina) segue o sexo do paciente.
Tooltip: Clicar para adicionar marcador.

---

## Marcações

Screen: Marcações
Element: Estado "Agendada"
Help text: Marcação criada e ainda não confirmada nem realizada.
Tooltip: NONE

Screen: Marcações
Element: Estado "Confirmada"
Help text: Marcação confirmada com o paciente, ainda não realizada.
Tooltip: NONE

Screen: Marcações
Element: Estado "Concluída"
Help text: Consulta realizada.
Tooltip: NONE

Screen: Marcações
Element: Estado "Cancelada"
Help text: Marcação cancelada; não conta para as estatísticas de marcações do dia nem do resumo semanal.
Tooltip: NONE

Screen: Marcações
Element: Estado "Falta"
Help text: Paciente não compareceu à marcação confirmada.
Tooltip: NONE

---

## Faturação

Screen: Faturação
Element: Estado "Rascunho"
Help text: Fatura criada mas ainda não emitida.
Tooltip: NONE

Screen: Faturação
Element: Estado "Emitida"
Help text: Fatura emitida via InvoiceXpress, aguarda pagamento.
Tooltip: NONE

Screen: Faturação
Element: Estado "Paga"
Help text: Fatura emitida e paga (IfThenPay ou Stripe).
Tooltip: NONE

Screen: Faturação
Element: Estado "Anulada"
Help text: Fatura anulada; não conta para os totais de pago nem pendente.
Tooltip: NONE

Screen: Faturação
Element: Botão "Nova fatura"
Help text: [A CONFIRMAR COM JP] Fluxo de emissão a partir daqui ainda não está confirmado no código (sem ação associada).
Tooltip: NONE

Screen: Faturação
Element: Tipo de documento fiscal e IVA ao emitir
Help text: [A CONFIRMAR COM JP] Tipo de documento (fatura, fatura-recibo, recibo) e eventual isenção de IVA em atos clínicos.
Tooltip: NONE

---

## Revisão Consulta

Screen: Revisão Consulta
Element: Estado "Por rever"
Help text: Item novo (registo de IA ou submissão de paciente) ainda não aberto por ninguém da equipa.
Tooltip: NONE

Screen: Revisão Consulta
Element: Estado "Em revisão"
Help text: Item já reclamado por um membro da equipa e em edição.
Tooltip: NONE

Screen: Revisão Consulta
Element: Estado "Aprovada"
Help text: Ficha resultante da revisão foi finalizada (assinada e bloqueada).
Tooltip: NONE

Screen: Revisão Consulta
Element: Estado "Rejeitada"
Help text: Item de revisão rejeitado; não deu origem a uma ficha clínica finalizada.
Tooltip: NONE

Screen: Revisão Consulta
Element: Botão "Assumir" / "Abrir"
Help text: "Assumir" reclama um item por rever; "Abrir" retoma um item que já está em revisão consigo.
Tooltip: NONE

Screen: Revisão Consulta
Element: Botão "Finalizar (assinar e bloquear)"
Help text: Só edita campos narrativos (texto livre); campos codificados e de segurança ficam sempre manuais. Ação permanente.
Tooltip: Finalizar, assinar e bloquear.

---

## Administração

Screen: Administração
Element: Função "Proprietário"
Help text: Acesso total. Só um proprietário pode atribuir ou alterar a função de proprietário; a clínica precisa de pelo menos um.
Tooltip: NONE

Screen: Administração
Element: Função "Administrador"
Help text: Gestão de equipa, serviços, locais e definições da clínica, ao nível do administrador.
Tooltip: NONE

Screen: Administração
Element: Função "Terapeuta"
Help text: Acesso à agenda própria e às fichas clínicas dos seus pacientes, até ficarem bloqueadas.
Tooltip: NONE

Screen: Administração
Element: Função "Receção"
Help text: Agenda, pacientes e faturação; sem acesso a fichas clínicas.
Tooltip: NONE

Screen: Administração
Element: Configuração de serviço (Nome, Duração, Preço)
Help text: Duração em minutos e preço base do serviço. O preço pode ter uma exceção por local em "Preços por local".
Tooltip: NONE

Screen: Administração
Element: Preço por local (exceção ao preço base)
Help text: Deixe em branco para usar o preço base do serviço; preencha só para aplicar um preço diferente neste local.
Tooltip: NONE

Screen: Administração
Element: Botão "Arquivar" / "Restaurar" (serviço ou local)
Help text: Arquivar oculta o serviço ou local de novas marcações sem apagar o histórico; Restaurar reverte a ação.
Tooltip: NONE

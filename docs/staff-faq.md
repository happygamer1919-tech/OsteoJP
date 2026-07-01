# FAQ da Equipa — Plataforma OsteoJP

**Audiência:** equipa clínica e administrativa das clínicas OsteoJP.
**Objetivo:** respostas diretas às 15 questões mais frequentes sobre o uso da plataforma.
**Última atualização:** 2026-07-01.

Itens marcados com `[A CONFIRMAR COM JP]` não têm resposta confirmada no código ou na documentação existente — não devem ser respondidos com base em suposições até serem esclarecidos.

---

## 1. Como inicio sessão na plataforma?

Aceda a `app.osteojp.pt`, indique o email de trabalho e a palavra-passe fornecida pela administração e clique em "Iniciar sessão".

## 2. Como marco uma nova consulta?

Na **Agenda**, clique em "Nova marcação". Selecione paciente, serviço, terapeuta, localização, data e hora — a duração é preenchida automaticamente a partir do serviço escolhido, mas pode ser ajustada. É também possível configurar uma marcação recorrente. Grave a marcação para a colocar na agenda.

## 3. Como encontro um paciente?

Em **Pacientes**, use a barra de pesquisa ("Pesquisar por nome, NIF ou telefone"). A pesquisa aceita partes do nome.

## 4. Como edito os dados de um paciente?

Abra o perfil do paciente em **Pacientes → [nome do paciente]** e clique em "Editar dados".

## 5. Como registo notas clínicas após uma consulta?

Em **Fichas Clínicas**, clique em "Nova ficha" (ou "Nova ficha neste episódio" a partir de um episódio já aberto). Selecione o paciente, o episódio e o modelo correspondente ao tipo de consulta — Osteopatia, Fisioterapia, NESA, RPG, Massagem Terapêutica ou Pilates Terapêutico — e preencha os campos.

- "Guardar" grava a ficha em rascunho, editável.
- "Assinar e bloquear" finaliza a ficha de forma permanente — deixa de poder ser alterada. Uma correção a uma ficha já assinada exige a criação de uma nova versão (adenda), nunca a edição da ficha original.

## 6. O que é a Revisão Consulta e quando devo usá-la?

A **Revisão Consulta** é a fila onde chegam as fichas produzidas pelo parceiro de IA (a partir da gravação ambiente da consulta) e os formulários submetidos diretamente pelos pacientes, antes de se tornarem fichas clínicas oficiais. Só terapeutas e o proprietário têm acesso a esta fila — a função Administrador não a vê.

Para a usar: clique em "Assumir" no item que quer rever. Pode editar apenas os campos de texto livre (narrativos); campos codificados e de segurança (por exemplo, sinais de alarme) têm de ser confirmados manualmente e não são alteráveis aqui. Quando a ficha estiver correta, clique em "Finalizar (assinar e bloquear)" — tal como nas fichas clínicas normais, esta ação é permanente.

## 7. Como emito uma fatura?

Em **Faturação**, o botão "Nova fatura" só aparece quando a integração InvoiceXpress está configurada e ativada para a clínica. `[A CONFIRMAR COM JP]` — qual o processo a seguir para emitir faturas enquanto essa integração não estiver ativada pelo proprietário.

## 8. Como vejo o calendário da semana?

Na **Agenda**, use o alternador "Dia / Semana" no topo do ecrã e selecione "Semana". Este alternador só está disponível em ecrã de computador — no telemóvel a Agenda mostra sempre a vista Dia.

## 9. Esqueci-me da palavra-passe — o que faço?

A página de início de sessão não tem, atualmente, uma opção de recuperação de palavra-passe autónoma. Contacte um administrador para lhe ser restabelecido o acesso. `[A CONFIRMAR COM JP]` — qual o procedimento exato que a administração deve seguir para restabelecer o acesso de um membro da equipa já existente (distinto do convite a um novo membro).

## 10. Como adiciono um novo terapeuta ao sistema?

Em **Administração → Equipa**, abra "Convidar novo membro". Preencha nome completo, email e função — selecione "Terapeuta" — e clique em "Convidar". O novo membro recebe um email com uma ligação para definir a própria palavra-passe; se o envio de email não estiver ativo nessa clínica, é apresentada uma palavra-passe temporária, a entregar ao novo membro por um canal seguro.

## 11. Posso aceder à plataforma no telemóvel?

Sim. A plataforma funciona no browser do telemóvel e a interface adapta-se ao ecrã — por exemplo, a Agenda mostra sempre a vista Dia no telemóvel, reservando a vista Semana para o ecrã de computador.

## 12. Os dados dos pacientes estão seguros?

Sim, por desenho. Cada clínica é isolada ao nível da base de dados: todas as tabelas exigem uma identificação da clínica (`tenant_id`) e têm uma política de segurança (RLS) que restringe o acesso apenas aos dados dessa clínica. Toda a infraestrutura — base de dados, alojamento, email — está na União Europeia. Ações sobre fichas clínicas e outras ações sensíveis ficam registadas num registo de auditoria que não pode ser editado nem apagado. Uma ficha clínica assinada torna-se imutável — não pode ser alterada nem eliminada.

## 13. O que acontece se fechar o browser a meio de uma ficha clínica?

Perde as alterações não guardadas. A ficha clínica não tem gravação automática — é necessário clicar em "Guardar" antes de sair ou fechar o browser para preservar o que foi escrito.

## 14. Como imprimo um relatório clínico?

Depois de a ficha estar assinada e bloqueada (finalizada), abra-a e clique em "Transferir PDF". Este botão só está disponível para fichas finalizadas — uma ficha em rascunho não tem PDF disponível. A partir do PDF transferido, imprima-o pelo seu leitor de PDF ou pelo browser.

## 15. A quem reporto um problema técnico?

Reporte problemas técnicos da plataforma à administração (Ivan). Para dúvidas sobre dados clínicos ou a migração do Fisiozero, contacte o João Pedro (JP).

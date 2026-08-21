# Pacote de aprovação para lançamento — OsteoJP

**Para:** JP
**De:** OsteoJP (via Ivan)
**Data:** 2026-08-21
**Assunto:** o que precisamos de si antes de a plataforma comunicar com doentes reais

---

## 1. O que está a ser lançado

A nova plataforma da clínica substitui o Fisiozero e o Stylus.pt. Está construída
e testada. O que **ainda não acontece** é a plataforma escrever a um doente:
todos os envios automáticos estão **desligados** e nunca enviaram nada a ninguém.

Ligar esses envios é um acto único, supervisionado, no dia do lançamento. **A sua
assinatura é a condição para o fazer.** Não é uma formalidade posterior: o
mecanismo que autoriza cada mensagem recusa, por omissão, qualquer texto que não
tenha sido aprovado, e regista o motivo da recusa como `template_unapproved`.

**O que já funciona hoje, sem si:** a agenda, as fichas clínicas, os pacotes, a
facturação, o portal do doente e o registo de consentimentos. Nada disto envia
mensagens.

---

## 2. O que lhe pedimos

Quatro conjuntos de decisões, separados porque têm naturezas diferentes e porque
alguns podem precisar do advogado e outros não.

Assine o que aprova. **O que não aprovar fica desligado** — a plataforma está
construída para funcionar sem essas peças, não para as assumir.

---

## 3. CLÍNICO

### 3.1 Consentimento para tratamento — TEXTO A APROVAR, VERBATIM

Este texto é impresso na ficha de consentimento que o doente assina.

> Declaro que fui informado/a, de forma clara e compreensível, sobre a natureza,
> os objetivos e os possíveis efeitos do tratamento proposto, tendo tido
> oportunidade de colocar questões e de obter resposta às mesmas. Consinto, de
> forma livre e esclarecida, a realização do tratamento proposto. Posso retirar
> este consentimento a qualquer momento, sem necessidade de justificação e sem
> prejuízo dos cuidados que me venham a ser prestados.

**Decisão:** aprova este texto como está? ☐ Sim ☐ Não, com alterações

### 3.2 Registo clínico e assinatura

O registo clínico segue `rascunho → bloqueado → assinado`. Bloquear torna o
conteúdo imutável; assinar anexa a assinatura do terapeuta. Alterações depois de
bloqueado criam adendas, nunca reescrevem o original.

**Decisão:** confirma que este é o comportamento correcto para os registos da
clínica? ☐ Sim ☐ Não

### 3.3 Quem vê o quê

Um terapeuta vê os registos clínicos **apenas dos seus doentes**. A recepção não
vê registos clínicos, de todo. O administrador vê, mas não escreve.

**Decisão:** confirma esta separação? ☐ Sim ☐ Não

---

## 4. FISCAL

### 4.1 NIF obrigatório na criação da ficha

Por decisão anterior sua, o NIF é obrigatório ao criar uma ficha, com uma
excepção explícita **"Estrangeiro / sem NIF"** que exige um motivo escrito. Um
doente sem NIF e sem isenção fica marcado **ficha incompleta** e **não pode ter
declaração nem factura emitida** até o NIF ser fornecido.

**Decisão:** confirma que a emissão fica bloqueada nesse caso? ☐ Sim ☐ Não

### 4.2 Facturação

A facturação está integrada e não emite nada automaticamente. A recepção emite;
o terapeuta não emite; anular uma factura é exclusivo do administrador.

**Decisão:** confirma esta atribuição? ☐ Sim ☐ Não

---

## 5. COMERCIAL

### 5.1 A taxa de 50% por falta — TEXTO A APROVAR, VERBATIM

Esta é a linha que seria acrescentada ao lembrete de 24 horas por SMS:

> Falta sem aviso: 50%, nos termos aceites na marcacao.

*(sem acentos por decisão técnica: acentos triplicam o custo do SMS)*

**ESTA LINHA ESTÁ DESLIGADA E PROTEGIDA POR TRÊS FECHOS, E NENHUM DELES ESTÁ
ABERTO:** um sinalizador global desligado por omissão; a aceitação **por doente**,
registada na ficha clínica; e o registo de aprovação, que recusa este texto pelo
nome enquanto não estiver assinado.

**Decisão:** aprova esta redacção? ☐ Sim ☐ Não, com alterações

### 5.2 ⚠️ O DOCUMENTO QUE ESTA LINHA CITA NÃO EXISTE

A linha diz **"nos termos aceites na marcacao"**. A plataforma regista, por
doente, **qual a versão** dos termos que ele aceitou, com data e quem registou.

**O texto dessa versão não existe em lado nenhum.** A plataforma guarda a
identidade do documento, nunca o seu conteúdo — é assim por desenho, porque o
documento é seu e não nosso.

**Enquanto não existir, a mensagem cita um documento que ninguém pode mostrar ao
doente que o contestar.** É a única peça deste pacote em que a plataforma está
pronta e falta o documento, e não o contrário.

**Decisão:** fornece o texto das condições de marcação e cancelamento, para ser
registado como versão? ☐ Sim, em anexo ☐ Ainda não

### 5.3 Prazo de cancelamento

A linha da taxa refere falta **sem aviso**. A plataforma não impõe hoje nenhum
prazo de aviso prévio: cancelar é possível a qualquer momento e é sempre
registado com data, hora e autor.

**Decisão:** qual é o prazo de aviso a partir do qual não há taxa?
☐ 24 horas ☐ 48 horas ☐ Outro: ______

---

## 6. LEGAL

### 6.1 Consentimento RGPD e conservação de dados — TEXTO A APROVAR, VERBATIM

> Nos termos do Regulamento Geral sobre a Proteção de Dados (Regulamento (UE)
> 2016/679) e da Lei n.º 58/2019, autorizo o tratamento dos meus dados pessoais e
> de saúde por esta clínica, com a finalidade exclusiva de prestação de cuidados
> de saúde, gestão clínica e administrativa e cumprimento de obrigações legais.
> Os meus dados são conservados pelo período legalmente exigido para registos
> clínicos e não são partilhados com terceiros, salvo obrigação legal ou serviços
> estritamente necessários à prestação de cuidados. Posso exercer, a qualquer
> momento, os direitos de acesso, retificação, apagamento (nos limites legais
> aplicáveis aos registos de saúde), limitação e oposição, contactando a clínica.

**Nota sobre a conservação:** o texto diz *"pelo período legalmente exigido"* e
não indica um número de anos. A plataforma também não apaga nada
automaticamente.

**Decisão:** mantém a formulação genérica, ou fixa um prazo em anos?
☐ Manter genérico ☐ Fixar: ______ anos

### 6.2 A taxa é uma questão jurídica, não apenas comercial

Anunciar uma taxa numa mensagem automática a um doente que não a aceitou é
precisamente o risco que motivou o mecanismo de aceitação por doente. **A
recomendação é que 5.1, 5.2 e 5.3 sigam juntos para o advogado**, porque a
redacção só é defensável se o documento que ela cita existir.

**Decisão:** envia 5.1–5.3 ao advogado antes de assinar? ☐ Sim ☐ Não, assino já

### 6.3 Onde ficam os dados

Base de dados, ficheiros e envio de email na União Europeia (Frankfurt). Sem
recursos fora da UE para dados guardados.

**Decisão:** confirma? ☐ Sim ☐ Não

---

## 7. AS MENSAGENS, UMA A UMA

As **onze** mensagens automáticas — confirmação de marcação, lembretes de 48h e
24h, agradecimento pós-consulta, falta à consulta, cada uma em SMS e email, mais
a variante com a linha da taxa — estão escritas, com o texto exacto, o custo por
SMS e o estado de aprovação de cada uma, em:

**`docs/notifications-approval-packet.md`** (anexo, 537 linhas, em português)

Não são reproduzidas aqui para este pacote continuar legível. **A aprovação das
onze é feita nesse anexo**; este documento aprova as decisões que as enquadram.

---

## 8. O QUE ACONTECE DEPOIS DE ASSINAR

1. As mensagens que aprovou passam a **aprovadas** no registo.
2. No dia do lançamento, os envios são ligados **por ordem e sob supervisão**,
   com uma primeira mensagem de teste a um número da clínica antes de qualquer
   doente receber alguma coisa.
3. O que não aprovou continua desligado e o motivo fica registado.

**Nada é ligado por este documento.** Ligar é um acto separado, num dia marcado,
com alguém a ver.

---

## 9. ASSINATURA

Aprovo os pontos assinalados acima.

Nome: __________________________  Data: ______________

Assinatura: __________________________

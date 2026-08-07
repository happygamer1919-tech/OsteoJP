# Pacote de aprovacao: mensagens automaticas aos doentes

**Para:** JP. **De:** lane de notificacoes. **Data:** 2026-08-03.

> **APROVADAS POR JP a 2026-08-03**, em resposta escrita, aprovacao em bloco das
> dez mensagens tal como aqui aparecem. Continua a nao ter sido enviada nenhuma
> mensagem: o interruptor de envio real (`REMINDERS_LIVE_SEND`) esta desligado.
> Fica em aberto a escolha entre o SMS de 24h aqui aprovado e a variante A.
>
> Historico, mantido para referencia: **Nada nesta lista foi enviado a um doente.** Todas as dez mensagens estao
> bloqueadas no codigo (`approved: false`) e o sistema recusa-se a envia-las ate
> serem aprovadas aqui, mesmo que o envio real esteja ligado. Este documento
> existe para que possa ler exactamente o que sairia, antes de sair.

Escrito sem acentos nas mensagens SMS de proposito. Ver a nota tecnica no fim.

## O que precisamos de si

1. Para cada uma das dez mensagens: **aprovar, corrigir o texto, ou rejeitar.**
2. Para a redaccao do lembrete de 24h que a clinica forneceu: escolher a
   **variante A ou B** (seccao no fim).
3. A linha da **taxa de 50%** e uma questao juridica, nao de texto. Ver a nota.

---

## Resumo: o que dispara hoje

| Acontecimento | Mensagens que sairiam | Estado |
|---|---|---|
| Rececao marca uma consulta | Confirmacao (SMS + email) | bloqueado |
| 48 horas antes | Lembrete por **email** | bloqueado |
| 24 horas antes | Lembrete por **SMS** | bloqueado |
| Consulta marcada como realizada | Agradecimento 24h depois (SMS + email) | bloqueado |
| Consulta marcada como falta | Aviso de falta (SMS + email) | bloqueado |

Uma **serie** (por exemplo 10 sessoes de Pilates) envia **uma** confirmacao, nao dez.
Os lembretes continuam a ser por sessao.

### Definicoes actuais

| Definicao | Valor | Onde |
|---|---|---|
| Email da clinica ligado | Sim | definicoes do tenant |
| SMS da clinica ligado | Sim | definicoes do tenant |
| Antecedencias | 48h e 24h | definicoes do tenant |
| **SMS por doente** | **Ligado por omissao** | `reminder_sms_enabled` |
| **Email por doente** | **Desligado por omissao** | `reminder_email_enabled` |

**Sem recurso ao email quando o doente recusa SMS** — ratificado por JP a
2026-08-03. Um doente que desactiva o SMS nao passa a receber email no seu lugar:
seria entregar-lhe um canal que nao aceitou. Questao fechada.

Consequencia pratica: com as omissoes actuais, **um doente novo recebe SMS mas
nao email**. O lembrete de 48h (email) nao chega a ninguem ate alguem ligar o
email por doente. Vale a pena decidir se a omissao do email deve mudar.

---

## As dez mensagens

### 1. Confirmacao de marcacao — SMS

- **Identificador:** `confirmation.sms`
- **Quando:** Imediatamente apos a marcacao ser criada ou remarcada.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.
- **Codificacao:** GSM-7 (sim) — **103 caracteres, 1 segmento**

**Texto tal como esta programado:**

```
OsteoJP - Marcacao confirmada
Consulta: {date} as {time}
Local: {clinic}
Remarcar: {phone}
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
OsteoJP - Marcacao confirmada
Consulta: 10/09 as 14:30
Local: Castelo Branco
Remarcar: +351 272 000 000
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 2. Confirmacao de marcacao — Email

- **Identificador:** `confirmation.email`
- **Quando:** Imediatamente apos a marcacao ser criada ou remarcada.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.

**Texto tal como esta programado:**

```
Olá {{patient_first_name}},

A sua marcação está confirmada:

  Data:      {{appointment_date}} às {{appointment_time}}
  Local:     {{clinic_location}}
  Terapeuta: {{practitioner_name}}

Para remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
Assunto: Marcação confirmada — 10 de setembro de 2026, 14:30

Olá Madalena,

A sua marcação está confirmada:

  Data:      10 de setembro de 2026 às 14:30
  Local:     Castelo Branco
  Terapeuta: Dr. Joao Pereira

Para remarcar ou cancelar: https://app.osteojp.pt/r/eyJ0IjoiM2EyZDA3MTEtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIiwiYSI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsImV4cCI6MTc4OTAwMDAwMH0.N-5B6LOtRZUQt2eazNOmzTfvU7DQEE_lLu8FN_6GMiw
Ou contacte: +351 272 000 000

— OsteoJP
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 3. Lembrete 48 horas antes — Email

- **Identificador:** `reminder.48h.email`
- **Quando:** 48 horas antes da consulta.
- **Estado:** aprovado (`approved: true`) — JP, **2026-08-05** (redaccao alterada nesta data: a linha de accao passou a incluir *confirmar*). **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.
- **Nota:** a clinica forneceu redaccao propria para o lembrete de 24h. Ver a seccao das variantes.

**Texto tal como esta programado:**

```
Olá {{patient_first_name}},

Lembrete da sua consulta em {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Para confirmar, remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
Assunto: Lembrete: consulta em 48 horas — 10 de setembro de 2026, 14:30

Olá Madalena,

Lembrete da sua consulta em 10 de setembro de 2026 às 14:30, em Castelo Branco, com Dr. Joao Pereira.

Para confirmar, remarcar ou cancelar: https://app.osteojp.pt/r/eyJ0IjoiM2EyZDA3MTEtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIiwiYSI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsImV4cCI6MTc4OTAwMDAwMH0.N-5B6LOtRZUQt2eazNOmzTfvU7DQEE_lLu8FN_6GMiw
Ou contacte: +351 272 000 000

— OsteoJP
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 4. Lembrete 48 horas antes — SMS

- **Identificador:** `reminder.48h.sms`
- **Quando:** 48 horas antes da consulta.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.
- **Nota:** a clinica forneceu redaccao propria para o lembrete de 24h. Ver a seccao das variantes.
- **Codificacao:** GSM-7 (sim) — **92 caracteres, 1 segmento**

**Texto tal como esta programado:**

```
OsteoJP - Lembrete
Consulta: {date} as {time}
Local: {clinic}
Remarcar: {phone}
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
OsteoJP - Lembrete
Consulta: 10/09 as 14:30
Local: Castelo Branco
Remarcar: +351 272 000 000
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 5. Lembrete 24 horas antes — Email

- **Identificador:** `reminder.24h.email`
- **Quando:** 24 horas antes da consulta.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.
- **Nota:** a clinica forneceu redaccao propria para o lembrete de 24h. Ver a seccao das variantes.

**Texto tal como esta programado:**

```
Olá {{patient_first_name}},

Lembrete da sua consulta amanhã, {{appointment_date}}, às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Pedimos que chegue 10 minutos antes.

Para remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
Assunto: Lembrete: consulta amanhã — 14:30, Castelo Branco

Olá Madalena,

Lembrete da sua consulta amanhã, 10 de setembro de 2026, às 14:30, em Castelo Branco, com Dr. Joao Pereira.

Pedimos que chegue 10 minutos antes.

Para remarcar ou cancelar: https://app.osteojp.pt/r/eyJ0IjoiM2EyZDA3MTEtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIiwiYSI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsImV4cCI6MTc4OTAwMDAwMH0.N-5B6LOtRZUQt2eazNOmzTfvU7DQEE_lLu8FN_6GMiw
Ou contacte: +351 272 000 000

— OsteoJP
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 6. Lembrete 24 horas antes — SMS

- **Identificador:** `reminder.24h.sms`
- **Quando:** 24 horas antes da consulta.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.
- **Nota:** a clinica forneceu redaccao propria para o lembrete de 24h. Ver a seccao das variantes.
- **Codificacao:** GSM-7 (sim) — **99 caracteres, 1 segmento**

**Texto tal como esta programado:**

```
OsteoJP - Lembrete
Consulta: amanha {date} as {time}
Local: {clinic}
Remarcar: {phone}
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
OsteoJP - Lembrete
Consulta: amanha 10/09 as 14:30
Local: Castelo Branco
Remarcar: +351 272 000 000
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 7. Agradecimento pos-consulta — Email

- **Identificador:** `follow_up.email`
- **Quando:** 24 horas depois de a consulta terminar, se marcada como realizada.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.

**Texto tal como esta programado:**

```
Olá {{patient_first_name}},

Obrigado pela visita de {{appointment_date}}. Ficamos ao dispor para qualquer questão.

Para marcar a próxima consulta contacte: {{clinic_phone}}

— OsteoJP
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
Assunto: Obrigado pela sua visita — 10 de setembro de 2026

Olá Madalena,

Obrigado pela visita de 10 de setembro de 2026. Ficamos ao dispor para qualquer questão.

Para marcar a próxima consulta contacte: +351 272 000 000

— OsteoJP
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 8. Agradecimento pos-consulta — SMS

- **Identificador:** `follow_up.sms`
- **Quando:** 24 horas depois de a consulta terminar, se marcada como realizada.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.
- **Codificacao:** GSM-7 (sim) — **90 caracteres, 1 segmento**

**Texto tal como esta programado:**

```
OsteoJP - Obrigado pela sua visita
Visita: {date}
Marcar proxima consulta: {phone}
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
OsteoJP - Obrigado pela sua visita
Visita: 10/09
Marcar proxima consulta: +351 272 000 000
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 9. Falta a consulta — Email

- **Identificador:** `no_show.email`
- **Quando:** Quando a rececao marca a consulta como falta.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.

**Texto tal como esta programado:**

```
Olá {{patient_first_name}},

A sua consulta de {{appointment_date}} às {{appointment_time}} ficou por realizar.

Para remarcar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
Assunto: Sentimos a sua falta — consulta de 10 de setembro de 2026

Olá Madalena,

A sua consulta de 10 de setembro de 2026 às 14:30 ficou por realizar.

Para remarcar: https://app.osteojp.pt/r/eyJ0IjoiM2EyZDA3MTEtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIiwiYSI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsImV4cCI6MTc4OTAwMDAwMH0.N-5B6LOtRZUQt2eazNOmzTfvU7DQEE_lLu8FN_6GMiw
Ou contacte: +351 272 000 000

— OsteoJP
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 10. Falta a consulta — SMS

- **Identificador:** `no_show.sms`
- **Quando:** Quando a rececao marca a consulta como falta.
- **Estado:** aprovado (`approved: true`) — JP, 2026-08-03. **O envio continua bloqueado** por `REMINDERS_LIVE_SEND`, que e o unico travao restante.
- **Codificacao:** GSM-7 (sim) — **84 caracteres, 1 segmento**

**Texto tal como esta programado:**

```
OsteoJP - Consulta nao realizada
Consulta: {date} as {time}
Remarcar: {phone}
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
OsteoJP - Consulta nao realizada
Consulta: 10/09 as 14:30
Remarcar: +351 272 000 000
```

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---

### 11. Lembrete 24 horas antes, COM a linha da taxa — SMS

> **ESTA E A UNICA MENSAGEM DESTE DOCUMENTO QUE AINDA NAO ESTA APROVADA.**
> As outras dez ja o estao. Esta e nova e precisa da sua decisao e da do advogado.

- **Identificador:** `reminder.24h.sms.fee_notice`
- **Quando:** 24 horas antes da consulta, **e apenas** para um doente que tenha
  aceitacao das condicoes registada na ficha clinica.
- **Estado:** bloqueado (`approved: false`) — **ninguem aprovou esta redaccao**. Sem
  aprovador e sem data, porque nao existe nenhum dos dois. Enquanto assim for,
  qualquer envio com esta linha e recusado com o motivo `template_unapproved`.
- **Codificacao:** GSM-7 (sim) — **153 caracteres, 1 segmento** (margem: 7 caracteres)

**Texto tal como esta programado:**

```
OsteoJP - Lembrete
Consulta: amanha {date} as {time}
Local: {clinic}
Remarcar: {phone}
Falta sem aviso: 50%, nos termos aceites na marcacao.
```

**Exemplo real, preenchido** (Madalena, 10/09 as 14:30, Castelo Branco, Dr. Joao Pereira):

```
OsteoJP - Lembrete
Consulta: amanha 10/09 as 14:30
Local: Castelo Branco
Remarcar: +351 272 000 000
Falta sem aviso: 50%, nos termos aceites na marcacao.
```

**Tres travoes, todos activos ao mesmo tempo. A mensagem so sai se os tres cederem:**

1. **O doente aceitou as condicoes**, registado na ficha clinica por um membro da
   equipa. Sem esse registo a linha nao aparece, mesmo com o interruptor ligado.
2. **`REMINDERS_FEE_NOTICE_ENABLED` esta ligado.** Por omissao esta desligado e nao
   esta ligado em lado nenhum.
3. **Esta redaccao foi aprovada por si** (`approved: true`). Hoje esta a `false`.

O primeiro travao e o que faltava e e a razao de ser deste lote: um interruptor
global sozinho anunciaria a taxa a doentes que nunca a aceitaram, que e
exactamente o que o advogado assinalou.

> **Porque tem identificador proprio e nao e o mesmo `reminder.24h.sms`.** A
> aprovacao e resolvida pelo identificador. Se esta linha fosse enviada com o
> identificador da mensagem ja aprovada, passaria por uma aprovacao que se referia
> a outro texto. Com identificador proprio, a aprovacao que falta e a desta.

**Nota tecnica sobre o tamanho.** A redaccao completa e natural —
`Falta sem aviso 24h: cobranca de 50%, nos termos aceites na marcacao.` — tem 69
caracteres e levaria a mensagem a **169 caracteres, ou seja 2 segmentos** (custo a
dobrar). A redaccao acima e a versao curta, que cabe em 1 segmento com 7
caracteres de margem. **Nenhum texto ja aprovado foi encurtado**: as dez mensagens
estao intactas e esta linha e conteudo adicional novo.

**Aprovado? [ ] sim  [ ] com alteracoes  [ ] nao** — alteracoes:

---
## A redaccao de 24h fornecida pela clinica

Recebemos esta redaccao para o lembrete de 24 horas. Fica aqui registada
**tal como foi fornecida**, com acentos:

```
Bom dia,
Recordamos o seu tratamento na OsteoJP no próximo dia {dia} pelas {horas}. Agradecemos confirmação (link)
Ausência sem aviso com 24H será cobrado 50% da consulta.
```

Nao pode ser enviada nesta forma, por duas razoes independentes.

### Problema 1: os acentos triplicam o custo

Um SMS sem acentos cabe em 160 caracteres por segmento. **Um unico caractere
acentuado** (`proximo`, `confirmacao`, `Ausencia`, `sera`) obriga a mensagem
inteira a mudar de codificacao e o limite cai de 160 para 70 caracteres por
segmento. Paga-se por segmento.

Medido, nao estimado, com a mensagem preenchida e a ligacao real:

| Versao | Acentos | Caracteres | Segmentos | Custo relativo |
|---|---|---|---|---|
| Original da clinica | sim | 371 | **6** | 6x |
| Variante A (sem acentos, ligacao curta) | nao | 122 | **1** | 1x |
| Variante B (sem acentos, ligacao curta) | nao | 160 | **1** | 1x |

Seis segmentos por lembrete em vez de um. Com dois lembretes por consulta e
centenas de consultas por mes, a diferenca e real.

### Problema 2: a ligacao assinada nao cabe num SMS

A ligacao de remarcacao actual tem **208 caracteres** (o codigo
assinado sozinho tem 183). Sozinha ja ocupa mais do que um
segmento inteiro. Numeros medidos com as variantes propostas:

| | Com a ligacao assinada actual | Com uma ligacao curta |
|---|---|---|
| Variante A | 303 car., **2 segmentos** | 122 car., **1 segmento** |
| Variante B | 341 car., **3 segmentos** | 160 car., **1 segmento** |

**Um segmento so e possivel com uma ligacao curta.** Isso e trabalho de
engenharia (um encurtador proprio no dominio da clinica), nao uma decisao sua,
mas condiciona a resposta: enquanto nao existir, a redaccao da clinica com
ligacao custa 2 ou 3 segmentos. E por isso que o SMS que esta programado hoje
aponta para o **telefone** da clinica e nao para uma ligacao, e cabe em 1
segmento.

### Variante A — sem a linha da taxa

```
OsteoJP
Recordamos o seu tratamento dia {dia} pelas {horas}.
Confirme: {link}
Ou ligue {phone}
```

Preenchido, com ligacao curta:

```
OsteoJP
Recordamos o seu tratamento dia 10/09 pelas 14:30.
Confirme: https://osteojp.pt/c/AB12CD
Ou ligue +351 272 000 000
```

GSM-7, 122 caracteres, **1 segmento**.

### Variante B — com a linha da taxa

> **ESTADO 2026-08-03: PARADA.** A variante A e a redaccao operativa. A variante B
> so volta a mesa quando (1) o fluxo de aceitacao na ficha clinica estiver a
> funcionar e (2) JP e o advogado assinarem por baixo. A redaccao revista do
> advogado substitui a original e remete para os termos aceites
> ("nos termos aceites na marcacao"). `REMINDERS_FEE_NOTICE_ENABLED` mantem-se
> desligado.
>
> **ACTUALIZACAO 2026-08-07: a condicao (1) esta cumprida, a (2) nao.** O fluxo de
> aceitacao na ficha clinica esta construido e a funcionar. A variante B volta
> portanto a mesa, e esta na seccao 11 acima com a redaccao revista e a
> `approved: false`. Falta apenas a condicao (2): a sua assinatura e a do advogado.
> A variante A continua a ser a redaccao operativa ate la.

```
OsteoJP
Recordamos o seu tratamento dia {dia} pelas {horas}.
Confirme: {link}
Ou ligue {phone}
Falta sem aviso 24h: cobranca de 50%.
```

Preenchido, com ligacao curta:

```
OsteoJP
Recordamos o seu tratamento dia 10/09 pelas 14:30.
Confirme: https://osteojp.pt/c/AB12CD
Ou ligue +351 272 000 000
Falta sem aviso 24h: cobranca de 50%.
```

GSM-7, 160 caracteres, **1 segmento**.

> **Aviso tecnico sobre a variante B:** 160 caracteres e exactamente o limite.
> A margem e **zero**. Um numero de telefone mais longo, um nome de clinica na
> mensagem, ou uma palavra a mais e a mensagem passa a 2 segmentos sem aviso.
> A variante A tem 38 caracteres de folga.

### A linha da taxa de 50% e uma questao juridica

**Nao vamos enviar esta linha por nossa iniciativa.**

`Falta sem aviso 24h: cobranca de 50%.`

Anunciar uma taxa por SMS nao a torna exigivel. Regra geral, uma penalizacao so
e cobravel se o doente tiver concordado com ela em algum lado: no consentimento
informado, nas condicoes de servico, ou numa assinatura na primeira consulta.
Um SMS enviado depois da marcacao nao e um acordo.

**Isto vai com o lote G8 (RGPD) para si e para o advogado.** Duas perguntas:

1. Existe hoje algum documento assinado pelo doente que preveja esta taxa?
2. Se nao existe, quer criar um, ou prefere retirar a linha?

Ate haver resposta, a linha fica **atras de um interruptor desligado**. O nome
previsto e `REMINDERS_FEE_NOTICE_ENABLED`, por omissao **desligado**.

> **Estado deste interruptor, actualizado a 2026-08-07: CONSTRUIDO, e desligado.**
> Antes desta data estava apenas especificado, e este documento dizia-o. Agora
> existe em codigo (`REMINDERS_FEE_NOTICE_ENABLED`, `lib/reminders/fee-notice.ts`),
> por omissao desligado, e nao esta ligado em nenhum ambiente.
>
> **Construido nao quer dizer aprovado, e a diferenca importa.** O que ficou
> construido foi o MECANISMO: o registo da aceitacao na ficha clinica, o travao por
> doente, e o interruptor. A REDACCAO continua por aprovar — e a seccao 11 acima, a
> `approved: false`. Dizemo-lo assim para que ninguem assuma que aprovar o
> mecanismo aprovou o texto, tal como antes o dizíamos para que ninguem assumisse
> uma proteccao que ainda nao existia.

**A sua escolha: [ ] variante A  [ ] variante B  [ ] outra redaccao:**

---

## Nota tecnica

- **Portugues sem acentos apenas no SMS.** Os emails mantem os acentos todos.
  E uma restricao de codificacao dos operadores, nao um erro de escrita.
- **As versoes em ingles** de cada mensagem existem e sao traducoes directas das
  portuguesas. Aprovar a portuguesa aprova a inglesa correspondente.
- **A mensagem de activacao de conta do doente** foi deliberadamente excluida
  deste pacote: nao esta ligada a nada e vai provavelmente ser eliminada. Nao
  vale o seu tempo.
- **As notas clinicas nunca entram em nenhuma destas mensagens.**

## Origem dos numeros

Todos os numeros de caracteres e segmentos deste documento foram gerados a
partir do codigo que envia as mensagens, com dados de exemplo reais, e nao
escritos a mao. Contagem de segmentos: GSM-7 e 160 caracteres para uma mensagem
de segmento unico e 153 por segmento quando dividida; UCS-2 (com acentos) e 70 e
67 respectivamente.
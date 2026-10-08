# SAT-01: textos da avaliação de satisfação

Versão de 2 de outubro de 2026. Especificação: `docs/design/SPEC-SAT-01-satisfaction-form.md`.

Este ficheiro reúne todos os textos que os pacientes e a equipa vão ler na
avaliação de satisfação. Nada está construído.

## Aprovação e alterações

* **Aprovado pelo JP a 2 de outubro de 2026:** as secções A a G e o bloco "O que
  o paciente recebe e quando" da versão de 29 de setembro de 2026, enviada ao
  proprietário como `SAT-01-copy-pt-for-JP.md`.
* **Alterado a 2 de outubro de 2026 pelas decisões da estratégia S-1002-D (S1 a
  S12).** Cada texto alterado mostra, por baixo, o texto aprovado anterior e a
  decisão que o mudou. Os números dos textos aprovados não mudam.
* **Texto 7 novo, aprovado pelo JP a 2 de outubro de 2026** ("Aprovado",
  transmitido pelo proprietário; S9a).
* **Todos os textos para o paciente estão aprovados** (S9a). O único passo que
  falta antes do envio real é o proprietário ligar o envio, depois do envio de
  teste acompanhado para um paciente ZZ TESTE.
* **Textos novos para a equipa** (61 a 81): escritos a 2 de outubro de 2026 a
  pedido da S9, no mesmo estilo dos textos aprovados.
* **Textos 82 e 83, novos para a equipa:** escritos a 8 de outubro de 2026, no
  mesmo estilo, para a eliminação definitiva de um paciente (secção L). Não são
  lidos por pacientes.
* **Inglês:** a secção "English" no fim deste ficheiro é traduzida dos textos
  em português; não foi revista em separado (S10).

## Como ler

* Cada texto tem um número, o sítio onde aparece e o texto.
* O que está entre chavetas é preenchido pelo sistema:
  `{{patient_first_name}}` é o primeiro nome do paciente, `{{appointment_date}}`
  a data da consulta por extenso (por exemplo "23 de maio de 2026"),
  `{data}` a data curta (por exemplo "23/05"), `{{survey_link}}` a ligação
  pessoal, `{{survey_expiry_date}}` o último dia em que a ligação funciona
  (14 dias depois do envio) e `{{clinic_phone}}` o telefone da clínica.
  Nos textos da equipa (61 a 81), `{data}`, `{data_envio}` e `{data_fim}` são
  datas no formato 23/05/2026 e `{nome}` é o nome do membro da equipa que
  enviou.
* `[endereço]` é o endereço do site onde a página fica alojada; é o mesmo que já
  aparece na ligação "Confirmar" dos lembretes por SMS.
* O1 está ligado (S8): o paciente pode recusar novas avaliações na própria
  página, no portal, e a equipa pode desligar o envio na ficha do paciente.
  Os textos que diziam "(só com O1)" passam a existir sempre.

## O que o paciente recebe e quando

**Envio automático (S3).** Uma única mensagem, 24 horas depois do fim de uma
consulta concluída, por email ou, se não houver email autorizado, por SMS. Nunca
as duas. No máximo uma avaliação a cada 60 dias por paciente: o envio automático
não acontece se tiver havido outro envio, automático ou feito pela equipa, nos
últimos 60 dias.

**Envio pela equipa (S4).** O botão "Enviar avaliação", na ficha do paciente e
em Comunicações, envia a avaliação da consulta concluída mais recente do
paciente, pelo mesmo canal (S6). Não está sujeito à regra dos 60 dias. Não envia
se o paciente tiver recusado as avaliações, se não houver canal autorizado, ou
enquanto uma ligação enviada antes ainda for válida e não tiver resposta.

A ligação funciona uma vez e durante 14 dias depois do envio. Esta mensagem
substitui a antiga mensagem "Obrigado pela sua visita / Marcar próxima
consulta", que está desligada desde 4 de setembro.

Antes (bloco aprovado; alterado pela S-1002-D S1, S3 e S4):

> Uma única mensagem, 24 horas depois do fim da consulta concluída, por email ou,
> se não houver email autorizado, por SMS. Nunca as duas. No máximo um
> questionário a cada 60 dias por paciente. A ligação funciona uma vez e até 14
> dias depois da consulta. Esta mensagem substitui a antiga mensagem "Obrigado
> pela sua visita / Marcar próxima consulta", que está desligada desde 4 de
> setembro.

## A. Email ao paciente

**1. Assunto do email**
Onde: assunto do email enviado 24 horas depois da consulta, ou pela equipa.

> Avaliação da sua consulta de {{appointment_date}}

Antes (S1): "Questionário sobre a sua consulta de {{appointment_date}}".

**2. Corpo do email**
Onde: corpo do mesmo email (texto simples, sem imagens).

> Olá {{patient_first_name}},
>
> Pedimos a sua avaliação da consulta de {{appointment_date}}. A avaliação tem três perguntas e a resposta é facultativa.
>
> Responder: {{survey_link}}
>
> A ligação é pessoal, só pode ser usada uma vez e é válida até {{survey_expiry_date}}.
>
> Se não pretender receber estas avaliações, indique-o na mesma ligação ou contacte a clínica: {{clinic_phone}}
>
> OsteoJP

Antes (S1): a segunda frase era "O questionário tem três perguntas e a resposta
é facultativa." e a penúltima "Se não pretender receber estes questionários,
indique-o na mesma ligação ou contacte a clínica: {{clinic_phone}}".

~~Sem O1, a penúltima frase passa a: "Se não pretender receber estes
questionários, contacte a clínica: {{clinic_phone}}".~~ Já não se aplica: O1
está ligado (S8).

Exemplo, com dados inventados (envio a 24 de maio, por isso a ligação vale até
7 de junho):

> Olá Ana,
>
> Pedimos a sua avaliação da consulta de 23 de maio de 2026. A avaliação tem três perguntas e a resposta é facultativa.
>
> Responder: https://[endereço]/s/AB12CD34
>
> A ligação é pessoal, só pode ser usada uma vez e é válida até 7 de junho de 2026.
>
> Se não pretender receber estas avaliações, indique-o na mesma ligação ou contacte a clínica: [telefone da clínica]
>
> OsteoJP

## B. SMS ao paciente

Regra da casa, igual aos lembretes atuais: o SMS não leva acentos nem cedilhas,
para caber numa única mensagem de 160 caracteres.

**3. Texto do SMS**
Onde: SMS enviado 24 horas depois da consulta, ou pela equipa, só quando não há
email autorizado.

> OsteoJP: avaliacao da consulta de {data}
> Responder: [endereço]/s/AB12CD34
> Para nao receber mais avaliacoes, use a mesma ligacao.

Tamanho: 104 caracteres de texto fixo, mais a data (5), o código (8) e o
endereço. Cabe numa mensagem com um endereço de até 43 caracteres. O sistema
recusa enviar um SMS que não caiba numa mensagem (S6).

Antes (S1):

> OsteoJP: questionario sobre a consulta de {data}
> Responder: [endereço]/s/AB12CD34
> Para nao receber mais questionarios, use a mesma ligacao.

(115 caracteres de texto fixo; cabia com um endereço de até 32 caracteres.)

~~Sem O1, a última linha passa a: "Para nao receber mais, contacte a
clinica."~~ Já não se aplica: O1 está ligado (S8).

## C. Página da avaliação (aberta pela ligação)

A página mostra apenas a data da consulta. Não mostra o terapeuta, o serviço, a
hora nem o nome do paciente. Abrir a página não grava nada; só o botão "Enviar
respostas" grava.

**4. Título da página**
Onde: topo da página.

> Avaliação de satisfação

Antes (S1): "Questionário de satisfação".

**5. Linha da consulta**
Onde: por baixo do título.

> Consulta de {{appointment_date}}

**6. Instrução**
Onde: antes da primeira pergunta.

> As perguntas 1 e 2 são obrigatórias. A pergunta 3 e a autorização de contacto são facultativas.

**7. Quem lê as respostas**
Onde: por baixo da instrução.

> As respostas são identificadas e lidas pela equipa da clínica onde foi atendido, incluindo o seu terapeuta.

Texto da decisão S9, palavra por palavra. Aprovado pelo JP a 2 de outubro de
2026 ("Aprovado", transmitido pelo proprietário; S9a).

Antes (S7 e S9): "As respostas são lidas apenas pela direção da clínica."

**8. Pergunta 1**
Onde: primeira pergunta, com uma escala de 0 a 10.

> 1. Numa escala de 0 a 10, qual a probabilidade de recomendar a OsteoJP a um amigo ou familiar?

**9. Extremo inferior da pergunta 1**
Onde: por baixo do 0.

> 0: nada provável

**10. Extremo superior da pergunta 1**
Onde: por baixo do 10.

> 10: extremamente provável

**11. Pergunta 2**
Onde: segunda pergunta, com uma escala de 1 a 5.

> 2. Numa escala de 1 a 5, qual o seu grau de satisfação com esta consulta?

**12. Extremo inferior da pergunta 2**
Onde: por baixo do 1.

> 1: muito baixo

**13. Extremo superior da pergunta 2**
Onde: por baixo do 5.

> 5: muito alto

**14. Pergunta 3**
Onde: terceira pergunta, caixa de texto livre.

> 3. Há algo que nos queira transmitir?

**15. Indicação da pergunta 3**
Onde: por baixo da caixa de texto.

> Facultativo. Máximo de 1000 caracteres.

**16. Indicação sobre dados de saúde**
Onde: por baixo da indicação 15.

> Não é necessário incluir informação sobre a sua saúde.

**17. Autorização de contacto**
Onde: caixa de seleção, vazia por omissão, depois da pergunta 3.

> Autorizo a OsteoJP a contactar-me a propósito das minhas respostas.

**18. Botão de envio**
Onde: fim do formulário.

> Enviar respostas

**19. Botão para recusar novas avaliações (O1, ligado pela S8)**
Onde: por baixo do botão de envio, com menos destaque.

> Não quero receber mais avaliações

Antes (S1): "Não quero receber mais questionários".

**20. Nota do botão 19 (O1, ligado pela S8)**
Onde: ao lado ou por baixo do botão 19.

> Os lembretes de consulta não são afetados.

**21. Aviso geral de erro no formulário**
Onde: topo do formulário, quando falta uma resposta obrigatória.

> Verifique os campos assinalados.

**22. Erro na pergunta 1**
Onde: junto da pergunta 1, se não houver resposta.

> Escolha um valor de 0 a 10.

**23. Erro na pergunta 2**
Onde: junto da pergunta 2, se não houver resposta.

> Escolha um valor de 1 a 5.

**24. Erro no comentário**
Onde: junto da pergunta 3, se o texto for demasiado longo.

> O comentário tem mais de 1000 caracteres.

**25. Erro ao gravar**
Onde: topo do formulário, se a gravação falhar ou houver demasiadas tentativas.

> Não foi possível registar a resposta. Tente novamente dentro de alguns minutos.

## D. Páginas de resultado

**26. Título depois de responder**
Onde: página mostrada depois de "Enviar respostas".

> Resposta registada

**27. Texto depois de responder**
Onde: por baixo do título 26.

> Obrigado. A sua resposta foi registada.

**28. Título depois de recusar (O1, ligado pela S8)**
Onde: página mostrada depois do botão 19.

> Pedido registado

**29. Texto depois de recusar (O1, ligado pela S8)**
Onde: por baixo do título 28.

> Não voltará a receber avaliações de satisfação da OsteoJP. Os lembretes de consulta não são afetados.

Antes (S1): "Não voltará a receber questionários de satisfação da OsteoJP. Os
lembretes de consulta não são afetados."

**30. Título da ligação inválida**
Onde: página mostrada para uma ligação desconhecida, expirada ou já usada. É a
mesma página nos três casos, por segurança. O título é igual ao da página de
confirmação de consulta que já existe.

> Ligação inválida ou expirada

**31. Texto da ligação inválida**
Onde: por baixo do título 30.

> Esta ligação já não é válida. O prazo de resposta pode ter terminado ou a avaliação pode já ter sido respondida.

Antes (S1): "Esta ligação já não é válida. O prazo de resposta pode ter terminado
ou o questionário pode já ter sido respondido."

## E. Área de paciente (portal), página da conta

**32. Título da secção**
Onde: página "A minha conta", por baixo de "Lembretes de consulta".

> Avaliações de satisfação

Antes (S1): "Questionários de satisfação".

**33. Interruptor**
Onde: dentro da secção 32. Ligado por omissão. Desligado, nenhum envio acontece,
automático ou pela equipa (S8).

> Receber avaliações de satisfação

Antes (S1): "Receber questionários de satisfação".

**34. Indicação do interruptor**
Onde: por baixo do interruptor 33.

> Enviada por email ou SMS 24 horas depois de uma consulta, no máximo uma vez a cada 60 dias. A equipa da clínica também a pode enviar.

Antes (S1, S3 e S4): "Enviado por email ou SMS 24 horas depois de uma consulta,
no máximo uma vez a cada 60 dias."

**35. Nota ao desligar**
Onde: por baixo do interruptor 33, quando está desligado.

> Desligar não afeta os lembretes de consulta.

## F. Lista de respostas (equipa: o terapeuta que realizou a consulta, a receção e os administradores dessa clínica, e o proprietário)

Antes (S7): "F. Lista de respostas (equipa: só proprietário e administradores)".

A lista mostra cada envio, com o estado do envio (S5, textos 79 e 80) e, quando
há resposta, as respostas. Cada resposta só aparece a quem a S7 permite (texto
81 nas outras linhas). O botão "Enviar avaliação" (texto 61) também está aqui.

**36. Separador em Comunicações**
Onde: barra de separadores de Comunicações, ao lado de Recuperação, Lembretes
SMS e Respostas SMS.

> Avaliações de satisfação

Antes (S1): "Questionários". Nunca apenas "Avaliações", que na plataforma são as
avaliações clínicas (S1).

**37. Título da página**
Onde: topo da lista.

> Avaliações de satisfação

Antes (S1): "Questionários de satisfação".

**38. Subtítulo**
Onde: por baixo do título 37.

> Avaliações de satisfação enviadas depois de uma consulta concluída, com as respostas. Cada resposta é visível para o terapeuta que realizou a consulta, para a receção e os administradores da clínica onde decorreu e para o proprietário.

Antes (S1, S4 e S7): "Respostas ao questionário enviado 24 horas depois de uma
consulta concluída. Visível apenas para o proprietário e os administradores."

**39. Coluna da data**
Onde: cabeçalho da tabela.

> Consulta

**40. Coluna do paciente**
Onde: cabeçalho da tabela.

> Paciente

**41. Coluna do terapeuta**
Onde: cabeçalho da tabela.

> Terapeuta

**42. Coluna da clínica**
Onde: cabeçalho da tabela.

> Clínica

**43. Coluna da pergunta 1**
Onde: cabeçalho da tabela.

> Recomendação (0 a 10)

**44. Coluna da pergunta 2**
Onde: cabeçalho da tabela.

> Satisfação (1 a 5)

**45. Coluna do comentário**
Onde: cabeçalho da tabela.

> Comentário

**46. Coluna da autorização**
Onde: cabeçalho da tabela.

> Aceita contacto

**47. Valores da coluna 46**
Onde: células da coluna 46.

> Sim
>
> Não

**48. Coluna do canal**
Onde: cabeçalho da tabela; as células dizem "Email" ou "SMS".

> Enviado por

**49. Coluna da hora de resposta**
Onde: cabeçalho da tabela.

> Respondido em

**50. Sem comentário**
Onde: célula da coluna 45 quando o paciente não escreveu nada.

> Sem comentário

**51. Comentário apagado**
Onde: célula da coluna 45 depois de 24 meses (as pontuações ficam, o comentário é apagado).

> Comentário apagado ao fim de 24 meses.

**52. Filtro**
Onde: por cima da tabela.

> Mês

**53. Abrir a ficha**
Onde: em cada linha. Texto igual ao que já existe em Recuperação.

> Abrir ficha

**54. Lista vazia**
Onde: no lugar da tabela, quando não há envios.

> Ainda não foi enviada nenhuma avaliação de satisfação.

Antes (S5: a lista passa a mostrar os envios, não só as respostas): "Ainda não
há respostas."

**55. Indicação da lista vazia**
Onde: por baixo do texto 54.

> A avaliação de satisfação é enviada 24 horas depois de uma consulta concluída, se o paciente o permitir.

Antes (S1): "O questionário é enviado 24 horas depois de uma consulta concluída,
se o paciente o permitir."

**56. Título de erro**
Onde: no lugar da tabela, se a lista não carregar.

> Não foi possível carregar as respostas

**57. Texto de erro**
Onde: por baixo do título 56.

> Ocorreu um erro ao carregar a lista. Isto não significa que não haja respostas. Tente novamente; se continuar, avise a equipa técnica.

## G. Ficha do paciente (equipa)

Antes (S8): "G. Ficha do paciente (equipa, só com O1)". O1 está ligado.

Na mesma secção ficam também o botão "Enviar avaliação" com o seu estado (textos
61 a 78) e a lista dos envios e respostas deste paciente (S11), com as colunas
39, 41, 42, 43 a 47, 49, 79 e 80 e o texto 81. Sem envios, a lista mostra o
texto 78.

**58. Título**
Onde: ficha do paciente, junto das preferências de contacto.

> Avaliações de satisfação

Antes (S1): "Questionários de satisfação".

**59. Interruptor**
Onde: dentro da secção 58. Ligado por omissão. Desligado, nenhum envio acontece,
automático ou pela equipa (S8).

> Enviar avaliação de satisfação depois das consultas

Antes (S1): "Enviar questionário de satisfação depois das consultas".

**60. Nota ao desligar**
Onde: por baixo do interruptor 59, quando está desligado.

> Desligar não afeta os lembretes de consulta.

## H. Envio pela equipa: botão e janela (novo, S4 e S6)

**61. Botão de envio**
Onde: ficha do paciente (secção 58) e lista de Comunicações (separador 36).
Visível para o terapeuta, nos pacientes que acompanha, para a receção e os
administradores, nas suas clínicas, e para o proprietário (S4).

> Enviar avaliação

**62. Título da janela**
Onde: janela aberta pelo botão 61, antes de enviar.

> Enviar avaliação de satisfação

**63. Texto da janela, envio por email**
Onde: janela 62, quando o canal é o email.

> A avaliação de satisfação da consulta de {{appointment_date}} será enviada por email.

**64. Texto da janela, envio por SMS**
Onde: janela 62, quando o canal é o SMS.

> A avaliação de satisfação da consulta de {{appointment_date}} será enviada por SMS, porque o paciente não tem email autorizado.

**65. Aviso de custo do SMS**
Onde: janela 62, por baixo do texto 64, só quando o canal é o SMS.

> O SMS tem custo para a clínica. Sempre que possível, registe o email do paciente.

**66. Botão de confirmação**
Onde: janela 62.

> Enviar

**67. Botão de cancelar**
Onde: janela 62. Texto que já existe na plataforma.

> Cancelar

**68. Confirmação**
Onde: aviso depois de um envio bem-sucedido.

> Avaliação de satisfação enviada.

**69. Erro no envio**
Onde: janela 62, se o sistema recusar ou o envio falhar.

> Não foi possível enviar a avaliação de satisfação. Atualize a página e tente novamente.

## I. Botão indisponível: motivos (novo, S4)

Onde: junto do botão 61, que fica desativado. Aparece um motivo de cada vez.

**70. Sem consulta concluída**

> Indisponível: o paciente não tem nenhuma consulta concluída.

**71. O paciente recusou**

> Indisponível: o paciente pediu para não receber avaliações de satisfação.

**72. Sem canal autorizado**

> Indisponível: não há email nem telemóvel autorizado para contactar este paciente.

**73. Ligação ainda válida e sem resposta**

> Indisponível: a avaliação enviada a {data_envio} ainda não foi respondida. A ligação é válida até {data_fim}.

## J. Estado do envio (novo, S5)

Onde: junto do botão 61, na ficha e na lista. A linha junta as partes assim:
"{74 ou 75}. {76}. {77}."

Exemplo, com dados inventados: "Último envio: 24/05/2026, por [nome]. Canal:
email. Sem resposta."

**74. Último envio, pela equipa**

> Último envio: {data}, por {nome}

**75. Último envio, automático**

> Último envio: {data}, automático

**76. Canal**

> Canal: email
>
> Canal: SMS

**77. Resposta**

> Com resposta
>
> Sem resposta

**78. Nunca enviada**
Onde: no lugar da linha de estado, e da lista da ficha, quando nunca houve
envio.

> Nenhuma avaliação de satisfação enviada.

## K. Lista de envios: colunas novas (novo, S5, S7 e S11)

Onde: lista do separador 36 e lista da ficha (secção 58).

**79. Coluna do envio**
Onde: cabeçalho da tabela; as células dizem "{data}, por {nome}" ou "{data},
automático", como nos textos 74 e 75.

> Envio

**80. Coluna da resposta**
Onde: cabeçalho da tabela; as células usam o texto 77.

> Resposta

**81. Resposta reservada**
Onde: no lugar das colunas 43 a 47 e 49, numa linha com resposta que a pessoa
não pode ver (S7).

> Resposta visível apenas para o terapeuta que realizou a consulta, para a receção e os administradores dessa clínica e para o proprietário.

## L. Eliminação definitiva de um paciente: o que a impede (novo, 8 de outubro de 2026)

Onde: na ficha do paciente, "Zona de risco", e em "Pacientes eliminados", na
lista "O que ainda referencia este paciente", ao lado dos outros tipos de dados
(marcações, notas, faturas). Cada linha mostra o texto, dois pontos e o número
de registos. Um paciente com envios ou respostas de avaliação não pode ser
eliminado definitivamente.

Exemplo: "Avaliações de satisfação (envios): 1"

**82. Envios de avaliação**

> Avaliações de satisfação (envios)

**83. Respostas de avaliação**

> Avaliações de satisfação (respostas)

## Perguntas para o JP, com as respostas de 2 de outubro de 2026

1. **O nome.** "Questionário de satisfação" em todo o lado. Prefere
   "inquérito" ou "avaliação"?
   **Resposta (S1):** "Avaliação de satisfação"; no plural "Avaliações de
   satisfação"; o separador diz "Avaliações de satisfação", nunca apenas
   "Avaliações".
2. **A pergunta 1** é a pergunta padrão de recomendação (NPS), com os extremos
   "nada provável" e "extremamente provável". Mantém-se esta formulação?
   **Resposta (S2):** mantém-se.
3. **Quem lê as respostas (texto 7).** A proposta diz "a direção da clínica",
   que inclui o proprietário e os administradores. Está correto dizê-lo assim, ou
   prefere não dizer quem lê? Não propomos escrever "o seu terapeuta não vê a
   avaliação", porque não é verdade quando o terapeuta é o próprio proprietário.
   **Resposta (S7, S9 e S9a):** as respostas passam a ser lidas pelo terapeuta
   que realizou a consulta, pela receção e os administradores dessa clínica e
   pelo proprietário. O texto 7 novo foi aprovado pelo JP a 2 de outubro de
   2026.
4. **A indicação sobre dados de saúde (texto 16).** Mantém-se, muda, ou sai?
   **Resposta (S2):** mantém-se.
5. **A autorização de contacto (texto 17).** A frase serve?
   **Resposta (S2):** mantém-se.
6. **A versão em inglês.** Os textos em inglês serão traduzidos destes depois da
   aprovação. O JP também os revê, ou fica com o proprietário?
   **Resposta (S10):** traduzidos dos textos aprovados em português e publicados
   sem segunda revisão.

## English (translated, not separately reviewed (S10))

Translated from the approved pt-PT texts above. The numbers are the same. In English the feature is a "satisfaction
survey": "evaluation" is already the platform's English word for the clinical
avaliações, and "review" is already Review Consultation.

| # | English |
|---|---|
| 1 | Satisfaction survey for your appointment on {{appointment_date}} |
| 2 | Dear {{patient_first_name}},<br><br>We would like your rating of your appointment on {{appointment_date}}. The survey has three questions and answering is optional.<br><br>Answer: {{survey_link}}<br><br>The link is personal, can be used only once and is valid until {{survey_expiry_date}}.<br><br>If you do not wish to receive these surveys, say so using the same link or contact the clinic: {{clinic_phone}}<br><br>OsteoJP |
| 3 | OsteoJP: survey about your appointment on {data}<br>Answer: [address]/s/AB12CD34<br>To stop receiving surveys, use the same link. |
| 4 | Satisfaction survey |
| 5 | Appointment on {{appointment_date}} |
| 6 | Questions 1 and 2 are required. Question 3 and the contact permission are optional. |
| 7 | Your answers are identified and are read by the team at the clinic where you were seen, including your therapist. |
| 8 | 1. On a scale of 0 to 10, how likely are you to recommend OsteoJP to a friend or family member? |
| 9 | 0: not at all likely |
| 10 | 10: extremely likely |
| 11 | 2. On a scale of 1 to 5, how satisfied are you with this appointment? |
| 12 | 1: very low |
| 13 | 5: very high |
| 14 | 3. Is there anything you would like to tell us? |
| 15 | Optional. Maximum 1000 characters. |
| 16 | You do not need to include any information about your health. |
| 17 | I authorise OsteoJP to contact me about my answers. |
| 18 | Submit answers |
| 19 | I do not want to receive any more surveys |
| 20 | Appointment reminders are not affected. |
| 21 | Check the highlighted fields. |
| 22 | Choose a value from 0 to 10. |
| 23 | Choose a value from 1 to 5. |
| 24 | The comment is longer than 1000 characters. |
| 25 | Your answer could not be saved. Please try again in a few minutes. |
| 26 | Answer saved |
| 27 | Thank you. Your answer has been saved. |
| 28 | Request saved |
| 29 | You will no longer receive satisfaction surveys from OsteoJP. Appointment reminders are not affected. |
| 30 | Invalid or expired link |
| 31 | This link is no longer valid. The time to answer may have ended or the survey may already have been answered. |
| 32 | Satisfaction surveys |
| 33 | Receive satisfaction surveys |
| 34 | Sent by email or SMS 24 hours after an appointment, at most once every 60 days. The clinic team can also send it. |
| 35 | Turning this off does not affect appointment reminders. |
| 36 | Satisfaction surveys |
| 37 | Satisfaction surveys |
| 38 | Satisfaction surveys sent after a completed appointment, with their answers. Each answer is visible to the therapist who carried out the appointment, to reception and the administrators of the clinic where it took place, and to the owner. |
| 39 | Appointment |
| 40 | Patient |
| 41 | Therapist |
| 42 | Clinic |
| 43 | Recommendation (0 to 10) |
| 44 | Satisfaction (1 to 5) |
| 45 | Comment |
| 46 | Agrees to be contacted |
| 47 | Yes<br>No |
| 48 | Sent via |
| 49 | Answered on |
| 50 | No comment |
| 51 | Comment deleted after 24 months. |
| 52 | Month |
| 53 | Open record |
| 54 | No satisfaction survey has been sent yet. |
| 55 | The satisfaction survey is sent 24 hours after a completed appointment, if the patient allows it. |
| 56 | The answers could not be loaded |
| 57 | An error occurred while loading the list. This does not mean there are no answers. Try again; if it continues, tell the technical team. |
| 58 | Satisfaction surveys |
| 59 | Send a satisfaction survey after appointments |
| 60 | Turning this off does not affect appointment reminders. |
| 61 | Send survey |
| 62 | Send satisfaction survey |
| 63 | The satisfaction survey for the appointment on {{appointment_date}} will be sent by email. |
| 64 | The satisfaction survey for the appointment on {{appointment_date}} will be sent by SMS, because the patient has no permitted email. |
| 65 | SMS has a cost for the clinic. Whenever possible, record the patient's email. |
| 66 | Send |
| 67 | Cancel |
| 68 | Satisfaction survey sent. |
| 69 | The satisfaction survey could not be sent. Refresh the page and try again. |
| 70 | Unavailable: the patient has no completed appointment. |
| 71 | Unavailable: the patient asked not to receive satisfaction surveys. |
| 72 | Unavailable: there is no permitted email or mobile number to contact this patient. |
| 73 | Unavailable: the survey sent on {data_envio} has not been answered yet. The link is valid until {data_fim}. |
| 74 | Last sent: {data}, by {nome} |
| 75 | Last sent: {data}, automatic |
| 76 | Channel: email<br>Channel: SMS |
| 77 | Answered<br>Not answered |
| 78 | No satisfaction survey sent. |
| 79 | Sent |
| 80 | Answer |
| 81 | Answer visible only to the therapist who carried out the appointment, to reception and the administrators of that clinic, and to the owner. |
| 82 | Satisfaction surveys (sends) |
| 83 | Satisfaction surveys (answers) |

The English SMS (3) is ASCII only, as the house rule asks of every SMS. Its
fixed text is 100 characters, plus the date (5), the code (8) and the
address, so it fits one message with an address of up to 47 characters.

# SAT-01: textos do questionário de satisfação, para revisão do JP

Versão de 29 de setembro de 2026. Especificação: `docs/design/SPEC-SAT-01-satisfaction-form.md`.

Este ficheiro reúne todos os textos que os pacientes e a equipa vão ler no
questionário de satisfação. Nada está construído. Nenhum texto é enviado a um
paciente antes de o JP o aprovar: as mensagens entram no sistema marcadas como
"não aprovadas" e só saem depois da aprovação registada e de o proprietário
ativar o envio.

## Como rever

* Cada texto tem um número, o sítio onde aparece e o texto proposto.
* Para aprovar, basta indicar "aprovado" ou o número e a alteração, por exemplo
  "12: trocar X por Y".
* O que está entre chavetas é preenchido pelo sistema:
  `{{patient_first_name}}` é o primeiro nome do paciente, `{{appointment_date}}`
  a data da consulta por extenso (por exemplo "23 de maio de 2026"),
  `{data}` a data curta (por exemplo "23/05"), `{{survey_link}}` a ligação
  pessoal, `{{survey_expiry_date}}` o último dia em que a ligação funciona
  (14 dias depois da consulta) e `{{clinic_phone}}` o telefone da clínica.
* `[endereço]` é o endereço do site onde a página fica alojada; é o mesmo que já
  aparece na ligação "Confirmar" dos lembretes por SMS.
* Os textos marcados "(só com O1)" só existem se o proprietário aprovar que o
  paciente possa recusar novos questionários na própria página e que a receção
  possa desligar o envio na ficha do paciente.

## O que o paciente recebe e quando

Uma única mensagem, 24 horas depois do fim da consulta concluída, por email ou,
se não houver email autorizado, por SMS. Nunca as duas. No máximo um
questionário a cada 60 dias por paciente. A ligação funciona uma vez e até 14
dias depois da consulta. Esta mensagem substitui a antiga mensagem "Obrigado
pela sua visita / Marcar próxima consulta", que está desligada desde 4 de
setembro.

## A. Email ao paciente

**1. Assunto do email**
Onde: assunto do email enviado 24 horas depois da consulta.

> Questionário sobre a sua consulta de {{appointment_date}}

**2. Corpo do email**
Onde: corpo do mesmo email (texto simples, sem imagens).

> Olá {{patient_first_name}},
>
> Pedimos a sua avaliação da consulta de {{appointment_date}}. O questionário tem três perguntas e a resposta é facultativa.
>
> Responder: {{survey_link}}
>
> A ligação é pessoal, só pode ser usada uma vez e é válida até {{survey_expiry_date}}.
>
> Se não pretender receber estes questionários, indique-o na mesma ligação ou contacte a clínica: {{clinic_phone}}
>
> OsteoJP

Sem O1, a penúltima frase passa a: "Se não pretender receber estes
questionários, contacte a clínica: {{clinic_phone}}".

Exemplo, com dados inventados:

> Olá Ana,
>
> Pedimos a sua avaliação da consulta de 23 de maio de 2026. O questionário tem três perguntas e a resposta é facultativa.
>
> Responder: https://[endereço]/s/AB12CD34
>
> A ligação é pessoal, só pode ser usada uma vez e é válida até 6 de junho de 2026.
>
> Se não pretender receber estes questionários, indique-o na mesma ligação ou contacte a clínica: [telefone da clínica]
>
> OsteoJP

## B. SMS ao paciente

Regra da casa, igual aos lembretes atuais: o SMS não leva acentos nem cedilhas,
para caber numa única mensagem de 160 caracteres.

**3. Texto do SMS**
Onde: SMS enviado 24 horas depois da consulta, só quando não há email
autorizado.

> OsteoJP: questionario sobre a consulta de {data}
> Responder: [endereço]/s/AB12CD34
> Para nao receber mais questionarios, use a mesma ligacao.

Tamanho: 115 caracteres de texto fixo, mais a data (5), o código (8) e o
endereço. Cabe numa mensagem com um endereço de até 32 caracteres. O sistema
recusa enviar um SMS que não caiba numa mensagem.

Sem O1, a última linha passa a: "Para nao receber mais, contacte a clinica."

## C. Página do questionário (aberta pela ligação)

A página mostra apenas a data da consulta. Não mostra o terapeuta, o serviço, a
hora nem o nome do paciente. Abrir a página não grava nada; só o botão "Enviar
respostas" grava.

**4. Título da página**
Onde: topo da página.

> Questionário de satisfação

**5. Linha da consulta**
Onde: por baixo do título.

> Consulta de {{appointment_date}}

**6. Instrução**
Onde: antes da primeira pergunta.

> As perguntas 1 e 2 são obrigatórias. A pergunta 3 e a autorização de contacto são facultativas.

**7. Quem lê as respostas**
Onde: por baixo da instrução.

> As respostas são lidas apenas pela direção da clínica.

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

**19. Botão para recusar novos questionários (só com O1)**
Onde: por baixo do botão de envio, com menos destaque.

> Não quero receber mais questionários

**20. Nota do botão 19 (só com O1)**
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

**28. Título depois de recusar (só com O1)**
Onde: página mostrada depois do botão 19.

> Pedido registado

**29. Texto depois de recusar (só com O1)**
Onde: por baixo do título 28.

> Não voltará a receber questionários de satisfação da OsteoJP. Os lembretes de consulta não são afetados.

**30. Título da ligação inválida**
Onde: página mostrada para uma ligação desconhecida, expirada ou já usada. É a
mesma página nos três casos, por segurança. O título é igual ao da página de
confirmação de consulta que já existe.

> Ligação inválida ou expirada

**31. Texto da ligação inválida**
Onde: por baixo do título 30.

> Esta ligação já não é válida. O prazo de resposta pode ter terminado ou o questionário pode já ter sido respondido.

## E. Área de paciente (portal), página da conta

**32. Título da secção**
Onde: página "A minha conta", por baixo de "Lembretes de consulta".

> Questionários de satisfação

**33. Interruptor**
Onde: dentro da secção 32. Ligado por omissão.

> Receber questionários de satisfação

**34. Indicação do interruptor**
Onde: por baixo do interruptor 33.

> Enviado por email ou SMS 24 horas depois de uma consulta, no máximo uma vez a cada 60 dias.

**35. Nota ao desligar**
Onde: por baixo do interruptor 33, quando está desligado.

> Desligar não afeta os lembretes de consulta.

## F. Lista de respostas (equipa: só proprietário e administradores)

**36. Separador em Comunicações**
Onde: barra de separadores de Comunicações, ao lado de Recuperação, Lembretes
SMS e Respostas SMS.

> Questionários

**37. Título da página**
Onde: topo da lista.

> Questionários de satisfação

**38. Subtítulo**
Onde: por baixo do título 37.

> Respostas ao questionário enviado 24 horas depois de uma consulta concluída. Visível apenas para o proprietário e os administradores.

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
Onde: no lugar da tabela, quando não há respostas.

> Ainda não há respostas.

**55. Indicação da lista vazia**
Onde: por baixo do texto 54.

> O questionário é enviado 24 horas depois de uma consulta concluída, se o paciente o permitir.

**56. Título de erro**
Onde: no lugar da tabela, se a lista não carregar.

> Não foi possível carregar as respostas

**57. Texto de erro**
Onde: por baixo do título 56.

> Ocorreu um erro ao carregar a lista. Isto não significa que não haja respostas. Tente novamente; se continuar, avise a equipa técnica.

## G. Ficha do paciente (equipa, só com O1)

**58. Título**
Onde: ficha do paciente, junto das preferências de contacto.

> Questionários de satisfação

**59. Interruptor**
Onde: dentro da secção 58. Ligado por omissão.

> Enviar questionário de satisfação depois das consultas

**60. Nota ao desligar**
Onde: por baixo do interruptor 59, quando está desligado.

> Desligar não afeta os lembretes de consulta.

## Perguntas para o JP

1. **O nome.** "Questionário de satisfação" em todo o lado. Prefere
   "inquérito" ou "avaliação"?
2. **A pergunta 1** é a pergunta padrão de recomendação (NPS), com os extremos
   "nada provável" e "extremamente provável". Mantém-se esta formulação?
3. **Quem lê as respostas (texto 7).** A proposta diz "a direção da clínica",
   que inclui o proprietário e os administradores. Está correto dizê-lo assim, ou
   prefere não dizer quem lê? Não propomos escrever "o seu terapeuta não vê a
   avaliação", porque não é verdade quando o terapeuta é o próprio proprietário.
4. **A indicação sobre dados de saúde (texto 16).** Mantém-se, muda, ou sai?
5. **A autorização de contacto (texto 17).** A frase serve?
6. **A versão em inglês.** Os textos em inglês serão traduzidos destes depois da
   aprovação. O JP também os revê, ou fica com o proprietário?

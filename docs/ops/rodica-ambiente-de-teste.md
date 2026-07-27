# Ambiente de teste OsteoJP - guia para a Rodica

Modelo de uma pagina. O Ivan preenche os campos entre chavetas `{ }` quando o
ambiente de teste estiver criado. Depois de preenchido, este guia permite a Rodica
testar sozinha, sem prejudicar os dados reais.

> Este ficheiro e um MODELO. Ate estar preenchido com o endereco e os dados de
> acesso reais, o ambiente de teste ainda nao existe (ver Q-INC-02-1).

## O mais importante, em primeiro lugar

- **Testar significa inventar dados falsos** (pacientes "Teste", marcacoes de
  experiencia, declaracoes de experiencia). Isso so pode ser feito no ambiente de
  teste, NUNCA no sistema real.
- **NUNCA testar em `osteojp.pt`.** O `osteojp.pt` (e qualquer endereco que
  comece por `app.osteojp.pt`) e o sistema REAL, com pacientes reais. Um paciente
  "Teste" criado la fica no historico clinico verdadeiro e tem de ser removido a
  mao pelo Ivan.

## Onde testar

- **Endereco de teste:** `{URL_DE_TESTE}`
- **Utilizador:** `{UTILIZADOR}`
- **Palavra-passe:** `{PALAVRA_PASSE}`

Abra sempre o endereco de teste acima. Escreva-o nos favoritos do navegador com o
nome "OsteoJP TESTE" para nao se enganar.

## Como saber, num segundo, se esta no sitio certo

1. Confirme o endereco no topo do navegador:
   - Endereco de teste `{URL_DE_TESTE}` -> pode inventar a vontade.
   - `osteojp.pt` ou `app.osteojp.pt` -> e o REAL, NAO inventar nada.
2. No ambiente de teste os dados sao ficticios (pacientes de exemplo). Se vir
   pacientes reais que conhece, PARE: esta no sistema real, feche e volte ao
   endereco de teste.

## O que pode fazer no ambiente de teste

- Criar pacientes de experiencia (use sempre um nome claro, por exemplo
  "TESTE Rodica").
- Criar e editar marcacoes.
- Gerar declaracoes de presenca de experiencia.
- Experimentar tudo o que precisar. Os dados de teste podem ser apagados a
  qualquer momento e nao afetam o sistema real.

## Se tiver duvidas

- Nao tem a certeza se esta no ambiente de teste? NAO inventa nada e envie o
  endereco (a linha do topo do navegador) ao Ivan antes de continuar.
- O acesso de teste deixou de funcionar? Avise o Ivan; nao use o sistema real como
  alternativa.

---

Preenchimento (Ivan): substituir `{URL_DE_TESTE}`, `{UTILIZADOR}`,
`{PALAVRA_PASSE}` pelos valores do ambiente de teste (staging), confirmar que a
referencia Supabase desse ambiente NAO e `dfotoodqvmjhbdcxyaxf` (prod), e entregar
a pagina preenchida a Rodica. Ver a loop INC-02
(`docs/loops/prelaunch/INC-02-synthetic-data-env-and-purge.md`).

# Caderno de encargos — exportação de dados da plataforma atual

**Destinatário:** fornecedor da plataforma atual (a/c Eduardo)
**Emitente:** OsteoJP — Linda-a-Velha, Castelo Branco, Montemor-o-Novo
**Data:** 2026-08-06
**Versão:** 1.0

---

## 1. Objeto

Este documento especifica, de forma completa e vinculativa, os dados, os campos
e o formato da exportação única dos dados clínicos e administrativos da OsteoJP
a partir da plataforma atual, para migração para a nova plataforma da clínica.

O fornecedor deve orçamentar contra esta especificação. A entrega será validada
contra esta especificação, campo a campo.

**Volume estimado:** cerca de 10.000 pacientes, com histórico de marcações,
registos clínicos e documentos anexos associados.

---

## 2. Condições gerais da entrega

1. **Uma única extração.** A exportação é feita uma só vez, no dia acordado
   como último dia de utilização da plataforma atual pela clínica. Esse dia
   será comunicado por escrito com antecedência.

2. **Entrega composta por duas partes:**
   - **Parte A — ficheiros CSV**, um por entidade, conforme a secção 4.
   - **Parte B — um ficheiro ZIP** com todos os documentos anexos, referenciados
     a partir das linhas dos CSV, conforme a secção 5.
   - **Parte C — um ficheiro de manifesto**, conforme a secção 6.

3. **Completude.** A exportação inclui a totalidade dos dados: todos os
   pacientes, todo o histórico, todos os documentos. Não é aplicada qualquer
   filtragem por data, por estado, por clínica, por terapeuta ou por atividade
   do paciente. Pacientes inativos, marcações antigas, marcações canceladas e
   faltas fazem parte da entrega.

4. **Entrega não conforme.** Se a entrega divergir desta especificação, trata-se
   de uma entrega não conforme e é devolvida ao fornecedor para correção. Este é
   o único caso em que uma segunda entrega não viola a condição de extração
   única.

5. **Amostra prévia (pedido separado e sem prejuízo do ponto 1).** A clínica
   solicita, antes da extração final, uma **amostra de 20 a 50 pacientes** com a
   estrutura completa aqui descrita, incluindo alguns documentos anexos. A
   amostra destina-se exclusivamente a validar o formato e não substitui nem
   antecipa a extração final. A condição de extração única refere-se à extração
   completa; uma amostra é um pedido distinto e de dimensão reduzida.

---

## 3. Regras de formato, aplicáveis a todos os ficheiros CSV

| Regra | Valor exigido |
|---|---|
| Codificação | UTF-8, sem BOM |
| Separador de campos | vírgula `,` |
| Delimitador de texto | aspas duplas `"` |
| Escape de aspas dentro de um campo | aspas duplas duplicadas `""` |
| Fim de linha | `LF` (`\n`) ou `CRLF` (`\r\n`), consistente em todo o ficheiro |
| Linha de cabeçalho | **obrigatória**, na primeira linha, com os nomes de coluna exatos desta especificação |
| Ordem das colunas | livre; a identificação é feita pelo nome no cabeçalho |
| Datas (só data) | ISO 8601, `AAAA-MM-DD` (exemplo: `1978-03-14`) |
| Datas com hora | ISO 8601 com fuso horário explícito, `AAAA-MM-DDTHH:MM:SS+01:00` ou em UTC com sufixo `Z` (exemplo: `2024-05-09T09:00:00Z`) |
| Campo vazio | célula vazia. **Não** utilizar `NULL`, `N/A`, `-` ou `0000-00-00` |
| Valores numéricos | sem separador de milhares; ponto `.` como separador decimal |
| Quebras de linha dentro de um campo | permitidas, desde que o campo esteja entre aspas |

**Fusos horários.** Se as datas com hora forem exportadas sem indicação de fuso,
o fornecedor deve declarar no manifesto qual o fuso em que estão gravadas. Uma
hora sem fuso e sem declaração não é interpretável e torna a entrega não
conforme.

---

## 4. Ficheiros CSV — um por entidade

São exigidos **quatro** ficheiros CSV, com estes nomes exatos:

| Ficheiro | Conteúdo |
|---|---|
| `pacientes.csv` | Ficha de cada paciente |
| `marcacoes.csv` | Histórico de marcações e consultas |
| `episodios.csv` | Episódios clínicos e respetivo conteúdo clínico |
| `documentos.csv` | Índice dos documentos contidos no ZIP |

### 4.0 Identificador estável de paciente

Requisito transversal e o mais importante deste documento.

Cada paciente tem um **identificador único e estável** na plataforma atual. Esse
identificador:

- é exportado na coluna `id_paciente` de `pacientes.csv`;
- é repetido, exatamente com o mesmo valor, na coluna `id_paciente` de
  `marcacoes.csv`, `episodios.csv` e `documentos.csv`;
- é único em toda a exportação: dois pacientes distintos nunca partilham o mesmo
  valor;
- é tratado como texto, mesmo que seja numérico, e é exportado sem
  formatação adicional, sem zeros à esquerda removidos e sem notação científica.

O mesmo princípio aplica-se aos identificadores de marcação (`id_marcacao`), de
episódio (`id_episodio`) e de documento (`id_documento`): únicos dentro do
respetivo ficheiro e estáveis entre ficheiros.

Sem estes identificadores a ligação entre paciente, marcação, episódio e
documento não é reconstruível e a exportação não tem valor.

### 4.1 `pacientes.csv`

| Coluna | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id_paciente` | texto | **sim** | Identificador único e estável. Ver 4.0 |
| `nome_completo` | texto | **sim** | Nome tal como registado |
| `data_nascimento` | data `AAAA-MM-DD` | não | Vazio se não existir. Não inventar |
| `sexo` | texto | não | Valor tal como registado na origem |
| `nif` | texto | não | Número de identificação fiscal. Vazio se não existir |
| `email` | texto | não | |
| `telefone` | texto | não | Com indicativo se existir. Exportado como texto |
| `morada` | texto | não | |
| `codigo_postal` | texto | não | Exportado como texto, incluindo o hífen |
| `localidade` | texto | não | |
| `clinica` | texto | **sim** | Clínica ou clínicas do paciente. Ver 4.5 |
| `observacoes` | texto | não | Notas administrativas livres da ficha |
| `data_criacao` | data com hora | não | Data de criação da ficha na plataforma atual |

Duplicados: se a mesma pessoa estiver registada mais do que uma vez, **todos os
registos são exportados**, cada um com o seu `id_paciente`. A deteção e a fusão
de duplicados é feita do lado da clínica e não deve ser feita na exportação.

### 4.2 `marcacoes.csv`

| Coluna | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id_marcacao` | texto | **sim** | Identificador único da marcação |
| `id_paciente` | texto | **sim** | Corresponde a `pacientes.csv` |
| `inicio` | data com hora | **sim** | Início da marcação |
| `fim` | data com hora | **sim** | Fim da marcação. Se não existir, ver nota abaixo |
| `terapeuta` | texto | **sim** | Nome do profissional. Ver 4.5 |
| `clinica` | texto | **sim** | Clínica onde ocorreu. Ver 4.5 |
| `tipo_servico` | texto | não | Designação do serviço tal como registada |
| `estado` | texto | **sim** | Estado da marcação. Ver 4.6 |
| `observacoes` | texto | não | Notas associadas à marcação |

**Se a plataforma não guardar hora de fim**, o fornecedor exporta a coluna `fim`
vazia e declara-o no manifesto, acrescentando uma coluna `duracao_minutos`
(inteiro) com a duração registada. A clínica calcula o fim a partir do início e
da duração. Uma das duas informações tem de existir.

### 4.3 `episodios.csv`

Um episódio clínico é o agrupamento de consultas e conteúdo clínico em torno de
um motivo de tratamento. Se a plataforma atual não tiver o conceito de episódio,
ver a nota no fim desta secção.

| Coluna | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id_episodio` | texto | **sim** | Identificador único do episódio |
| `id_paciente` | texto | **sim** | Corresponde a `pacientes.csv` |
| `titulo` | texto | **sim** | Motivo ou designação do episódio |
| `estado` | texto | **sim** | `aberto` ou `fechado` |
| `data_abertura` | data com hora | **sim** | |
| `data_fecho` | data com hora | não | Vazio se o episódio estiver aberto |
| `terapeuta` | texto | não | Profissional responsável. Ver 4.5 |
| `id_marcacao` | texto | não | Marcação a que o conteúdo clínico diz respeito, se aplicável |
| `data_registo` | data com hora | **sim** | Data original do registo clínico. Ver nota |
| `conteudo_clinico` | texto | **sim** | Conteúdo clínico integral. Ver nota |

**`conteudo_clinico`.** Texto livre, exportado **integralmente e sem truncar**,
incluindo quebras de linha (campo entre aspas). Se a plataforma guardar o
conteúdo em campos separados (por exemplo queixa, avaliação, tratamento,
evolução), o fornecedor exporta uma coluna por campo, com o nome do campo de
origem, e declara essas colunas no manifesto. É preferível ter os campos
separados a ter um único bloco de texto concatenado.

**`data_registo`.** É a data em que o registo clínico foi feito na plataforma
atual, não a data da exportação. A cronologia clínica tem de ser preservada.

**Se não existir o conceito de episódio** na plataforma atual, o fornecedor
exporta na mesma este ficheiro, com uma linha por registo clínico, usando o
identificador do próprio registo como `id_episodio`, `estado` igual a `fechado`
e `data_abertura` igual a `data_registo`. Deve declará-lo no manifesto.

### 4.4 `documentos.csv`

Índice dos documentos contidos no ZIP. Uma linha por ficheiro.

| Coluna | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id_documento` | texto | **sim** | Identificador único do documento |
| `id_paciente` | texto | **sim** | Corresponde a `pacientes.csv` |
| `id_episodio` | texto | não | Episódio a que o documento pertence, se aplicável |
| `ficheiro` | texto | **sim** | Caminho relativo dentro do ZIP. Ver secção 5 |
| `nome_original` | texto | **sim** | Nome do ficheiro tal como carregado pelo utilizador |
| `tipo_mime` | texto | não | Exemplo: `application/pdf`, `image/jpeg` |
| `tamanho_bytes` | inteiro | não | Dimensão do ficheiro em bytes |
| `data_upload` | data com hora | não | |
| `descricao` | texto | não | Legenda ou descrição, se existir |

### 4.5 Clínica, terapeuta e tipo de serviço

Estas três colunas identificam entidades que já existem na nova plataforma. Não
é pedido nenhum código interno: o texto exportado tal como está registado é
suficiente, desde que seja **consistente**.

- **`clinica`** — nome da clínica. Se a plataforma usar abreviaturas ou códigos,
  o fornecedor lista no manifesto a correspondência entre cada valor exportado e
  o nome da clínica.
- **`terapeuta`** — nome do profissional. O mesmo profissional deve aparecer
  sempre com a mesma grafia. Se um paciente ou marcação tiver mais do que um
  profissional associado, exportar os nomes separados por ponto e vírgula `;`.
- **`tipo_servico`** — designação do serviço tal como registada, mesmo que seja
  texto livre e inconsistente. A normalização é feita do lado da clínica. Não
  substituir por um valor genérico nem deixar vazio quando existe informação.

Se um paciente estiver associado a mais do que uma clínica, exportar os nomes
separados por ponto e vírgula `;` na coluna `clinica` de `pacientes.csv`.

### 4.6 Valores da coluna `estado` em `marcacoes.csv`

O estado é exportado com os valores da plataforma atual, sem tradução. O
fornecedor lista no manifesto **todos** os valores distintos que ocorrem na
exportação, para que a clínica os possa mapear. A título indicativo, a nova
plataforma distingue: marcada, confirmada, realizada, cancelada e falta.

Marcações canceladas e faltas fazem parte da entrega e não devem ser omitidas.

---

## 5. Ficheiro ZIP dos documentos

1. **Nome:** `documentos.zip`.

2. **Regra de referência, exata e vinculativa.** A coluna `ficheiro` de
   `documentos.csv` contém o **caminho relativo do ficheiro dentro do ZIP**, a
   partir da raiz do arquivo, com barras normais `/` como separador.

   Exemplo. Se o ZIP contiver a entrada
   `documentos/174159/relatorio-rm.pdf`, a linha correspondente de
   `documentos.csv` tem, na coluna `ficheiro`, exatamente
   `documentos/174159/relatorio-rm.pdf`.

3. **Correspondência exata, em ambos os sentidos.**
   - Toda a linha de `documentos.csv` tem um ficheiro correspondente no ZIP.
   - Todo o ficheiro do ZIP tem uma linha correspondente em `documentos.csv`.
   - Não são aceites ficheiros no ZIP sem entrada no índice, nem entradas no
     índice sem ficheiro.

4. **Nomes dos ficheiros dentro do ZIP.** Podem ser normalizados (sem acentos,
   sem espaços) desde que o nome original seja preservado na coluna
   `nome_original`. Não podem conter caminhos absolutos, `..`, nem caracteres
   `\ : * ? " < > |`.

5. **Estrutura interna.** Recomenda-se uma pasta por paciente, com o nome igual
   ao `id_paciente`. Qualquer estrutura é aceite desde que a regra do ponto 2
   seja respeitada.

6. **Fragmentação.** Se a dimensão total exigir divisão, o ZIP pode ser entregue
   em volumes (`documentos.z01`, `documentos.z02`, ..., `documentos.zip`). A
   numeração e o número total de volumes são declarados no manifesto.

7. **Sem cifra e sem palavra-passe.** O suporte de entrega é acordado à parte.

---

## 6. Ficheiro de manifesto

**Nome:** `manifesto.json`. Permite validar a entrega antes de qualquer
importação, sem abrir os dados.

Conteúdo mínimo:

```json
{
  "plataforma_origem": "nome da plataforma",
  "data_extracao": "2026-09-30T18:00:00Z",
  "fuso_horario_datas": "Europe/Lisbon",
  "ficheiros": [
    { "nome": "pacientes.csv",  "linhas": 10234, "sha256": "..." },
    { "nome": "marcacoes.csv",  "linhas": 187430, "sha256": "..." },
    { "nome": "episodios.csv",  "linhas": 96210, "sha256": "..." },
    { "nome": "documentos.csv", "linhas": 41022, "sha256": "..." }
  ],
  "zip": {
    "nome": "documentos.zip",
    "volumes": 1,
    "numero_ficheiros": 41022,
    "tamanho_total_bytes": 39182736212,
    "sha256": "..."
  },
  "valores_estado_marcacao": ["Agendada", "Realizada", "Cancelada", "Faltou"],
  "correspondencia_clinicas": { "LAV": "Linda-a-Velha", "CB": "Castelo Branco" },
  "colunas_conteudo_clinico": ["queixa", "avaliacao", "tratamento", "evolucao"],
  "observacoes": "texto livre sobre desvios ou limitações"
}
```

Regras:

- `linhas` é a contagem de linhas de dados, **sem** contar a linha de cabeçalho.
- `numero_ficheiros` do ZIP é igual ao número de linhas de `documentos.csv`.
- `sha256` é a soma de verificação SHA-256 de cada ficheiro entregue.
- `valores_estado_marcacao` lista todos os valores distintos que ocorrem em
  `marcacoes.csv`.
- `colunas_conteudo_clinico` é preenchido apenas se o conteúdo clínico tiver
  sido exportado em colunas separadas (secção 4.3).
- Qualquer desvio a esta especificação é declarado em `observacoes`. Um desvio
  declarado é tratável; um desvio não declarado torna a entrega não conforme.

---

## 7. Critérios de aceitação

A entrega é aceite quando, cumulativamente:

1. Os quatro CSV, o ZIP e o manifesto estão presentes.
2. As somas SHA-256 dos ficheiros recebidos coincidem com o manifesto.
3. A contagem de linhas de cada CSV coincide com o manifesto.
4. O número de ficheiros no ZIP coincide com o número de linhas de
   `documentos.csv`.
5. Todos os `id_paciente` referidos em `marcacoes.csv`, `episodios.csv` e
   `documentos.csv` existem em `pacientes.csv`.
6. `id_paciente`, `id_marcacao`, `id_episodio` e `id_documento` não têm
   duplicados dentro do respetivo ficheiro.
7. As colunas obrigatórias não têm células vazias.
8. As datas respeitam o formato ISO 8601 da secção 3.
9. Toda a linha de `documentos.csv` resolve para uma entrada existente no ZIP e
   vice-versa.

---

## 8. Campos que a plataforma de origem pode não conseguir fornecer

Levantados antecipadamente. Nenhum destes casos impede a exportação, desde que
seja declarado no manifesto.

| Campo | Se não existir na origem |
|---|---|
| `fim` (hora de fim da marcação) | Exportar `duracao_minutos`. Secção 4.2 |
| `id_episodio` / conceito de episódio | Uma linha por registo clínico. Secção 4.3 |
| `nif`, `data_nascimento`, `sexo` | Deixar vazio. São opcionais e completados manualmente pela clínica |
| `tipo_mime`, `tamanho_bytes` | Deixar vazio. A clínica deriva-os do próprio ficheiro |
| `tipo_servico` | Deixar vazio apenas se a informação não existir. Nunca substituir por um valor genérico |
| Fuso horário das datas | Declarar em `fuso_horario_datas` no manifesto |
| Estado da marcação | Se não existir, exportar `estado` vazio e declará-lo. A clínica assume `realizada` para marcações passadas |
| Assinatura do registo clínico | Não é pedida. A assinatura clínica não é transferível entre plataformas e não deve ser exportada |

---

## 9. Proteção de dados

Os dados objeto desta exportação incluem dados pessoais e dados de saúde na
aceção do RGPD. O fornecedor atua como subcontratante da clínica para efeitos
desta extração. A entrega é feita por canal seguro, acordado por escrito antes
da extração, e os dados são eliminados dos sistemas do fornecedor após
confirmação de receção pela clínica.

---

## 10. Contacto

Questões sobre esta especificação devem ser dirigidas à clínica antes da
apresentação do orçamento. Uma dúvida esclarecida antes da extração custa uma
mensagem; depois da extração custa a extração inteira.

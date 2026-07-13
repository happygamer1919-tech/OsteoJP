// W5-34 - "Guião do Exame Subjetivo" in-app guide content.
//
// Typed, pt-only static transcription of docs/clinical/guiao-exame-subjetivo.md
// (source of truth; keep in sync). No markdown dependency, no runtime file read.
// Read-only reference shown as a collapsible panel on the recording screen; the
// wording is verbatim from the guião doc, rendered with pt-PT diacritics.

export type GuiaoSection = {
  /** Stable id for anchors / e2e selectors. */
  id: string;
  title: string;
  items: string[];
};

export const GUIAO_TITLE = "Guião do Exame Subjetivo";

export const GUIAO_SECTIONS: GuiaoSection[] = [
  {
    id: "abertura",
    title: "Abertura da consulta",
    items: [
      "Entrada do utente.",
      "Consentimento informado para gravação e análise do áudio por IA; assinatura do consentimento informado para gravação e análise por IA.",
      "Iniciar gravação.",
      '"Como posso ajudar?"',
      "Utente responde sucintamente, não mais que 3 min.",
    ],
  },
  {
    id: "motivo",
    title: "Motivo da consulta",
    items: [
      "Principais problemas, neste momento? Quando começou? Como descreve as queixas pelas próprias palavras? Veio encaminhado/a por outro profissional de saúde? Existe diagnóstico médico?",
      "Início súbito ou gradual? Houve traumatismo, queda, esforço, em tarefa motora ou movimento específico (o que estava a fazer quando as queixas iniciaram)? Já tinha sentido algo semelhante anteriormente?",
      "Desde o seu início, as queixas estão melhores/piores/iguais? Os sintomas são constantes ou intermitentes? Existe algum padrão durante as 24h? Como se sente de manhã, ao acordar? Os sintomas agravam ao final do dia? Acorda durante a noite devido aos sintomas?",
      "Já realizou algum tratamento/terapêutica/medicação? Alguma destas opções descritas anteriormente promoveu alívio das suas queixas, mantiveram-se iguais ou intensificaram? Realizou exames complementares de diagnóstico médico?",
    ],
  },
  {
    id: "se-dor",
    title: "Se dor",
    items: [
      "Voltando às suas queixas dolorosas, onde sente a dor? Consegue apontar com o dedo para o(s) local/ais? Os sintomas dolorosos permanecem nesse local/região ou irradiam para outra(s) região/ões?",
      "Natureza: Como descreve a sua sensação de dor? É dor aguda, queimadura, choque, peso, pressão, rigidez, formigueiro ou dormência? Sente fraqueza, instabilidade, bloqueio ou alteração do controlo de movimento?",
      "Intensidade: Numa escala de 0-10, qual a intensidade atual da(s) sua(s) dor(es)? Qual a maior intensidade sentida? E a menor intensidade sentida? Para si, qual a intensidade da dor que considera aceitável?",
      "Comportamento: O que agrava os sintomas? Que movimentos/posturas ou atividades provocam a(s) dor(es)? Quanto tempo demora até ao(s) sintoma(s) aparecer(em)? O que alivia? Quanto tempo demora até regressar ao estado habitual/aceitável? Os sintomas aparecem durante a atividade ou após?",
      "Impacto funcional: Que atividades deixou de conseguir realizar? O que consegue fazer, mas com dificuldade? Tem dificuldade em caminhar, subir/descer escadas, correr, alcançar objetos com a mão ou mudar de posição? Tem dificuldade para se vestir/despir, calçar/descalçar, fazer higiene pessoal, cozinhar, realizar tarefas domésticas/profissionais? De que forma os sintomas interferem no seu trabalho? Os sintomas interferem com o sono? Os sintomas interferem com o exercício/desporto, lazer ou vida social/familiar? Necessita de ajuda de outra pessoa? Utiliza algum auxiliar/produto de apoio? Tem receio de cair ou realizar determinados movimentos?",
    ],
  },
  {
    id: "participacao",
    title: "Participação e contexto de vida",
    items: [
      "Que impacto tem este problema na sua vida profissional, familiar e social? Deixou de participar em alguma atividade importante/significativa para si? Vive sozinho/a ou acompanhado/a? Tem apoio familiar/cuidadores (caso precise)? Existem barreiras físicas em casa ou trabalho? Tem escadas até conseguir entrar em casa? O local de trabalho exige esforço físico, movimentos/posições repetidos/mantidos? Existem fatores financeiros, familiares ou profissionais que possam dificultar o tratamento?",
    ],
  },
  {
    id: "antecedentes",
    title: "Antecedentes pessoais",
    items: [
      "Tem outras doenças ou condições de saúde? Está medicado/a ou realiza terapêutica? Já realizou cirurgias (onde, explique, quais os resultados)? Fraturas e outras lesões? Diabetes, HTA, osteoporose, doença oncológica/reumática, etc? Tem antecedentes de quedas?",
    ],
  },
  {
    id: "medicacao",
    title: "Medicação e alergias",
    items: [
      "Que medicação faz atualmente? Alergias conhecidas? Toma anticoagulantes, corticoides (há quanto tempo), analgésico ou anti-inflamatórios?",
    ],
  },
  {
    id: "habitos",
    title: "Hábitos de vida e fatores relacionados com saúde",
    items: [
      "Pratica atividade física (frequência e intensidade)? Passa muito tempo na mesma posição (sentado ou em pé)? Caracterizar sono; caracterizar alimentação e consumo de água; fuma ou consome álcool? Como têm sido os seus níveis de energia? Presença e gestão de stress (relacionar com sistema nervoso autónomo).",
    ],
  },
  {
    id: "flags",
    title: "Pesquisa de flags e revisão de sistemas",
    items: [
      "Teve febre, arrepios ou infeção recente? Teve perda de peso inexplicada? Tem antecedentes de doença oncológica? A dor é constante, progressiva e não altera com movimento ou posição? A dor noturna é intensa e não melhora com mudança de posição? Teve traumatismo significativo? Osteoporose e corticoides prolongados? Fraqueza progressiva? Perda de sensibilidade extensa? Teve alterações do controlo urinário ou intestinal? Sente dormência/formigueiro na região do períneo? Teve episódios de desmaio, tonturas intensas, alterações da fala ou visão? Sente dor no peito/tórax, falta de ar ou palpitações? Há presença de edema súbito, calor, vermelhidão?",
    ],
  },
];

---
id: registos.exportar-pdf
title: Exportar registos em PDF
goal: Saber onde estão os três botões de PDF e o que cada ficheiro contém.
roles: terapeuta, proprietario
order: terapeuta 7, proprietario 7
capability: clinical_records:read
screens: ficha-paciente
---
## Exportar registos em PDF

Há três botões, para quem pode abrir os **Registos clínicos** de um paciente. A Receção não os tem.

* **Exportar ficha**, no topo do separador **Registos clínicos**: um só PDF com os registos do paciente que esse separador lhe mostra.
* **PDF do episódio**, dentro de um grupo da lista: os registos desse grupo. Um grupo com a etiqueta **Importado** também o tem; o grupo **Sem episódio** não.
* **Transferir PDF**, dentro de um registo: só esse registo.

Cada botão só aparece quando há um registo finalizado.

O que o ficheiro contém:

* Só registos finalizados: um **Rascunho** nunca é exportado.
* Um registo anulado entra, com a marca **ANULADO** em todas as páginas desse registo.
* Um registo importado sai como no ecrã: os nomes de campo de origem e o aviso de apenas leitura.
* Um registo escrito no modelo **Ficha Clínica** sai como relatório clínico, só com as secções Motivo da consulta, Diagnóstico, Plano de tratamento e Observações, se preenchidas. Os outros campos do ecrã não entram.

Cada exportação fica no registo de auditoria, em seu nome.

O ficheiro contém dados de saúde do paciente. Depois de transferido, fica fora da plataforma, que já não controla quem o abre.

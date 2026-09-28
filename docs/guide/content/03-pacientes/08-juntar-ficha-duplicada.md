---
id: pacientes.juntar-ficha-duplicada
title: Juntar uma ficha duplicada
goal: Passar o histórico para a ficha que fica.
roles: proprietario
order: proprietario 8
capability: patients:delete
screens: ficha-paciente
---
## Juntar uma ficha duplicada

1. Abra a ficha que fica e copie o seu ID: é o código longo que aparece no endereço da página, logo a seguir a patients/ (sem o que vier depois de um ponto de interrogação).
2. Abra a ficha duplicada, clique em **Zona de risco** e cole o ID em **ID do paciente a manter (sobrevivente)**.
3. Clique em **Fundir neste paciente**. O histórico passa para a ficha que fica e a duplicada é marcada como duplicado.

A ficha duplicada passa a aparecer em Administração, **Pacientes eliminados**, com a etiqueta **Duplicado de** seguida do nome da ficha que ficou. A junção não se desfaz: confirme o ID antes de clicar.

Na mesma **Zona de risco**, **Eliminar** retira o paciente da lista e pode ser desfeito em **Pacientes eliminados**. **Eliminar definitivamente** pede a palavra-passe de eliminação, não se desfaz e só funciona num paciente sem dados associados.

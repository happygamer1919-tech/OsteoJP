// The delivery checker, against GENERATED fixtures only.
//
// CLAUDE.md patient-data isolation: no real delivery file is involved, here or
// in CI. Every value below is invented, and the leak assertions treat them as
// if they were not - because the checker's output is meant to be pasted back in
// full without being read first, and only `estado`/`tipo_servico` may appear.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CHECK = fileURLToPath(new URL("./check-delivery.mjs", import.meta.url));

const PAC_H =
  "id_paciente,nome_completo,numero_paciente,data_nascimento,sexo,nif,email,telefone,morada,codigo_postal,localidade,clinica,seguro_saude,numero_apolice,observacoes,data_criacao,FICHEIRO";
const MARC_H = "id_paciente,inicio,fim,terapeuta,clinica,tipo_servico,estado,observacoes";
const DOC_H = "id_documento,id_paciente,ficheiro,nome_original,tipo_mime,descricao";

/** Every personal-looking value is a tracked token, so ANY leak fails. */
const TOK = (n) => `ZZV${String(n).padStart(3, "0")}`;

function fixture(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-"));
  const pac =
    over.pacientes ??
    `${PAC_H}\nFZ1,${TOK(1)},4001,1980-05-04,F,${TOK(2)},${TOK(3)},${TOK(4)},"${TOK(5)}, 12",1000-001,${TOK(6)},Linda-a-Velha,,,${TOK(7)},2026-08-01 10:00:00,\n`;
  fs.writeFileSync(path.join(dir, "pacientes.csv"), pac, "utf8");
  fs.writeFileSync(
    path.join(dir, "marcacoes.csv"),
    over.marcacoes ?? `${MARC_H}\nFZ1,2026-07-15 09:00:00,2026-07-15 10:00:00,${TOK(8)},Linda-a-Velha,Osteopatia,realizada,\n`,
    "utf8",
  );
  if (over.documentos !== null) {
    fs.writeFileSync(
      path.join(dir, "documentos.csv"),
      over.documentos ?? `${DOC_H}\nD1,FZ1,f1.pdf,${TOK(9)}.pdf,application/pdf,${TOK(10)}\n`,
      "utf8",
    );
  }
  fs.writeFileSync(
    path.join(dir, "Episodios_Osteopatia.csv"),
    over.episodios ?? `tipo,id_paciente,terapeuta,data_avaliacao,escala_eva,FICHEIRO\naval,FZ1,${TOK(8)},2026-02-10,3,\n`,
    "utf8",
  );
  return dir;
}

function run(dir, extra = []) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CHECK, dir, ...extra], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("a conforming delivery is ACCEPTED with exit 0", () => {
  const dir = fixture();
  try {
    const r = run(dir);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ACCEPTED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("NOT ONE personal value reaches stdout, on the accept path", () => {
  // The positive path is the one that would leak by accident: on rejection
  // people expect terse output, on acceptance they expect a summary.
  const dir = fixture();
  try {
    const r = run(dir);
    assert.equal(r.out.match(/ZZV\d{3}/g), null, "checker leaked a value");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("duplicate id_paciente is REJECTED - the caderno's load-bearing requirement", () => {
  const dir = fixture({
    pacientes: `${PAC_H}\nFZ1,${TOK(1)},1,,,,,,,,,,,,,,\nFZ1,${TOK(11)},2,,,,,,,,,,,,,,\n`,
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /id_paciente is NOT unique/);
    assert.equal(r.out.match(/ZZV\d{3}/g), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an orphan id_paciente in marcacoes is REJECTED", () => {
  const dir = fixture({
    marcacoes: `${MARC_H}\nNOPE,2026-07-15 09:00:00,2026-07-15 10:00:00,${TOK(8)},Linda-a-Velha,Osteopatia,realizada,\n`,
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /reference an id_paciente not present/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("duplicate documentos.ficheiro is REJECTED", () => {
  const dir = fixture({
    documentos: `${DOC_H}\nD1,FZ1,same.pdf,a.pdf,application/pdf,x\nD2,FZ1,same.pdf,b.pdf,application/pdf,y\n`,
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /ficheiro is NOT unique/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an unknown estado is REJECTED and reported BY VALUE with a count", () => {
  // Ruled safe to print: estado is operational vocabulary about the clinic's
  // process, and an unknown value is useless to report without naming it.
  const dir = fixture({
    marcacoes:
      `${MARC_H}\n` +
      `FZ1,2026-07-15 09:00:00,2026-07-15 10:00:00,${TOK(8)},Linda-a-Velha,Osteopatia,remarcada,\n` +
      `FZ1,2026-07-16 09:00:00,2026-07-16 10:00:00,${TOK(8)},Linda-a-Velha,Osteopatia,remarcada,\n`,
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /"remarcada"=2/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a missing expected column is REJECTED, an extra one is only a note", () => {
  const dir = fixture({ pacientes: `id_paciente,nome_completo,cor_favorita\nFZ1,${TOK(1)},azul\n` });
  try {
    const r = run(dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /missing column\(s\)/);
    assert.match(r.out, /beyond the spec/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("non-UTF-8 bytes are REJECTED - they would import mangled", () => {
  const dir = fixture();
  try {
    fs.writeFileSync(
      path.join(dir, "pacientes.csv"),
      Buffer.from([...Buffer.from(`${PAC_H}\nFZ1,Jo`, "ascii"), 0xe3, ...Buffer.from("o,1,,,,,,,,,,,,,,\n", "ascii")]),
    );
    const r = run(dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /NOT valid UTF-8/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a missing directory exits 2, distinct from a rejection", () => {
  const r = run(path.join(os.tmpdir(), "definitely-not-here-xyz"));
  assert.equal(r.code, 2);
});

test("without --zip, correspondence is explicitly NOT claimed", () => {
  // Silence would read as "checked and fine". It says what it did not do.
  const dir = fixture();
  try {
    assert.match(run(dir).out, /zip: not supplied - correspondence NOT checked/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ---------------- ZIP correspondence, both directions ---------------- */

function zipWith(dir, fileNames) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "zipstage-"));
  const inner = path.join(stage, "docs");
  fs.mkdirSync(inner);
  for (const n of fileNames) fs.writeFileSync(path.join(inner, n), "x");
  const zip = path.join(dir, "documentos.zip");
  execFileSync("zip", ["-qr", zip, "docs"], { cwd: stage });
  fs.rmSync(stage, { recursive: true, force: true });
  return zip;
}

test("zip correspondence passes when every reference and every entry line up", () => {
  const dir = fixture();
  try {
    const zip = zipWith(dir, ["f1.pdf"]);
    const r = run(dir, ["--zip", zip]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /zip: 1 file entr/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a REFERENCED file absent from the archive is REJECTED - a document is gone", () => {
  const dir = fixture();
  try {
    const zip = zipWith(dir, ["something-else.pdf"]);
    const r = run(dir, ["--zip", zip]);
    assert.equal(r.code, 1);
    assert.match(r.out, /1 referenced file\(s\) are NOT in the archive/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an ORPHANED archive entry is REJECTED - the other direction, and a different fault", () => {
  // An archived file nothing references may be the document of a patient the
  // export DROPPED. Row counts alone would never show that.
  const dir = fixture();
  try {
    const zip = zipWith(dir, ["f1.pdf", "nobody-references-me.pdf"]);
    const r = run(dir, ["--zip", zip]);
    assert.equal(r.code, 1);
    assert.match(r.out, /1 archived file\(s\) are referenced by no row/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("zip entry names never reach stdout", () => {
  const dir = fixture();
  try {
    const zip = zipWith(dir, ["f1.pdf", `${TOK(30)}-leak.pdf`]);
    const r = run(dir, ["--zip", zip]);
    assert.equal(r.out.match(/ZZV\d{3}/g), null, "checker leaked an entry name");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

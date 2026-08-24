// The probe must never emit a value from the delivery, and this is the check
// that keeps it true.
//
// WHY IT IS MECHANICAL RATHER THAN A COMMENT. CLAUDE.md's patient-data
// isolation rule is a sentence, and the way a sentence gets broken is not
// somebody deciding to ignore it - it is somebody adding one helpful line to a
// diagnostic ("...offending row: <row>") while fixing an unrelated bug. The
// probe's whole value is that its output can be pasted back in full without
// being read first. A prose warning cannot hold that; this fails the build.
//
// THE FIXTURE IS BUILT HERE AND DELETED AFTER. No delivery file is involved,
// which is itself the rule: this suite runs in CI, and CI must never need one.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PROBE = fileURLToPath(new URL("./probe-amostra.mjs", import.meta.url));

/**
 * EVERY DATA CELL IS A TRACKED TOKEN, AND THAT IS THE WHOLE DESIGN OF THIS
 * SUITE. It was originally a hand-written list of six realistic-looking values,
 * and the negative control that mattered - a "helpful" diagnostic echoing the
 * offending ragged row - PASSED 7/7 against it, because the row it echoed
 * happened to contain none of the six.
 *
 * A leak test built on a sample of the values proves nothing about the rest. So
 * the fixture is generated: every cell in every file is ZZV<nnn>, nothing else
 * is, and the assertion is that NOT ONE of them appears. Any line that prints
 * any value from any row now fails, rather than only the lines that print the
 * values somebody thought to list.
 */
const TOK = (n) => `ZZV${String(n).padStart(3, "0")}`;
const SECRETS = Array.from({ length: 22 }, (_, i) => TOK(i + 1));

function buildFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amostra-probe-"));
  // Semicolon, BOM, a quoted field carrying BOTH the delimiter and a newline,
  // and one ragged row. The quoted-newline case is the one a naive split gets
  // wrong, and it gets it wrong in the direction that inflates the row count.
  fs.writeFileSync(
    path.join(dir, "pacientes.csv"),
    "﻿id_paciente;nome;morada;nif\n" +
      // The quoted field carries BOTH the delimiter and a newline.
      `${TOK(1)};${TOK(2)};"${TOK(3)}; 4\n${TOK(4)}";${TOK(5)}\n` +
      // Empty nif, so the fill rate is not 100% on every column.
      `${TOK(6)};${TOK(7)};${TOK(8)};\n` +
      // One field too many: the ragged row.
      `${TOK(9)};${TOK(10)};${TOK(11)};${TOK(12)};${TOK(13)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "manifesto.json"),
    JSON.stringify({ versao: TOK(20), ficheiros: [TOK(21)] }),
    "utf8",
  );
  return dir;
}

function run(dir) {
  return execFileSync(process.execPath, [PROBE, dir], { encoding: "utf8" });
}

test("NOT ONE cell value or manifest value reaches stdout", () => {
  const dir = buildFixture();
  try {
    const outText = run(dir);
    for (const s of SECRETS) {
      assert.ok(!outText.includes(s), `probe leaked ${JSON.stringify(s)}`);
    }
    // Belt to the braces: no ZZV token of any number, including ones this
    // fixture does not currently use, so extending the fixture cannot silently
    // outrun the assertion.
    assert.equal(outText.match(/ZZV\d{3}/g), null, "probe leaked an untracked token");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("column headers and manifest KEYS do reach stdout - they are the deliverable", () => {
  // The positive control. Every assertion above is "this string is absent", and
  // a probe that printed nothing at all would satisfy all of them perfectly.
  const dir = buildFixture();
  try {
    const outText = run(dir);
    for (const s of ["id_paciente", "nome", "morada", "nif", "versao", "ficheiros"]) {
      assert.ok(outText.includes(s), `probe omitted ${JSON.stringify(s)}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a quoted field containing a newline does not inflate the row count", () => {
  // Three data rows across five physical lines. A split-on-newline probe
  // reports four, and reports it with total confidence.
  const dir = buildFixture();
  try {
    const outText = run(dir);
    assert.match(outText, /data rows\s+3/);
    assert.match(outText, /lines \(physical\)\s+5/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the ragged row is counted rather than silently normalised", () => {
  const dir = buildFixture();
  try {
    assert.match(run(dir), /ragged rows\s+1/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a BOM is detected and the delimiter is read from the header", () => {
  const dir = buildFixture();
  try {
    const outText = run(dir);
    assert.match(outText, /utf8 BOM\s+yes/);
    assert.match(outText, /delimiter\s+semicolon/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("non-UTF-8 bytes are flagged, because they mangle accented names silently", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amostra-probe-latin1-"));
  try {
    // "Joao;Setubal" with cp1252 accents - decodes without throwing and is wrong.
    fs.writeFileSync(
      path.join(dir, "latin1.csv"),
      Buffer.from([
        ...Buffer.from("nome;cidade\n", "ascii"),
        0x4a, 0x6f, 0xe3, 0x6f, 0x3b, 0x53, 0x65, 0x74, 0xfa, 0x62, 0x61, 0x6c, 0x0a,
      ]),
    );
    assert.match(run(dir), /valid UTF-8\s+NO/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing directory exits 2; anything else exits 0", () => {
  const dir = buildFixture();
  try {
    run(dir); // throws on non-zero
    assert.throws(
      () => execFileSync(process.execPath, [PROBE, path.join(dir, "nope")], { stdio: "pipe" }),
      (e) => e.status === 2,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// G1-5: NO PRODUCTION NAME IN THE GUIDE'S COMMITTED FILES. The repository is
// public, so a screenshot, a text record or a fixture holding a real patient's
// or staff member's name would publish it.
//
//   (a) Every PNG under apps/web/public/ajuda has its text record,
//       docs/guide/shots/text/<section>/<slug>-<size>.txt, whose first line is
//       "sha256 <hex>" of that PNG. The record is the PNG's visible text at
//       capture time (capture-guide.mjs), so scanning the record scans what the
//       image shows, without reading pixels. A PNG with no record, or with a
//       record of another PNG, fails.
//   (b) The text records, the lesson source, the capture specs, the guide seed,
//       the JSON /ajuda renders and the e2e seed are scanned against the
//       production names list in GUIDE_FORBIDDEN_NAMES (an encoded list of
//       hashes; docs/guide/build/guide-names.mjs). A hit fails naming the FILE
//       and LINE only, never the words.
//   (c) With GUIDE_FORBIDDEN_NAMES empty the scan cannot run. It FAILS when
//       GUIDE_NAMES_REQUIRED is "1"; otherwise it passes and says, on the
//       console, that the check is not wired yet. The GATE-CHANGE PR that sets
//       the secret in CI also sets GUIDE_NAMES_REQUIRED.
//   (d) Seeded arms prove the check both ways on a SYNTHETIC list: a planted
//       invented "production" name is caught (in any case, with or without
//       accents, over a line break), the guide's own invented names pass, and
//       an encode and decode round trip holds.
//
// The legacy captures of #1455 (docs/guide/screens/**) have no text records;
// they are listed on the console as legacy and retire in PR 7.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { PUBLIC_DIR, REPO_ROOT } from "../../../../docs/guide/build/guide-model.mjs";
import {
  FORMAT_PREFIX,
  SECRET_LIMIT,
  decodeNames,
  encodeHashes,
  encodeNames,
  hash32,
  hitLines,
  nameKey,
  normalize,
  partOf,
} from "../../../../docs/guide/build/guide-names.mjs";

import { GUIDE_DATA } from "./guide";

const AJUDA_DIR = join(PUBLIC_DIR, "ajuda");
const TEXT_DIR = join(REPO_ROOT, "docs", "guide", "shots", "text");

/** Every file under a directory, recursively; none when it does not exist. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

/** What is wrong between the PNGs of ajudaDir and the text records of textDir. */
function recordProblems(ajudaDir: string, textDir: string, root: string): string[] {
  const problems: string[] = [];
  const pngs = walk(ajudaDir).filter((file) => file.endsWith(".png"));
  const wanted = new Set<string>();
  for (const png of pngs) {
    const record = join(textDir, relative(ajudaDir, png).replace(/\.png$/, ".txt"));
    wanted.add(record);
    const shown = relative(root, png);
    if (!existsSync(record)) {
      problems.push(`${shown}: no text record at ${relative(root, record)}`);
      continue;
    }
    const first = readFileSync(record, "utf8").split("\n", 1)[0];
    const sha = createHash("sha256").update(readFileSync(png)).digest("hex");
    if (first !== `sha256 ${sha}`) problems.push(`${shown}: its text record ${relative(root, record)} is of another image`);
  }
  for (const record of walk(textDir).filter((file) => file.endsWith(".txt"))) {
    if (!wanted.has(record)) problems.push(`${relative(root, record)}: a text record with no image`);
  }
  return problems;
}

/** "file:line" for every line of the files that holds a name of the list. */
function scan(files: string[], list: Set<number>, root: string): string[] {
  return files.flatMap((file) => hitLines(readFileSync(file, "utf8"), list).map((line) => `${relative(root, file)}:${line}`));
}

/** The files the names check reads (b), each once. */
function scannedFiles(): string[] {
  const files = [
    ...walk(TEXT_DIR),
    ...walk(join(REPO_ROOT, "docs", "guide", "content")),
    ...walk(join(REPO_ROOT, "docs", "guide", "shots")),
    join(REPO_ROOT, "docs", "guide", "build", "seed-guide.mjs"),
    join(REPO_ROOT, "apps", "web", "lib", "guide", "guide-data.json"),
    ...walk(join(REPO_ROOT, "apps", "web", "e2e", "seed")),
  ];
  return [...new Set(files)].filter((file) => !file.endsWith(".png"));
}

const temps: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "guide-names-"));
  temps.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("(a) every guide PNG has its text record", () => {
  it("each PNG under apps/web/public/ajuda has a record carrying its sha256, and each record has its PNG", () => {
    expect(recordProblems(AJUDA_DIR, TEXT_DIR, REPO_ROOT)).toEqual([]);
  });

  it("the PNGs are exactly the capture pairs the lessons name, so the check above is not empty", () => {
    const named = [...GUIDE_DATA.lessons, ...GUIDE_DATA.faq]
      .flatMap((lesson) => (lesson.images === null ? [] : [lesson.images.phone.src, lesson.images.desktop.src]))
      .map((src) => join(PUBLIC_DIR, src))
      .sort();
    const pngs = walk(AJUDA_DIR).filter((file) => file.endsWith(".png"));
    expect(pngs).toEqual(named);
    expect(pngs.length).toBeGreaterThan(0);
  });

  it("every capture spec names a lesson that shows its capture, and every captured lesson has its spec", () => {
    const shotsDir = join(REPO_ROOT, "docs", "guide", "shots");
    const specs = readdirSync(shotsDir)
      .filter((name) => name.endsWith(".shots.json"))
      .map((name) => name.replace(/\.shots\.json$/, ""))
      .sort();
    const captured = [...GUIDE_DATA.lessons, ...GUIDE_DATA.faq]
      .filter((lesson) => lesson.images !== null)
      .map((lesson) => lesson.id)
      .sort();
    for (const id of specs) {
      const spec = JSON.parse(readFileSync(join(shotsDir, `${id}.shots.json`), "utf8")) as { id: string };
      expect(spec.id, `${id}.shots.json names another id`).toBe(id);
    }
    expect(specs).toEqual(captured);
    const shots = [...GUIDE_DATA.lessons, ...GUIDE_DATA.faq].filter((lesson) => lesson.shots !== null).map((lesson) => lesson.shots);
    expect(shots.sort()).toEqual(captured);
  });

  it("lists the legacy captures of #1455, which have no text record and retire in PR 7", () => {
    const legacy = walk(join(REPO_ROOT, "docs", "guide", "screens")).filter((file) => file.endsWith(".png"));
    console.log(
      `guide names check: ${legacy.length} legacy capture(s) under docs/guide/screens have no text record and are not scanned; they retire in PR 7`,
    );
    expect(legacy.every((file) => !file.startsWith(AJUDA_DIR))).toBe(true);
  });

  it("seeded: a matching record passes, a missing record and a record of another image are refused", () => {
    const root = tempDir();
    const ajuda = join(root, "ajuda");
    const text = join(root, "text");
    mkdirSync(join(ajuda, "agenda"), { recursive: true });
    mkdirSync(join(text, "agenda"), { recursive: true });
    const png = Buffer.from("not really a png, only bytes to hash");
    const sha = createHash("sha256").update(png).digest("hex");
    writeFileSync(join(ajuda, "agenda", "exemplo-390.png"), png);

    expect(recordProblems(ajuda, text, root)).toEqual(["ajuda/agenda/exemplo-390.png: no text record at text/agenda/exemplo-390.txt"]);

    writeFileSync(join(text, "agenda", "exemplo-390.txt"), `sha256 ${sha}\n## frame 1\nAgenda\n`);
    expect(recordProblems(ajuda, text, root)).toEqual([]);

    writeFileSync(join(ajuda, "agenda", "exemplo-390.png"), Buffer.concat([png, Buffer.from("x")]));
    expect(recordProblems(ajuda, text, root)).toEqual([
      "ajuda/agenda/exemplo-390.png: its text record text/agenda/exemplo-390.txt is of another image",
    ]);

    writeFileSync(join(text, "agenda", "sobra-desktop.txt"), `sha256 ${sha}\n`);
    expect(recordProblems(ajuda, text, root)).toContain("text/agenda/sobra-desktop.txt: a text record with no image");
  });
});

describe("(b) and (c) the guide files hold no production name", () => {
  const files = scannedFiles();

  it("reads the files it is meant to scan", () => {
    const rel = files.map((file) => relative(REPO_ROOT, file));
    expect(rel.filter((f) => f.startsWith("docs/guide/shots/text/")).length).toBe(walk(TEXT_DIR).length);
    expect(rel.filter((f) => f.startsWith("docs/guide/shots/text/")).length).toBeGreaterThan(0);
    expect(rel.filter((f) => f.startsWith("docs/guide/content/")).length).toBeGreaterThanOrEqual(66);
    expect(rel).toContain("docs/guide/build/seed-guide.mjs");
    expect(rel).toContain("apps/web/lib/guide/guide-data.json");
    expect(rel).toContain("apps/web/e2e/seed/seed-e2e.mjs");
  });

  it("scans against GUIDE_FORBIDDEN_NAMES; a hit names the file and line only", () => {
    const encoded = (process.env.GUIDE_FORBIDDEN_NAMES ?? "").trim();
    if (encoded === "") {
      // (c) Not wired: fail only where the gate says the list must be there.
      expect(process.env.GUIDE_NAMES_REQUIRED, "GUIDE_NAMES_REQUIRED is 1 but GUIDE_FORBIDDEN_NAMES is empty").not.toBe("1");
      console.log("guide names check: GUIDE_FORBIDDEN_NAMES is not set, so the production names scan did not run (not wired yet)");
      return;
    }
    // A list that does not decode fails; the error never quotes the list.
    const list = new Set(decodeNames(encoded));
    expect(list.size).toBeGreaterThan(0);
    const hits = scan(files, list, REPO_ROOT);
    console.log(`guide names check: ${files.length} files scanned against ${list.size} names, ${hits.length} hit(s)`);
    // Only "file:line" is printed, never the words on the line.
    expect(hits.length, `each line below holds a name from the production list; replace it with an invented name:\n${hits.join("\n")}\n`).toBe(0);
  });
});

describe("(d) seeded: the check catches a planted name and passes invented ones", () => {
  // An invented "production" name, planted only in temporary files here.
  const PLANTED = "Zacarias Produção Sintética";
  const synthetic = [PLANTED, "Olímpia Registo Fantasma", "Quirino Lista Secreta Quatro Palavras Mais"];
  const list = new Set(decodeNames(encodeNames(synthetic)));

  it("a planted name is caught, whatever its case, accents or line break, and the report is file:line", () => {
    const root = tempDir();
    const file = join(root, "registo.txt");
    writeFileSync(
      file,
      ["## frame 1", "Agenda", "Marta Exemplo", "ZACARIAS PRODUCAO SINTETICA", "Ver ficha de zacarias-produção sintética.", "Zacarias", "Produção Sintética"].join(
        "\n",
      ),
    );
    expect(scan([file], list, root)).toEqual(["registo.txt:4", "registo.txt:5", "registo.txt:6"]);
  });

  it("a name of more than four words is found by its first four", () => {
    expect(nameKey("Quirino Lista Secreta Quatro Palavras Mais")).toBe("quirino lista secreta quatro");
    expect(hitLines("Paciente: Quirino Lista Secreta Quatro Palavras Mais", list)).toEqual([1]);
    expect(nameKey("Quirino")).toBeNull();
  });

  it("the guide's invented names and every scanned file pass the synthetic list", () => {
    const invented = ["Marta Exemplo", "Bruno Fictício", "Rita Exemplo", "Receção Exemplo", "Carla Modelo", "Helena Exemplo", "Sofia Amostra"];
    for (const name of invented) expect(hitLines(name, list)).toEqual([]);
    expect(scan(scannedFiles(), list, REPO_ROOT)).toEqual([]);
  });

  it("a list round trips: encode, decode, and the parts of a split list rejoin", () => {
    const names = Array.from({ length: 3000 }, (_, i) => `Pessoa Sintetica Numero ${i.toString(36)}`);
    const want = [...new Set(names.map((n) => hash32(nameKey(n) as string)))].sort((a, b) => a - b);
    const encoded = encodeNames(names);
    expect(encoded.startsWith(FORMAT_PREFIX)).toBe(true);
    expect(encoded.length).toBeLessThan(SECRET_LIMIT);
    expect(decodeNames(encoded)).toEqual(want);
    const parts = [1, 2, 3].map((k) => encodeHashes(partOf(want, k, 3)));
    expect(decodeNames(parts.join(" "))).toEqual(want);
    expect(parts.map((p) => decodeNames(p).length).reduce((a, b) => a + b, 0)).toBe(want.length);
  });

  it("normalizing: accents, case, punctuation and spacing do not matter", () => {
    expect(normalize("  Receção   EXEMPLO ")).toBe("rececao exemplo");
    expect(normalize("Ana-Rita d'Exemplo")).toBe("ana rita d exemplo");
    expect(hash32(normalize("Receção Exemplo"))).toBe(hash32(normalize("RECECAO exemplo")));
  });

  it("a malformed list is refused, and the message does not quote it", () => {
    for (const bad of ["sem prefixo", "v1:%%%", "v1:AAAA"]) {
      let message = "";
      try {
        decodeNames(bad);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe("");
      expect(message).not.toContain(bad);
    }
  });
});

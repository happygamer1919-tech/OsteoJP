// G1-5: NO PRODUCTION NAME IN THE GUIDE'S COMMITTED FILES. The repository is
// public, so a screenshot, a text record or a fixture holding a real patient's
// or staff member's name would publish it.
//
//   (a) Every file under apps/web/public/ajuda is a PNG with its text record,
//       docs/guide/shots/text/<section>/<slug>-<size>.txt, whose first line is
//       "sha256 <hex>" of that PNG. The record is what the image shows as text
//       at capture time (capture-guide.mjs, visibleText): per frame, the page
//       text and then the values the frame's form fields show, so scanning the
//       record scans what the image shows, without reading pixels. A PNG with
//       no record, with a record of another PNG, or with a record missing a
//       frame's form values fails. A file of any other kind fails too: a JPEG,
//       WebP or SVG there would escape this check and the scan. A record the
//       capture tool writes (capture-guide.mjs, textRecord) is one this check
//       accepts, so the writer and the checker cannot drift apart.
//   (b) The text records, the lesson source, the capture specs, the guide seed,
//       the JSON /ajuda renders, the e2e seed and fixtures
//       (apps/web/e2e/fixtures.ts) and the guide tests' fixture
//       (guide-test-fixture.ts) are scanned against the production names list
//       in GUIDE_FORBIDDEN_NAMES (an encoded list of hashes;
//       docs/guide/build/guide-names.mjs). A hit fails naming the FILE, the
//       LINE and the line's context hash, never the words. A line whose
//       context hash is in docs/guide/build/guide-names-waived.txt (a chance
//       match of the hash, read and waived by a person) does not fail. The
//       log never says how many names the list holds: a verdict carries the
//       hits only, and the CI log of this public repository is public.
//   (c) With GUIDE_FORBIDDEN_NAMES empty the scan cannot run. It FAILS when
//       GUIDE_NAMES_REQUIRED is "1"; otherwise it passes and says, on the
//       console, that the check is not wired yet. The GATE-CHANGE PR that sets
//       the secret in CI also sets GUIDE_NAMES_REQUIRED. namesCheck decides
//       all of this from an environment it is given, so the seeded arms run
//       the very function the live test runs.
//   (d) Seeded arms prove the check both ways on a SYNTHETIC list: a planted
//       invented "production" name is caught (in any case, with or without
//       accents, over a line break, through the environment, whole or split),
//       the guide's own invented names pass, a waiver clears exactly its line,
//       and an encode and decode round trip holds.
//   (e) The legacy captures of #1455 (every file under docs/guide/screens)
//       have no text records and are NOT scanned. They are PINNED instead:
//       docs/guide/build/legacy-screens.sha256 lists each file with its
//       sha256, and this test holds that list's own sha256 and its count, so
//       no file can be added there, or changed, without editing this test.
//       G1-5 is complete only when PR 7 retires them.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { PUBLIC_DIR, REPO_ROOT } from "../../../../docs/guide/build/guide-model.mjs";
import {
  FORMAT_PREFIX,
  SECRET_LIMIT,
  contextHash,
  contextHashes,
  decodeNames,
  encodeHashes,
  encodeNames,
  hash32,
  hitLines,
  lineContext,
  nameKey,
  normalize,
  parseWaivers,
  partOf,
} from "../../../../docs/guide/build/guide-names.mjs";
import { textRecord } from "../../../../docs/guide/build/capture-guide.mjs";

import { GUIDE_DATA } from "./guide";

const AJUDA_DIR = join(PUBLIC_DIR, "ajuda");
const TEXT_DIR = join(REPO_ROOT, "docs", "guide", "shots", "text");
const WAIVERS_FILE = join(REPO_ROOT, "docs", "guide", "build", "guide-names-waived.txt");
const LEGACY_DIR = join(REPO_ROOT, "docs", "guide", "screens");
const LEGACY_MANIFEST = join(REPO_ROOT, "docs", "guide", "build", "legacy-screens.sha256");

// (e) The pin. Changing either number is the deliberate act that adds a file
// under docs/guide/screens; PR 7 removes both with the legacy captures.
const LEGACY_COUNT = 94;
const LEGACY_MANIFEST_SHA256 = "1a58ae8c38ea6fa853fe2739b9e204f6699a144c8c4fb9efd38d2248eaab7207";

const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

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

/**
 * What is wrong with the headings of a text record, or null. A record is its
 * "sha256 <hex>" line, then per frame N a "## frame N" line, the page text, a
 * "## frame N form values" line and the values (capture-guide.mjs). Names line
 * numbers only, never the words.
 */
function recordShape(text: string): string | null {
  const lines = text.split("\n");
  if (!/^sha256 [0-9a-f]{64}$/.test(lines[0] ?? "")) return "its first line is not sha256 <hex>";
  if (lines[1] !== "## frame 1") return "its second line is not ## frame 1";
  const headings = lines.map((line, i) => ({ line, at: i + 1 })).filter(({ line }) => line.startsWith("## "));
  for (const [i, { line, at }] of headings.entries()) {
    const n = Math.floor(i / 2) + 1;
    const want = i % 2 === 0 ? `## frame ${n}` : `## frame ${n} form values`;
    if (line !== want) return `its line ${at} is not "${want}"`;
  }
  if (headings.length % 2 !== 0) return `frame ${headings.length / 2 + 0.5} has no form values`;
  return null;
}

/** The lines of one section of a text record, from its heading to the next. */
function recordSection(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf(heading);
  if (start === -1) return [];
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).filter((line) => line !== "");
}

/** What is wrong between the files of ajudaDir and the text records of textDir. */
function recordProblems(ajudaDir: string, textDir: string, root: string): string[] {
  const problems: string[] = [];
  const wanted = new Set<string>();
  for (const file of walk(ajudaDir)) {
    const shown = relative(root, file);
    if (!file.endsWith(".png")) {
      problems.push(`${shown}: not a PNG; only the captures of capture-guide.mjs belong here, and any other file escapes the record check and the names scan`);
      continue;
    }
    const record = join(textDir, relative(ajudaDir, file).replace(/\.png$/, ".txt"));
    wanted.add(record);
    if (!existsSync(record)) {
      problems.push(`${shown}: no text record at ${relative(root, record)}`);
      continue;
    }
    const text = readFileSync(record, "utf8");
    const first = text.split("\n", 1)[0];
    if (first !== `sha256 ${sha256(readFileSync(file))}`) {
      problems.push(`${shown}: its text record ${relative(root, record)} is of another image`);
      continue;
    }
    const shape = recordShape(text);
    if (shape !== null) problems.push(`${relative(root, record)}: not a record of capture-guide.mjs, ${shape}`);
  }
  for (const record of walk(textDir)) {
    if (!record.endsWith(".txt")) problems.push(`${relative(root, record)}: not a text record (.txt)`);
    else if (!wanted.has(record)) problems.push(`${relative(root, record)}: a text record with no image`);
  }
  return problems;
}

type Hit = { at: string; context: string };

/**
 * Every line of the files that holds a name of the list, as "file:line" and
 * the line's context hash, less the lines a waiver covers.
 */
function scan(files: string[], list: Set<number>, root: string, waivers: Set<string>): Hit[] {
  return files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return hitLines(text, list)
      .map((line) => ({ at: `${relative(root, file)}:${line}`, context: contextHash(text, line) }))
      .filter((hit) => !waivers.has(hit.context));
  });
}

// A scanned verdict holds the hits and nothing about the list: not even its
// size, which the live test would otherwise be tempted to print to the public
// CI log. A seeded arm pins that shape.
type Verdict = { kind: "not wired" } | { kind: "refused"; reason: string } | { kind: "scanned"; hits: Hit[] };

/**
 * (b) and (c): what the names check decides for an environment. The live
 * test passes process.env; the seeded arms pass their own. A list that does
 * not decode throws, and the error never quotes the list.
 */
function namesCheck(env: Record<string, string | undefined>, files: string[], root: string, waivers: Set<string>): Verdict {
  const encoded = (env.GUIDE_FORBIDDEN_NAMES ?? "").trim();
  if (encoded === "") {
    return env.GUIDE_NAMES_REQUIRED === "1"
      ? { kind: "refused", reason: "GUIDE_NAMES_REQUIRED is 1 but GUIDE_FORBIDDEN_NAMES is empty" }
      : { kind: "not wired" };
  }
  const list = new Set(decodeNames(encoded));
  if (list.size === 0) return { kind: "refused", reason: "GUIDE_FORBIDDEN_NAMES decodes to no name" };
  return { kind: "scanned", hits: scan(files, list, root, waivers) };
}

/**
 * The files the names check reads (b), each once. The e2e specs and helpers
 * are not read: the people they name are the ones fixtures.ts and the e2e
 * seed create, which are read.
 */
function scannedFiles(): string[] {
  const files = [
    ...walk(TEXT_DIR),
    ...walk(join(REPO_ROOT, "docs", "guide", "content")),
    ...walk(join(REPO_ROOT, "docs", "guide", "shots")),
    join(REPO_ROOT, "docs", "guide", "build", "seed-guide.mjs"),
    join(REPO_ROOT, "apps", "web", "lib", "guide", "guide-data.json"),
    join(REPO_ROOT, "apps", "web", "lib", "guide", "guide-test-fixture.ts"),
    ...walk(join(REPO_ROOT, "apps", "web", "e2e", "seed")),
    join(REPO_ROOT, "apps", "web", "e2e", "fixtures.ts"),
  ];
  return [...new Set(files)].filter((file) => !file.endsWith(".png"));
}

/** (e) Each file under a directory as "<sha256>  <path from root>", sorted by path. */
function manifest(dir: string, root: string): string[] {
  return walk(dir)
    .map((file) => ({ path: relative(root, file), sha: sha256(readFileSync(file)) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(({ path, sha }) => `${sha}  ${path}`);
}

/** (e) The paths added, gone or changed between two manifests. */
function manifestDiff(was: string[], now: string[]): { added: string[]; gone: string[]; changed: string[] } {
  const pathOf = (line: string) => line.slice(66);
  const before = new Map(was.map((line) => [pathOf(line), line]));
  const after = new Map(now.map((line) => [pathOf(line), line]));
  return {
    added: [...after.keys()].filter((path) => !before.has(path)),
    gone: [...before.keys()].filter((path) => !after.has(path)),
    changed: [...after.keys()].filter((path) => before.has(path) && before.get(path) !== after.get(path)),
  };
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

/** A well formed text record of one frame, for the seeded arms. */
const recordOf = (png: Buffer, body = "Agenda", values = "Marta Exemplo") =>
  `sha256 ${sha256(png)}\n## frame 1\n${body}\n## frame 1 form values\n${values}\n`;

describe("(a) every guide PNG has its text record", () => {
  it("each file under apps/web/public/ajuda is a PNG with a record carrying its sha256 and every frame's form values, and each record has its PNG", () => {
    expect(recordProblems(AJUDA_DIR, TEXT_DIR, REPO_ROOT)).toEqual([]);
  });

  it("the files under apps/web/public/ajuda are exactly the capture pairs the lessons name, so the check above is not empty", () => {
    // An FAQ entry shows its primary lesson's pair (the model enforces it), so
    // the set of files is the lessons' pairs, and every FAQ pair is one of them.
    const pairs = (entries: ReadonlyArray<{ images: typeof GUIDE_DATA.lessons[number]["images"] }>) =>
      entries.flatMap((entry) => (entry.images === null ? [] : [entry.images.phone.src, entry.images.desktop.src]));
    const named = [...new Set(pairs(GUIDE_DATA.lessons))].map((src) => join(PUBLIC_DIR, src)).sort();
    const files = walk(AJUDA_DIR);
    expect(files).toEqual(named);
    for (const src of pairs(GUIDE_DATA.faq)) expect(named, src).toContain(join(PUBLIC_DIR, src));
    expect(files.length).toBeGreaterThan(0);
  });

  it("a record holds what the image's form fields show: frame 2 of pacientes/atualizar-dados, the edit form, carries the patient's name", () => {
    // The case that proved the records incomplete (R4 round 1): the name, the
    // NIF and the e-mail were in the image's form fields and not in its record.
    for (const size of ["390", "desktop"]) {
      const text = readFileSync(join(TEXT_DIR, "pacientes", `atualizar-dados-${size}.txt`), "utf8");
      expect(recordSection(text, "## frame 2 form values"), size).toContain("Marta Exemplo");
    }
  });

  it("every capture spec names a lesson that shows its capture, and every captured lesson has its spec", () => {
    const shotsDir = join(REPO_ROOT, "docs", "guide", "shots");
    const specs = readdirSync(shotsDir)
      .filter((name) => name.endsWith(".shots.json"))
      .map((name) => name.replace(/\.shots\.json$/, ""))
      .sort();
    // Specs belong to lessons; an FAQ entry reuses its primary lesson's capture.
    const captured = GUIDE_DATA.lessons
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

  it("seeded: a matching record passes; a missing record, a record of another image, a record with no form values and a stray record are refused", () => {
    const root = tempDir();
    const ajuda = join(root, "ajuda");
    const text = join(root, "text");
    mkdirSync(join(ajuda, "agenda"), { recursive: true });
    mkdirSync(join(text, "agenda"), { recursive: true });
    const png = Buffer.from("not really a png, only bytes to hash");
    writeFileSync(join(ajuda, "agenda", "exemplo-390.png"), png);

    expect(recordProblems(ajuda, text, root)).toEqual(["ajuda/agenda/exemplo-390.png: no text record at text/agenda/exemplo-390.txt"]);

    writeFileSync(join(text, "agenda", "exemplo-390.txt"), recordOf(png));
    expect(recordProblems(ajuda, text, root)).toEqual([]);

    // A frame with no form field still carries its heading, with nothing under it.
    writeFileSync(join(text, "agenda", "exemplo-390.txt"), recordOf(png, "Agenda", ""));
    expect(recordProblems(ajuda, text, root)).toEqual([]);

    // A record of the old shape, page text only.
    writeFileSync(join(text, "agenda", "exemplo-390.txt"), `sha256 ${sha256(png)}\n## frame 1\nAgenda\n`);
    expect(recordProblems(ajuda, text, root)).toEqual(["text/agenda/exemplo-390.txt: not a record of capture-guide.mjs, frame 1 has no form values"]);

    // Two frames, the second without its form values heading.
    writeFileSync(
      join(text, "agenda", "exemplo-390.txt"),
      `sha256 ${sha256(png)}\n## frame 1\nAgenda\n## frame 1 form values\n## frame 2\nFicha\n## frame 3\n`,
    );
    expect(recordProblems(ajuda, text, root)).toEqual(['text/agenda/exemplo-390.txt: not a record of capture-guide.mjs, its line 7 is not "## frame 2 form values"']);

    writeFileSync(join(text, "agenda", "exemplo-390.txt"), recordOf(png));
    writeFileSync(join(ajuda, "agenda", "exemplo-390.png"), Buffer.concat([png, Buffer.from("x")]));
    expect(recordProblems(ajuda, text, root)).toEqual([
      "ajuda/agenda/exemplo-390.png: its text record text/agenda/exemplo-390.txt is of another image",
    ]);
    writeFileSync(join(ajuda, "agenda", "exemplo-390.png"), png);

    writeFileSync(join(text, "agenda", "sobra-desktop.txt"), recordOf(png));
    expect(recordProblems(ajuda, text, root)).toEqual(["text/agenda/sobra-desktop.txt: a text record with no image"]);
    rmSync(join(text, "agenda", "sobra-desktop.txt"));
    expect(recordProblems(ajuda, text, root)).toEqual([]);
  });

  it("seeded: a JPEG, a WebP or an SVG under the captures, or a stray file among the records, is refused", () => {
    const root = tempDir();
    const ajuda = join(root, "ajuda");
    const text = join(root, "text");
    mkdirSync(join(ajuda, "agenda"), { recursive: true });
    mkdirSync(join(text, "agenda"), { recursive: true });
    for (const name of ["foto.jpg", "foto.webp", "desenho.svg"]) writeFileSync(join(ajuda, "agenda", name), "bytes");
    writeFileSync(join(text, "agenda", "notas.md"), "Marta Exemplo\n");
    const refused = "not a PNG; only the captures of capture-guide.mjs belong here, and any other file escapes the record check and the names scan";
    expect(recordProblems(ajuda, text, root)).toEqual([
      `ajuda/agenda/desenho.svg: ${refused}`,
      `ajuda/agenda/foto.jpg: ${refused}`,
      `ajuda/agenda/foto.webp: ${refused}`,
      "text/agenda/notas.md: not a text record (.txt)",
    ]);
  });

  it("seeded: the record capture-guide.mjs writes (textRecord) is exactly the expected text, and this check accepts it", () => {
    const root = tempDir();
    const ajuda = join(root, "ajuda");
    const text = join(root, "text");
    mkdirSync(join(ajuda, "agenda"), { recursive: true });
    mkdirSync(join(text, "agenda"), { recursive: true });
    const png = Buffer.from("bytes standing in for a capture");
    writeFileSync(join(ajuda, "agenda", "exemplo-desktop.png"), png);
    // Frame 1: Windows line ends, trailing blanks, a blank field value; frame 2: no form field.
    const frames = [
      { text: "Agenda  \r\nMarta Exemplo\t\n\n", values: ["Marta Exemplo ", "   ", "Consulta de osteopatia"] },
      { text: "Ficha", values: [] },
    ];
    const record = textRecord(png, frames);
    expect(record).toBe(
      `sha256 ${sha256(png)}\n` +
        "## frame 1\nAgenda\nMarta Exemplo\n## frame 1 form values\nMarta Exemplo\nConsulta de osteopatia\n" +
        "## frame 2\nFicha\n## frame 2 form values\n",
    );
    writeFileSync(join(text, "agenda", "exemplo-desktop.txt"), record);
    expect(recordProblems(ajuda, text, root)).toEqual([]);
    expect(recordSection(record, "## frame 1 form values")).toEqual(["Marta Exemplo", "Consulta de osteopatia"]);
    expect(recordSection(record, "## frame 2 form values")).toEqual([]);

    // The same frames recorded for other bytes: the image is not the one its record describes.
    writeFileSync(join(text, "agenda", "exemplo-desktop.txt"), textRecord(Buffer.from("another capture"), frames));
    expect(recordProblems(ajuda, text, root)).toEqual([
      "ajuda/agenda/exemplo-desktop.png: its text record text/agenda/exemplo-desktop.txt is of another image",
    ]);
  });
});

describe("(b) and (c) the guide files hold no production name", () => {
  const files = scannedFiles();
  const waivers = parseWaivers(readFileSync(WAIVERS_FILE, "utf8"));

  it("reads the files it is meant to scan", () => {
    const rel = files.map((file) => relative(REPO_ROOT, file));
    expect(rel.filter((f) => f.startsWith("docs/guide/shots/text/")).length).toBe(walk(TEXT_DIR).length);
    expect(rel.filter((f) => f.startsWith("docs/guide/shots/text/")).length).toBeGreaterThan(0);
    expect(rel.filter((f) => f.startsWith("docs/guide/content/")).length).toBeGreaterThanOrEqual(66);
    expect(rel).toContain("docs/guide/build/seed-guide.mjs");
    expect(rel).toContain("apps/web/lib/guide/guide-data.json");
    expect(rel).toContain("apps/web/lib/guide/guide-test-fixture.ts");
    expect(rel).toContain("apps/web/e2e/seed/seed-e2e.mjs");
    expect(rel).toContain("apps/web/e2e/fixtures.ts");
    for (const file of files) expect(existsSync(file), relative(REPO_ROOT, file)).toBe(true);
  });

  it("scans against GUIDE_FORBIDDEN_NAMES; a hit names the file, the line and its context hash only", () => {
    const verdict = namesCheck(process.env, files, REPO_ROOT, waivers);
    if (verdict.kind === "not wired") {
      console.log("guide names check: GUIDE_FORBIDDEN_NAMES is not set, so the production names scan did not run (not wired yet)");
      return;
    }
    expect(verdict.kind, verdict.kind === "refused" ? verdict.reason : "").toBe("scanned");
    if (verdict.kind !== "scanned") return;
    // Never the list's size: this log is public.
    console.log(`guide names check: ${files.length} files scanned, ${verdict.hits.length} hit(s), ${waivers.size} waiver(s)`);
    // Only "file:line" and a hash of public text are printed, never the words.
    // The line itself is public, so a hit still says that a run of words on
    // it is in the list (README, "The names check").
    expect(
      verdict.hits.length,
      "each line below holds a name from the production list, or matches one by chance. A real name: replace it with an invented one. " +
        "A line of platform copy and invented names only: add its context hash to docs/guide/build/guide-names-waived.txt " +
        `(README, "The names check").\n${verdict.hits.map((hit) => `${hit.at} context ${hit.context}`).join("\n")}\n`,
    ).toBe(0);
  });

  it("every waiver in guide-names-waived.txt is the context of a line the check reads, so none is stale", () => {
    const present = new Set(files.flatMap((file) => contextHashes(readFileSync(file, "utf8"))));
    const stale = [...waivers].filter((hash) => !present.has(hash));
    expect(stale, "these waivers match no line any more; remove them").toEqual([]);
  });
});

describe("(d) seeded: the check catches a planted name and passes invented ones", () => {
  // An invented "production" name, planted only in temporary files here.
  const PLANTED = "Zacarias Produção Sintética";
  const synthetic = [PLANTED, "Olímpia Registo Fantasma", "Quirino Lista Secreta Quatro Palavras Mais"];
  const list = new Set(decodeNames(encodeNames(synthetic)));
  const none = new Set<string>();

  it("a planted name is caught, whatever its case, accents or line break, and the report is file:line", () => {
    const root = tempDir();
    const file = join(root, "registo.txt");
    writeFileSync(
      file,
      ["## frame 1", "Agenda", "Marta Exemplo", "ZACARIAS PRODUCAO SINTETICA", "Ver ficha de zacarias-produção sintética.", "Zacarias", "Produção Sintética"].join(
        "\n",
      ),
    );
    expect(scan([file], list, root, none).map((hit) => hit.at)).toEqual(["registo.txt:4", "registo.txt:5", "registo.txt:6"]);
  });

  it("a name of more than four words is found by its first four", () => {
    expect(nameKey("Quirino Lista Secreta Quatro Palavras Mais")).toBe("quirino lista secreta quatro");
    expect(hitLines("Paciente: Quirino Lista Secreta Quatro Palavras Mais", list)).toEqual([1]);
    expect(nameKey("Quirino")).toBeNull();
  });

  it("the guide's invented names and every scanned file pass the synthetic list", () => {
    const invented = ["Marta Exemplo", "Bruno Fictício", "Rita Exemplo", "Receção Exemplo", "Carla Modelo", "Helena Exemplo", "Sofia Amostra"];
    for (const name of invented) expect(hitLines(name, list)).toEqual([]);
    expect(scan(scannedFiles(), list, REPO_ROOT, none)).toEqual([]);
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

describe("(c) seeded: the environment decides, through the function the live test runs", () => {
  const PLANTED = "Zacarias Produção Sintética";
  const root = tempDir();
  const file = join(root, "registo.txt");
  writeFileSync(file, ["## frame 1", "Agenda", "Paciente Zacarias Produção Sintética", "Ver ficha", "Guardar"].join("\n"));
  const none = new Set<string>();

  it("no list and GUIDE_NAMES_REQUIRED unset or not 1: not wired, so it passes", () => {
    expect(namesCheck({}, [file], root, none)).toEqual({ kind: "not wired" });
    expect(namesCheck({ GUIDE_NAMES_REQUIRED: "0", GUIDE_FORBIDDEN_NAMES: "" }, [file], root, none)).toEqual({ kind: "not wired" });
  });

  it("fail closed: GUIDE_NAMES_REQUIRED=1 with no list, or a blank one, is refused", () => {
    const refused = { kind: "refused", reason: "GUIDE_NAMES_REQUIRED is 1 but GUIDE_FORBIDDEN_NAMES is empty" };
    expect(namesCheck({ GUIDE_NAMES_REQUIRED: "1" }, [file], root, none)).toEqual(refused);
    expect(namesCheck({ GUIDE_NAMES_REQUIRED: "1", GUIDE_FORBIDDEN_NAMES: " \n " }, [file], root, none)).toEqual(refused);
  });

  it("a live list holding the planted name: scanned, and the hit is its file and line", () => {
    const env = { GUIDE_NAMES_REQUIRED: "1", GUIDE_FORBIDDEN_NAMES: encodeNames([PLANTED, "Olímpia Registo Fantasma"]) };
    const verdict = namesCheck(env, [file], root, none);
    expect(verdict).toEqual({ kind: "scanned", hits: [{ at: "registo.txt:3", context: contextHash(readFileSync(file, "utf8"), 3) }] });
  });

  it("a scanned verdict says nothing about the list: two lists of different sizes give the same verdict, with no size in it", () => {
    // The live test prints from the verdict to a public log, so the list's
    // size must not be in it to print.
    const small = namesCheck({ GUIDE_FORBIDDEN_NAMES: encodeNames([PLANTED]) }, [file], root, none);
    const large = namesCheck(
      { GUIDE_FORBIDDEN_NAMES: encodeNames([PLANTED, ...Array.from({ length: 500 }, (_, i) => `Pessoa Sintetica ${i.toString(36)}`)]) },
      [file],
      root,
      none,
    );
    expect(small).toEqual(large);
    expect(Object.keys(small).sort()).toEqual(["hits", "kind"]);
  });

  it("a split list, its parts in one variable separated by a space, catches it too", () => {
    const hashes = decodeNames(encodeNames([PLANTED, "Olímpia Registo Fantasma", "Quirino Lista Secreta"]));
    const joined = [1, 2].map((k) => encodeHashes(partOf(hashes, k, 2))).join(" ");
    const verdict = namesCheck({ GUIDE_NAMES_REQUIRED: "1", GUIDE_FORBIDDEN_NAMES: joined }, [file], root, none);
    expect(verdict.kind === "scanned" ? verdict.hits.map((hit) => hit.at) : verdict).toEqual(["registo.txt:3"]);
  });

  it("a live list without the planted name: scanned, no hit", () => {
    const verdict = namesCheck({ GUIDE_NAMES_REQUIRED: "1", GUIDE_FORBIDDEN_NAMES: encodeNames(["Olímpia Registo Fantasma"]) }, [file], root, none);
    expect(verdict).toEqual({ kind: "scanned", hits: [] });
  });

  it("a malformed live list throws, and the message does not quote it", () => {
    expect(() => namesCheck({ GUIDE_FORBIDDEN_NAMES: "v1:%%%" }, [file], root, none)).toThrow(/not base64/);
    expect(() => namesCheck({ GUIDE_FORBIDDEN_NAMES: "v1:%%%" }, [file], root, none)).not.toThrow(/%%%/);
  });

  it("a waiver of the hit line's context clears exactly that line, and a change to the words it covers brings the hit back", () => {
    const env = { GUIDE_FORBIDDEN_NAMES: encodeNames([PLANTED]) };
    const text = readFileSync(file, "utf8");
    // The context is the line's words and the three words after it.
    expect(lineContext(text, 3)).toBe("paciente zacarias producao sintetica ver ficha guardar");
    const waived = parseWaivers(`# a comment\n\n${contextHash(text, 3)}  registo.txt:3, a chance match in this seeded arm\n`);
    expect(namesCheck(env, [file], root, waived)).toEqual({ kind: "scanned", hits: [] });

    // A word after the line, within the three the context covers, changes: the waiver no longer applies.
    const moved = join(root, "registo-mudado.txt");
    writeFileSync(moved, ["## frame 1", "Agenda", "Paciente Zacarias Produção Sintética", "Ver ficha", "Cancelar"].join("\n"));
    const verdict = namesCheck(env, [moved], root, waived);
    expect(verdict.kind === "scanned" ? verdict.hits.map((hit) => hit.at) : verdict).toEqual(["registo-mudado.txt:3"]);
  });

  it("the context hashes of a text are those of its lines with words, and a waiver file refuses anything but a hash and a note", () => {
    const text = "Agenda de hoje\n\nPaciente Marta Exemplo\nGuardar";
    expect(contextHashes(text)).toEqual([1, 3, 4].map((line) => contextHash(text, line)));
    expect(lineContext(text, 2)).toBe("");
    expect(() => parseWaivers("abc  not a hash\n")).toThrow(/waiver line 1/);
    const hash = contextHash(text, 1);
    expect(() => parseWaivers(`${hash}\n${hash}  again\n`)).toThrow(/waiver line 2 repeats/);
    expect(parseWaivers(`${hash}\n`)).toEqual(new Set([hash]));
  });
});

describe("(e) the legacy captures of #1455 are pinned, not scanned", () => {
  it("the files under docs/guide/screens are exactly those of legacy-screens.sha256, whose sha256 and count this test holds", () => {
    const committed = readFileSync(LEGACY_MANIFEST, "utf8");
    expect(sha256(committed), "docs/guide/build/legacy-screens.sha256 changed; only PR 7, which retires the legacy captures, changes the pin").toBe(
      LEGACY_MANIFEST_SHA256,
    );
    const pinned = committed.trimEnd().split("\n");
    expect(pinned.length).toBe(LEGACY_COUNT);
    const now = manifest(LEGACY_DIR, REPO_ROOT);
    expect(
      manifestDiff(pinned, now),
      "a file under docs/guide/screens was added, removed or changed. Those captures have no text record and are not scanned for names; " +
        "a new capture belongs under apps/web/public/ajuda, made by capture-guide.mjs",
    ).toEqual({ added: [], gone: [], changed: [] });
    console.log(`guide names check: ${now.length} legacy capture(s) under docs/guide/screens are pinned by sha256 and not scanned; they retire in PR 7`);
  });

  it("seeded: a file added, changed or removed under a pinned directory is named", () => {
    const root = tempDir();
    const dir = join(root, "screens", "rececao");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "agenda-390.png"), "a");
    writeFileSync(join(dir, "agenda-desktop.png"), "b");
    const pinned = manifest(join(root, "screens"), root);
    expect(manifestDiff(pinned, manifest(join(root, "screens"), root))).toEqual({ added: [], gone: [], changed: [] });

    writeFileSync(join(dir, "nova.webp"), "c");
    writeFileSync(join(dir, "agenda-390.png"), "a2");
    rmSync(join(dir, "agenda-desktop.png"));
    expect(manifestDiff(pinned, manifest(join(root, "screens"), root))).toEqual({
      added: ["screens/rececao/nova.webp"],
      gone: ["screens/rececao/agenda-desktop.png"],
      changed: ["screens/rececao/agenda-390.png"],
    });
  });
});

/**
 * FICHA-IMPORTED-VIEW, acceptance 4: ONE WRITER OF `_aiIngestionRaw`.
 *
 * `data._aiIngestionRaw` is the shape of a clinical record the AI ingestion
 * endpoint created from a consultation recording. The ingestion store
 * (lib/ingestion/store.ts) is the only code that writes it, which is why a
 * patient created in the app, or a booking, can never produce a record of that
 * shape. This suite pins it: it FAILS the day any other production file starts
 * writing the key.
 *
 * HOW IT DECIDES "WRITES". It parses every production source file in the
 * monorepo with the TypeScript compiler and classifies each use of the key by
 * its syntax, so a comment or a doc mention is never counted and a new writer
 * cannot hide behind formatting:
 *
 *   WRITE   `{ _aiIngestionRaw: x }`, `{ "_aiIngestionRaw": x }`, the
 *           shorthand `{ _aiIngestionRaw }`, a computed `{ ["_aiIngestionRaw"]: x }`,
 *           an assignment to `x._aiIngestionRaw` or `x["_aiIngestionRaw"]`, and
 *           `delete` of either.
 *   READ    `x._aiIngestionRaw`, `x["_aiIngestionRaw"]` anywhere else, a
 *           destructuring pattern, and `"_aiIngestionRaw" in x`.
 *   TYPE    a property in a type declaration.
 *   OTHER   anything else: the key inside a longer string or an SQL template
 *           (`jsonb_build_object('_aiIngestionRaw', ...)`), or bound to a
 *           constant that could then be used as a computed key. OTHER is a
 *           failure too, because it is exactly how a second writer would look
 *           if it did not write the key literally.
 *
 * SQL files (migrations) may not mention the key at all.
 *
 * WHAT IS OUT OF SCOPE, deliberately: test files, and anything under an `e2e/`
 * directory, where the Playwright seed writes AI drafts on purpose to test the
 * review flow. Neither runs in the product.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const KEY = "_aiIngestionRaw";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** The one sanctioned writer. */
const WRITER = "apps/web/lib/ingestion/store.ts";
/** A known reader: its presence proves the scan reached real code. */
const KNOWN_READER = "apps/web/lib/clinical/ficha-medica.ts";

const SCAN_ROOTS = ["apps", "packages", "scripts", "supabase"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "e2e",
  "playwright-report",
  "test-results",
]);
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SQL_EXT = /\.sql$/;
const TEST_FILE = /\.(test|spec)\.[a-z]+$/;

type Kind = "write" | "read" | "type" | "other";
type Finding = { file: string; line: number; kind: Kind; text: string };

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

/** Is this property/element access the TARGET of a write? */
function accessIsWritten(access: ts.Node): boolean {
  let node: ts.Node = access;
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  const parent = node.parent;
  if (ts.isBinaryExpression(parent) && parent.left === node) {
    return isAssignmentOperator(parent.operatorToken.kind);
  }
  if (ts.isDeleteExpression(parent)) return true;
  if (
    (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
    (parent.operator === ts.SyntaxKind.PlusPlusToken ||
      parent.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    return true;
  }
  return false;
}

function classifyExact(node: ts.Node): Kind {
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return "write";
  if (ts.isShorthandPropertyAssignment(parent)) return "write";
  if (ts.isComputedPropertyName(parent)) {
    const holder = parent.parent;
    if (ts.isPropertySignature(holder)) return "type";
    return "write";
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return accessIsWritten(parent) ? "write" : "read";
  }
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return accessIsWritten(parent) ? "write" : "read";
  }
  if (ts.isBindingElement(parent)) return "read";
  if (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.InKeyword
  ) {
    return "read";
  }
  if (ts.isPropertySignature(parent) && parent.name === node) return "type";
  return "other";
}

/** Every use of the key in one source text, classified. Comments never count. */
function classifySource(fileName: string, text: string): Finding[] {
  if (!text.includes(KEY)) return [];
  const kind = fileName.endsWith(".tsx") || fileName.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const out: Finding[] = [];
  const record = (node: ts.Node, k: Kind) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ file: fileName, line: line + 1, kind: k, text: node.getText(sf).slice(0, 80) });
  };
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      if (node.text === KEY) record(node, classifyExact(node));
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text === KEY) record(node, classifyExact(node));
      else if (node.text.includes(KEY)) record(node, "other");
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (node.text.includes(KEY)) record(node, "other");
    } else if (ts.isJsxText(node)) {
      if (node.text.includes(KEY)) record(node, "other");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function walk(dir: string, files: string[]) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if ((CODE_EXT.test(name) || SQL_EXT.test(name)) && !TEST_FILE.test(name) && !name.endsWith(".d.ts")) {
      files.push(full);
    }
  }
}

function scanRepo(): { scanned: string[]; findings: Finding[]; sqlMentions: string[] } {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(path.join(REPO_ROOT, root), files);
  const findings: Finding[] = [];
  const sqlMentions: string[] = [];
  for (const full of files) {
    const rel = path.relative(REPO_ROOT, full).split(path.sep).join("/");
    const text = readFileSync(full, "utf8");
    if (!text.includes(KEY)) continue;
    if (SQL_EXT.test(full)) {
      sqlMentions.push(rel);
      continue;
    }
    findings.push(...classifySource(rel, text));
  }
  return {
    scanned: files.map((f) => path.relative(REPO_ROOT, f).split(path.sep).join("/")),
    findings,
    sqlMentions,
  };
}

describe("the classifier, on synthetic sources (so a green scan means something)", () => {
  const kinds = (src: string) => classifySource("x.ts", src).map((f) => f.kind);

  it.each([
    ["object literal key", "const d = { _aiIngestionRaw: p };"],
    ["quoted object literal key", 'const d = { "_aiIngestionRaw": p };'],
    ["shorthand property", "const _aiIngestionRaw = p; const d = { _aiIngestionRaw };"],
    ["computed key", 'const d = { ["_aiIngestionRaw"]: p };'],
    ["dot assignment", "d._aiIngestionRaw = p;"],
    ["bracket assignment", 'd["_aiIngestionRaw"] = p;'],
    ["logical assignment", "d._aiIngestionRaw ??= p;"],
    ["delete", "delete d._aiIngestionRaw;"],
  ])("%s is a WRITE", (_label, src) => {
    expect(kinds(src)).toContain("write");
  });

  it.each([
    ["bracket read", 'const r = data["_aiIngestionRaw"];'],
    ["dot read", "const r = data._aiIngestionRaw;"],
    ["destructuring", "const { _aiIngestionRaw: raw } = data;"],
    ["in operator", 'if ("_aiIngestionRaw" in data) {}'],
  ])("%s is a READ and never a write", (_label, src) => {
    const k = kinds(src);
    expect(k).toContain("read");
    expect(k).not.toContain("write");
    expect(k).not.toContain("other");
  });

  it.each([
    ["an SQL template", "sql`update t set data = jsonb_build_object('_aiIngestionRaw', ${p})`;"],
    ["a longer string", 'const q = "data->_aiIngestionRaw";'],
    ["a constant alias", 'const K = "_aiIngestionRaw";'],
  ])("%s is OTHER, which the scan refuses", (_label, src) => {
    expect(kinds(src)).toContain("other");
  });

  it("a type declaration is TYPE, not a write", () => {
    expect(kinds("type T = { _aiIngestionRaw: unknown };")).toEqual(["type"]);
  });

  // THE GREEN ARM. The red arms above prove the classifier catches writes; only
  // this one proves it is not so tight that a comment or a doc line trips it.
  // Without it, a scan that flagged every mention would pass the red arms and
  // fail the repository for a reason that is not a writer.
  it("a mention in a comment is nothing at all", () => {
    expect(kinds("// data._aiIngestionRaw = x\n/* { _aiIngestionRaw: y } */\nconst a = 1;")).toEqual([]);
  });
});

describe("the repository: only the ingestion store writes `_aiIngestionRaw`", () => {
  const { scanned, findings, sqlMentions } = scanRepo();

  it("the scan is not vacuous: it reached the writer, a known reader and the app", () => {
    expect(scanned).toContain(WRITER);
    expect(scanned).toContain(KNOWN_READER);
    expect(scanned.length).toBeGreaterThan(500);
    expect(findings.some((f) => f.file === KNOWN_READER && f.kind === "read")).toBe(true);
  });

  it("exactly one write site, and it is the ingestion store", () => {
    const writes = findings.filter((f) => f.kind === "write");
    expect(writes.map((f) => f.file)).toEqual([WRITER]);
  });

  it("no production file uses the key in a shape the classifier cannot vouch for", () => {
    expect(findings.filter((f) => f.kind === "other")).toEqual([]);
  });

  it("no SQL file mentions the key: no migration or SQL script writes it", () => {
    expect(sqlMentions).toEqual([]);
  });
});

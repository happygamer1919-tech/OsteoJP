/**
 * The SECURITY DEFINER set, READ FROM THE MIGRATIONS instead of a hand list.
 *
 * Production is the migrations applied in journal order (the files sort in
 * that order; `0000_` to `NNNN_` are zero-padded). So the set of public
 * functions with `prosecdef` true after the last migration is a property of the
 * files, and this module computes it by replaying every statement that decides
 * it:
 *
 *   CREATE [OR REPLACE] FUNCTION public.<name>(...)
 *       -> DEFINER if the statement says SECURITY DEFINER, else INVOKER. That
 *          is PostgreSQL's rule: a replace that omits the clause RESETS the
 *          function to the default, SECURITY INVOKER.
 *   ALTER FUNCTION public.<name>(...) [EXTERNAL] SECURITY DEFINER|INVOKER
 *       -> sets it.
 *   DROP FUNCTION [IF EXISTS] public.<name>[(...)] [, ...]
 *       -> removes it. A later CREATE is a NEW object, owned by whoever applied
 *          it, so it needs its own owner pin.
 *   ALTER FUNCTION public.<name>(...) OWNER TO <role>
 *       -> an owner pin, attached to the object as it exists at that point.
 *
 * WHAT IS NOT STATEMENT TEXT DOES NOT COUNT. Comments (`--`, and `/* *\/`, which
 * nest in PostgreSQL) are removed, and the CONTENTS of every quoted literal are
 * blanked: '...' (with '' and E'\'' escapes) and $$...$$ / $tag$...$tag$. So
 * "SECURITY DEFINER" inside a function body or a COMMENT ON FUNCTION string,
 * which is how 0060, 0072 to 0074 and 0095 all talk about it, never makes a
 * function DEFINER. The clause is read from the whole statement outside those
 * literals, because PostgreSQL accepts it before or after the AS $$ body.
 *
 * FAIL CLOSED where the model would be wrong rather than guess:
 *   - an unqualified CREATE/ALTER/DROP FUNCTION (its schema depends on
 *     search_path at apply time);
 *   - ALTER FUNCTION ... RENAME TO / SET SCHEMA (moves a function between
 *     names; not modelled);
 *   - a CREATE OR REPLACE of a live name with a DIFFERENT parameter list,
 *     which PostgreSQL treats as a NEW OVERLOAD beside the old one, so a
 *     name-keyed reader would wrongly retire the old function's mode.
 * Each throws with the file name, so the test fails loudly and names the file.
 *
 * Keyed by function NAME, as the owner pins and the checker's report are.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type SecurityMode = "DEFINER" | "INVOKER";

export interface OwnerPin {
  name: string;
  owner: string;
  file: string;
  /**
   * live       - pins the object that exists at the end and is SECURITY DEFINER.
   * historical - pinned a function that WAS SECURITY DEFINER at the time, which
   *              has since been made INVOKER or dropped. Allowed: migrations are
   *              immutable, so an old pin cannot be removed.
   * extra      - anything else: a pin of a function that was not SECURITY
   *              DEFINER when pinned and is not a live DEFINER now, or of a name
   *              no migration created.
   */
  kind: "live" | "historical" | "extra";
}

export interface SecdefReading {
  /** The .sql files read, in apply order. */
  files: string[];
  /** Every public function alive at the end, with its final mode. */
  finalMode: Map<string, SecurityMode>;
  /** The final SECURITY DEFINER set, sorted. */
  definers: string[];
  /** Every owner pin, in apply order, classified. */
  pins: OwnerPin[];
}

/**
 * Removes comments and blanks the contents of quoted literals, leaving only the
 * text PostgreSQL parses as statements. Quoted identifiers ("...") are kept.
 */
export function statementText(sql: string, file = "<input>"): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  const isIdent = (ch: string | undefined) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
  const unterminated = (what: string) =>
    new Error(`${file}: unterminated ${what}; the reader refuses to guess`);

  while (i < n) {
    const c = sql[i]!;
    const d = sql[i + 1];

    if (c === "-" && d === "-") {
      const eol = sql.indexOf("\n", i);
      i = eol === -1 ? n : eol;
      out += " ";
      continue;
    }

    if (c === "/" && d === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      if (depth > 0) throw unterminated("block comment");
      out += " ";
      continue;
    }

    if (c === "'") {
      // E'...' allows backslash escapes; a plain '...' only doubles the quote.
      const escaped = (sql[i - 1] === "E" || sql[i - 1] === "e") && !isIdent(sql[i - 2]);
      i++;
      let closed = false;
      while (i < n) {
        const ch = sql[i];
        if (escaped && ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        i++;
      }
      if (!closed) throw unterminated("string literal");
      out += "''";
      continue;
    }

    if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      if (end === -1) throw unterminated("quoted identifier");
      out += sql.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    if (c === "$" && !isIdent(sql[i - 1])) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 80))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) throw unterminated(`${tag}-quoted body`);
        out += "$$ $$";
        i = end + tag.length;
        continue;
      }
    }

    out += c;
    i++;
  }
  return out;
}

/** Drops every parenthesised group, so `a(numeric(10,2)), b(int)` reads `a, b`. */
function withoutParens(s: string): string {
  let out = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

/** The parenthesised group starting at `open` (which must be "("), inclusive. */
function groupAt(s: string, open: number): string {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return s.slice(open, i + 1);
  }
  return s.slice(open);
}

const unquote = (id: string) => (id.startsWith('"') ? id.slice(1, -1) : id.toLowerCase());

/** `schema.name` -> { schema, name }, or null when unqualified. */
function qualified(ref: string): { schema: string; name: string } | null {
  const m = /^\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\s*$/.exec(
    ref,
  );
  if (!m) return null;
  return { schema: unquote(m[1]!), name: unquote(m[2]!) };
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = String.raw`(${IDENT}(?:\s*\.\s*${IDENT})?)`;
const CREATE_RE = new RegExp(
  String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+${QNAME}\s*\(`,
  "i",
);
const ALTER_RE = new RegExp(String.raw`^ALTER\s+(?:FUNCTION|PROCEDURE)\s+${QNAME}\s*`, "i");
const DROP_RE = /^DROP\s+(?:FUNCTION|PROCEDURE)\s+(?:IF\s+EXISTS\s+)?([\s\S]*?)(?:\s+(?:CASCADE|RESTRICT))?$/i;
const DEFINER_RE = /\bSECURITY\s+DEFINER\b/i;
const MODE_RE = /\bSECURITY\s+(DEFINER|INVOKER)\b/i;
const OWNER_RE = new RegExp(String.raw`^OWNER\s+TO\s+(${IDENT})\s*$`, "i");

interface Live {
  mode: SecurityMode;
  /** Which object this is: bumped every time the name is created after a DROP. */
  generation: number;
  /** Normalised parameter list, to refuse a silent overload. */
  params: string;
}

interface RawPin {
  name: string;
  owner: string;
  file: string;
  generation: number | null;
  modeAtPin: SecurityMode | null;
}

/** Replays `files` (already in apply order); `read` returns each file's text. */
export function readSecdef(
  files: string[],
  read: (file: string) => string,
): SecdefReading {
  const live = new Map<string, Live>();
  const generations = new Map<string, number>();
  const rawPins: RawPin[] = [];

  for (const file of files) {
    const text = statementText(read(file), file);
    for (const raw of text.split(";")) {
      const stmt = raw.trim();
      if (stmt === "") continue;

      const create = CREATE_RE.exec(stmt);
      if (create) {
        const ref = qualified(create[1]!);
        if (!ref) {
          throw new Error(`${file}: unqualified CREATE FUNCTION ${create[1]}; qualify it with public.`);
        }
        if (ref.schema !== "public") continue;
        const params = groupAt(stmt, create[0].length - 1)
          .replace(/\s+/g, " ")
          .toLowerCase();
        const mode: SecurityMode = DEFINER_RE.test(stmt) ? "DEFINER" : "INVOKER";
        const prior = live.get(ref.name);
        if (prior && prior.params !== params) {
          throw new Error(
            `${file}: public.${ref.name} is re-created with a different parameter list ` +
              `(${prior.params} -> ${params}). PostgreSQL makes that a second overload, ` +
              `which this name-keyed reader does not model. DROP the old one first, or extend the reader.`,
          );
        }
        const generation = prior
          ? prior.generation
          : (generations.get(ref.name) ?? 0) + 1;
        generations.set(ref.name, generation);
        live.set(ref.name, { mode, generation, params });
        continue;
      }

      const alter = ALTER_RE.exec(stmt);
      if (alter) {
        const ref = qualified(alter[1]!);
        if (!ref) {
          throw new Error(`${file}: unqualified ALTER FUNCTION ${alter[1]}; qualify it with public.`);
        }
        if (ref.schema !== "public") continue;
        const after = stmt.slice(alter[0].length);
        const rest = (after.startsWith("(") ? after.slice(groupAt(after, 0).length) : after).trim();
        if (/^(RENAME\s+TO|SET\s+SCHEMA)\b/i.test(rest)) {
          throw new Error(`${file}: ALTER FUNCTION public.${ref.name} ${rest} is not modelled; extend the reader.`);
        }
        const owner = OWNER_RE.exec(rest);
        if (owner) {
          const current = live.get(ref.name);
          rawPins.push({
            name: ref.name,
            owner: unquote(owner[1]!),
            file,
            generation: current?.generation ?? null,
            modeAtPin: current?.mode ?? null,
          });
          continue;
        }
        const mode = MODE_RE.exec(rest);
        if (mode) {
          const current = live.get(ref.name);
          if (current) current.mode = mode[1]!.toUpperCase() as SecurityMode;
        }
        continue;
      }

      const drop = DROP_RE.exec(stmt);
      if (drop) {
        for (const item of withoutParens(drop[1]!).split(",")) {
          if (item.trim() === "") continue;
          const ref = qualified(item);
          if (!ref) {
            throw new Error(`${file}: unqualified DROP FUNCTION ${item.trim()}; qualify it with public.`);
          }
          if (ref.schema === "public") live.delete(ref.name);
        }
      }
    }
  }

  const finalMode = new Map<string, SecurityMode>();
  for (const [name, f] of live) finalMode.set(name, f.mode);

  const definers = [...finalMode]
    .filter(([, mode]) => mode === "DEFINER")
    .map(([name]) => name)
    .sort();

  const pins: OwnerPin[] = rawPins.map((p) => {
    const now = live.get(p.name);
    const isLive = now !== undefined && now.mode === "DEFINER" && now.generation === p.generation;
    const kind: OwnerPin["kind"] = isLive
      ? "live"
      : p.modeAtPin === "DEFINER"
        ? "historical"
        : "extra";
    return { name: p.name, owner: p.owner, file: p.file, kind };
  });

  return { files, finalMode, definers, pins };
}

/** Reads every `*.sql` in `dir`, in file order (= journal order). */
export function readSecdefFromDir(dir: string): SecdefReading {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return readSecdef(files, (f) => readFileSync(join(dir, f), "utf8"));
}

/**
 * THE PAIRING VERDICT. Empty means every final SECURITY DEFINER function has
 * exactly one live owner pin, every pin names `owner`, and no pin is extra.
 * Historical pins (the function was DEFINER when pinned and is not any more)
 * are allowed.
 */
export function pairingProblems(reading: SecdefReading, owner: string): string[] {
  const problems: string[] = [];
  for (const name of reading.definers) {
    const livePins = reading.pins.filter((p) => p.kind === "live" && p.name === name);
    if (livePins.length === 0) {
      problems.push(`${name} is SECURITY DEFINER with no owner pin`);
    } else if (livePins.length > 1) {
      problems.push(
        `${name} has ${livePins.length} owner pins (${livePins.map((p) => p.file).join(", ")}); expected exactly one`,
      );
    }
  }
  for (const p of reading.pins) {
    if (p.kind === "extra") {
      problems.push(`${p.file}: pin of ${p.name}, which is not a SECURITY DEFINER function`);
    }
    if (p.owner !== owner) {
      problems.push(`${p.file}: pin of ${p.name} names "${p.owner}", expected "${owner}"`);
    }
  }
  return problems;
}

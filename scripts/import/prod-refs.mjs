/**
 * READ THE PRODUCTION BLOCKLIST FROM ITS ONE SOURCE, FROM PLAIN NODE.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS AT ALL
 * ==========================================================================
 * `packages/db/seed/seed-guard.ts` owns `PROD_REFS`. TypeScript entrypoints
 * import it directly (assert-not-prod.ts, rehearsal-import.ts). But
 * `copy-attachments.mjs` runs under BARE NODE - deliberately, it has no build
 * step and no tsx dependency - and bare node cannot import a `.ts` file.
 *
 * So the choice was: duplicate the two refs into the `.mjs`, or read them from
 * the source at runtime. DUPLICATING IS THE ONE THING THIS REPOSITORY HAS
 * ALREADY BEEN BURNED BY: SEC-seed-guard-prod-blocklist was a blocklist that
 * sat EMPTY for months while a comment claimed it was enforced. A second copy
 * would go stale the first time a ref is added, and nothing would say so.
 *
 * This reads the real declaration, at runtime, every run.
 *
 * ==========================================================================
 * IT THROWS RATHER THAN RETURNING AN EMPTY LIST. THAT IS THE WHOLE DESIGN.
 * ==========================================================================
 * A parser that cannot find the list has exactly two options, and only one of
 * them is safe. Returning `[]` makes every subsequent `includes()` false, so
 * the guard passes EVERYTHING and reports nothing - the same silent-empty
 * failure the original card was written for, reintroduced through the back
 * door of a regex that stopped matching.
 *
 * PORTAL-REHYDRATE section 1.3: "a one-line convenience that maps an unknown or
 * failed case onto a known, harmless-looking one WILL be read as the harmless
 * one." An unreadable blocklist is an unknown case. It throws.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The single source of truth. Resolved from THIS file, not from the cwd. */
export const SEED_GUARD_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../packages/db/seed/seed-guard.ts",
);

/**
 * Every ref on the blocklist, read from `seed-guard.ts`.
 *
 * THE ARRAY LITERAL IS PARSED, not the whole file. A whole-file scan for
 * 20-character tokens would also pick up the refs named in the surrounding
 * COMMENTS, which happen to be the same two today - so it would look correct
 * and would silently keep "working" if the declaration were emptied while the
 * comments stayed. Parsing the declaration is what makes an emptied list
 * detectable.
 *
 * @throws if the declaration cannot be found, or parses to nothing.
 */
export function readProdRefs(file = SEED_GUARD_PATH) {
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new Error(`prod blocklist unreadable at ${file} (${e?.code ?? e?.name ?? "Error"})`);
  }
  const decl = src.match(/export\s+const\s+PROD_REFS\s*:\s*string\[\]\s*=\s*\[([\s\S]*?)\]/);
  if (!decl) {
    throw new Error(
      "prod blocklist NOT FOUND: seed-guard.ts no longer declares `export const PROD_REFS: string[] = [...]`. " +
        "Refusing to continue with no blocklist.",
    );
  }
  const refs = [...decl[1].matchAll(/["']([a-z0-9]{20})["']/gi)].map((m) => m[1]);
  if (refs.length === 0) {
    throw new Error(
      "prod blocklist is EMPTY. That is the exact state SEC-seed-guard-prod-blocklist was carded for. " +
        "Refusing to continue.",
    );
  }
  return refs;
}

/**
 * The project ref a Supabase URL points at, or null.
 *
 * `seed-guard`'s own `parseProjectRef` reads the two POSTGRES forms
 * (`postgres.<ref>@...` and `db.<ref>.supabase.co`) and returns NULL for
 * `https://<ref>.supabase.co` - which is exactly the shape of a Storage
 * endpoint, and therefore exactly the shape the byte copy writes to.
 */
export function refFromSupabaseUrl(url) {
  if (typeof url !== "string" || url === "") return null;
  const m = url.match(/^https?:\/\/([a-z0-9]{20})\.supabase\.(?:co|com)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Is this URL pointed at a production project?
 *
 * TWO ARMS, AND THE SECOND IS NOT REDUNDANT. The parse above handles the
 * documented endpoint shape. The substring test catches everything else a real
 * environment can hold - a custom domain, a pooler URL pasted into the wrong
 * variable, a ref with a path or port appended. Substring CANNOT under-match,
 * and the asymmetry is deliberate: a false positive costs one confused
 * operator, a false negative uploads patient documents into the live clinic.
 */
export function isProdSupabaseUrl(url, refs = readProdRefs()) {
  const parsed = refFromSupabaseUrl(url);
  if (parsed && refs.includes(parsed)) return { prod: true, ref: parsed, how: "parsed" };
  if (typeof url === "string") {
    for (const r of refs) if (url.includes(r)) return { prod: true, ref: r, how: "substring" };
  }
  return { prod: false, ref: parsed, how: parsed ? "parsed" : "unresolved" };
}

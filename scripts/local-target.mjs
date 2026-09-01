/**
 * THE POSITIVE TARGET GUARD, FOR BARE-NODE SCRIPTS.
 *
 * `packages/db/seed/local-target.ts` is the source of the rule and the place to
 * change it. Bare node cannot import a `.ts` file, and `scripts/*.mjs` runs
 * under bare node deliberately (no build step, no tsx).
 *
 * SO THE HOST LIST IS READ FROM THE TYPESCRIPT DECLARATION AT RUNTIME, NEVER
 * COPIED. `scripts/import/prod-refs.mjs` already made this choice for the
 * blocklist, and its header gives the reason: this repository has been burned by
 * a duplicated safety list going stale. A second copy of `ALLOWED_LOCAL_HOSTS`
 * would drift the first time a host is added, and nothing would say so.
 *
 * IT THROWS RATHER THAN RETURNING AN EMPTY LIST. An empty allowlist refuses
 * everything, which is safe — but it is safe by accident, and it would present
 * as "the seeder is broken" rather than "the guard cannot read its rule". The
 * throw says which.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_TARGET_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/db/seed/local-target.ts",
);

/** @throws if the declaration cannot be found, or parses to nothing. */
export function readAllowedLocalHosts(file = LOCAL_TARGET_PATH) {
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new Error(`local-target allowlist unreadable at ${file} (${e?.code ?? e?.name ?? "Error"})`);
  }
  const decl = src.match(
    /export\s+const\s+ALLOWED_LOCAL_HOSTS\s*:\s*readonly\s+string\[\]\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/,
  );
  if (!decl) {
    throw new Error(
      "ALLOWED_LOCAL_HOSTS NOT FOUND in local-target.ts. Refusing to continue with no allowlist.",
    );
  }
  const hosts = [...decl[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  if (hosts.length === 0) throw new Error("ALLOWED_LOCAL_HOSTS is EMPTY. Refusing to continue.");
  return hosts;
}

/** The host a connection string points at, lowercased and unbracketed, or null. */
export function parseTargetHost(url) {
  if (typeof url !== "string" || url.trim() === "") return null;
  const unbracket = (h) => (h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h);
  try {
    const host = new URL(url).hostname;
    if (host) return unbracket(host.toLowerCase());
  } catch {
    /* fall through */
  }
  const scheme = url.indexOf("://");
  if (scheme === -1) return null;
  const authority = url.slice(scheme + 3).split("/")[0]?.split("?")[0] ?? "";
  if (authority === "") return null;
  const at = authority.lastIndexOf("@");
  const hostPort = at === -1 ? authority : authority.slice(at + 1);
  if (hostPort === "") return null;
  const v6 = hostPort.match(/^\[([^\]]+)\]/);
  if (v6) return v6[1].toLowerCase();
  const host = hostPort.split(":")[0] ?? "";
  return host === "" ? null : host.toLowerCase();
}

export function describeTarget(url, hosts = readAllowedLocalHosts()) {
  if (url === undefined || url === null || url === "") {
    return { local: false, host: null, reason: "no connection string is set" };
  }
  const host = parseTargetHost(url);
  if (host === null) {
    return { local: false, host: null, reason: "no host could be parsed from the connection string" };
  }
  if (hosts.includes(host)) {
    return { local: true, host, reason: `host "${host}" is an allowed local target` };
  }
  return { local: false, host, reason: `host "${host}" is not one of the allowed local targets` };
}

/** Exits 1 unless the target is affirmatively local. Never prints the URL. */
export function assertLocalTarget(url, what = "DATABASE_URL") {
  const v = describeTarget(url);
  if (v.local) return url;
  console.error(
    `SAFETY: refusing to run. ${what} ${v.reason}.\n` +
      `Allowed local targets: ${readAllowedLocalHosts().join(", ")}.\n` +
      "This guard identifies a permitted target POSITIVELY. It does not ask whether\n" +
      "the target is on a list of known-production refs, because an unlisted\n" +
      "production project would pass that question and this one refuses it.",
  );
  process.exit(1);
}

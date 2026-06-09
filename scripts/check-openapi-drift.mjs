#!/usr/bin/env node
// OpenAPI drift check (zero-dependency).
//
// Enumerates every Next.js route handler that is part of the documented V1 API
// surface — anything under `/api/v1/*` plus the `/api/health` probe — across
// apps/api and apps/web, then asserts each (path, method) is present in
// docs/api/openapi.yaml. Fails (exit 1) if any route is undocumented, so the
// spec can never silently drift behind the code.
//
// Deliberately NOT a YAML parser: the spec is authored with a fixed 2-space
// path / 4-space method indentation, which we scan directly. This keeps the
// check dependency-free (it runs in CI before install of any spec tooling).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = path.join(ROOT, "docs/api/openapi.yaml");
const APP_DIRS = ["apps/api/app", "apps/web/app"];
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

// A route belongs to the documented surface if its URL path is under /api/v1 or
// is the public health probe. Everything else (NextAuth callbacks, /api/inngest,
// internal app routes) is intentionally out of contract.
function isDocumented(routePath) {
  return routePath.startsWith("/api/v1/") || routePath === "/api/v1" || routePath === "/api/health";
}

/** Recursively collect every `route.ts` (or `.js`) file under a directory. */
function findRouteFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc; // missing app dir — nothing to scan
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findRouteFiles(full, acc);
    else if (/^route\.(ts|tsx|js|mjs)$/.test(e.name)) acc.push(full);
  }
  return acc;
}

/**
 * Derive the URL path from a route file path. Everything after the `app`
 * segment, minus the trailing `/route.*`. Next.js `[id]` → OpenAPI `{id}`;
 * route groups `(group)` are dropped from the URL.
 */
function routePathFromFile(appDirAbs, fileAbs) {
  const rel = path.relative(appDirAbs, path.dirname(fileAbs)); // e.g. api/v1/appointments/[id]
  const segments = rel
    .split(path.sep)
    .filter((s) => s.length > 0 && !(s.startsWith("(") && s.endsWith(")")))
    .map((s) => s.replace(/^\[(?:\.\.\.)?(.+)\]$/, "{$1}"));
  return "/" + segments.join("/");
}

/** Exported HTTP methods in a handler file, lowercased. */
function methodsInFile(fileAbs) {
  const src = readFileSync(fileAbs, "utf8");
  const found = new Set();
  for (const m of HTTP_METHODS) {
    const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${m.toUpperCase()}\\b`);
    if (re.test(src)) found.add(m);
  }
  return [...found];
}

/** Parse declared paths + methods from the spec by indentation scan. */
function parseSpecPaths(specText) {
  const lines = specText.split(/\r?\n/);
  const spec = new Map(); // path -> Set(method)
  let inPaths = false;
  let current = null;
  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;
    // A new top-level key (0 indent, non-empty) ends the paths section.
    if (/^[A-Za-z]/.test(line)) break;

    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) {
      current = pathMatch[1];
      if (!spec.has(current)) spec.set(current, new Set());
      continue;
    }
    const methodMatch = line.match(/^ {4}([a-z]+):\s*$/);
    if (methodMatch && current && HTTP_METHODS.includes(methodMatch[1])) {
      spec.get(current).add(methodMatch[1]);
    }
  }
  return spec;
}

function main() {
  if (!statSync(SPEC, { throwIfNoEntry: false })) {
    console.error(`✗ spec not found at ${path.relative(ROOT, SPEC)}`);
    process.exit(1);
  }
  const spec = parseSpecPaths(readFileSync(SPEC, "utf8"));

  // Discover documented routes from code.
  const discovered = new Map(); // path -> Set(method)
  for (const appDir of APP_DIRS) {
    const appAbs = path.join(ROOT, appDir);
    for (const file of findRouteFiles(appAbs)) {
      const routePath = routePathFromFile(appAbs, file);
      if (!isDocumented(routePath)) continue;
      const set = discovered.get(routePath) ?? new Set();
      for (const m of methodsInFile(file)) set.add(m);
      discovered.set(routePath, set);
    }
  }

  const missingPaths = [];
  const missingMethods = [];
  for (const [routePath, methods] of [...discovered].sort()) {
    if (!spec.has(routePath)) {
      missingPaths.push(routePath);
      continue;
    }
    const documented = spec.get(routePath);
    for (const m of methods) {
      if (!documented.has(m)) missingMethods.push(`${m.toUpperCase()} ${routePath}`);
    }
  }

  console.log(`Discovered ${discovered.size} documented-surface routes; spec declares ${spec.size} paths.`);

  if (missingPaths.length === 0 && missingMethods.length === 0) {
    console.log("✓ OpenAPI spec covers every /api/v1 + health route.");
    return;
  }
  if (missingPaths.length) {
    console.error("\n✗ Routes missing a path in the spec:");
    for (const p of missingPaths) console.error(`    ${p}`);
  }
  if (missingMethods.length) {
    console.error("\n✗ Route methods missing from the spec:");
    for (const m of missingMethods) console.error(`    ${m}`);
  }
  console.error("\nAdd the missing path(s)/method(s) to docs/api/openapi.yaml.");
  process.exit(1);
}

main();

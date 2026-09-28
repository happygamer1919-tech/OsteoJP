#!/usr/bin/env node
// Writes apps/web/lib/guide/guide-data.json, the data /ajuda renders, from the
// lesson source in docs/guide/content/NN-<section>/.
//
//   node docs/guide/build/gen-guide-data.mjs            write the file
//   node docs/guide/build/gen-guide-data.mjs --check    compare only, write nothing
//
// The JSON is committed. apps/web/lib/guide/guide-data.test.ts regenerates it
// in memory through guide-model.mjs and fails when the committed file differs,
// so a lesson edited without running this script fails its own PR.
//
// The output is deterministic: sorted keys, stable order, no timestamp. The
// same source always gives the same bytes.
//
// Exit codes: 0 written (or, with --check, up to date); 1 the source has
// problems, or with --check the committed file differs; 2 a bad argument.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { GUIDE_DATA_FILE, GuideError, REPO_ROOT, renderGuideData } from './guide-model.mjs';

function main(argv) {
  const check = argv.includes('--check');
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    process.stderr.write(`gen-guide-data: unknown argument ${unknown[0]}\nUsage: node docs/guide/build/gen-guide-data.mjs [--check]\n`);
    return 2;
  }

  let text;
  try {
    text = renderGuideData();
  } catch (error) {
    if (error instanceof GuideError) {
      process.stderr.write(`gen-guide-data: ${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const shown = path.relative(REPO_ROOT, GUIDE_DATA_FILE);
  const current = existsSync(GUIDE_DATA_FILE) ? readFileSync(GUIDE_DATA_FILE, 'utf8') : null;
  if (check) {
    if (current === text) {
      process.stdout.write(`${shown} is up to date\n`);
      return 0;
    }
    process.stderr.write(`gen-guide-data: ${shown} differs from the lesson source; run node docs/guide/build/gen-guide-data.mjs\n`);
    return 1;
  }
  if (current === text) {
    process.stdout.write(`${shown} unchanged\n`);
    return 0;
  }
  writeFileSync(GUIDE_DATA_FILE, text);
  process.stdout.write(`${shown} written\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));

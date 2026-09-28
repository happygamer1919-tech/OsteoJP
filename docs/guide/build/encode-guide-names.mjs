#!/usr/bin/env node
// Reads one name per line on stdin and writes the encoded list (format v1,
// guide-names.mjs) on stdout. Nothing else is printed on success.
//
//   ... | node docs/guide/build/encode-guide-names.mjs              the whole list
//   ... | node docs/guide/build/encode-guide-names.mjs --part 1/2   one half of it, by hash range
//
// It is the OWNER'S tool: the production names reach it through a pipe from
// psql and leave it as hashes, piped on into "gh secret set", so no terminal
// and no file ever holds a name (README, "The names check"). An agent never
// runs it on real data.
//
// It refuses, with one line on stderr and nothing on stdout, when:
//   * no line holds a name of two words or more (an empty list would pass
//     every text, so it is never written);
//   * the encoded list is larger than one Actions secret holds (48 KiB); the
//     message says how many parts to split it into.
// Neither message quotes a name. Exit codes: 0 written, 1 refused, 2 a bad argument.

import { readFileSync } from 'node:fs';

import { SECRET_LIMIT, encodeHashes, hash32, nameKey, partOf } from './guide-names.mjs';

function fail(code, message) {
  process.stderr.write(`encode-guide-names: ${message}\n`);
  return code;
}

function main(argv) {
  let part = 1;
  let parts = 1;
  if (argv.length > 0) {
    const match = argv.length === 2 && argv[0] === '--part' ? /^(\d+)\/(\d+)$/.exec(argv[1]) : null;
    if (!match) return fail(2, 'usage: node docs/guide/build/encode-guide-names.mjs [--part k/N] < names');
    part = Number(match[1]);
    parts = Number(match[2]);
    if (part < 1 || part > parts) return fail(2, `a part is k/N with 1 <= k <= N, not ${argv[1]}`);
  }

  const hashes = new Set();
  for (const line of readFileSync(0, 'utf8').split(/\r?\n/)) {
    const key = nameKey(line);
    if (key !== null) hashes.add(hash32(key));
  }
  if (hashes.size === 0) return fail(1, 'no name of two words or more on stdin; nothing written');

  const chosen = partOf([...hashes], part, parts);
  const encoded = encodeHashes(chosen);
  if (encoded.length > SECRET_LIMIT) {
    // A tenth of headroom: the parts split by hash range, so they are only roughly equal.
    const need = Math.ceil((encoded.length * parts) / (SECRET_LIMIT * 0.9));
    return fail(
      1,
      `the encoded list is ${encoded.length} bytes for ${chosen.length} names, over the ${SECRET_LIMIT} bytes of one Actions secret; split it with --part 1/${need} to --part ${need}/${need}`,
    );
  }
  process.stdout.write(encoded);
  return 0;
}

process.exitCode = main(process.argv.slice(2));

// The names check for the guide (G1-5): no committed screenshot, text record
// or fixture of the guide may contain a person's name from production.
//
// The repository is public, so the production names can never be in it, not
// even as a test fixture. They reach CI as an ENCODED LIST in the Actions
// secret GUIDE_FORBIDDEN_NAMES, which the owner builds on his own machine with
// encode-guide-names.mjs (README, "The names check"). The list holds no name:
// only the first 4 bytes of the sha256 of each normalized name.
//
// How a text is checked. Every run of 2 to 4 consecutive words of the text is
// a candidate; a candidate whose hash is in the list is a hit. The check names
// the FILE and the LINE of a hit, never the words: a hit on a real name would
// otherwise print the very fact the check exists to keep private.
//
// Normalizing, the same on both sides: NFKD, the diacritics stripped, lower
// case, every character that is not a letter or a digit read as a space,
// spaces collapsed. "Marta Exemplo", "MARTA  EXEMPLO" and "marta-exemplo" are
// one name; "Receção Exemplo" and "Rececao Exemplo" are one name.
//
// A name of more than 4 words is encoded by its first 4 words, because a text
// that holds the whole name holds those 4 as a run, and a candidate is never
// longer than 4 words. A name of one word is not encoded: no candidate is one
// word, so it could never be found, and it would only take space.
//
// THE ENCODED LIST, format v1:
//
//   "v1:" + base64( deflateRaw( LEB128 varints of the sorted, distinct
//                   uint32 hashes, each written as its gap from the previous
//                   one, the first as its gap from 0 ) )
//
// A uint32 is the first 4 bytes of sha256(normalized name), big endian.
//
// Pure ESM, node built-ins only. Nothing runs at import time.

import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/** The prefix of an encoded list; a list without it is refused. */
export const FORMAT_PREFIX = 'v1:';
/** A candidate is a run of this many words, at least... */
export const MIN_RUN = 2;
/** ...and at most. */
export const MAX_RUN = 4;
/** GitHub's limit on the size of one Actions secret, in bytes. */
export const SECRET_LIMIT = 48 * 1024;

export class GuideNamesError extends Error {}

/** The words of a text, normalized: NFKD, no diacritics, lower case, letters and digits only. */
export function normalizedWords(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

/** A text normalized to one line: its words joined by single spaces. */
export function normalize(text) {
  return normalizedWords(text).join(' ');
}

/**
 * The string the list holds for one name: the name normalized, cut to its
 * first MAX_RUN words; null for a name of fewer than MIN_RUN words.
 */
export function nameKey(name) {
  const words = normalizedWords(name);
  if (words.length < MIN_RUN) return null;
  return words.slice(0, MAX_RUN).join(' ');
}

/** The first 4 bytes of sha256 of a normalized string, as an unsigned 32 bit integer. */
export function hash32(normalized) {
  return createHash('sha256').update(normalized, 'utf8').digest().readUInt32BE(0);
}

function writeVarint(out, value) {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

/** The encoded list for some names. Names that normalize alike are one entry. */
export function encodeNames(names) {
  const hashes = new Set();
  for (const name of names) {
    const key = nameKey(name);
    if (key !== null) hashes.add(hash32(key));
  }
  return encodeHashes([...hashes]);
}

/** The encoded list for a set of uint32 hashes (encodeNames without the hashing). */
export function encodeHashes(hashes) {
  const sorted = [...new Set(hashes)].sort((a, b) => a - b);
  const bytes = [];
  let previous = 0;
  for (const hash of sorted) {
    if (!Number.isInteger(hash) || hash < 0 || hash > 0xffffffff) throw new GuideNamesError('a hash is not a uint32');
    writeVarint(bytes, hash - previous);
    previous = hash;
  }
  const packed = deflateRawSync(Buffer.from(bytes), { level: 9 });
  return `${FORMAT_PREFIX}${packed.toString('base64')}`;
}

/**
 * The hashes of one part of a list split in `parts` by hash range (part is 1
 * based): each hash falls in exactly one part. A list too big for one secret
 * goes into several (README, "The names check").
 */
export function partOf(hashes, part, parts) {
  if (!Number.isInteger(parts) || parts < 1 || !Number.isInteger(part) || part < 1 || part > parts) {
    throw new GuideNamesError(`a part is k/N with 1 <= k <= N, not ${part}/${parts}`);
  }
  return hashes.filter((hash) => Math.floor((hash * parts) / 2 ** 32) === part - 1);
}

/**
 * The sorted hashes of an encoded list, or of several separated by white
 * space (the parts of a split list, in any order). Throws GuideNamesError on
 * anything that is not well formed; the message never quotes the input.
 */
export function decodeNames(encoded) {
  const lists = String(encoded).trim().split(/\s+/).filter((list) => list !== '');
  if (lists.length === 0) throw new GuideNamesError('the list is empty');
  const all = new Set();
  for (const list of lists) for (const hash of decodeOne(list)) all.add(hash);
  return [...all].sort((a, b) => a - b);
}

function decodeOne(text) {
  if (!text.startsWith(FORMAT_PREFIX)) throw new GuideNamesError(`the list does not start with "${FORMAT_PREFIX}"`);
  const body = text.slice(FORMAT_PREFIX.length);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body)) throw new GuideNamesError('the list is not base64 after its prefix');
  let bytes;
  try {
    bytes = inflateRawSync(Buffer.from(body, 'base64'));
  } catch {
    throw new GuideNamesError('the list does not inflate');
  }
  const hashes = [];
  let value = 0;
  let scale = 1;
  let previous = 0;
  let open = false;
  for (const byte of bytes) {
    value += (byte & 0x7f) * scale;
    if (byte & 0x80) {
      scale *= 0x80;
      open = true;
      if (scale > 2 ** 35) throw new GuideNamesError('a varint in the list is too long');
      continue;
    }
    const hash = previous + value;
    if (hash > 0xffffffff) throw new GuideNamesError('a hash in the list is not a uint32');
    if (hashes.length > 0 && value === 0) throw new GuideNamesError('the list repeats a hash');
    hashes.push(hash);
    previous = hash;
    value = 0;
    scale = 1;
    open = false;
  }
  if (open) throw new GuideNamesError('the list ends inside a varint');
  return hashes;
}

/** The words of a text with the line each one is on, 1 based. */
function wordsWithLines(text) {
  const out = [];
  String(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const word of normalizedWords(line)) out.push({ word, line: i + 1 });
    });
  return out;
}

/**
 * Every candidate of a text: each run of MIN_RUN to MAX_RUN consecutive words,
 * normalized, with the line its first word is on. A run may cross a line
 * break, so a name split over two lines is still one candidate.
 */
export function candidates(text) {
  const words = wordsWithLines(text);
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    for (let n = MIN_RUN; n <= MAX_RUN && i + n <= words.length; n += 1) {
      out.push({
        text: words
          .slice(i, i + n)
          .map((w) => w.word)
          .join(' '),
        line: words[i].line,
      });
    }
  }
  return out;
}

/**
 * The lines of a text that hold a name of the list, sorted, each once. The
 * list is the result of decodeNames (or any iterable of uint32 hashes).
 * Returns line numbers only: the caller reports "file:line", never the words.
 */
export function hitLines(text, list) {
  const set = list instanceof Set ? list : new Set(list);
  const lines = new Set();
  for (const candidate of candidates(text)) {
    if (set.has(hash32(candidate.text))) lines.add(candidate.line);
  }
  return [...lines].sort((a, b) => a - b);
}

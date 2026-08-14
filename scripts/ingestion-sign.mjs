#!/usr/bin/env node
// Standalone HMAC signer for POST /api/v1/ingestion/clinical-records.
//
// WHY THIS EXISTS: the live acceptance session with the AI ingestion partner has
// three steps their scenario cannot produce on its own — an exact-bytes replay
// (200), a one-character mutation under the same idempotency key (409), and a
// deliberately bad signature (401). This sends those by hand.
//
// THE CONTRACT, re-derived from the code rather than remembered
// (docs/ai-ingestion/endpoint-contract.md §1, apps/web/lib/ingestion/hmac.ts):
//
//   X-OsteoJP-Timestamp: <unix seconds, integer>
//   X-OsteoJP-Signature: lowercase hex HMAC-SHA256( secret, `${timestamp}.${rawBody}` )
//
// The timestamp is bound INTO the signed string, the window is ±300s, and the
// server MACs over `await req.text()` — the literal bytes received.
//
// THE ONE PROPERTY THIS SCRIPT IS BUILT AROUND: the bytes signed are the bytes
// sent. There is exactly one Buffer. It is read from disk, optionally mutated
// once, then hashed and handed to fetch WITHOUT a serialization round-trip.
// Re-serializing between signing and sending (JSON.parse -> JSON.stringify) is
// the standard way a signer of this kind is silently wrong: key order, unicode
// escaping and whitespace all move, the MAC no longer covers the transmitted
// bytes, and the endpoint answers a flat 401 that says nothing about why.
// scripts/ingestion-sign.test.mjs pins this against the endpoint's OWN helper.
//
// THE SECRET COMES FROM THE ENVIRONMENT AND NOWHERE ELSE. Not an argument, not a
// default, not a file, and it is never printed — not even the corrupted
// signature is echoed, because a signature one nibble off the real one narrows
// the real one to sixteen candidates.
//
// Usage:
//   AI_INGESTION_HMAC_SECRET=... node scripts/ingestion-sign.mjs <base-url> <body.json> [flags]
//
// Flags:
//   --corrupt-signature   send a well-formed but WRONG signature      (expect 401)
//   --mutate-body         flip one character inside the payload,
//                         then sign the mutated bytes                 (expect 409)
//   --timestamp <unix>    pin the timestamp instead of using now
//   --path <path>         override the endpoint path
//   --expect <status>     exit 1 unless the response status matches
//   --dry-run             print everything, send nothing

import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { argv, env, exit, stdout } from "node:process";
import { fileURLToPath } from "node:url";

export const SECRET_ENV = "AI_INGESTION_HMAC_SECRET";
export const DEFAULT_PATH = "/api/v1/ingestion/clinical-records";
export const TIMESTAMP_HEADER = "X-OsteoJP-Timestamp";
export const SIGNATURE_HEADER = "X-OsteoJP-Signature";
/** Mirrors REPLAY_WINDOW_SECONDS in apps/web/lib/ingestion/hmac.ts. */
export const REPLAY_WINDOW_SECONDS = 300;

/** A failure this script is responsible for, as opposed to an HTTP answer. */
export class SignerError extends Error {}

const fail = (msg) => {
  throw new SignerError(msg);
};

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

/**
 * The server signs `await req.text()`, which is a UTF-8 decode of the bytes we
 * put on the wire. If a byte sequence does not survive that decode unchanged,
 * the server is signing something we did not send and no signature can ever
 * verify. That is not a case to work around, it is a case to stop on: a signer
 * that quietly repaired the bytes would send a request whose 401 looked like a
 * key problem.
 *
 * A UTF-8 BOM is rejected separately because it DOES round-trip: the signature
 * would verify and then JSON.parse would throw server-side, answering 400
 * malformed_body during a test whose expected answer is 200, 401 or 409.
 */
export function assertSendableBytes(bodyBytes) {
  if (!Buffer.isBuffer(bodyBytes)) fail("body must be a Buffer of the exact bytes to send");
  if (bodyBytes.length === 0) fail("body file is empty");

  if (bodyBytes[0] === 0xef && bodyBytes[1] === 0xbb && bodyBytes[2] === 0xbf) {
    fail(
      "body file starts with a UTF-8 BOM. The signature would verify and the " +
        "server's JSON.parse would then fail, answering 400 malformed_body. " +
        "Re-save the file without a BOM.",
    );
  }

  const roundTripped = Buffer.from(bodyBytes.toString("utf8"), "utf8");
  if (!roundTripped.equals(bodyBytes)) {
    fail(
      "body file is not valid UTF-8. The server MACs over a UTF-8 decode of " +
        "what it receives, so these bytes cannot verify against any signature " +
        "over the bytes as they sit on disk.",
    );
  }
}

export function sha256Hex(bodyBytes) {
  return createHash("sha256").update(bodyBytes).digest("hex");
}

/**
 * HMAC-SHA256 over `${timestamp}.` followed by the RAW BODY BYTES, hex.
 *
 * Deliberately fed as two byte-wise updates rather than as one interpolated
 * JavaScript string: the body never becomes a string here, so there is no point
 * at which a decode or re-encode could alter it. For any body that passes
 * assertSendableBytes this is identical to the server's string form, which
 * scripts/ingestion-sign.test.mjs asserts against the endpoint's own helper.
 */
export function signBytes(bodyBytes, timestamp, secret) {
  if (!Number.isInteger(timestamp)) fail("timestamp must be an integer number of unix seconds");
  if (typeof secret !== "string" || secret.length === 0) fail(`${SECRET_ENV} is empty`);
  return createHmac("sha256", secret)
    .update(Buffer.from(`${timestamp}.`, "utf8"))
    .update(bodyBytes)
    .digest("hex");
}

/**
 * A signature that is the right length and valid hex but WRONG, so the request
 * reaches the endpoint's constant-time comparison and is refused there rather
 * than being thrown out by the length pre-check. Deterministic: one nibble, at
 * index 0, rotated by one.
 */
export function corruptHexSignature(hex) {
  if (typeof hex !== "string" || !/^[0-9a-f]+$/.test(hex)) fail("expected a lowercase hex signature");
  const rotated = ((parseInt(hex[0], 16) + 1) % 16).toString(16);
  return rotated + hex.slice(1);
}

// ---------------------------------------------------------------------------
// The one-character mutation (the 409 case)
// ---------------------------------------------------------------------------

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);
const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COLON = 0x3a;

const skipWs = (b, i) => {
  while (i < b.length && WS.has(b[i])) i += 1;
  return i;
};

/** End index (exclusive) of the string literal whose opening quote is at `i`. */
function endOfString(b, i) {
  let j = i + 1;
  while (j < b.length) {
    if (b[j] === BACKSLASH) {
      j += 2;
      continue;
    }
    if (b[j] === QUOTE) return j + 1;
    j += 1;
  }
  fail("unterminated string in body");
}

/**
 * Byte range of the TOP-LEVEL `payload` object's value, braces included.
 *
 * Found by walking the bytes rather than by searching for the text `"payload"`,
 * because that text can also appear inside a string value; a search would then
 * mutate clinical content that is not the payload object, or worse, a transport
 * field. Depth is tracked so only a key at depth 1 counts.
 */
export function findPayloadObjectRange(bodyBytes) {
  const b = bodyBytes;
  let i = skipWs(b, 0);
  if (b[i] !== 0x7b) fail("body is not a JSON object");

  let depth = 0;
  while (i < b.length) {
    const c = b[i];

    if (c === QUOTE) {
      const end = endOfString(b, i);
      const after = skipWs(b, end);
      const isKey = b[after] === COLON;
      if (isKey && depth === 1) {
        const key = b.toString("utf8", i + 1, end - 1);
        if (key === "payload") {
          const valueStart = skipWs(b, after + 1);
          if (b[valueStart] !== 0x7b) {
            fail('"payload" is not a JSON object; the contract requires an object');
          }
          let d = 0;
          let j = valueStart;
          while (j < b.length) {
            const v = b[j];
            if (v === QUOTE) {
              j = endOfString(b, j);
              continue;
            }
            if (v === 0x7b) d += 1;
            else if (v === 0x7d) {
              d -= 1;
              if (d === 0) return { start: valueStart, end: j + 1 };
            }
            j += 1;
          }
          fail('unterminated "payload" object');
        }
      }
      i = end;
      continue;
    }

    if (c === 0x7b || c === 0x5b) depth += 1;
    else if (c === 0x7d || c === 0x5d) depth -= 1;
    i += 1;
  }
  fail('no top-level "payload" key in body');
}

const isAsciiAlnum = (c) =>
  (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);

const rotateAlnum = (c) => {
  if (c >= 0x30 && c <= 0x39) return 0x30 + ((c - 0x30 + 1) % 10);
  if (c >= 0x61 && c <= 0x7a) return 0x61 + ((c - 0x61 + 1) % 26);
  return 0x41 + ((c - 0x41 + 1) % 26);
};

/**
 * Pick the byte to flip: the first ASCII alphanumeric inside a STRING VALUE
 * within the payload object.
 *
 * Every part of that is load-bearing. Inside the payload, so the transport
 * envelope (idempotency_key, request_id, patient_id) is untouched and the server
 * still routes the request to the same (tenant, key) pair — otherwise the answer
 * is 400 or 422 instead of the 409 this flag exists to produce. Inside a string
 * VALUE, so the body stays valid JSON and no key is renamed. ASCII alphanumeric,
 * so no multi-byte UTF-8 sequence is cut in half and no escape is broken.
 *
 * NO FALLBACK. If the payload has no such byte this throws, because the
 * alternative — flip something else and send it — produces a request whose
 * status code answers a different question than the one being asked.
 */
export function findMutablePayloadByte(bodyBytes) {
  const b = bodyBytes;
  const { start, end } = findPayloadObjectRange(b);

  let i = start;
  while (i < end) {
    if (b[i] !== QUOTE) {
      i += 1;
      continue;
    }
    const stringEnd = endOfString(b, i);
    const after = skipWs(b, stringEnd);
    const isValue = b[after] !== COLON;
    if (isValue) {
      let j = i + 1;
      while (j < stringEnd - 1) {
        if (b[j] === BACKSLASH) {
          j += 2;
          continue;
        }
        if (isAsciiAlnum(b[j])) return { offset: j, from: b[j], to: rotateAlnum(b[j]) };
        j += 1;
      }
    }
    i = stringEnd;
  }

  fail(
    "no mutable character found: the payload contains no string value with an " +
      "ASCII alphanumeric in it. Add a text field to the body, or hand-edit a " +
      "copy of the file and send it without --mutate-body.",
  );
}

/** A copy of the body with exactly one byte changed inside the payload. */
export function mutateBodyByte(bodyBytes) {
  const { offset, from, to } = findMutablePayloadByte(bodyBytes);
  const mutated = Buffer.from(bodyBytes);
  mutated[offset] = to;
  return { body: mutated, offset, from, to };
}

// ---------------------------------------------------------------------------
// Request assembly
// ---------------------------------------------------------------------------

/**
 * Sign a body and return the headers ALONGSIDE the very Buffer that was signed.
 * The caller sends `request.body`. It is the same object that went into the MAC,
 * not a copy and not a re-encoding, which is what makes "signs the exact bytes
 * transmitted" a structural property here rather than a claim.
 */
export function buildSignedRequest({ bodyBytes, timestamp, secret, corrupt = false }) {
  assertSendableBytes(bodyBytes);
  const signature = signBytes(bodyBytes, timestamp, secret);
  return {
    body: bodyBytes,
    bodyLength: bodyBytes.length,
    bodySha256: sha256Hex(bodyBytes),
    corrupted: corrupt,
    headers: {
      "Content-Type": "application/json",
      [TIMESTAMP_HEADER]: String(timestamp),
      [SIGNATURE_HEADER]: corrupt ? corruptHexSignature(signature) : signature,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(args) {
  const positional = [];
  const opts = { corrupt: false, mutate: false, dryRun: false, path: DEFAULT_PATH };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = () => {
      const v = args[i + 1];
      if (v === undefined) fail(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === "--corrupt-signature") opts.corrupt = true;
    else if (a === "--mutate-body") opts.mutate = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--path") opts.path = next();
    else if (a === "--timestamp") {
      const v = Number(next());
      if (!Number.isInteger(v)) fail("--timestamp must be an integer of unix seconds");
      opts.timestamp = v;
    } else if (a === "--expect") {
      const v = Number(next());
      if (!Number.isInteger(v)) fail("--expect must be an HTTP status code");
      opts.expect = v;
    } else if (a.startsWith("-")) fail(`unknown flag ${a}`);
    else positional.push(a);
  }

  if (positional.length !== 2) {
    fail("usage: ingestion-sign.mjs <base-url> <body.json> [flags]");
  }
  opts.baseUrl = positional[0];
  opts.bodyPath = positional[1];
  return opts;
}

function readSecret(args) {
  const secret = env[SECRET_ENV];
  if (!secret) {
    fail(
      `${SECRET_ENV} is not set. The secret is read from the environment only: ` +
        "pass it as an env var on the command, never as an argument.",
    );
  }
  // The secret must not have been typed on the command line, where it lands in
  // shell history and in this process's own argv.
  if (args.includes(secret)) {
    fail(
      `a command-line argument is byte-identical to ${SECRET_ENV}. Refusing to ` +
        "run: rotate it, it is now in your shell history.",
    );
  }
  return secret;
}

const line = (k, v) => stdout.write(`  ${k.padEnd(14)}${v}\n`);

async function main(args) {
  const opts = parseArgs(args);
  const secret = readSecret(args);

  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const url = new URL(opts.path, opts.baseUrl).toString();

  let bodyBytes;
  try {
    bodyBytes = readFileSync(opts.bodyPath);
  } catch (err) {
    fail(`cannot read body file ${opts.bodyPath}: ${err.message}`);
  }
  assertSendableBytes(bodyBytes);

  let mutation = null;
  if (opts.mutate) {
    mutation = mutateBodyByte(bodyBytes);
    bodyBytes = mutation.body;
  }

  const request = buildSignedRequest({ bodyBytes, timestamp, secret, corrupt: opts.corrupt });

  stdout.write("request\n");
  line("target", url);
  line("timestamp", `${timestamp} (window ±${REPLAY_WINDOW_SECONDS}s)`);
  line("body bytes", `${request.bodyLength}`);
  line("body sha256", request.bodySha256);
  line("signature", request.corrupted ? "DELIBERATELY CORRUPTED, expect 401" : "computed, not printed");
  if (mutation) {
    const chr = (c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : "?");
    line(
      "mutated byte",
      `offset ${mutation.offset}: 0x${mutation.from.toString(16).padStart(2, "0")} ` +
        `'${chr(mutation.from)}' -> 0x${mutation.to.toString(16).padStart(2, "0")} ` +
        `'${chr(mutation.to)}' (inside "payload", signed after mutating)`,
    );
  }

  if (opts.dryRun) {
    stdout.write("\ndry run, nothing sent\n");
    return 0;
  }

  // The Buffer handed to fetch is request.body, the object that was signed.
  const res = await fetch(url, { method: "POST", headers: request.headers, body: request.body });
  const text = await res.text();

  stdout.write("\nresponse\n");
  line("status", `${res.status} ${res.statusText}`);
  line("body", text === "" ? "(empty)" : text);
  line("sent bytes", `${request.bodyLength}`);

  if (opts.expect !== undefined) {
    const match = res.status === opts.expect;
    stdout.write(`\nexpected ${opts.expect}, got ${res.status}: ${match ? "MATCH" : "MISMATCH"}\n`);
    return match ? 0 : 1;
  }
  return 0;
}

const invokedDirectly =
  argv[1] !== undefined && fileURLToPath(import.meta.url) === argv[1];

if (invokedDirectly) {
  main(argv.slice(2))
    .then(exit)
    .catch((err) => {
      // Never echo the secret: only our own messages and the fetch error reach here.
      stdout.write(`\nerror: ${err instanceof SignerError ? err.message : err}\n`);
      exit(1);
    });
}

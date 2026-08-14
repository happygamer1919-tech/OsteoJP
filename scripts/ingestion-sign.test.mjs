// Pins scripts/ingestion-sign.mjs against the ENDPOINT'S OWN verification code.
//
// The signer is only useful if the signature it produces is the one the endpoint
// computes. Asserting that against a second copy of the algorithm written here
// would prove nothing: both copies would drift together. So this file imports
// apps/web/lib/ingestion/hmac.ts directly — the module the route calls — and
// compares against it. Node 22 strips the types on import; no build step, no
// dependency, and nothing in apps/web is modified.
//
// Run: pnpm test:scripts   (node --test, wired into the CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  signIngestionBody,
  verifyIngestionSignature,
  REPLAY_WINDOW_SECONDS as ENDPOINT_REPLAY_WINDOW,
} from "../apps/web/lib/ingestion/hmac.ts";

import {
  REPLAY_WINDOW_SECONDS,
  SECRET_ENV,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  SignerError,
  buildSignedRequest,
  corruptHexSignature,
  findPayloadObjectRange,
  mutateBodyByte,
  parseArgs,
  signBytes,
} from "./ingestion-sign.mjs";

const SECRET = "test-secret-not-a-real-key";
const TIMESTAMP = 1_764_000_000;

// Deliberately awkward on every axis the script promises not to disturb:
// pretty-printed with newlines and tabs, keys out of alphabetical order, a
// non-ASCII pt-PT value, an escaped quote, and a number that JSON.stringify
// would reformat. A signer that round-trips the JSON changes all of these.
const RAW = `{
\t"idempotency_key": "andrei-2026-08-14-abc123",
  "request_id": "req_01H8XYZ",
  "patient_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "payload": {
    "queixa": "dor lombar \\"aguda\\", irradia\\u00e7\\u00e3o at\\u00e9 ao joelho",
    "regiao": "lombar",
    "intensidade": 7.0,
    "notas": ["postura sentada prolongada"]
  }
}`;

const bytes = (s) => Buffer.from(s, "utf8");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const BODIES = {
  "pretty-printed with escapes and non-ASCII": RAW,
  compact: JSON.stringify(JSON.parse(RAW)),
  "trailing newline": `${RAW}\n`,
  "unicode in a key": '{"idempotency_key":"k","request_id":"r","patient_id":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","payload":{"observaç":"ão"}}',
};

// ---------------------------------------------------------------------------
// The property the whole script exists for
// ---------------------------------------------------------------------------

test("the signature matches the endpoint's own helper for the same body and timestamp", async (t) => {
  for (const [name, body] of Object.entries(BODIES)) {
    await t.test(name, () => {
      const ours = signBytes(bytes(body), TIMESTAMP, SECRET);
      const theirs = signIngestionBody(body, TIMESTAMP, SECRET);
      assert.equal(ours, theirs);
      assert.match(ours, /^[0-9a-f]{64}$/);
    });
  }
});

test("the comparison above is load-bearing: a re-serialised body signs differently", () => {
  // This is the defect the script is built to avoid. If the signer had parsed
  // and re-stringified before signing, it would produce THIS signature while the
  // endpoint computed one over the bytes actually transmitted, and the endpoint
  // would answer a flat 401. If this assertion ever fails, the test above has
  // gone vacuous and would pass for a broken signer.
  const reserialised = JSON.stringify(JSON.parse(RAW));
  assert.notEqual(reserialised, RAW, "fixture must not already be in canonical form");
  assert.notEqual(
    signBytes(bytes(reserialised), TIMESTAMP, SECRET),
    signIngestionBody(RAW, TIMESTAMP, SECRET),
  );
});

test("the endpoint's real verifier accepts what the script builds", () => {
  const original = process.env[SECRET_ENV];
  process.env[SECRET_ENV] = SECRET;
  try {
    const bodyBytes = bytes(RAW);
    const req = buildSignedRequest({ bodyBytes, timestamp: TIMESTAMP, secret: SECRET });
    const now = new Date(TIMESTAMP * 1000);

    assert.deepEqual(verifyIngestionSignature(req.body.toString("utf8"), req.headers, now), {
      ok: true,
    });
  } finally {
    if (original === undefined) delete process.env[SECRET_ENV];
    else process.env[SECRET_ENV] = original;
  }
});

test("the script signs the exact Buffer it hands to fetch", () => {
  const bodyBytes = bytes(RAW);
  const req = buildSignedRequest({ bodyBytes, timestamp: TIMESTAMP, secret: SECRET });

  // Reference identity, not just equal contents: there is no copy, no decode and
  // no re-encode between signing and sending.
  assert.equal(req.body, bodyBytes);
  assert.equal(req.bodyLength, Buffer.byteLength(RAW, "utf8"));
  assert.equal(req.bodySha256, sha256(bodyBytes));
  assert.equal(req.headers[TIMESTAMP_HEADER], String(TIMESTAMP));
  assert.equal(req.headers[SIGNATURE_HEADER], signIngestionBody(RAW, TIMESTAMP, SECRET));
});

test("the script's replay window matches the endpoint's", () => {
  assert.equal(REPLAY_WINDOW_SECONDS, ENDPOINT_REPLAY_WINDOW);
});

// ---------------------------------------------------------------------------
// --corrupt-signature, the 401 case
// ---------------------------------------------------------------------------

test("--corrupt-signature is refused by the endpoint's verifier as a bad signature", () => {
  const original = process.env[SECRET_ENV];
  process.env[SECRET_ENV] = SECRET;
  try {
    const bodyBytes = bytes(RAW);
    const good = buildSignedRequest({ bodyBytes, timestamp: TIMESTAMP, secret: SECRET });
    const bad = buildSignedRequest({ bodyBytes, timestamp: TIMESTAMP, secret: SECRET, corrupt: true });
    const now = new Date(TIMESTAMP * 1000);

    const goodSig = good.headers[SIGNATURE_HEADER];
    const badSig = bad.headers[SIGNATURE_HEADER];

    assert.notEqual(badSig, goodSig);
    // Same length and still valid hex, so the request is refused by the
    // constant-time comparison rather than thrown out by the length pre-check:
    // the 401 proves signature verification ran.
    assert.equal(badSig.length, goodSig.length);
    assert.match(badSig, /^[0-9a-f]{64}$/);

    assert.deepEqual(verifyIngestionSignature(RAW, bad.headers, now), {
      ok: false,
      reason: "bad_signature",
    });
  } finally {
    if (original === undefined) delete process.env[SECRET_ENV];
    else process.env[SECRET_ENV] = original;
  }
});

test("corruption is deterministic and changes exactly one nibble", () => {
  const sig = signBytes(bytes(RAW), TIMESTAMP, SECRET);
  const bad = corruptHexSignature(sig);
  const differing = [...sig].filter((c, i) => c !== bad[i]);
  assert.equal(differing.length, 1);
  assert.equal(corruptHexSignature(sig), bad);
});

// ---------------------------------------------------------------------------
// --mutate-body, the 409 case
// ---------------------------------------------------------------------------

test("--mutate-body changes exactly one byte, inside the payload", () => {
  const bodyBytes = bytes(RAW);
  const { body, offset, from, to } = mutateBodyByte(bodyBytes);

  assert.equal(body.length, bodyBytes.length);
  const differing = [...body].map((b, i) => (b === bodyBytes[i] ? null : i)).filter((i) => i !== null);
  assert.deepEqual(differing, [offset]);
  assert.equal(bodyBytes[offset], from);
  assert.equal(body[offset], to);
  assert.notEqual(from, to);

  const { start, end } = findPayloadObjectRange(bodyBytes);
  assert.ok(offset > start && offset < end, "mutated byte must sit inside the payload object");
});

test("--mutate-body leaves valid JSON with the transport envelope untouched", () => {
  const bodyBytes = bytes(RAW);
  const { body } = mutateBodyByte(bodyBytes);

  const before = JSON.parse(bodyBytes.toString("utf8"));
  const after = JSON.parse(body.toString("utf8"));

  // The 409 the acceptance step is asking for is "same key, different payload".
  // If any of these moved, the endpoint would answer 400 or 422 instead, and the
  // step would look like it failed for the wrong reason.
  assert.equal(after.idempotency_key, before.idempotency_key);
  assert.equal(after.request_id, before.request_id);
  assert.equal(after.patient_id, before.patient_id);
  assert.deepEqual(Object.keys(after.payload), Object.keys(before.payload));
  assert.notDeepEqual(after.payload, before.payload);
});

test("--mutate-body changes the payload_hash the endpoint dedupes on", () => {
  const bodyBytes = bytes(RAW);
  const { body } = mutateBodyByte(bodyBytes);
  // hashPayload() in apps/web/lib/ingestion/ingest.ts is sha256 of the raw body;
  // a different hash under the same idempotency_key is exactly what yields 409.
  assert.notEqual(sha256(body), sha256(bodyBytes));
});

test("a mutated body verifies under a signature over the MUTATED bytes", () => {
  const original = process.env[SECRET_ENV];
  process.env[SECRET_ENV] = SECRET;
  try {
    const bodyBytes = bytes(RAW);
    const { body } = mutateBodyByte(bodyBytes);
    const req = buildSignedRequest({ bodyBytes: body, timestamp: TIMESTAMP, secret: SECRET });
    const now = new Date(TIMESTAMP * 1000);

    assert.deepEqual(verifyIngestionSignature(body.toString("utf8"), req.headers, now), { ok: true });
    // ...and NOT under a signature over the pre-mutation bytes, which is what a
    // signer that mutated after signing would have sent.
    const stale = buildSignedRequest({ bodyBytes, timestamp: TIMESTAMP, secret: SECRET });
    assert.deepEqual(verifyIngestionSignature(body.toString("utf8"), stale.headers, now), {
      ok: false,
      reason: "bad_signature",
    });
  } finally {
    if (original === undefined) delete process.env[SECRET_ENV];
    else process.env[SECRET_ENV] = original;
  }
});

test("--mutate-body refuses rather than falling back when there is nothing safe to flip", () => {
  // No string value inside the payload: the only alphanumerics are in KEYS and
  // in the transport fields. Flipping either would change what the request MEANS
  // and the endpoint would answer something other than 409. It must throw.
  const noStringValue =
    '{"idempotency_key":"k","request_id":"r",' +
    '"patient_id":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","payload":{"intensidade":7}}';
  assert.throws(() => mutateBodyByte(bytes(noStringValue)), SignerError);
});

test("the payload object is found by structure, not by searching for the text", () => {
  // "payload" also appears inside a transport string value here. A search-based
  // implementation would latch onto the first hit and mutate the request_id.
  const decoy =
    '{"idempotency_key":"k","request_id":"payload-2026","patient_id":' +
    '"3f2504e0-4f89-41d3-9a0c-0305e82c3301","payload":{"queixa":"dor"}}';
  const b = bytes(decoy);
  const { start, end } = findPayloadObjectRange(b);
  assert.equal(b.toString("utf8", start, end), '{"queixa":"dor"}');

  const { offset } = mutateBodyByte(b);
  assert.ok(offset > start && offset < end);
});

// ---------------------------------------------------------------------------
// Secret handling
// ---------------------------------------------------------------------------

test("the secret never reaches the headers or the printable request summary", () => {
  const req = buildSignedRequest({ bodyBytes: bytes(RAW), timestamp: TIMESTAMP, secret: SECRET });
  const printable = JSON.stringify({
    headers: req.headers,
    bodyLength: req.bodyLength,
    bodySha256: req.bodySha256,
    corrupted: req.corrupted,
  });
  assert.ok(!printable.includes(SECRET));
});

test("the secret cannot be passed as an argument", () => {
  // Not a flag the parser accepts, and not a positional it would treat as a URL
  // or a path: there is no argv route to the secret at all.
  assert.throws(() => parseArgs(["--secret", SECRET, "https://x", "b.json"]), SignerError);
  assert.throws(() => parseArgs(["https://x", "b.json", SECRET]), SignerError);
});

// ---------------------------------------------------------------------------
// Byte hygiene
// ---------------------------------------------------------------------------

test("a body that does not survive the server's UTF-8 decode is refused, not repaired", () => {
  // The endpoint MACs over `await req.text()`. These bytes decode to U+FFFD, so
  // the server would sign something we did not send: no signature can verify and
  // the 401 would look like a key problem.
  const invalid = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
  assert.throws(
    () => buildSignedRequest({ bodyBytes: invalid, timestamp: TIMESTAMP, secret: SECRET }),
    SignerError,
  );
});

test("a UTF-8 BOM is refused, because it verifies and then fails the server's JSON.parse", () => {
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes(RAW)]);
  assert.throws(
    () => buildSignedRequest({ bodyBytes: withBom, timestamp: TIMESTAMP, secret: SECRET }),
    SignerError,
  );
});

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

test("parseArgs reads the flags the acceptance steps need", () => {
  const opts = parseArgs([
    "https://app.osteojp.pt",
    "body.json",
    "--mutate-body",
    "--timestamp",
    String(TIMESTAMP),
    "--expect",
    "409",
  ]);
  assert.equal(opts.baseUrl, "https://app.osteojp.pt");
  assert.equal(opts.bodyPath, "body.json");
  assert.equal(opts.mutate, true);
  assert.equal(opts.corrupt, false);
  assert.equal(opts.timestamp, TIMESTAMP);
  assert.equal(opts.expect, 409);
  assert.equal(opts.path, "/api/v1/ingestion/clinical-records");
});

test("parseArgs rejects an unknown flag rather than ignoring it", () => {
  assert.throws(() => parseArgs(["https://x", "b.json", "--corupt-signature"]), SignerError);
});

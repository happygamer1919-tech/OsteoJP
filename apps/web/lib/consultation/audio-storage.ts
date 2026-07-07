import "server-only";
import { createHash, createHmac } from "node:crypto";

// W4-08 — presigned S3 signer for the AI-recording audio bucket. Implemented
// with node:crypto (AWS Signature V4 query-string presigning) — no AWS SDK
// dependency (the SDK's transitive @types/node@22 conflicts with the app's DOM
// types, and it is unnecessary for a single scoped presign).
//
// Infra (DECISIONS 2026-07-06 + SPEC-ai-recording §6, André-confirmed):
//   - bucket `osteojp-audio-intake`, eu-central-1, on André's AWS;
//   - Block All Public Access ON — access ONLY ever via a presigned URL;
//   - encryption SSE-S3 (bucket default, NEVER KMS — KMS breaks presigned URLs),
//     so the PUT sets no encryption header; the bucket enforces SSE-S3;
//   - a 7-day lifecycle auto-deletes every object, so every expiry set here stays
//     well under 7 days (this loop uses 10 minutes; W4-09's fired GET is 1h);
//   - ONE dedicated scoped key (PutObject+GetObject on this bucket only — no
//     list, no delete). The secret lives in Vercel env / vault and is read at
//     runtime; NEVER hardcoded, stubbed, printed, or committed. Missing env
//     THROWS (AudioStorageConfigError) — we never invent a key.
//
// The backend is the ONLY signer (same key for PUT and GET); the browser PUTs
// direct to S3 with the returned URL and never proxies audio through Next.

const REGION_ENV = "AUDIO_S3_REGION";
const BUCKET_ENV = "AUDIO_S3_BUCKET";
const ACCESS_KEY_ID_ENV = "AUDIO_S3_ACCESS_KEY_ID";
const SECRET_ACCESS_KEY_ENV = "AUDIO_S3_SECRET_ACCESS_KEY";

/** The uploaded object's filename — André's transcription module reads it from
 * the webhook `audio_filename` field (SPEC §7). */
export const AUDIO_FILENAME = "consultation.webm";
/** PUT / round-trip GET expiry: 10 min — short, well under the 7-day lifecycle. */
export const UPLOAD_URL_TTL_SECONDS = 600;

export class AudioStorageConfigError extends Error {
  constructor(missing: string[]) {
    super(`audio storage env not configured: ${missing.join(", ")}`); // names only
    this.name = "AudioStorageConfigError";
  }
}

interface AudioS3Config {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function readConfig(): AudioS3Config {
  const region = process.env[REGION_ENV];
  const bucket = process.env[BUCKET_ENV];
  const accessKeyId = process.env[ACCESS_KEY_ID_ENV];
  const secretAccessKey = process.env[SECRET_ACCESS_KEY_ENV];
  const missing = [
    !region && REGION_ENV,
    !bucket && BUCKET_ENV,
    !accessKeyId && ACCESS_KEY_ID_ENV,
    !secretAccessKey && SECRET_ACCESS_KEY_ENV,
  ].filter((v): v is string => typeof v === "string");
  if (missing.length > 0) throw new AudioStorageConfigError(missing);
  return { region: region!, bucket: bucket!, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! };
}

/** RFC-3986 encoding as AWS SigV4 requires (encode everything but A-Za-z0-9-_.~). */
function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** AWS SigV4 query-string presigned URL (virtual-hosted-style, UNSIGNED-PAYLOAD). */
export function presignS3Url(opts: {
  method: "PUT" | "GET";
  cfg: AudioS3Config;
  objectKey: string;
  expiresIn: number;
  now: Date;
}): string {
  const { region, bucket, accessKeyId, secretAccessKey } = opts.cfg;
  const service = "s3";
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const amzDate = opts.now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const signedHeaders = "host";
  const canonicalUri = `/${opts.objectKey.split("/").map(rfc3986).join("/")}`;

  // Canonical query — sorted by key, each key & value RFC-3986-encoded.
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(opts.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Object key derived SERVER-SIDE from the JWT tenant (never the payload) so an
 * upload correlates to tenant/patient/consultation and cannot collide.
 */
export function audioObjectKey(
  tenantId: string,
  patientId: string,
  consultationStartedAt: string,
): string {
  const slug = consultationStartedAt.replace(/[:.]/g, "-");
  return `${tenantId}/${patientId}/${slug}/${AUDIO_FILENAME}`;
}

/** Presigned PUT for the browser's direct-to-S3 upload. Returns URL + key only. */
export async function signAudioUpload(
  tenantId: string,
  patientId: string,
  consultationStartedAt: string,
  now: Date = new Date(),
): Promise<{ url: string; objectKey: string }> {
  const cfg = readConfig();
  const objectKey = audioObjectKey(tenantId, patientId, consultationStartedAt);
  const url = presignS3Url({ method: "PUT", cfg, objectKey, expiresIn: UPLOAD_URL_TTL_SECONDS, now });
  return { url, objectKey };
}

/** Presigned GET (same scoped key) — proves the object is readable back. */
export async function signAudioDownload(
  objectKey: string,
  expiresIn: number = UPLOAD_URL_TTL_SECONDS,
  now: Date = new Date(),
): Promise<string> {
  const cfg = readConfig();
  return presignS3Url({ method: "GET", cfg, objectKey, expiresIn, now });
}

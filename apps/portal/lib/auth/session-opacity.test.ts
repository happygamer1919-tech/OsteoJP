/**
 * W13-03b — THE PORTAL NEVER VERIFIES THE SESSION TOKEN. It is opaque here.
 *
 * The ruling's first constraint, asserted the way WF-08 asserts that no path
 * mints a Supabase session: by SCANNING THE SOURCE, not by testing the paths
 * somebody remembered to call.
 *
 * WHY A SCAN AND NOT A BEHAVIOURAL TEST. The property is "no code path does X".
 * A behavioural test can only prove the paths it thought of do not do X, which
 * is exactly the assurance that failed when a dead session-minting module sat in
 * the tree for two waves looking inert. A scan asserts absence across the whole
 * app, including code nobody remembered to test.
 *
 * WHY IT MATTERS HERE SPECIFICALLY. The signing secret lives in the
 * osteojp-api Vercel project and nowhere else, so this app COULD NOT verify a
 * token honestly even if it tried. A portal that "checked" a token it cannot
 * verify would be reading the attacker's own claims and believing them — the
 * precise defect that produced the SEC-W1-patient-jwt-verify incident, where
 * apps/api decoded a token and trusted the payload. The fix there was to verify;
 * the fix here is not to pretend to.
 *
 * The API is the single verifier. Forever.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

const PORTAL_ROOT = join(__dirname, '..', '..')

/**
 * Symbols that read, decode, or verify a token's contents. `SignJWT` is here
 * too: the portal must not MINT one either — minting is the API's job and a
 * portal that could mint would be a second issuer with no secret to issue from.
 */
const TOKEN_INSPECTION = [
  'jwtVerify',
  'decodeJwt',
  'decodeProtectedHeader',
  'SignJWT',
  'jwt.verify',
  'jwt.decode',
  'jsonwebtoken',
  'createRemoteJWKSet',
]

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Comments are stripped: this file and others DISCUSS the forbidden names. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the patient session token is opaque to the portal', () => {
  const files = sourceFiles(PORTAL_ROOT)

  it('finds source files to scan (the scan is not vacuously passing)', () => {
    // A scan over an empty file list passes and proves nothing.
    expect(files.length).toBeGreaterThan(20)
  })

  for (const symbol of TOKEN_INSPECTION) {
    it(`no file in apps/portal calls ${symbol}`, () => {
      const offenders = files
        .filter((f) => code(f).includes(symbol))
        .map((f) => f.replace(`${PORTAL_ROOT}/`, ''))
      expect(offenders).toEqual([])
    })
  }

  it('the session module stores and returns a string, and decides nothing from it', () => {
    // Read as text rather than exercised, because the property is about what the
    // module does NOT contain. Anything that branched on the token's contents
    // would be a local verification decision.
    const src = code(join(PORTAL_ROOT, 'lib/auth/session.ts'))
    expect(src).not.toMatch(/atob|Buffer\.from\([^)]*base64/)
    expect(src).not.toMatch(/\.split\(['"]\.['"]\)/) // splitting a JWT into parts
    expect(src).not.toMatch(/exp\b|payload|claims/)
  })

  it('the api client forwards the token verbatim, without touching it', () => {
    const src = code(join(PORTAL_ROOT, 'lib/api/client.ts'))
    // Present: forwarded as a Bearer exactly as stored.
    expect(src).toContain('Bearer ${portalSession}')
    // Absent: any attempt to read what is inside it.
    expect(src).not.toMatch(/portalSession\.(split|slice|substring|match)/)
  })
})

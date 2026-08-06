/**
 * W13-03 — the portal's device cookie name must equal the API's, forever.
 *
 * WHY THIS TEST EXISTS. The portal forwards the trusted-device token to the API
 * as a raw `Cookie:` header, and the API parses that header by an exact
 * name match in `readDeviceToken`. So the two constants are one constant with
 * two homes, and they cannot be imported into one place: `apps/api` and
 * `apps/portal` are separate Next applications with separate builds, and neither
 * may import the other's source.
 *
 * THE FAILURE IT PREVENTS IS SILENT AND SLOW. Rename either side and nothing
 * breaks at build time, nothing throws at runtime, and no test that mocks its own
 * fetch would notice. Every trusted-device login simply starts answering 401,
 * every patient starts getting an SMS they should not have needed, and the
 * symptom looks like an expiry bug rather than a typo.
 *
 * IT READS THE API's SOURCE FROM DISK, which is deliberate: if that file is
 * moved or renamed, this test fails loudly rather than passing on a stale
 * assumption. The path is the assertion too.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PORTAL_DEVICE_COOKIE, PORTAL_SESSION_COOKIE } from './cookie-names'

const API_DEVICE_COOKIE_MODULE = join(
  __dirname,
  '..',
  '..',
  '..',
  'api',
  'lib',
  'auth',
  'device-cookie.ts',
)

const API_SESSION_MODULE = join(
  __dirname,
  '..',
  '..',
  '..',
  'api',
  'lib',
  'auth',
  'patient-session.ts',
)

function literal(path: string, constName: string): string | null {
  const src = readFileSync(path, 'utf8')
  const m = new RegExp(`${constName}\\s*=\\s*["']([^"']+)["']`).exec(src)
  return m ? m[1] : null
}

describe('the device cookie name is shared with the API', () => {
  it('the API module is where this test expects it', () => {
    expect(existsSync(API_DEVICE_COOKIE_MODULE)).toBe(true)
  })

  it('DEVICE_COOKIE on the API equals PORTAL_DEVICE_COOKIE here', () => {
    expect(literal(API_DEVICE_COOKIE_MODULE, 'DEVICE_COOKIE')).toBe(PORTAL_DEVICE_COOKIE)
  })

  it('both are __Host- prefixed, which the browser enforces', () => {
    // The prefix pins Secure + Path=/ + no Domain. A later edit that relaxes any
    // of them stops the cookie working rather than silently weakening it.
    expect(PORTAL_DEVICE_COOKIE.startsWith('__Host-')).toBe(true)
    expect(PORTAL_SESSION_COOKIE.startsWith('__Host-')).toBe(true)
  })

  it('the session cookie names match too', () => {
    // Not load-bearing the way the device name is — the session travels as a
    // Bearer header, not as a cookie the API parses — but a mismatch here would
    // mean the two apps disagree about what the same credential is called, and
    // that is the kind of drift that makes an incident hard to read.
    expect(existsSync(API_SESSION_MODULE)).toBe(true)
    expect(literal(API_SESSION_MODULE, 'SESSION_COOKIE')).toBe(PORTAL_SESSION_COOKIE)
  })

  it('the extractor can actually fail (negative arm)', () => {
    expect(literal(API_DEVICE_COOKIE_MODULE, 'A_CONSTANT_THAT_DOES_NOT_EXIST')).toBeNull()
  })
})

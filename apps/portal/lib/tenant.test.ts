import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))

import { tenantId } from './tenant'

/**
 * LE-portal-tenant-id-two-readers — the consolidation, and the three properties
 * it must not have cost.
 *
 * ==========================================================================
 * WHY A TEST AT ALL FOR EIGHT LINES THAT MOVED
 * ==========================================================================
 * Merging two readers into one is only safe if the surviving one keeps every
 * property both had. Two of the three are invisible in a diff and both fail in
 * the direction that looks fine:
 *
 *   CALL-TIME, NOT MODULE-SCOPE. A module-scope throw fails `next build` on
 *   every PR, because Next imports modules during the build to collect page
 *   data — the defect W13-03a had to unpick on the API side. **A build is not a
 *   boot.** "Simplify to a constant" is the obvious tidy-up and it is the bug.
 *
 *   NAMES ONLY, NEVER VALUES. Rule 7. A message that quoted what it found would
 *   put a tenant id in a log.
 *
 *   IT THROWS AT ALL. A reader that fell back to `''` or `undefined` would send
 *   an empty tenant to the API, and the API would answer a refusal the portal
 *   renders as "unavailable" — a deployment misconfiguration wearing the face of
 *   a service outage, which is exactly what `supabase/env.test.ts` next door was
 *   written for.
 */

const VAR = 'PORTAL_TENANT_ID'
const ORIGINAL = process.env[VAR]

beforeEach(() => {
  delete process.env[VAR]
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env[VAR]
  else process.env[VAR] = ORIGINAL
})

describe('tenantId', () => {
  it('returns the configured tenant', () => {
    process.env[VAR] = 'tenant-abc'
    expect(tenantId()).toBe('tenant-abc')
  })

  it('THROWS when it is absent, rather than returning an empty tenant', () => {
    expect(() => tenantId()).toThrow(/PORTAL_TENANT_ID is not set/)
  })

  it('throws on an EMPTY string too - a set-but-blank variable is not configured', () => {
    // The adjacent state, and the one a `!== undefined` check would miss. A
    // deployment that sets the variable to "" is misconfigured in exactly the
    // way this guard exists for.
    process.env[VAR] = ''
    expect(() => tenantId()).toThrow(/PORTAL_TENANT_ID is not set/)
  })

  it('names the VARIABLE and never a value - PII rule 7', () => {
    process.env[VAR] = 'a-real-looking-tenant-uuid'
    // Set it, then blank it, so a message that captured the value at module
    // scope would still be carrying it.
    process.env[VAR] = ''
    try {
      tenantId()
      throw new Error('did not throw')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      expect(msg).toContain(VAR)
      expect(msg).not.toContain('a-real-looking-tenant-uuid')
    }
  })

  it('is evaluated at CALL time, not at module scope - a build is not a boot', () => {
    // THE PROPERTY THAT PROTECTS `next build`. The import at the top of this
    // file already happened with the variable deleted (see beforeEach), and
    // nothing threw - which is the assertion. Reading it now still throws, so
    // the check did not simply disappear.
    expect(() => tenantId()).toThrow()
    process.env[VAR] = 'set-after-import'
    expect(tenantId()).toBe('set-after-import')
  })
})

describe('there is exactly ONE reader of PORTAL_TENANT_ID', () => {
  // The card's whole point: "two copies is the number at which a third gets
  // written without anybody noticing". This is what notices.
  const files = [
    'lib/tenant.ts',
    'lib/auth/otp.ts',
    'lib/guest/api.ts',
  ].map((f) => ({ f, src: readFileSync(join(import.meta.dirname, '..', f), 'utf8') }))

  it('lib/tenant.ts reads it', () => {
    expect(files.find((x) => x.f === 'lib/tenant.ts')?.src).toContain('process.env.PORTAL_TENANT_ID')
  })

  it('the two former copies now IMPORT it and read the env of nothing', () => {
    for (const f of files.filter((x) => x.f !== 'lib/tenant.ts')) {
      expect(f.src, `${f.f} still reads the variable directly`).not.toContain(
        'process.env.PORTAL_TENANT_ID',
      )
      expect(f.src, `${f.f} does not import the shared reader`).toContain(
        "from '@/lib/tenant'",
      )
    }
  })
})

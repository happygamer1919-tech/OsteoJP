/**
 * LE-env-sweep-scope — the portal's API origin fails LOUDLY, not silently.
 *
 * PG7's rule is "no silent degradation: every var has a safe default or fails
 * loudly at boot". `process.env.NEXT_PUBLIC_API_URL ?? ''` had neither. An empty
 * base is not a failed call — it is a RELATIVE request to the portal's own
 * origin, which 404s at the patient while looking healthy at boot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL = process.env.NEXT_PUBLIC_API_URL

describe('apiBase', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_API_URL
    else process.env.NEXT_PUBLIC_API_URL = ORIGINAL
    vi.restoreAllMocks()
  })

  it('returns the configured origin unchanged', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test'
    const { apiBase } = await import('./base')
    expect(apiBase()).toBe('https://api.example.test')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('LOGS LOUDLY when unset, naming the variable', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    const { apiBase } = await import('./base')
    expect(apiBase()).toBe('')
    expect(console.error).toHaveBeenCalledTimes(1)
    const msg = vi.mocked(console.error).mock.calls[0]![0] as string
    expect(msg).toContain('NEXT_PUBLIC_API_URL')
    // It must say WHY the empty value is dangerous, not merely that it is unset.
    expect(msg).toMatch(/RELATIVE/i)
  })

  it('never logs a VALUE, only the name', async () => {
    process.env.NEXT_PUBLIC_API_URL = ''
    const { apiBase } = await import('./base')
    apiBase()
    const msg = vi.mocked(console.error).mock.calls[0]![0] as string
    expect(msg).not.toContain('=')
  })

  it('logs ONCE per process, not once per request', async () => {
    // A per-request log on a dead deployment buries the first occurrence.
    delete process.env.NEXT_PUBLIC_API_URL
    const { apiBase } = await import('./base')
    apiBase()
    apiBase()
    apiBase()
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('apiBaseOrNull gives callers with an unavailable branch a null to switch on', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    const { apiBaseOrNull } = await import('./base')
    expect(apiBaseOrNull()).toBeNull()
  })
})

describe('no module re-derives the origin for itself', () => {
  it('the `?? empty-string` pattern is gone from every portal source', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const ROOT = join(__dirname, '..', '..')

    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
        const full = join(dir, e)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) files.push(full)
      }
    }
    walk(ROOT)
    expect(files.length).toBeGreaterThan(10) // vacuous-pass guard

    const offenders = files.filter((f) => {
      if (f.endsWith(join('lib', 'api', 'base.ts'))) return false // the one owner
      return /NEXT_PUBLIC_API_URL\s*\?\?\s*['"]['"]/.test(readFileSync(f, 'utf8'))
    })
    expect(
      offenders.map((f) => f.slice(ROOT.length + 1)),
      'A module re-derives the API origin with a silent empty-string default. ' +
        'Import apiBase from lib/api/base instead.',
    ).toEqual([])
  })
})

/**
 * LE-env-sweep-scope, the portal half.
 *
 * WHAT THIS FILE IS PROTECTING. `NEXT_PUBLIC_SUPABASE_URL` was read in three
 * modules with three different failure behaviours, and one of them was silent:
 * `?? ''` fed to `new URL()` inside a bare `catch { return null }`. That null is
 * the SAME null the caller uses for "this patient is not signed in", so a
 * deployment misconfiguration rendered as a signed-out patient and a 401, with
 * nothing anywhere naming the variable.
 *
 * Every case below is asserted in BOTH directions - the state that must log and
 * the adjacent state that must NOT - because a warning that fires on the normal
 * path gets ignored within a week and one that never fires was never protection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const URL_VAR = 'NEXT_PUBLIC_SUPABASE_URL'
const KEY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
const ORIGINAL_URL = process.env[URL_VAR]
const ORIGINAL_KEY = process.env[KEY_VAR]

/** The warn-once latches are module state; a fresh import per case is the reset. */
async function fresh() {
  vi.resetModules()
  return import('./env')
}

let err: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  err = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  err.mockRestore()
  if (ORIGINAL_URL === undefined) delete process.env[URL_VAR]
  else process.env[URL_VAR] = ORIGINAL_URL
  if (ORIGINAL_KEY === undefined) delete process.env[KEY_VAR]
  else process.env[KEY_VAR] = ORIGINAL_KEY
})

const logged = () => err.mock.calls.flat().map(String).join(' ')

describe('a missing variable is named, not swallowed', () => {
  it('supabaseUrl logs the VARIABLE NAME and returns empty', async () => {
    delete process.env[URL_VAR]
    const { supabaseUrl } = await fresh()
    expect(supabaseUrl()).toBe('')
    expect(logged()).toContain(URL_VAR)
    // The message must say it is OUR fault, not the patient's. That distinction
    // is the whole reason the log exists.
    expect(logged()).toContain('not a user error')
  })

  it('supabaseAnonKey logs the VARIABLE NAME and returns empty', async () => {
    delete process.env[KEY_VAR]
    const { supabaseAnonKey } = await fresh()
    expect(supabaseAnonKey()).toBe('')
    expect(logged()).toContain(KEY_VAR)
  })

  // The negative arm: a configured deployment must be silent.
  it('says NOTHING when both are set', async () => {
    process.env[URL_VAR] = 'https://abc.supabase.co'
    process.env[KEY_VAR] = 'anon-key'
    const { supabaseUrl, supabaseAnonKey } = await fresh()
    expect(supabaseUrl()).toBe('https://abc.supabase.co')
    expect(supabaseAnonKey()).toBe('anon-key')
    expect(err).not.toHaveBeenCalled()
  })

  it('logs ONCE per process, not once per request', async () => {
    delete process.env[URL_VAR]
    const { supabaseUrl } = await fresh()
    supabaseUrl()
    supabaseUrl()
    supabaseUrl()
    expect(err).toHaveBeenCalledTimes(1)
  })

  // NAMES ONLY, NEVER VALUES - standing rule 3. The one case where a value
  // could leak is the set-but-invalid branch, which is holding the value when
  // it logs.
  it('never puts the VALUE in the log', async () => {
    process.env[URL_VAR] = 'not-a-url-but-secret-looking'
    const { supabaseAuthCookieName } = await fresh()
    expect(supabaseAuthCookieName()).toBeNull()
    expect(logged()).toContain(URL_VAR)
    expect(logged()).not.toContain('not-a-url-but-secret-looking')
  })
})

describe('the four causes of a null cookie name stop wearing one face', () => {
  it('SET BUT NOT A URL logs, and says so distinctly from unset', async () => {
    process.env[URL_VAR] = 'howdy'
    const { supabaseAuthCookieName } = await fresh()
    expect(supabaseAuthCookieName()).toBeNull()
    // "is set but is not a valid URL" - a missing-variable check does not catch
    // this one, which is why it has its own branch and its own message.
    expect(logged()).toContain('is set but is not a valid URL')
  })

  it('UNSET logs the unset message, not the malformed one', async () => {
    delete process.env[URL_VAR]
    const { supabaseAuthCookieName } = await fresh()
    expect(supabaseAuthCookieName()).toBeNull()
    expect(logged()).toContain('is not set')
    expect(logged()).not.toContain('is set but is not a valid URL')
  })

  it('a well-formed URL yields the cookie name and logs nothing', async () => {
    process.env[URL_VAR] = 'https://abcdefg.supabase.co'
    const { supabaseAuthCookieName } = await fresh()
    expect(supabaseAuthCookieName()).toBe('sb-abcdefg-auth-token')
    expect(err).not.toHaveBeenCalled()
  })
})

describe('no module re-derives the Supabase configuration for itself', () => {
  it('the raw process.env reads are gone from every portal source but the owner', async () => {
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
    // Vacuous-pass guard: a walk that finds nothing would report a clean sweep.
    expect(files.length).toBeGreaterThan(10)

    // COMMENTS STRIPPED BEFORE THE ASSERTION, and this guard is its own reason
    // why. `app/portal/account/actions.ts` DESCRIBES the pre-fix shape at length
    // in prose, because the defect is worth recording where it happened. Run
    // over raw text, this predicate matches that description and goes red on
    // correct code - a guard that punishes documentation, which is the opposite
    // of what it is for. Same fix as #962 and #965, which removed this class
    // from five other guards; the helper is copied from those deliberately
    // rather than shared, because a test helper imported across app boundaries
    // is a dependency the apps do not otherwise have.
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

    const OWNER = join('lib', 'supabase', 'env.ts')
    const offenders = files.filter((f) => {
      if (f.endsWith(OWNER)) return false
      const src = stripComments(readFileSync(f, 'utf8'))
      return (
        /process\.env\.NEXT_PUBLIC_SUPABASE_URL/.test(src) ||
        /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(src)
      )
    })
    expect(
      offenders.map((f) => f.slice(ROOT.length + 1)),
      'A module reads the Supabase configuration directly. Import supabaseUrl / ' +
        'supabaseAnonKey / supabaseAuthCookieName from lib/supabase/env instead, ' +
        'so a missing variable is named once rather than degrading differently in ' +
        'each module.',
    ).toEqual([])
  })
})

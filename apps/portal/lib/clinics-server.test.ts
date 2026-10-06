import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PUBLISHED_CLINIC_CARDS } from './clinics'
import { GIVE_UP_MS, loadClinicCards, resetClinicCardsMemo } from './clinics-server'

// R45 (strategy, 2026-10-06), gate G1: "portal with a test location that has no
// bookable therapist. EXPECT: not listed anywhere patient-facing."
//
// THE API DECIDES WHICH LOCATIONS ARE LISTED (apps/api, proven on a database in
// `location-bookable.db.test.ts`). What this file proves is the portal's half:
// the screens show the locations the API lists AND NO OTHERS, and when the list
// cannot be read the caller is told so instead of being handed something that
// looks like an answer.

const TENANT = '11111111-1111-1111-1111-111111111111'
const LV = { id: 'loc-lv', name: 'OsteoJP (LV)', address: null, phone: null }
const NEW = { id: 'loc-new', name: 'OsteoJP (Vila Nova)', address: 'Rua Direita, 10', phone: '266 000 111' }

const ok = (locations: unknown) =>
  new Response(JSON.stringify({ locations, services: [], intakeEnabled: false }), { status: 200 })

let fetchMock: ReturnType<typeof vi.fn>
let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetClinicCardsMemo()
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test')
  vi.stubEnv('PORTAL_TENANT_ID', TENANT)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  errorLog.mockRestore()
})

describe('R45 — the clinics a patient is shown are the locations the API lists', () => {
  it('asks the one public read, for this deployment\'s tenant, uncached and with a deadline', async () => {
    fetchMock.mockResolvedValue(ok([LV]))
    await loadClinicCards()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://api.test/api/v1/booking/guest/catalog?tenantId=${TENANT}`)
    expect(init.cache).toBe('no-store')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('gives up after two seconds: the read carries that deadline, and an aborted read is "could not ask"', async () => {
    // A slow API must not hold the login screen. Two halves: the signal handed
    // to fetch IS the two second one, and when it fires the caller gets null.
    expect(GIVE_UP_MS).toBe(2000)
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')))
        }),
    )
    try {
      const pending = loadClinicCards()
      await Promise.resolve()
      expect(timeout).toHaveBeenCalledWith(2000)
      expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBe(controller.signal)
      controller.abort()
      expect(await pending).toBeNull()
    } finally {
      // Restored whatever happened above: a spy left on AbortSignal.timeout
      // would fail every later test in this file for a reason of its own.
      timeout.mockRestore()
    }
  })

  it('the published clinics come first in their published order, whatever order the API lists them in', async () => {
    fetchMock.mockResolvedValue(
      ok([{ id: 'loc-cb', name: 'OsteoJP (CB)' }, LV, NEW]),
    )
    const cards = await loadClinicCards()
    expect(cards?.map((c) => c.id)).toEqual(['loc-lv', 'loc-cb', 'loc-new'])
  })

  it('G1: a location the API does not list is not on the list, published details or not', async () => {
    // The API listed ONE of the two clinics that have published details, and a
    // new one. The other published clinic must not appear: having details in
    // this app is not what puts a clinic in front of a patient.
    fetchMock.mockResolvedValue(ok([LV, NEW]))
    const cards = await loadClinicCards()
    expect(cards?.map((c) => c.id)).toEqual(['loc-lv', 'loc-new'])
    expect(PUBLISHED_CLINIC_CARDS.length).toBeGreaterThan(1)
    const names = cards?.map((c) => c.name) ?? []
    const unlisted = PUBLISHED_CLINIC_CARDS.filter((c) => c.id !== 'LV').map((c) => c.name)
    expect(unlisted.length).toBeGreaterThan(0)
    for (const name of unlisted) expect(names).not.toContain(name)
  })

  it('a new location is shown from its own row, with no change to this app', async () => {
    fetchMock.mockResolvedValue(ok([NEW]))
    const [card] = (await loadClinicCards()) ?? []
    expect(card).toMatchObject({
      id: 'loc-new',
      name: 'Vila Nova',
      addressLine: 'Rua Direita, 10',
      phone: [{ number: '+351266000111', display: '266 000 111' }],
      weekdayHours: null,
    })
  })

  it('reads an answer from an API that predates R45, which carries no address or telephone', async () => {
    fetchMock.mockResolvedValue(ok([{ id: 'loc-lv', name: 'OsteoJP (LV)' }]))
    const cards = await loadClinicCards()
    expect(cards).toHaveLength(1)
    // The published details do not depend on the two new fields.
    expect(cards?.[0]?.phone.length).toBeGreaterThan(0)
  })
})

describe('R45 — one read per five minutes, and the last good answer outlives a failure', () => {
  const T0 = 1_800_000_000_000
  const MIN = 60_000

  it('does not ask again inside five minutes', async () => {
    fetchMock.mockResolvedValue(ok([LV]))
    await loadClinicCards(T0)
    await loadClinicCards(T0 + 4 * MIN + 59_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks again after five minutes, and the new answer replaces the old', async () => {
    fetchMock.mockResolvedValueOnce(ok([LV])).mockResolvedValueOnce(ok([LV, NEW]))
    expect(await loadClinicCards(T0)).toHaveLength(1)
    expect(await loadClinicCards(T0 + 5 * MIN)).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the last good answer when the next read fails', async () => {
    fetchMock.mockResolvedValueOnce(ok([LV, NEW])).mockRejectedValueOnce(new Error('timeout'))
    await loadClinicCards(T0)
    expect((await loadClinicCards(T0 + 6 * MIN))?.map((c) => c.id)).toEqual(['loc-lv', 'loc-new'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a failure is remembered for thirty seconds, so an outage is not asked about on every page view', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await loadClinicCards(T0)).toBeNull()
    expect(await loadClinicCards(T0 + 1000)).toBeNull()
    expect(await loadClinicCards(T0 + 29_000)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // ...and then it asks again, and the good answer is kept as usual.
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(ok([LV]))
    expect(await loadClinicCards(T0 + 30_000)).toHaveLength(1)
    expect(await loadClinicCards(T0 + 31_000)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a remembered failure still answers with the last good list, without asking', async () => {
    fetchMock.mockResolvedValueOnce(ok([LV, NEW])).mockRejectedValueOnce(new Error('timeout'))
    await loadClinicCards(T0)
    await loadClinicCards(T0 + 6 * MIN)
    expect((await loadClinicCards(T0 + 6 * MIN + 5000))?.map((c) => c.id)).toEqual(['loc-lv', 'loc-new'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('an empty answer is remembered as a failure too, and is logged once, not per page view', async () => {
    fetchMock.mockResolvedValue(ok([]))
    for (const at of [T0, T0 + 1000, T0 + 2000]) expect(await loadClinicCards(at)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(errorLog).toHaveBeenCalledTimes(1)
  })

  it('callers that arrive while a read is in flight share it', async () => {
    let release: (r: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)))
    const calls = [loadClinicCards(T0), loadClinicCards(T0), loadClinicCards(T0)]
    await Promise.resolve()
    release(ok([LV]))
    for (const cards of await Promise.all(calls)) expect(cards).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('R45 — "could not ask" is null, never something that looks like an answer', () => {
  it.each([
    ['the API is unreachable', () => fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))],
    ['the API answers 429', () => fetchMock.mockResolvedValue(new Response('{}', { status: 429 }))],
    ['the API answers 500', () => fetchMock.mockResolvedValue(new Response('{}', { status: 500 }))],
    ['the body is not JSON', () => fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))],
    ['the body has no locations', () => fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))],
    ['a location has no name', () => fetchMock.mockResolvedValue(ok([{ id: 'x' }]))],
    ['a location has a non-text telephone', () => fetchMock.mockResolvedValue(ok([{ ...LV, phone: 969472111 }]))],
    // AN EMPTY LIST IS NOT "THE CLINIC HAS NO CLINICS". Every caller uses this
    // to tell a patient what to telephone; the published list is the better
    // thing to show for a wrong tenant variable or an empty database.
    ['the API lists no clinic at all', () => fetchMock.mockResolvedValue(ok([]))],
  ])('%s', async (_name, arrange) => {
    arrange()
    expect(await loadClinicCards()).toBeNull()
    expect(errorLog).toHaveBeenCalled()
  })

  it('the tenant variable is missing: null, and the API is never asked', async () => {
    vi.stubEnv('PORTAL_TENANT_ID', '')
    expect(await loadClinicCards()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a body that is not JSON is logged as that, without the parser quoting what it read', async () => {
    fetchMock.mockResolvedValue(new Response('<!DOCTYPE html><title>MARKER-IN-BODY</title>', { status: 200 }))
    expect(await loadClinicCards()).toBeNull()
    const logged = errorLog.mock.calls.flat().join(' ')
    expect(logged).toContain('not JSON')
    expect(logged).not.toMatch(/DOCTYPE|MARKER-IN-BODY|Unexpected token/)
  })

  it('logs that it failed, and neither the tenant nor what the API said', async () => {
    fetchMock.mockResolvedValue(ok([{ id: 'x', marker: 'ANSWER-BODY-MARKER' }]))
    await loadClinicCards()
    const logged = errorLog.mock.calls.flat().join(' ')
    expect(logged).toContain('[clinics] directory:')
    expect(logged).not.toContain(TENANT)
    expect(logged).not.toContain('ANSWER-BODY-MARKER')
  })
})

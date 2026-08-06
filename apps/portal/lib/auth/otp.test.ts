/**
 * W13-03 — the portal's login flow against a stubbed API.
 *
 * WHAT THESE TESTS ARE FOR. The API's own suite already proves the OTP
 * mechanism: single-use codes, attempt caps, the indistinguishable 401, the
 * 30-day device. None of that is re-tested here. What is untested until this
 * file exists is the PORTAL's half — that the outcomes reach the screen without
 * being widened, that both credentials are taken into this app's own cookies,
 * and that a 200 carrying nothing is not treated as a login.
 *
 * `next/headers` and the session module are stubbed because a vitest process has
 * no request context: `cookies()` throws outside one. The stubs record what was
 * written, which is exactly what these tests assert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const written = {
  session: [] as string[],
  device: [] as string[],
  deviceCleared: 0,
}

vi.mock('./session', () => ({
  writePortalSession: async (token: string) => {
    written.session.push(token)
  },
}))

vi.mock('./device', async () => {
  const actual = await vi.importActual<typeof import('./device')>('./device')
  return {
    // The extractor is the real one: it is the thing under test in half of these
    // cases, and stubbing it would leave the Set-Cookie parsing unproven.
    deviceTokenFromApiResponse: actual.deviceTokenFromApiResponse,
    readDeviceToken: async () => deviceCookie,
    writeDeviceToken: async (token: string) => {
      written.device.push(token)
    },
    clearDeviceToken: async () => {
      written.deviceCleared += 1
    },
  }
})

let deviceCookie: string | null = null

const TOKEN = 'a'.repeat(64)
const SESSION = 'opaque.session.token'

/** A response the API could actually have produced. */
function apiResponse(
  status: number,
  body?: unknown,
  setCookie?: string[],
): Response {
  const headers = new Headers()
  if (body !== undefined) headers.set('content-type', 'application/json')
  for (const c of setCookie ?? []) headers.append('set-cookie', c)
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  written.session = []
  written.device = []
  written.deviceCleared = 0
  deviceCookie = null
  process.env.PORTAL_TENANT_ID = 'tenant-under-test'
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('requestOtp', () => {
  it('reports SENT on 204 — the same answer for a known and an unknown number', async () => {
    const { requestOtp } = await import('./otp')
    fetchMock.mockResolvedValue(apiResponse(204))
    expect(await requestOtp('912345678')).toBe('sent')
  })

  it('sends the tenant and the phone, and nothing else', async () => {
    const { requestOtp } = await import('./otp')
    fetchMock.mockResolvedValue(apiResponse(204))
    await requestOtp('912345678')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/v1/auth/otp/request')
    expect(JSON.parse(init.body)).toEqual({ phone: '912345678', tenantId: 'tenant-under-test' })
  })

  it('distinguishes a malformed number from a refusal, and a rate limit from both', async () => {
    const { requestOtp } = await import('./otp')
    fetchMock.mockResolvedValue(apiResponse(400, { error: 'invalid_input' }))
    expect(await requestOtp('nonsense')).toBe('invalid_phone')

    fetchMock.mockResolvedValue(apiResponse(429, { error: 'rate_limited' }))
    expect(await requestOtp('912345678')).toBe('rate_limited')
  })

  it('a misconfigured tenant is UNAVAILABLE, never a refusal, and never a build failure', async () => {
    // The distinction PG7 exists for: the server is broken, the request was fine,
    // and the patient must not read it as "I typed my number wrong".
    delete process.env.PORTAL_TENANT_ID
    const { requestOtp } = await import('./otp')
    expect(await requestOtp('912345678')).toBe('unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names the VARIABLE in the log and never a value', async () => {
    delete process.env.PORTAL_TENANT_ID
    const { requestOtp } = await import('./otp')
    await requestOtp('912345678')
    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(logged).toContain('PORTAL_TENANT_ID')
    // PII rule #7: the number the patient typed is not in the log line.
    expect(logged).not.toContain('912345678')
  })

  it('a 503 from the API is unavailable, not sent', async () => {
    const { requestOtp } = await import('./otp')
    fetchMock.mockResolvedValue(apiResponse(503, { error: 'service_unavailable' }))
    expect(await requestOtp('912345678')).toBe('unavailable')
  })
})

describe('verifyOtp', () => {
  it('takes custody of BOTH credentials on success', async () => {
    const { verifyOtp } = await import('./otp')
    fetchMock.mockResolvedValue(
      apiResponse(200, { patientId: 'p1', sessionToken: SESSION }, [
        `__Host-ojp_session=${SESSION}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`,
        `__Host-ojp_device=${TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      ]),
    )

    expect(await verifyOtp('912345678', '123456')).toBe('ok')
    expect(written.session).toEqual([SESSION])
    // THE ASSERTION THIS CARD EXISTS FOR. The API's device cookie is host-scoped
    // to the API and can never reach the browser through a server-to-server
    // call; without this copy the 30-day device is written at every login and
    // read by nobody.
    expect(written.device).toEqual([TOKEN])
  })

  it('collapses every failure into one refusal', async () => {
    const { verifyOtp } = await import('./otp')
    fetchMock.mockResolvedValue(apiResponse(401, { error: 'unauthorized' }))
    expect(await verifyOtp('912345678', '000000')).toBe('refused')
    expect(written.session).toEqual([])
    expect(written.device).toEqual([])
  })

  it('a 200 with no session token is NOT a login', async () => {
    // A success-shaped nothing is the failure mode PG7 forbids: the patient would
    // be redirected into the portal holding no credential and bounced out again.
    const { verifyOtp } = await import('./otp')
    fetchMock.mockResolvedValue(apiResponse(200, { patientId: 'p1' }))
    expect(await verifyOtp('912345678', '123456')).toBe('unavailable')
    expect(written.session).toEqual([])
  })

  it('still signs the patient in when the device cookie is missing', async () => {
    // The 30-day convenience is best-effort. A login that worked must not be
    // failed because the extra credential did not arrive.
    const { verifyOtp } = await import('./otp')
    fetchMock.mockResolvedValue(apiResponse(200, { patientId: 'p1', sessionToken: SESSION }))
    expect(await verifyOtp('912345678', '123456')).toBe('ok')
    expect(written.session).toEqual([SESSION])
    expect(written.device).toEqual([])
  })

  it('ignores a device cookie of the wrong shape', async () => {
    const { verifyOtp } = await import('./otp')
    fetchMock.mockResolvedValue(
      apiResponse(200, { patientId: 'p1', sessionToken: SESSION }, [
        '__Host-ojp_device=not-a-token; Path=/; HttpOnly',
      ]),
    )
    expect(await verifyOtp('912345678', '123456')).toBe('ok')
    expect(written.device).toEqual([])
  })
})

describe('loginWithTrustedDevice', () => {
  it('asks nothing when the browser holds no device cookie', async () => {
    const { loginWithTrustedDevice } = await import('./otp')
    deviceCookie = null
    expect(await loginWithTrustedDevice()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards the token as a Cookie header — the header the API parses', async () => {
    const { loginWithTrustedDevice } = await import('./otp')
    deviceCookie = TOKEN
    fetchMock.mockResolvedValue(apiResponse(200, { patientId: 'p1', sessionToken: SESSION }))

    expect(await loginWithTrustedDevice()).toBe(true)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/v1/auth/otp/trusted')
    expect(init.headers.cookie).toBe(`__Host-ojp_device=${TOKEN}`)
    // The route takes no body at all, deliberately: no caller-supplied value can
    // disagree with the device row.
    expect(init.body).toBeUndefined()
    expect(written.session).toEqual([SESSION])
  })

  it('drops the cookie when the API refuses the device', async () => {
    const { loginWithTrustedDevice } = await import('./otp')
    deviceCookie = TOKEN
    fetchMock.mockResolvedValue(apiResponse(401, { error: 'unauthorized' }))

    expect(await loginWithTrustedDevice()).toBe(false)
    expect(written.deviceCleared).toBe(1)
  })

  it('KEEPS the cookie when the API is merely unreachable', async () => {
    // A network fault is not a refusal. Dropping a valid 30-day credential for
    // our outage would cost the patient an SMS.
    const { loginWithTrustedDevice } = await import('./otp')
    deviceCookie = TOKEN
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    expect(await loginWithTrustedDevice()).toBe(false)
    expect(written.deviceCleared).toBe(0)
  })

  it('does not mint a session from a 200 that carries no token', async () => {
    const { loginWithTrustedDevice } = await import('./otp')
    deviceCookie = TOKEN
    fetchMock.mockResolvedValue(apiResponse(200, { patientId: 'p1' }))

    expect(await loginWithTrustedDevice()).toBe(false)
    expect(written.session).toEqual([])
  })
})

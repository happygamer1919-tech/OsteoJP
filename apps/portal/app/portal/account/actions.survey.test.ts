/**
 * updateSurveyPrefAction: what the portal sends when a patient presses their
 * survey switch (SAT-01, S8).
 *
 * THE ROUND-TRIP RULE, AT ITS SOURCE. The two reminder switches must never move
 * when the survey switch does. The API writes only what it is sent, so the
 * guarantee starts here: the body is `surveyEnabled` and nothing else. The
 * reminder action, beside it, sends the two reminder switches and not this one.
 *
 * `fetch` is replaced and its one call is read back. The session, the cookies
 * and the cache are replaced because a vitest worker has none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/auth/session', () => ({
  readPortalSession: async () => 'session-token-fixture',
  clearPortalSession: async () => {},
}))
vi.mock('@/lib/auth/device', () => ({ readDeviceToken: async () => null, clearDeviceToken: async () => {} }))
vi.mock('@/lib/api/base', () => ({ apiBase: () => 'http://api.invalid' }))

import { updateReminderPrefsAction, updateSurveyPrefAction } from './actions'

type Call = { url: string; method?: string; body: unknown; authorization?: string }
let calls: Call[]
let answer: () => Promise<Response>

beforeEach(() => {
  calls = []
  revalidatePath.mockReset()
  answer = async () => new Response(JSON.stringify({ profile: {} }), { status: 200 })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({
      url,
      method: init?.method,
      body: JSON.parse(String(init?.body)),
      authorization: headers.Authorization,
    })
    return answer()
  })
})

describe('updateSurveyPrefAction', () => {
  it.each([true, false])('sends surveyEnabled=%s and no other key, as the signed-in patient', async (value) => {
    await expect(updateSurveyPrefAction(value)).resolves.toEqual({ ok: true })
    expect(calls).toEqual([
      {
        url: 'http://api.invalid/api/v1/patient/profile',
        method: 'PATCH',
        body: { surveyEnabled: value },
        authorization: 'Bearer session-token-fixture',
      },
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/portal/account')
  })

  it('a refusal from the API is not ok, and the page is not refreshed', async () => {
    for (const status of [400, 401, 422, 500]) {
      answer = async () => new Response(JSON.stringify({ error: 'x' }), { status })
      await expect(updateSurveyPrefAction(false), String(status)).resolves.toEqual({ ok: false })
    }
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a network failure is not ok', async () => {
    answer = async () => {
      throw new Error('offline')
    }
    await expect(updateSurveyPrefAction(false)).resolves.toEqual({ ok: false })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('the reminder action, beside it, does not send the survey switch', async () => {
    await updateReminderPrefsAction({ smsEnabled: false, emailEnabled: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body).toEqual({ reminderSmsEnabled: false, reminderEmailEnabled: true })
  })
})

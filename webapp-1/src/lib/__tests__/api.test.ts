import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiFetch, ApiError } from '@/lib/api'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('apiFetch', () => {
  it('sends credentials + JSON headers and returns parsed body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const body = await apiFetch<{ ok: boolean }>('/api/v1/thing')

    expect(body).toEqual({ ok: true })
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.credentials).toBe('include')
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('throws ApiError with status + parsed body on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: 401, message: 'nope' }), { status: 401 }),
        ),
    )

    await expect(apiFetch('/api/v1/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      body: { code: 401, message: 'nope' },
    })
  })

  it('returns null for an empty (204) body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 204 })))
    await expect(apiFetch('/api/v1/auth/logout', { method: 'POST' })).resolves.toBeNull()
  })

  it('does not let caller headers clobber credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/x', { headers: { 'X-Test': '1' } })
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.credentials).toBe('include')
    expect(opts.headers['X-Test']).toBe('1')
  })
})

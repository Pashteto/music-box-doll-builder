// Typed HTTP client for the dollbuilder backend (Plan 4).
// Static export → every call is a client-side fetch carrying the session cookie.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''

/** Thrown on any non-2xx response. `body` is the parsed JSON error ({code,message}) or null. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`)
    this.name = 'ApiError'
  }
}

/** Low-level fetch wrapper: prepends the API base, sends the session cookie, parses JSON. */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = opts
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

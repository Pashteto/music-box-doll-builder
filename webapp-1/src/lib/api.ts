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

/** Parse a response body as JSON, falling back to the raw text if it isn't JSON
 * (e.g. an HTML 502 page from a proxy/CDN) and to null for an empty body. */
function parseBody(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Low-level fetch wrapper: prepends the API base, sends the session cookie, parses
 * JSON. An empty body (e.g. a 204) yields `null` — type such endpoints `apiFetch<null>`.
 * Any non-2xx response throws `ApiError` carrying the parsed (or raw) body.
 */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = opts
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
  const body = parseBody(await res.text())
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

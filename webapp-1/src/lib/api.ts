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

export interface ApiUser {
  uuid: string
  email: string
  name: string
  status: 'active' | 'deleted'
  created_at?: string
  updated_at?: string
}

export interface AuthResult {
  user: ApiUser
}

export const authApi = {
  signup: (email: string, password: string) =>
    apiFetch<AuthResult>('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    apiFetch<AuthResult>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => apiFetch<null>('/api/v1/auth/logout', { method: 'POST' }),
  // /auth/me returns a BARE User (not wrapped in { user }).
  me: () => apiFetch<ApiUser>('/api/v1/auth/me'),
}

export interface ServerProject {
  uuid: string
  name: string
  data: Record<string, unknown>
  thumbnail?: string
  updated_at: string // RFC3339
  created_at: string
}

export interface ProjectInput {
  name: string
  data: Record<string, unknown>
  thumbnail?: string
  updated_at: string // RFC3339 — drives last-write-wins
}

export const projectsApi = {
  list: () => apiFetch<ServerProject[]>('/api/v1/projects'),
  upsert: (id: string, input: ProjectInput) =>
    apiFetch<ServerProject>(`/api/v1/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiFetch<null>(`/api/v1/projects/${id}`, { method: 'DELETE' }),
}

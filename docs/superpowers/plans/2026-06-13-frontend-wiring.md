# Frontend Wiring (Plan 4 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the live `dollbuilder` backend into the static Next.js frontend — real email/password auth, local-first project sync (last-write-wins), project thumbnails, and the mocked-paywall entitlement swap.

**Architecture:** Static export (no SSR/Node) → all backend calls are client-side `fetch(..., { credentials:'include' })` to `https://api.lindentar.pashteto.com`, carrying the `.pashteto.com` session cookie. A thin typed API client (`src/lib/api.ts`) wraps every endpoint; a Zustand `session` slice mirrors the existing slice pattern; a `sync` module holds pure last-write-wins merge logic plus the IndexedDB↔server orchestration. The entitlement slice swaps its localStorage stub for real API calls behind an unchanged hook interface. The entitlements backend (Plan 3) is **not deployed** — those calls are coded against the documented contract and degrade gracefully until it ships.

**Tech Stack:** Next.js 15 (App Router, `output: 'export'`), React 19, TypeScript (strict), Zustand 5, `idb`, three.js/R3F (thumbnail capture), Vitest + jsdom + Testing Library.

---

## Backend contract (verified against `webapp-1/backend/api/swagger.yaml`, basePath `/api/v1/`)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/v1/auth/signup` | `{ email, password }` | 200 `{ user: User }`; 409 dup email |
| POST | `/api/v1/auth/login` | `{ email, password }` | 200 `{ user: User }` (sets cookie); 401 bad creds |
| POST | `/api/v1/auth/logout` | – | 204 (clears cookie) |
| GET | `/api/v1/auth/me` | – | 200 **bare** `User`; 401 |
| GET | `/api/v1/projects` | – | 200 `Project[]` (newest first) |
| PUT | `/api/v1/projects/{id}` | `ProjectInput` | 200 `Project` |
| DELETE | `/api/v1/projects/{id}` | – | 204 |
| GET | `/api/v1/entitlements` | – | `{ entitled }` — **Plan 3, not deployed** |
| POST | `/api/v1/entitlements/mock-checkout` | – | `{ entitled }` — **Plan 3, not deployed** |

- `User` = `{ uuid, email, name, status, created_at?, updated_at? }` — note **`uuid`, not `id`**. Login/signup wrap it as `{ user }`; `/auth/me` returns it bare.
- `Project` = `{ uuid, name, data, thumbnail?, updated_at, created_at }`; `ProjectInput` = `{ name, data, thumbnail?, updated_at }`. `data` carries the full `DollProject` JSON. **`updated_at` is an RFC3339 string** server-side vs. **epoch-ms number** (`DollProject.updatedAt`) client-side — the sync layer converts both ways. `uuid` ↔ client `id`.
- Error body = `{ code, message, details? }`.

## File structure

| File | Responsibility |
|---|---|
| `webapp-1/.env.example` *(new)* | Documents `NEXT_PUBLIC_API_BASE`. |
| `webapp-1/src/lib/api.ts` *(new)* | `apiFetch`, `ApiError`, and `authApi`/`projectsApi`/`entitlementsApi` wrappers + their types. |
| `webapp-1/src/store/sessionSlice.ts` *(new)* | Session Zustand slice (`user`, login/signup/logout/fetchMe). |
| `webapp-1/src/store/types.ts`, `index.ts` *(edit)* | Register the session slice. |
| `webapp-1/src/modules/auth/useSession.ts` *(new)* | `useSession()` selector hook for components. |
| `webapp-1/src/modules/auth/AuthForm.tsx` *(new)* | Presentational email/password form. |
| `webapp-1/src/app/login/page.tsx`, `signup/page.tsx` *(new)* | Static auth route pages. |
| `webapp-1/src/modules/auth/SessionInit.tsx` *(new)* | App-load: `fetchMe` then `syncOnLogin`; renders null. |
| `webapp-1/src/modules/auth/AuthAffordance.tsx` *(new)* | "Log in" / "Log out" header control. |
| `webapp-1/src/app/layout.tsx`, `app/editor/page.tsx` *(edit)* | Mount `SessionInit` + affordance. |
| `webapp-1/src/modules/sync/merge.ts` *(new)* | Pure last-write-wins merge. |
| `webapp-1/src/modules/sync/mapping.ts` *(new)* | `DollProject` ↔ server `Project` conversion. |
| `webapp-1/src/modules/sync/useSync.ts` *(new)* | `syncOnLogin()` orchestration. |
| `webapp-1/src/modules/storage/thumbnail.ts` *(new)* | `captureThumbnail()` canvas downscale. |
| `webapp-1/src/modules/storage/useAutosave.ts` *(edit)* | Capture thumbnail + push to server when logged in. |
| `webapp-1/src/store/entitlementSlice.ts` *(edit)* | Swap stub for `/entitlements` calls; add `mockCheckout`. |
| `webapp-1/src/modules/paywall/PaywallScreen.tsx` *(edit)* | Wire Unlock → `mockCheckout` / login redirect. |

**All commands run from `webapp-1/`.** Test a single file with `npx vitest run <path>`; whole suite with `npm test`. Branch `feat/frontend-wiring` already exists with the design spec committed.

---

### Task 1: API client foundation (`apiFetch` + `ApiError`)

**Files:**
- Create: `webapp-1/.env.example`
- Create: `webapp-1/src/lib/api.ts`
- Test: `webapp-1/src/lib/__tests__/api.test.ts`

- [ ] **Step 1: Create the env example**

`webapp-1/.env.example`:

```
# Base URL of the dollbuilder backend (no trailing slash). Read at build time.
NEXT_PUBLIC_API_BASE=https://api.lindentar.pashteto.com
```

- [ ] **Step 2: Write the failing test**

`webapp-1/src/lib/__tests__/api.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiFetch, ApiError } from '@/lib/api'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('apiFetch', () => {
  it('sends credentials + JSON headers and returns parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
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
      vi.fn().mockResolvedValue(
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/api.test.ts`
Expected: FAIL — cannot resolve `@/lib/api`.

- [ ] **Step 4: Write minimal implementation**

`webapp-1/src/lib/api.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add webapp-1/.env.example webapp-1/src/lib/api.ts webapp-1/src/lib/__tests__/api.test.ts
git commit -m "feat(api): add typed apiFetch client + ApiError"
```

---

### Task 2: Auth API + session Zustand slice

**Files:**
- Modify: `webapp-1/src/lib/api.ts` (append auth wrapper)
- Create: `webapp-1/src/store/sessionSlice.ts`
- Modify: `webapp-1/src/store/types.ts`
- Modify: `webapp-1/src/store/index.ts`
- Create: `webapp-1/src/modules/auth/useSession.ts`
- Test: `webapp-1/src/store/__tests__/sessionSlice.test.ts`

- [ ] **Step 1: Append the auth API wrapper to `src/lib/api.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test**

`webapp-1/src/store/__tests__/sessionSlice.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  authApi: {
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

import { useAppStore } from '@/store'
import { authApi } from '@/lib/api'

const USER = { uuid: 'u1', email: 'a@b.com', name: 'A', status: 'active' as const }

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ user: null, sessionLoading: false })
})

describe('sessionSlice', () => {
  it('login stores the returned user', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ user: USER })
    await useAppStore.getState().login('a@b.com', 'pw')
    expect(useAppStore.getState().user).toEqual(USER)
  })

  it('signup stores the returned user', async () => {
    vi.mocked(authApi.signup).mockResolvedValue({ user: USER })
    await useAppStore.getState().signup('a@b.com', 'password8')
    expect(useAppStore.getState().user).toEqual(USER)
  })

  it('logout clears the user', async () => {
    useAppStore.setState({ user: USER })
    vi.mocked(authApi.logout).mockResolvedValue(null)
    await useAppStore.getState().logout()
    expect(useAppStore.getState().user).toBeNull()
  })

  it('fetchMe populates user on success', async () => {
    vi.mocked(authApi.me).mockResolvedValue(USER)
    await useAppStore.getState().fetchMe()
    expect(useAppStore.getState().user).toEqual(USER)
    expect(useAppStore.getState().sessionLoading).toBe(false)
  })

  it('fetchMe clears user on 401 (rejects)', async () => {
    useAppStore.setState({ user: USER })
    vi.mocked(authApi.me).mockRejectedValue(new Error('401'))
    await useAppStore.getState().fetchMe()
    expect(useAppStore.getState().user).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/sessionSlice.test.ts`
Expected: FAIL — `login` is not a function (slice not registered yet).

- [ ] **Step 4: Create the slice**

`webapp-1/src/store/sessionSlice.ts`:

```ts
import type { StateCreator } from 'zustand'
import type { AppState } from '@/store/types'
import { authApi, type ApiUser } from '@/lib/api'

export interface SessionSlice {
  user: ApiUser | null
  sessionLoading: boolean
  setUser: (user: ApiUser | null) => void
  signup: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
}

export const createSessionSlice: StateCreator<AppState, [], [], SessionSlice> = (set, get) => ({
  user: null,
  sessionLoading: false,
  setUser: (user) => set({ user }),
  signup: async (email, password) => {
    const { user } = await authApi.signup(email, password)
    set({ user })
  },
  login: async (email, password) => {
    const { user } = await authApi.login(email, password)
    set({ user })
  },
  logout: async () => {
    await authApi.logout()
    set({ user: null })
  },
  fetchMe: async () => {
    set({ sessionLoading: true })
    try {
      const user = await authApi.me()
      set({ user })
    } catch {
      set({ user: null }) // not authenticated (401) or offline
    } finally {
      set({ sessionLoading: false })
    }
  },
})
```

(The `get` param is unused now but kept for parity with sibling slices; if the linter flags it, drop it.)

- [ ] **Step 5: Register the slice in `src/store/types.ts`**

Replace the file with:

```ts
// Combined store shape — referenced by each slice creator for cross-slice access.
import type { CompositionSlice } from '@/store/compositionSlice'
import type { EditorSlice } from '@/store/editorSlice'
import type { EntitlementSlice } from '@/store/entitlementSlice'
import type { SessionSlice } from '@/store/sessionSlice'

export type AppState = CompositionSlice & EditorSlice & EntitlementSlice & SessionSlice
```

- [ ] **Step 6: Register the slice in `src/store/index.ts`**

Add the import and spread:

```ts
import { create } from 'zustand'
import type { AppState } from '@/store/types'
import { createCompositionSlice } from '@/store/compositionSlice'
import { createEditorSlice } from '@/store/editorSlice'
import { createEntitlementSlice } from '@/store/entitlementSlice'
import { createSessionSlice } from '@/store/sessionSlice'

/** The single global app store, assembled from feature slices. */
export const useAppStore = create<AppState>()((...a) => ({
  ...createCompositionSlice(...a),
  ...createEditorSlice(...a),
  ...createEntitlementSlice(...a),
  ...createSessionSlice(...a),
}))

export type { AppState }
```

- [ ] **Step 7: Create the `useSession` hook**

`webapp-1/src/modules/auth/useSession.ts`:

```ts
'use client'

import { useAppStore } from '@/store'

/** Component-facing session accessor: current user + auth actions. */
export function useSession() {
  const user = useAppStore((s) => s.user)
  const sessionLoading = useAppStore((s) => s.sessionLoading)
  const login = useAppStore((s) => s.login)
  const signup = useAppStore((s) => s.signup)
  const logout = useAppStore((s) => s.logout)
  return { user, sessionLoading, login, signup, logout }
}
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run src/store/__tests__/sessionSlice.test.ts && npm run typecheck`
Expected: PASS (5 tests); typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add webapp-1/src/lib/api.ts webapp-1/src/store/sessionSlice.ts webapp-1/src/store/types.ts webapp-1/src/store/index.ts webapp-1/src/modules/auth/useSession.ts webapp-1/src/store/__tests__/sessionSlice.test.ts
git commit -m "feat(auth): add session slice + authApi + useSession hook"
```

---

### Task 3: Auth form + login/signup routes

**Files:**
- Create: `webapp-1/src/modules/auth/AuthForm.tsx`
- Create: `webapp-1/src/app/login/page.tsx`
- Create: `webapp-1/src/app/signup/page.tsx`
- Test: `webapp-1/src/modules/auth/__tests__/AuthForm.test.tsx`

- [ ] **Step 1: Write the failing test**

`webapp-1/src/modules/auth/__tests__/AuthForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AuthForm } from '@/modules/auth/AuthForm'

describe('AuthForm', () => {
  it('renders the mode title', () => {
    render(<AuthForm mode="login" onSubmit={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('submits the typed email + password', () => {
    const onSubmit = vi.fn()
    render(<AuthForm mode="signup" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(onSubmit).toHaveBeenCalledWith('a@b.com', 'password8')
  })

  it('shows an error message when provided', () => {
    render(<AuthForm mode="login" onSubmit={() => {}} error="Invalid email or password." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
  })

  it('disables the submit button while pending', () => {
    render(<AuthForm mode="login" onSubmit={() => {}} pending />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/auth/__tests__/AuthForm.test.tsx`
Expected: FAIL — cannot resolve `@/modules/auth/AuthForm`.

- [ ] **Step 3: Create `AuthForm`**

`webapp-1/src/modules/auth/AuthForm.tsx`:

```tsx
'use client'

import { useState, type FormEvent } from 'react'

interface AuthFormProps {
  mode: 'login' | 'signup'
  onSubmit: (email: string, password: string) => void
  error?: string | null
  pending?: boolean
}

export function AuthForm({ mode, onSubmit, error, pending }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const title = mode === 'login' ? 'Log in' : 'Create account'

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(email, password)
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          aria-label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-foreground/15 px-4 py-3"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          aria-label="Password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-foreground/15 px-4 py-3"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {pending ? '…' : title}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/auth/__tests__/AuthForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the login route page**

`webapp-1/src/app/login/page.tsx`:

```tsx
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthForm } from '@/modules/auth/AuthForm'
import { useSession } from '@/modules/auth/useSession'
import { ApiError } from '@/lib/api'

function LoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { login } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const next = params.get('next') || '/editor'

  const onSubmit = async (email: string, password: string) => {
    setPending(true)
    setError(null)
    try {
      await login(email, password)
      router.push(next)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'Invalid email or password.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }

  const signupHref = next === '/editor' ? '/signup' : `/signup?next=${encodeURIComponent(next)}`

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-6">
      <AuthForm mode="login" onSubmit={onSubmit} error={error} pending={pending} />
      <a href={signupHref} className="text-sm text-foreground/70 underline">
        Create an account
      </a>
    </main>
  )
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary under static export.
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}
```

- [ ] **Step 6: Create the signup route page**

`webapp-1/src/app/signup/page.tsx`:

```tsx
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthForm } from '@/modules/auth/AuthForm'
import { useSession } from '@/modules/auth/useSession'
import { ApiError } from '@/lib/api'

function SignupInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { signup } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const next = params.get('next') || '/editor'

  const onSubmit = async (email: string, password: string) => {
    setPending(true)
    setError(null)
    try {
      await signup(email, password)
      router.push(next)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'That email is already registered.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }

  const loginHref = next === '/editor' ? '/login' : `/login?next=${encodeURIComponent(next)}`

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-6">
      <AuthForm mode="signup" onSubmit={onSubmit} error={error} pending={pending} />
      <a href={loginHref} className="text-sm text-foreground/70 underline">
        Already have an account? Log in
      </a>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupInner />
    </Suspense>
  )
}
```

- [ ] **Step 7: Verify the static build emits both routes**

Run: `npm run build`
Expected: build succeeds; output lists `/login` and `/signup` (and `out/login/index.html`, `out/signup/index.html` exist because of `trailingSlash: true`).

- [ ] **Step 8: Commit**

```bash
git add webapp-1/src/modules/auth/AuthForm.tsx webapp-1/src/app/login/page.tsx webapp-1/src/app/signup/page.tsx webapp-1/src/modules/auth/__tests__/AuthForm.test.tsx
git commit -m "feat(auth): add AuthForm + static /login and /signup routes"
```

---

### Task 4: Projects API + pure last-write-wins merge

**Files:**
- Modify: `webapp-1/src/lib/api.ts` (append projects wrapper)
- Create: `webapp-1/src/modules/sync/merge.ts`
- Test: `webapp-1/src/modules/sync/__tests__/merge.test.ts`

- [ ] **Step 1: Append the projects API wrapper to `src/lib/api.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test**

`webapp-1/src/modules/sync/__tests__/merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeProjects } from '@/modules/sync/merge'
import { createEmptySlotSelections, type DollProject } from '@/lib/types'

function proj(id: string, updatedAt: number): DollProject {
  return {
    id,
    name: id,
    createdAt: updatedAt,
    updatedAt,
    currentStep: 0,
    slotSelections: createEmptySlotSelections(),
    sceneBackground: null,
    sceneForeground: null,
    sceneProps: [],
    musicTrackId: null,
    videoDuration: 10,
    thumbnailDataUrl: null,
  }
}

describe('mergeProjects (last-write-wins)', () => {
  it('pushes a local-only project', () => {
    const { toApply, toPush } = mergeProjects([proj('a', 100)], [])
    expect(toPush.map((p) => p.id)).toEqual(['a'])
    expect(toApply).toEqual([])
  })

  it('applies a server-only project', () => {
    const { toApply, toPush } = mergeProjects([], [proj('b', 100)])
    expect(toApply.map((p) => p.id)).toEqual(['b'])
    expect(toPush).toEqual([])
  })

  it('on conflict, the newer side wins', () => {
    const localNewer = mergeProjects([proj('c', 200)], [proj('c', 100)])
    expect(localNewer.toPush.map((p) => p.id)).toEqual(['c'])
    expect(localNewer.toApply).toEqual([])

    const serverNewer = mergeProjects([proj('d', 100)], [proj('d', 200)])
    expect(serverNewer.toApply.map((p) => p.id)).toEqual(['d'])
    expect(serverNewer.toPush).toEqual([])
  })

  it('equal timestamps are a no-op', () => {
    const { toApply, toPush } = mergeProjects([proj('e', 100)], [proj('e', 100)])
    expect(toApply).toEqual([])
    expect(toPush).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/modules/sync/__tests__/merge.test.ts`
Expected: FAIL — cannot resolve `@/modules/sync/merge`.

- [ ] **Step 4: Implement `merge.ts`**

`webapp-1/src/modules/sync/merge.ts`:

```ts
import type { DollProject } from '@/lib/types'

export interface MergeResult {
  /** Server-or-newer projects to write into local IndexedDB. */
  toApply: DollProject[]
  /** Local-only or locally-newer projects to push to the server. */
  toPush: DollProject[]
}

/**
 * Last-write-wins per project id by `updatedAt` (epoch ms). Inputs are both in
 * client `DollProject` shape — the caller maps server projects first.
 */
export function mergeProjects(local: DollProject[], server: DollProject[]): MergeResult {
  const byId = new Map<string, { local?: DollProject; server?: DollProject }>()
  for (const p of local) byId.set(p.id, { ...byId.get(p.id), local: p })
  for (const p of server) byId.set(p.id, { ...byId.get(p.id), server: p })

  const toApply: DollProject[] = []
  const toPush: DollProject[] = []
  for (const { local: l, server: s } of byId.values()) {
    if (l && s) {
      if (l.updatedAt > s.updatedAt) toPush.push(l)
      else if (s.updatedAt > l.updatedAt) toApply.push(s)
      // equal → already in sync
    } else if (s) {
      toApply.push(s)
    } else if (l) {
      toPush.push(l)
    }
  }
  return { toApply, toPush }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/sync/__tests__/merge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add webapp-1/src/lib/api.ts webapp-1/src/modules/sync/merge.ts webapp-1/src/modules/sync/__tests__/merge.test.ts
git commit -m "feat(sync): add projectsApi + pure last-write-wins merge"
```

---

### Task 5: Project mapping + `syncOnLogin` orchestration

**Files:**
- Create: `webapp-1/src/modules/sync/mapping.ts`
- Create: `webapp-1/src/modules/sync/useSync.ts`
- Test: `webapp-1/src/modules/sync/__tests__/mapping.test.ts`
- Test: `webapp-1/src/modules/sync/__tests__/useSync.test.ts`

- [ ] **Step 1: Write the failing mapping test**

`webapp-1/src/modules/sync/__tests__/mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toProjectInput, fromServerProject } from '@/modules/sync/mapping'
import { createEmptySlotSelections, type DollProject } from '@/lib/types'
import type { ServerProject } from '@/lib/api'

const local: DollProject = {
  id: 'p1',
  name: 'My Doll',
  createdAt: 0,
  updatedAt: Date.parse('2026-06-13T10:00:00Z'),
  currentStep: 2,
  slotSelections: createEmptySlotSelections(),
  sceneBackground: null,
  sceneForeground: null,
  sceneProps: [],
  musicTrackId: null,
  videoDuration: 10,
  thumbnailDataUrl: 'data:image/jpeg;base64,xxx',
}

describe('project mapping', () => {
  it('toProjectInput converts epoch-ms updatedAt to RFC3339 + carries data/thumbnail', () => {
    const input = toProjectInput(local)
    expect(input.name).toBe('My Doll')
    expect(input.updated_at).toBe('2026-06-13T10:00:00.000Z')
    expect(input.thumbnail).toBe('data:image/jpeg;base64,xxx')
    expect((input.data as unknown as DollProject).currentStep).toBe(2)
  })

  it('fromServerProject normalizes uuid→id and parses updated_at to epoch ms', () => {
    const sp: ServerProject = {
      uuid: 'server-uuid',
      name: 'Server Doll',
      data: { ...local, id: 'server-uuid', name: 'Server Doll' } as unknown as Record<string, unknown>,
      thumbnail: 'data:image/jpeg;base64,yyy',
      updated_at: '2026-06-13T12:00:00Z',
      created_at: '2026-06-13T09:00:00Z',
    }
    const dp = fromServerProject(sp)
    expect(dp.id).toBe('server-uuid')
    expect(dp.name).toBe('Server Doll')
    expect(dp.updatedAt).toBe(Date.parse('2026-06-13T12:00:00Z'))
    expect(dp.thumbnailDataUrl).toBe('data:image/jpeg;base64,yyy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/sync/__tests__/mapping.test.ts`
Expected: FAIL — cannot resolve `@/modules/sync/mapping`.

- [ ] **Step 3: Implement `mapping.ts`**

`webapp-1/src/modules/sync/mapping.ts`:

```ts
import type { DollProject } from '@/lib/types'
import type { ServerProject, ProjectInput } from '@/lib/api'

/** Client DollProject → server upsert payload. Epoch-ms `updatedAt` → RFC3339. */
export function toProjectInput(p: DollProject): ProjectInput {
  return {
    name: p.name,
    data: p as unknown as Record<string, unknown>,
    thumbnail: p.thumbnailDataUrl ?? undefined,
    updated_at: new Date(p.updatedAt).toISOString(),
  }
}

/**
 * Server project → client DollProject. The full project rides in `data`; we
 * normalize id/name/thumbnail/updatedAt from the authoritative server columns.
 */
export function fromServerProject(sp: ServerProject): DollProject {
  const d = sp.data as unknown as DollProject
  return {
    ...d,
    id: sp.uuid,
    name: sp.name,
    thumbnailDataUrl: sp.thumbnail ?? null,
    updatedAt: Date.parse(sp.updated_at),
  }
}
```

- [ ] **Step 4: Run mapping test to verify it passes**

Run: `npx vitest run src/modules/sync/__tests__/mapping.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing `useSync` test**

`webapp-1/src/modules/sync/__tests__/useSync.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  projectsApi: { list: vi.fn(), upsert: vi.fn(), remove: vi.fn() },
}))

import { syncOnLogin } from '@/modules/sync/useSync'
import { projectsApi, type ServerProject } from '@/lib/api'
import { saveProject, listProjects, deleteProject } from '@/modules/storage/projectStorage'
import { createEmptySlotSelections, type DollProject } from '@/lib/types'

function local(id: string, updatedAt: number): DollProject {
  return {
    id,
    name: id,
    createdAt: updatedAt,
    updatedAt,
    currentStep: 0,
    slotSelections: createEmptySlotSelections(),
    sceneBackground: null,
    sceneForeground: null,
    sceneProps: [],
    musicTrackId: null,
    videoDuration: 10,
    thumbnailDataUrl: null,
  }
}

function server(id: string, iso: string): ServerProject {
  return {
    uuid: id,
    name: id,
    data: { ...local(id, Date.parse(iso)) } as unknown as Record<string, unknown>,
    updated_at: iso,
    created_at: iso,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  for (const p of await listProjects()) await deleteProject(p.id)
})

describe('syncOnLogin', () => {
  it('pushes local-only drafts and applies server-only projects', async () => {
    await saveProject(local('local-only', 100))
    vi.mocked(projectsApi.list).mockResolvedValue([server('server-only', '2026-06-13T10:00:00Z')])
    vi.mocked(projectsApi.upsert).mockResolvedValue(server('local-only', '2026-06-13T09:00:00Z'))

    await syncOnLogin()

    // server-only got written locally
    const ids = (await listProjects()).map((p) => p.id).sort()
    expect(ids).toContain('server-only')
    // local-only got pushed
    expect(vi.mocked(projectsApi.upsert)).toHaveBeenCalledWith('local-only', expect.objectContaining({ name: 'local-only' }))
  })

  it('swallows API failures (best-effort)', async () => {
    await saveProject(local('x', 100))
    vi.mocked(projectsApi.list).mockRejectedValue(new Error('network'))
    await expect(syncOnLogin()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/modules/sync/__tests__/useSync.test.ts`
Expected: FAIL — cannot resolve `@/modules/sync/useSync`.

- [ ] **Step 7: Implement `useSync.ts`**

`webapp-1/src/modules/sync/useSync.ts`:

```ts
'use client'

import { projectsApi } from '@/lib/api'
import { saveProject, listProjects } from '@/modules/storage/projectStorage'
import { mergeProjects } from '@/modules/sync/merge'
import { fromServerProject, toProjectInput } from '@/modules/sync/mapping'

/**
 * Pull the user's server projects, last-write-wins merge with local IndexedDB
 * drafts, write the winners locally, and push local-only/locally-newer drafts.
 * Best-effort: any failure is swallowed so a backend hiccup never blocks the app.
 */
export async function syncOnLogin(): Promise<void> {
  try {
    const [local, serverRaw] = await Promise.all([listProjects(), projectsApi.list()])
    const server = serverRaw.map(fromServerProject)
    const { toApply, toPush } = mergeProjects(local, server)
    await Promise.all(toApply.map((p) => saveProject(p)))
    await Promise.all(toPush.map((p) => projectsApi.upsert(p.id, toProjectInput(p))))
  } catch {
    // best-effort — IndexedDB remains the source of truth
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/modules/sync/`
Expected: PASS (mapping + useSync + merge from Task 4).

- [ ] **Step 9: Commit**

```bash
git add webapp-1/src/modules/sync/mapping.ts webapp-1/src/modules/sync/useSync.ts webapp-1/src/modules/sync/__tests__/mapping.test.ts webapp-1/src/modules/sync/__tests__/useSync.test.ts
git commit -m "feat(sync): add project mapping + syncOnLogin orchestration"
```

---

### Task 6: Thumbnail capture

**Files:**
- Create: `webapp-1/src/modules/storage/thumbnail.ts`
- Test: `webapp-1/src/modules/storage/__tests__/thumbnail.test.ts`

- [ ] **Step 1: Write the failing test**

`webapp-1/src/modules/storage/__tests__/thumbnail.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { captureThumbnail, THUMB_WIDTH, THUMB_HEIGHT } from '@/modules/storage/thumbnail'

describe('captureThumbnail', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns null when there is no source canvas and none in the DOM', () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(null)
    expect(captureThumbnail(null)).toBeNull()
  })

  it('downscales the source canvas to a JPEG data URL', () => {
    const drawImage = vi.fn()
    const offscreen = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage }),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,zzz'),
    } as unknown as HTMLCanvasElement
    vi.spyOn(document, 'createElement').mockReturnValue(offscreen)

    const source = {} as HTMLCanvasElement
    const url = captureThumbnail(source)

    expect(url).toBe('data:image/jpeg;base64,zzz')
    expect(offscreen.width).toBe(THUMB_WIDTH)
    expect(offscreen.height).toBe(THUMB_HEIGHT)
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, THUMB_WIDTH, THUMB_HEIGHT)
  })

  it('returns null when the 2D context is unavailable', () => {
    const offscreen = {
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLCanvasElement
    vi.spyOn(document, 'createElement').mockReturnValue(offscreen)
    expect(captureThumbnail({} as HTMLCanvasElement)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/storage/__tests__/thumbnail.test.ts`
Expected: FAIL — cannot resolve `@/modules/storage/thumbnail`.

- [ ] **Step 3: Implement `thumbnail.ts`**

`webapp-1/src/modules/storage/thumbnail.ts`:

```ts
'use client'

/** Portrait thumbnail dimensions (matches the 9:16 stage, downscaled). */
export const THUMB_WIDTH = 180
export const THUMB_HEIGHT = 320

/**
 * Downscale a source canvas to a small JPEG data URL. The R3F <Canvas> sets
 * `preserveDrawingBuffer: true`, so the live WebGL canvas can be read directly.
 * Returns null when no canvas / no 2D context (SSR, private mode, headless).
 */
export function captureThumbnail(source?: HTMLCanvasElement | null): string | null {
  const canvas =
    source ?? (typeof document !== 'undefined' ? document.querySelector('canvas') : null)
  if (!canvas) return null

  const off = document.createElement('canvas')
  off.width = THUMB_WIDTH
  off.height = THUMB_HEIGHT
  const ctx = off.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(canvas, 0, 0, THUMB_WIDTH, THUMB_HEIGHT)
  return off.toDataURL('image/jpeg', 0.6)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/storage/__tests__/thumbnail.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp-1/src/modules/storage/thumbnail.ts webapp-1/src/modules/storage/__tests__/thumbnail.test.ts
git commit -m "feat(storage): add canvas thumbnail capture"
```

---

### Task 7: Autosave — thumbnail + server push when logged in

**Files:**
- Modify: `webapp-1/src/modules/storage/useAutosave.ts`
- Test: `webapp-1/src/modules/storage/__tests__/useAutosave.test.ts`

- [ ] **Step 1: Write the failing test**

`webapp-1/src/modules/storage/__tests__/useAutosave.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/modules/storage/projectStorage', () => ({ saveProject: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/api', () => ({ projectsApi: { upsert: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/modules/storage/thumbnail', () => ({ captureThumbnail: vi.fn().mockReturnValue('data:image/jpeg;base64,thumb') }))

import { flushProject } from '@/modules/storage/useAutosave'
import { useAppStore } from '@/store'
import { saveProject } from '@/modules/storage/projectStorage'
import { projectsApi } from '@/lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ projectId: null, user: null })
})

describe('flushProject', () => {
  it('does nothing when no project is open', () => {
    flushProject()
    expect(saveProject).not.toHaveBeenCalled()
  })

  it('saves locally with a captured thumbnail; does NOT push when logged out', () => {
    useAppStore.setState({ projectId: 'p1', projectName: 'Doll', user: null })
    flushProject()
    expect(saveProject).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveProject).mock.calls[0][0].thumbnailDataUrl).toBe('data:image/jpeg;base64,thumb')
    expect(projectsApi.upsert).not.toHaveBeenCalled()
  })

  it('also pushes to the server when logged in', () => {
    useAppStore.setState({
      projectId: 'p1',
      projectName: 'Doll',
      user: { uuid: 'u', email: 'e', name: 'n', status: 'active' },
    })
    flushProject()
    expect(projectsApi.upsert).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Doll' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/storage/__tests__/useAutosave.test.ts`
Expected: FAIL — `flushProject` is not exported.

- [ ] **Step 3: Rewrite `useAutosave.ts`**

Replace the file with (snapshot now captures a thumbnail; logic extracted into the testable `flushProject`):

```ts
'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { saveProject } from '@/modules/storage/projectStorage'
import { captureThumbnail } from '@/modules/storage/thumbnail'
import { projectsApi } from '@/lib/api'
import { toProjectInput } from '@/modules/sync/mapping'
import type { DollProject } from '@/lib/types'

/** Build a serializable project snapshot from the live store (null if no project open). */
function snapshot(): DollProject | null {
  const s = useAppStore.getState()
  if (!s.projectId) return null
  return {
    id: s.projectId,
    name: s.projectName,
    createdAt: s.projectCreatedAt || Date.now(),
    updatedAt: Date.now(),
    currentStep: s.currentStep,
    slotSelections: s.slotSelections,
    sceneBackground: s.sceneBackground,
    sceneForeground: s.sceneForeground,
    sceneProps: s.sceneProps,
    musicTrackId: s.musicTrackId,
    videoDuration: s.videoDuration,
    thumbnailDataUrl: captureThumbnail(),
  }
}

/**
 * Persist the current project: always to IndexedDB, and — when logged in —
 * additionally push to the server (best-effort). Exported for testing.
 */
export function flushProject(): void {
  const project = snapshot()
  if (!project) return
  void saveProject(project).catch(() => {})
  if (useAppStore.getState().user) {
    void projectsApi.upsert(project.id, toProjectInput(project)).catch(() => {})
  }
}

/**
 * Debounced autosave (E4-T2): persists 1s after any store change and immediately
 * on tab close. Silent on failure (IndexedDB / network may be unavailable).
 */
export function useAutosave(enabled = true): void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flushProject, 1000)
    }

    const unsubscribe = useAppStore.subscribe(schedule)
    window.addEventListener('beforeunload', flushProject)

    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', flushProject)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled])
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/modules/storage/__tests__/useAutosave.test.ts && npm run typecheck`
Expected: PASS (3 tests); typecheck clean.

> Note: the test references `projectName` / `projectCreatedAt` on the store — these already exist (used by the original `snapshot`). If `projectCreatedAt` is named differently, match the existing field in `compositionSlice`/`editorSlice`.

- [ ] **Step 5: Commit**

```bash
git add webapp-1/src/modules/storage/useAutosave.ts webapp-1/src/modules/storage/__tests__/useAutosave.test.ts
git commit -m "feat(storage): capture thumbnail + push to server on autosave when logged in"
```

---

### Task 8: Entitlement swap (mocked-paywall contract)

**Files:**
- Modify: `webapp-1/src/lib/api.ts` (append entitlements wrapper)
- Modify: `webapp-1/src/store/entitlementSlice.ts`
- Test: `webapp-1/src/store/__tests__/entitlementSlice.test.ts`

- [ ] **Step 1: Append the entitlements API wrapper to `src/lib/api.ts`**

```ts
// Plan 3 contract (backend NOT deployed yet) — documented in the parent design.
export interface Entitlement {
  entitled: boolean
}

export const entitlementsApi = {
  get: () => apiFetch<Entitlement>('/api/v1/entitlements'),
  mockCheckout: () =>
    apiFetch<Entitlement>('/api/v1/entitlements/mock-checkout', { method: 'POST' }),
}
```

- [ ] **Step 2: Check for existing `checkEntitlement` callers**

Run: `grep -rn "checkEntitlement" webapp-1/src`
Expected: only the slice definition (and possibly `useEntitlement.ts`). If any caller passes a `sessionId` argument, note it — Step 4 changes the signature to take no argument. Update such callers to call `checkEntitlement()`.

- [ ] **Step 3: Write the failing test**

`webapp-1/src/store/__tests__/entitlementSlice.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  entitlementsApi: { get: vi.fn(), mockCheckout: vi.fn() },
}))

import { useAppStore } from '@/store'
import { entitlementsApi } from '@/lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ entitled: false })
})

describe('entitlementSlice (server-backed)', () => {
  it('checkEntitlement sets + returns the server value', async () => {
    vi.mocked(entitlementsApi.get).mockResolvedValue({ entitled: true })
    const result = await useAppStore.getState().checkEntitlement()
    expect(result).toBe(true)
    expect(useAppStore.getState().entitled).toBe(true)
  })

  it('checkEntitlement keeps current value on network failure', async () => {
    useAppStore.setState({ entitled: false })
    vi.mocked(entitlementsApi.get).mockRejectedValue(new Error('offline'))
    await expect(useAppStore.getState().checkEntitlement()).resolves.toBe(false)
    expect(useAppStore.getState().entitled).toBe(false)
  })

  it('mockCheckout sets entitled from the response', async () => {
    vi.mocked(entitlementsApi.mockCheckout).mockResolvedValue({ entitled: true })
    const result = await useAppStore.getState().mockCheckout()
    expect(result).toBe(true)
    expect(useAppStore.getState().entitled).toBe(true)
  })
})
```

- [ ] **Step 4: Rewrite `entitlementSlice.ts`**

```ts
import type { StateCreator } from 'zustand'
import type { AppState } from '@/store/types'
import { entitlementsApi } from '@/lib/api'

// Entitlement state. `entitled` now comes from the backend (Plan 3 contract).
// First-export-free remains a client-side localStorage gate (see useEntitlement).
export interface EntitlementSlice {
  entitled: boolean
  firstExportUsed: boolean
  entitlementLoading: boolean

  setEntitled: (entitled: boolean) => void
  markFirstExportUsed: () => void
  setFirstExportUsed: (used: boolean) => void
  /** Fetch entitlement for the current session; returns the (new) entitled value. */
  checkEntitlement: () => Promise<boolean>
  /** Mocked checkout — grants entitlement server-side (no Stripe). */
  mockCheckout: () => Promise<boolean>
}

export const createEntitlementSlice: StateCreator<AppState, [], [], EntitlementSlice> = (
  set,
  get,
) => ({
  entitled: false,
  firstExportUsed: false,
  entitlementLoading: false,

  setEntitled: (entitled) => set({ entitled }),
  markFirstExportUsed: () => set({ firstExportUsed: true }),
  setFirstExportUsed: (used) => set({ firstExportUsed: used }),

  checkEntitlement: async () => {
    set({ entitlementLoading: true })
    try {
      const { entitled } = await entitlementsApi.get()
      set({ entitled })
      return entitled
    } catch {
      // Network/Plan-3-not-deployed: keep current value (client first-free gate still applies).
      return get().entitled
    } finally {
      set({ entitlementLoading: false })
    }
  },

  mockCheckout: async () => {
    const { entitled } = await entitlementsApi.mockCheckout()
    set({ entitled })
    return entitled
  },
})
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/store/__tests__/entitlementSlice.test.ts && npm run typecheck`
Expected: PASS (3 tests); typecheck clean. If typecheck flags a removed-argument caller, fix it per Step 2.

- [ ] **Step 6: Commit**

```bash
git add webapp-1/src/lib/api.ts webapp-1/src/store/entitlementSlice.ts webapp-1/src/store/__tests__/entitlementSlice.test.ts
git commit -m "feat(entitlements): swap localStorage stub for /entitlements API + mockCheckout"
```

---

### Task 9: Wire the paywall to mock-checkout

**Files:**
- Modify: `webapp-1/src/modules/paywall/PaywallScreen.tsx`
- Test: `webapp-1/src/modules/paywall/__tests__/PaywallScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

`webapp-1/src/modules/paywall/__tests__/PaywallScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { PaywallScreen } from '@/modules/paywall/PaywallScreen'
import { useAppStore } from '@/store'

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ user: null, entitled: false, mockCheckout: vi.fn().mockResolvedValue(true) })
})

describe('PaywallScreen', () => {
  it('redirects to /login when unlocking while logged out', () => {
    render(<PaywallScreen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    expect(push).toHaveBeenCalledWith('/login?next=/editor')
  })

  it('calls mockCheckout when unlocking while logged in', async () => {
    const mockCheckout = vi.fn().mockResolvedValue(true)
    useAppStore.setState({
      user: { uuid: 'u', email: 'e', name: 'n', status: 'active' },
      mockCheckout,
    })
    const onClose = vi.fn()
    render(<PaywallScreen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    await waitFor(() => expect(mockCheckout).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/paywall/__tests__/PaywallScreen.test.tsx`
Expected: FAIL — current button is disabled / no router wiring.

- [ ] **Step 3: Rewrite `PaywallScreen.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'

// Mocked paywall (Plan 4): real entitlement endpoint, Stripe still mocked.
// Logged-out users are routed to /login; logged-in users hit mock-checkout.
interface PaywallScreenProps {
  onClose: () => void
}

export function PaywallScreen({ onClose }: PaywallScreenProps) {
  const router = useRouter()
  const user = useAppStore((s) => s.user)
  const mockCheckout = useAppStore((s) => s.mockCheckout)
  const [pending, setPending] = useState(false)

  const handleUnlock = async () => {
    if (!user) {
      router.push('/login?next=/editor')
      return
    }
    setPending(true)
    try {
      await mockCheckout()
      onClose()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
        <div className="mb-3 text-4xl">🔓</div>
        <h2 className="text-xl font-bold">Unlock more exports</h2>
        <p className="mt-2 text-sm text-foreground/60">
          Your first export was free. Unlock unlimited exports.
        </p>
        <button
          type="button"
          onClick={handleUnlock}
          disabled={pending}
          className="mt-5 w-full rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Unlocking…' : user ? 'Unlock Export' : 'Log in to unlock'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-2 text-sm text-foreground/70"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/paywall/__tests__/PaywallScreen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp-1/src/modules/paywall/PaywallScreen.tsx webapp-1/src/modules/paywall/__tests__/PaywallScreen.test.tsx
git commit -m "feat(paywall): wire Unlock to mock-checkout + login redirect"
```

---

### Task 10: App-load hydration + login affordance

**Files:**
- Create: `webapp-1/src/modules/auth/SessionInit.tsx`
- Create: `webapp-1/src/modules/auth/AuthAffordance.tsx`
- Modify: `webapp-1/src/app/layout.tsx`
- Modify: `webapp-1/src/app/editor/page.tsx`
- Test: `webapp-1/src/modules/auth/__tests__/AuthAffordance.test.tsx`

- [ ] **Step 1: Create `SessionInit`**

`webapp-1/src/modules/auth/SessionInit.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { syncOnLogin } from '@/modules/sync/useSync'

/** App-load: hydrate the session once, then sync projects when a user appears. Renders nothing. */
export function SessionInit() {
  const fetchMe = useAppStore((s) => s.fetchMe)
  const user = useAppStore((s) => s.user)
  const synced = useRef(false)

  useEffect(() => {
    void fetchMe()
  }, [fetchMe])

  useEffect(() => {
    if (user && !synced.current) {
      synced.current = true
      void syncOnLogin()
    }
  }, [user])

  return null
}
```

- [ ] **Step 2: Mount `SessionInit` in `src/app/layout.tsx`**

Add the import and render it inside `<body>` (server component rendering a client child is fine):

```tsx
import { SessionInit } from '@/modules/auth/SessionInit'
```

Change the body to:

```tsx
      <body className="flex min-h-full flex-col">
        <SessionInit />
        {children}
      </body>
```

- [ ] **Step 3: Write the failing affordance test**

`webapp-1/src/modules/auth/__tests__/AuthAffordance.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { AuthAffordance } from '@/modules/auth/AuthAffordance'
import { useAppStore } from '@/store'

beforeEach(() => {
  useAppStore.setState({ user: null, logout: vi.fn().mockResolvedValue(undefined) })
})

describe('AuthAffordance', () => {
  it('shows a Log in link when logged out', () => {
    render(<AuthAffordance />)
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login')
  })

  it('shows the email + a Log out button when logged in', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ user: { uuid: 'u', email: 'me@x.com', name: 'n', status: 'active' }, logout })
    render(<AuthAffordance />)
    expect(screen.getByText('me@x.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/modules/auth/__tests__/AuthAffordance.test.tsx`
Expected: FAIL — cannot resolve `@/modules/auth/AuthAffordance`.

- [ ] **Step 5: Create `AuthAffordance`**

`webapp-1/src/modules/auth/AuthAffordance.tsx`:

```tsx
'use client'

import { useSession } from '@/modules/auth/useSession'

/** Small header control: "Log in" link when guest, email + "Log out" when authed. */
export function AuthAffordance() {
  const { user, logout } = useSession()

  if (!user) {
    return (
      <a href="/login" className="text-sm font-medium text-foreground/70 underline">
        Log in
      </a>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-foreground/60">{user.email}</span>
      <button
        type="button"
        onClick={() => void logout()}
        className="font-medium text-foreground/70 underline"
      >
        Log out
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/modules/auth/__tests__/AuthAffordance.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Mount the affordance in the editor header**

In `webapp-1/src/app/editor/page.tsx`, add the import:

```tsx
import { AuthAffordance } from '@/modules/auth/AuthAffordance'
```

Render `<AuthAffordance />` in the editor's top bar. Locate the header/top-row element of the editor layout and add it to the right side, e.g.:

```tsx
        <AuthAffordance />
```

If the editor has no header row, wrap the screen in a top bar:

```tsx
        <header className="flex items-center justify-end px-4 py-2">
          <AuthAffordance />
        </header>
```

- [ ] **Step 8: Full verification — suite, types, lint, build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all green. Build emits `/login`, `/signup`, `/editor` static routes. Confirm no `'use client'`-in-server-component errors from `SessionInit`/`AuthAffordance`.

- [ ] **Step 9: Manual smoke test against the live backend**

Run: `NEXT_PUBLIC_API_BASE=https://api.lindentar.pashteto.com npm run dev`, then in a browser:
1. Visit `/signup`, create an account → redirected to `/editor`; header shows your email.
2. Build a doll; confirm a `PUT /api/v1/projects/{id}` fires (Network tab) and a thumbnail is sent.
3. Reload → `GET /api/v1/auth/me` returns the user; `GET /api/v1/projects` returns your project; the draft is restored.
4. Log out → header shows "Log in"; reload stays logged out.
5. Trigger the paywall (after a free export): logged out → routed to `/login`; logged in → "Unlock" calls `POST /api/v1/entitlements/mock-checkout`. **Expected to fail/404 until Plan 3 is deployed** — verify the UI degrades gracefully (no crash) rather than that it succeeds.

- [ ] **Step 10: Commit**

```bash
git add webapp-1/src/modules/auth/SessionInit.tsx webapp-1/src/modules/auth/AuthAffordance.tsx webapp-1/src/app/layout.tsx webapp-1/src/app/editor/page.tsx webapp-1/src/modules/auth/__tests__/AuthAffordance.test.tsx
git commit -m "feat(auth): hydrate session on load + sync + login/logout affordance"
```

---

## Self-Review

**Spec coverage:**
- Auth module (login/signup UI, `useSession`, `credentials:'include'`) → Tasks 2, 3, 10. ✓
- Dedicated `/login` + `/signup` routes with `?next=` → Task 3. ✓
- Sync module (LWW merge + push/pull, wired into autosave) → Tasks 4, 5, 7. ✓
- Entitlement swap against documented contract, hook interface stable → Task 8 (+ paywall Task 9). ✓
- First-export-free stays client-side localStorage → preserved (Task 8 keeps `firstExportUsed` + `useEntitlement` localStorage gate untouched). ✓
- Thumbnail generation (R3F canvas capture) → Tasks 6, 7. ✓
- `NEXT_PUBLIC_API_BASE` config → Task 1. ✓
- Error handling: typed `ApiError`, inline auth messages, best-effort sync/autosave, entitlement network fallback → Tasks 1, 3, 5, 7, 8. ✓
- Testing: pure merge, mocked-api hook tests, thumbnail helper, no entitlement backend integration → Tasks 4–9. ✓
- App-load `fetchMe` + one-shot sync → Task 10. ✓

**Type consistency:** `ApiUser` (uuid/email/name/status) used identically across Tasks 2, 7, 9, 10. `ServerProject`/`ProjectInput` consistent across Tasks 4, 5, 7. `checkEntitlement()` is no-arg everywhere after Task 8 (Step 2 grep catches stragglers). `captureThumbnail()` signature matches its caller in Task 7. `mergeProjects`/`toProjectInput`/`fromServerProject` names consistent between definition and callers.

**Placeholder scan:** every code step contains complete code; commands have expected output. Two intentional adaptation points (not placeholders): Task 7 Step 4 note on the exact `projectCreatedAt` field name, and Task 10 Step 7 editor-header placement — both flagged because they depend on existing code the executor will see.

**Known limitation (by design):** the entitlement path cannot succeed end-to-end until the Plan 3 backend is deployed; Task 10 Step 9 verifies graceful degradation, not success.

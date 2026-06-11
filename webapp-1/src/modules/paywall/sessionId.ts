'use client'

// Anonymous guest session id (E12-T7). Persisted to localStorage + cookie so the
// future entitlements API (deferred) can key purchases to it.
const SESSION_KEY = 'doll_session_id'

export function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}`
    localStorage.setItem(SESSION_KEY, id)
    document.cookie = `${SESSION_KEY}=${id};path=/;max-age=31536000;samesite=lax`
  }
  return id
}

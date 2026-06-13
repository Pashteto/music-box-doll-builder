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
    // Reset the guard on logout so a subsequent login re-syncs (adopts any
    // drafts made while logged out).
    if (!user) {
      synced.current = false
      return
    }
    if (!synced.current) {
      synced.current = true
      void syncOnLogin()
    }
  }, [user])

  return null
}

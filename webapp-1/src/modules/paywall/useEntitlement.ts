'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { getSessionId } from '@/modules/paywall/sessionId'

// First-free-export gate (E12-T7) — STUB: the first export is always free; further
// exports require an entitlement we never grant yet (no Stripe). The flag persists
// in localStorage so it survives reloads, ready for the real backend later.
const FIRST_EXPORT_KEY = 'doll_first_export_used'

/** Hydrate entitlement state from localStorage on app load + ensure a session id. */
export function useEntitlementInit(): void {
  const setFirstExportUsed = useAppStore((s) => s.setFirstExportUsed)
  useEffect(() => {
    getSessionId()
    if (typeof window !== 'undefined' && localStorage.getItem(FIRST_EXPORT_KEY) === '1') {
      setFirstExportUsed(true)
    }
  }, [setFirstExportUsed])
}

export interface ExportGate {
  /** True when the user may export right now (first one free, or entitled). */
  canExport: boolean
  /** Record that a free export was used (call after a successful export). */
  consume: () => void
  firstExportUsed: boolean
  entitled: boolean
}

export function useExportGate(): ExportGate {
  const firstExportUsed = useAppStore((s) => s.firstExportUsed)
  const entitled = useAppStore((s) => s.entitled)
  const markFirstExportUsed = useAppStore((s) => s.markFirstExportUsed)

  const canExport = !firstExportUsed || entitled
  const consume = () => {
    if (!firstExportUsed) {
      markFirstExportUsed()
      if (typeof window !== 'undefined') localStorage.setItem(FIRST_EXPORT_KEY, '1')
    }
  }

  return { canExport, consume, firstExportUsed, entitled }
}

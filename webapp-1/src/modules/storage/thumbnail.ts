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

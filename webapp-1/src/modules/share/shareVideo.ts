// Deliver the rendered video to the user (E11): native share sheet or download.

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

function fileName(ext: string): string {
  return `music-box-doll-${Date.now()}.${ext}`
}

function extFor(mimeType: string): string {
  return mimeType.includes('webm') ? 'webm' : 'mp4'
}

/** Trigger a direct download of the blob (E11-T2). */
export function downloadVideo(blob: Blob, mimeType: string): ShareOutcome {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName(extFor(mimeType))
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

/**
 * Share via the Web Share API when files are supported (E11-T1), else download.
 * Returns 'cancelled' if the user dismisses the native sheet.
 */
export async function shareVideo(blob: Blob, mimeType: string): Promise<ShareOutcome> {
  const file = new File([blob], fileName(extFor(mimeType)), { type: mimeType })

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: 'My Music Box Doll' })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Fall through to download on any other share failure.
    }
  }
  return downloadVideo(blob, mimeType)
}

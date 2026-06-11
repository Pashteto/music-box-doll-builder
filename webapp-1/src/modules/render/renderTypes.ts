export interface RenderParams {
  width: number
  height: number
  fps: number
  durationSeconds: number
  /** Music track URL to mux in (null = silent video). */
  audioUrl?: string | null
  /** Render frame `i` of `total` and return the canvas to capture. */
  drawFrame: (i: number, total: number) => HTMLCanvasElement
  onProgress?: (fraction: number) => void
}

export interface RenderResult {
  blob: Blob
  mimeType: string
  codec: string
  hasAudio: boolean
}

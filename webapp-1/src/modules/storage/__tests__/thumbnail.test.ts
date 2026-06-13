import { describe, it, expect, afterEach, vi } from 'vitest'
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

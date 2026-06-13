import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/modules/storage/projectStorage', () => ({
  saveProject: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/api', () => ({ projectsApi: { upsert: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/modules/storage/thumbnail', () => ({
  captureThumbnail: vi.fn().mockReturnValue('data:image/jpeg;base64,thumb'),
}))

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
    const savedProject = vi.mocked(saveProject).mock.calls[0]?.[0]
    expect(savedProject?.thumbnailDataUrl).toBe('data:image/jpeg;base64,thumb')
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

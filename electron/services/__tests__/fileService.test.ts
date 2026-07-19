import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { create } = require('../fileService') as {
  create: (options: Record<string, unknown>) => {
    openPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>
    showItemInFolder: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  }
}

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('fileService artifact paths', () => {
  it('resolves project-relative paths before opening or revealing files', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-file-service-'))
    temporaryDirectories.push(projectRoot)
    const relativePath = path.join('out', 'voice_segments', 'segment.mp3')
    const absolutePath = path.join(projectRoot, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, 'audio')
    const shellApi = {
      openPath: vi.fn().mockResolvedValue(''),
      showItemInFolder: vi.fn(),
    }
    const service = create({ projectRoot, getCurrentWorkflow: () => null, shellApi })

    await expect(service.openPath(relativePath)).resolves.toEqual({ success: true })
    await expect(service.showItemInFolder(relativePath)).resolves.toEqual({ success: true })

    expect(shellApi.openPath).toHaveBeenCalledWith(absolutePath)
    expect(shellApi.showItemInFolder).toHaveBeenCalledWith(absolutePath)
  })

  it('reports the resolved path when a relative artifact is missing', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-file-service-'))
    temporaryDirectories.push(projectRoot)
    const shellApi = {
      openPath: vi.fn().mockResolvedValue(''),
      showItemInFolder: vi.fn(),
    }
    const service = create({ projectRoot, getCurrentWorkflow: () => null, shellApi })
    const result = await service.openPath(path.join('out', 'missing.mp3'))

    expect(result.success).toBe(false)
    expect(result.error).toContain(path.join(projectRoot, 'out', 'missing.mp3'))
    expect(shellApi.openPath).not.toHaveBeenCalled()
  })
})

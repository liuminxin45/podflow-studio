import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const {
  asarUnpackedPath,
  buildFfmpegEnv,
  inspectBundledFfmpeg,
  resolveBundledFfmpeg,
} = require('../ffmpegRuntime') as {
  asarUnpackedPath: (candidate: string) => string
  buildFfmpegEnv: (env?: NodeJS.ProcessEnv, executable?: string) => NodeJS.ProcessEnv
  inspectBundledFfmpeg: () => { executable: string; version: string }
  resolveBundledFfmpeg: () => string
}

describe('npm-managed FFmpeg runtime', () => {
  it('resolves and executes the installed platform binary', () => {
    const executable = resolveBundledFfmpeg()
    const runtime = inspectBundledFfmpeg()

    expect(fs.existsSync(executable)).toBe(true)
    expect(path.basename(executable).toLowerCase()).toMatch(/^ffmpeg(?:\.exe)?$/)
    expect(runtime.executable).toBe(executable)
    expect(runtime.version).toMatch(/^ffmpeg version /)
  })

  it('prepends the binary directory and publishes standard executable hints', () => {
    const executable = resolveBundledFfmpeg()
    const env = buildFfmpegEnv({ Path: 'C:\\existing', PATH: 'duplicate' }, executable)
    const pathEntries = Object.entries(env).filter(([key]) => key.toLowerCase() === 'path')

    expect(pathEntries).toHaveLength(1)
    expect(pathEntries[0][1]).toBe(`${path.dirname(executable)}${path.delimiter}C:\\existing`)
    expect(env.FFMPEG_BINARY).toBe(executable)
    expect(env.FFMPEG_PATH).toBe(executable)
    expect(env.IMAGEIO_FFMPEG_EXE).toBe(executable)
    expect(env.PODFLOW_FFMPEG_PATH).toBe(executable)
  })

  it('maps packaged app.asar paths to executable app.asar.unpacked paths', () => {
    const packed = path.join('C:\\PodFlow', 'resources', 'app.asar', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    const unpacked = path.join('C:\\PodFlow', 'resources', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')

    expect(asarUnpackedPath(packed)).toBe(unpacked)
  })
})

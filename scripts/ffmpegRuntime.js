const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function asarUnpackedPath(candidate) {
  const marker = `${path.sep}app.asar${path.sep}`
  if (!candidate.includes(marker)) return candidate
  return candidate.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`)
}

function resolveBundledFfmpeg(options = {}) {
  let candidate = options.candidate
  if (!candidate) {
    try {
      candidate = require('ffmpeg-static')
    } catch (error) {
      throw new Error(`Bundled FFmpeg is unavailable. Run npm install. ${error.message}`)
    }
  }

  if (typeof candidate !== 'string' || !candidate) {
    throw new Error(`Bundled FFmpeg does not support platform ${process.platform}/${process.arch}.`)
  }

  const unpackedCandidate = asarUnpackedPath(candidate)
  const candidates = unpackedCandidate === candidate
    ? [candidate]
    : [unpackedCandidate, candidate]
  const executable = candidates.find((value) => typeof value === 'string' && fs.existsSync(value))
  if (!executable) {
    throw new Error('Bundled FFmpeg executable is missing. Run npm install without --ignore-scripts.')
  }
  return executable
}

function buildFfmpegEnv(baseEnv = process.env, executable = resolveBundledFfmpeg()) {
  const env = { ...baseEnv }
  const pathKeys = Object.keys(env).filter((key) => key.toLowerCase() === 'path')
  const pathKey = pathKeys[0] || 'PATH'
  const existingPath = pathKeys.map((key) => env[key]).find(Boolean) || ''
  for (const key of pathKeys.slice(1)) delete env[key]

  env[pathKey] = [path.dirname(executable), existingPath].filter(Boolean).join(path.delimiter)
  env.FFMPEG_BINARY = executable
  env.FFMPEG_PATH = executable
  env.IMAGEIO_FFMPEG_EXE = executable
  env.PODFLOW_FFMPEG_PATH = executable
  return env
}

function inspectBundledFfmpeg() {
  const executable = resolveBundledFfmpeg()
  const result = spawnSync(executable, ['-version'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `FFmpeg exited with code ${result.status}`)
  }
  const version = result.stdout.split(/\r?\n/, 1)[0].trim()
  return { executable, version }
}

module.exports = {
  asarUnpackedPath,
  buildFfmpegEnv,
  inspectBundledFfmpeg,
  resolveBundledFfmpeg,
}

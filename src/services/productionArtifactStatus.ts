const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
])

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveNumber(value: unknown): boolean {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

function extension(targetPath: string): string {
  const leaf = targetPath.split(/[\\/]/).filter(Boolean).pop()?.toLowerCase() || ''
  const dot = leaf.lastIndexOf('.')
  return dot > 0 ? leaf.slice(dot) : ''
}

export function verifiedFinalAudioPath(state: {
  audio_outputs?: Record<string, unknown>
} | null | undefined): string {
  const outputs = state?.audio_outputs || {}
  const statePath = text(outputs.final_audio_path)
  const outputExtension = extension(statePath)
  const outputFormat = text(outputs.format).toLowerCase().replace(/^\./, '')

  if (!statePath || !AUDIO_EXTENSIONS.has(outputExtension)) return ''
  if (text(outputs.status) !== 'ok') return ''
  if (!outputFormat || outputExtension !== `.${outputFormat}`) return ''
  if (!positiveNumber(outputs.file_size)) return ''
  if (!positiveNumber(outputs.duration_seconds)) return ''
  if (!positiveNumber(outputs.segments_count)) return ''
  return statePath
}

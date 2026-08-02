const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const vitestEntry = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs')
const progressPath = path.join(projectRoot, 'tmp', 'vitest-progress.json')
const testPattern = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/

function collectTestFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectTestFiles(absolute))
    else if (testPattern.test(entry.name)) files.push(path.relative(projectRoot, absolute).replaceAll(path.sep, '/'))
  }
  return files.sort()
}

function buildSuites() {
  const files = ['electron', 'scripts', 'src'].flatMap((directory) => (
    collectTestFiles(path.join(projectRoot, directory))
  ))
  const runtime = files.filter((file) => file.startsWith('electron/') || file.startsWith('scripts/'))
  const logic = files.filter((file) => file.startsWith('src/services/') || file.startsWith('src/utils/'))
  const ui = files.filter((file) => !runtime.includes(file) && !logic.includes(file))
  return [
    { name: 'Electron and CLI', files: runtime, workers: 2 },
    { name: 'Frontend services and utilities', files: logic, workers: 2 },
    ...ui.map((file) => ({ name: file, files: [file], workers: 1 })),
  ].filter((suite) => suite.files.length)
}

function run() {
  const forwardedArgs = process.argv.slice(2)
  const suites = buildSuites()
  const totalFiles = suites.reduce((count, suite) => count + suite.files.length, 0)
  const failures = []
  fs.mkdirSync(path.dirname(progressPath), { recursive: true })
  process.stdout.write(`[test:run] ${totalFiles} test files in ${suites.length} isolated suites\n`)

  for (const [index, suite] of suites.entries()) {
    fs.writeFileSync(progressPath, `${JSON.stringify({
      status: 'running',
      suite: suite.name,
      suiteIndex: index + 1,
      suiteCount: suites.length,
      totalFiles,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`)
    process.stdout.write(`\n[test:run] ${index + 1}/${suites.length} ${suite.name} (${suite.files.length} files)\n`)
    const result = spawnSync(process.execPath, [
      vitestEntry,
      'run',
      ...suite.files,
      '--pool=forks',
      `--maxWorkers=${suite.workers}`,
      '--minWorkers=1',
      ...forwardedArgs,
    ], {
      cwd: projectRoot,
      env: process.env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    const status = result.status ?? 1
    if (status !== 0) {
      failures.push({ name: suite.name, status, error: result.error?.message })
      break
    }
  }

  if (failures.length) {
    fs.writeFileSync(progressPath, `${JSON.stringify({ status: 'failed', totalFiles, failures }, null, 2)}\n`)
    process.stderr.write(`\n[test:run] ${failures.length} suite(s) failed:\n`)
    failures.forEach((failure) => {
      process.stderr.write(`- ${failure.name}: ${failure.error || `exit ${failure.status}`}\n`)
    })
    process.exitCode = 1
    return
  }
  fs.writeFileSync(progressPath, `${JSON.stringify({
    status: 'passed',
    totalFiles,
    suiteCount: suites.length,
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`)
  process.stdout.write(`\n[test:run] PASS: ${totalFiles} test files completed\n`)
}

if (require.main === module) run()

module.exports = { buildSuites, collectTestFiles }

#!/usr/bin/env node

const { main: runCli } = require('./podflow-cli')
const { resolveDevExecutables } = require('./runtimeSupervisor')

function legacyArgs(argv) {
  const result = ['run', '--mode', 'dev', '--session', 'default', '--window', 'show']
  if (argv.includes('--cdp')) result.push('--cdp', 'auto')
  const portIndex = argv.indexOf('--port')
  if (portIndex >= 0 && argv[portIndex + 1]) process.env.VITE_PORT = argv[portIndex + 1]
  const cdpPortIndex = argv.indexOf('--cdp-port')
  if (cdpPortIndex >= 0 && argv[cdpPortIndex + 1]) {
    const cdpIndex = result.indexOf('--cdp')
    if (cdpIndex >= 0) result[cdpIndex + 1] = argv[cdpPortIndex + 1]
    else result.push('--cdp', argv[cdpPortIndex + 1])
  }
  return result
}

if (require.main === module) {
  runCli(legacyArgs(process.argv.slice(2))).then((code) => {
    process.exitCode = code
  })
}

module.exports = { resolveDevExecutables }

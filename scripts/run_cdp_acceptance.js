#!/usr/bin/env node

const { main: runCli } = require('./podflow-cli')

if (require.main === module) {
  runCli(['accept', '--suite', 'e2e-offline', ...process.argv.slice(2)]).then((code) => {
    process.exitCode = code
  })
}

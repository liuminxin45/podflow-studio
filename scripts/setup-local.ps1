[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Require-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $InstallHint"
  }
}

Require-Command node 'Install Node.js 22 before running this script.'
Require-Command npm 'Install npm with Node.js 22 before running this script.'
Require-Command git 'Install Git for Windows before running this script.'

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -ne 22) {
  throw "Node.js 22 is required; found $(node --version)."
}

Write-Host '[podflow] Installing exact Node dependencies...'
npm ci
Write-Host '[podflow] Creating the Python 3.13 environment...'
npm run setup:python
Write-Host '[podflow] Running the machine-readable environment doctor...'
npm run cli -- doctor --json

if (Get-Command gh -ErrorAction SilentlyContinue) {
  gh auth status
} else {
  Write-Warning 'GitHub CLI is not installed. Local generation works, but the publish stage requires gh.'
}

Write-Host '[podflow] Local source installation is ready. Provider keys were not read or stored.'

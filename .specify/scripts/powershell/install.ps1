param(
    [string]$SpecKitSourcePath = "",
    [switch]$Editable,
    [switch]$NoForce,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: install.ps1 [-SpecKitSourcePath <path>] [-Editable] [-NoForce] [-Help]"
    Write-Output "Installs specify-cli from this workspace-level spec-kit source."
    Write-Output "  -SpecKitSourcePath  Override the default spec-kit source root."
    Write-Output "  -Editable           Install from the local source in editable mode."
    Write-Output "  -NoForce            Do not pass --force to uv tool install."
    exit 0
}

$SpecKitRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($SpecKitSourcePath)) {
    if (-not [string]::IsNullOrWhiteSpace($env:SPEC_KIT_SOURCE)) {
        $SpecKitSourcePath = $env:SPEC_KIT_SOURCE
    } else {
        $SpecKitSourcePath = $SpecKitRoot
    }
}
$SpecKitPath = (Resolve-Path -LiteralPath $SpecKitSourcePath -ErrorAction SilentlyContinue).Path

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required. Install uv first, then rerun this script."
}

if (-not $SpecKitPath -or -not (Test-Path -LiteralPath (Join-Path $SpecKitPath "pyproject.toml"))) {
    throw "Spec Kit source is missing: $SpecKitSourcePath"
}

$uvArgs = @("tool", "install", $SpecKitPath)
if ($Editable) {
    $uvArgs = @("tool", "install", "--editable", $SpecKitPath)
}
if (-not $NoForce) {
    $uvArgs += "--force"
    $uvArgs += "--reinstall"
}

Write-Host "Installing specify-cli from $SpecKitPath"
& uv @uvArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& specify --version
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

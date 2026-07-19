#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const cssPath = path.join(root, 'src', 'index.css')
const appPath = path.join(root, 'src', 'App.tsx')
const guidePath = path.join(root, 'docs', 'desktop-ui-design-system.md')

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function expectIncludes(source, expected, description, failures) {
  if (!source.includes(expected)) failures.push(`${description}: missing ${expected}`)
}

const css = read(cssPath)
const app = read(appPath)
const guide = read(guidePath)
const failures = []
const quietPassStart = css.indexOf('/* Quiet workbench pass:')

if (quietPassStart === -1) {
  failures.push('Quiet workbench pass is missing from src/index.css')
}

const quietPass = quietPassStart === -1 ? '' : css.slice(quietPassStart)

for (const token of [
  '--bg-primary: #ffffff;',
  '--bg-secondary: #ffffff;',
  '--bg-tertiary: #f6f6f5;',
  '--text-primary: #242629;',
  '--text-secondary: #686a6d;',
  '--border-color: #e6e7e7;',
  '--accent-primary: #303438;',
  '--accent-light: #f0f1f1;',
  '--radius-sm: 5px;',
  '--radius-md: 7px;',
  '--radius-lg: 10px;',
]) {
  expectIncludes(quietPass, token, 'Quiet workbench token', failures)
}

for (const rule of [
  '#root :where([style*="font-weight"])',
  'font-weight: 500 !important;',
  ':where(h1, h2)',
  'font-weight: 600 !important;',
  ':where(h3, h4, h5, h6, strong, b)',
  'font-weight: 550 !important;',
  '.ant-card,',
  'box-shadow: none !important;',
  '@media (prefers-reduced-motion: reduce)',
]) {
  expectIncludes(quietPass, rule, 'Quiet workbench hierarchy rule', failures)
}

if (quietPass && /font-weight:\s*(?:6[5-9]\d|[7-9]\d\d)\s*!important/.test(quietPass)) {
  failures.push('Quiet workbench pass contains a prohibited heavy font-weight')
}

for (const token of [
  "colorPrimary: '#303438'",
  "colorText: '#242629'",
  "colorBgLayout: '#ffffff'",
  "colorBorder: '#e6e7e7'",
  'fontWeightStrong: 600',
  'controlHeight: 32',
  'borderRadius: 6',
]) {
  expectIncludes(app, token, 'Ant Design token', failures)
}

for (const heading of [
  '# PodFlow Studio 桌面端 UI 设计系统',
  '## 令牌',
  '## 防漂移流程',
  'npm run verify:ui-system',
]) {
  expectIncludes(guide, heading, 'Design system guide', failures)
}

if (failures.length > 0) {
  console.error('[verify:ui-system] FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('[verify:ui-system] PASS: quiet workbench tokens and guardrails are intact')

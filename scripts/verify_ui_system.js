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
  '--bg-primary: #f5f4f0;',
  '--bg-secondary: #fbfaf7;',
  '--bg-tertiary: #eeede8;',
  '--text-primary: #262521;',
  '--text-secondary: #6d6a63;',
  '--border-color: #dddbd3;',
  '--accent-primary: #292823;',
  '--accent-light: #e7e5de;',
  '--radius-sm: 6px;',
  '--radius-md: 9px;',
  '--radius-lg: 14px;',
  '--stage-nav-width: 224px;',
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
  "colorPrimary: '#292823'",
  "colorText: '#262521'",
  "colorBgLayout: '#f5f4f0'",
  "colorBorder: '#dddbd3'",
  'fontWeightStrong: 600',
  'controlHeight: 32',
  'borderRadius: 9',
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

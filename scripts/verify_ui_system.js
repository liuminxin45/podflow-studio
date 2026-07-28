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
const quietPassStart = css.indexOf('/* OpenHuman light system:')

if (quietPassStart === -1) {
  failures.push('OpenHuman light system is missing from src/index.css')
}

const quietPass = quietPassStart === -1 ? '' : css.slice(quietPassStart)

for (const token of [
  '--bg-primary: #ffffff;',
  '--bg-secondary: #fafafa;',
  '--bg-tertiary: #f4f4f5;',
  '--text-primary: #202124;',
  '--text-secondary: #62646a;',
  '--border-color: #e5e5e7;',
  '--accent-primary: #242529;',
  '--accent-light: #f0f0f1;',
  '--radius-sm: 6px;',
  '--radius-md: 8px;',
  '--radius-lg: 12px;',
  '--stage-nav-width: 216px;',
]) {
  expectIncludes(quietPass, token, 'OpenHuman light token', failures)
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
  expectIncludes(quietPass, rule, 'OpenHuman light hierarchy rule', failures)
}

if (quietPass && /font-weight:\s*(?:6[5-9]\d|[7-9]\d\d)\s*!important/.test(quietPass)) {
  failures.push('OpenHuman light system contains a prohibited heavy font-weight')
}

for (const token of [
  "colorPrimary: '#242529'",
  "colorText: '#202124'",
  "colorBgLayout: '#ffffff'",
  "colorBorder: '#e5e5e7'",
  'fontWeightStrong: 600',
  'controlHeight: 32',
  'borderRadius: 8',
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

console.log('[verify:ui-system] PASS: OpenHuman light tokens and guardrails are intact')

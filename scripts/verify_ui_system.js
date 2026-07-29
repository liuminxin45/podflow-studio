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

function collectUiFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectUiFiles(target)
    return /\.(?:css|tsx)$/.test(entry.name) ? [target] : []
  })
}

function lastCssBlock(source, selector) {
  const start = source.lastIndexOf(`${selector} {`)
  if (start === -1) return ''
  const end = source.indexOf('}', start)
  return end === -1 ? '' : source.slice(start, end + 1)
}

function channelSpread(red, green, blue) {
  return Math.max(red, green, blue) - Math.min(red, green, blue)
}

function findChromaticColor(source) {
  for (const match of source.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const value = match[1]
    const channels = [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16))
    if (channelSpread(...channels) > 24) return match[0]
  }
  for (const match of source.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/gi)) {
    const channels = match.slice(1, 4).map(Number)
    if (channelSpread(...channels) > 24) return match[0]
  }
  return ''
}

const css = read(cssPath)
const app = read(appPath)
const guide = read(guidePath)
const failures = []
const uiFiles = collectUiFiles(path.join(root, 'src'))
const quietPassStart = css.indexOf('/* OpenHuman light system:')

if (quietPassStart === -1) {
  failures.push('OpenHuman light system is missing from src/index.css')
}

const quietPass = quietPassStart === -1 ? '' : css.slice(quietPassStart)
const discoverMainBlock = lastCssBlock(css, '.discover-main')
const discoverToolbarBlock = lastCssBlock(css, '.discover-toolbar')
const discoverListBlock = lastCssBlock(css, '.discover-list')

for (const token of [
  '--bg-primary: #ffffff;',
  '--bg-secondary: #fafafa;',
  '--bg-tertiary: #f4f4f5;',
  '--text-primary: #202124;',
  '--text-secondary: #62646a;',
  '--border-color: #e5e5e7;',
  '--accent-primary: #242529;',
  '--accent-light: #f0f0f1;',
  '--success-color: #4f5156;',
  '--warning-color: #62646a;',
  '--error-color: #303136;',
  '--info-color: #62646a;',
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
  'font-weight: 550 !important;',
  ':where(h3, h4, h5, h6, strong, b)',
  'font-weight: 500 !important;',
  '.ant-card,',
  'box-shadow: none !important;',
  '@media (prefers-reduced-motion: reduce)',
]) {
  expectIncludes(quietPass, rule, 'OpenHuman light hierarchy rule', failures)
}

for (const [block, rule, description] of [
  [discoverMainBlock, 'overflow-x: hidden;', 'Discover main overflow guard'],
  [discoverToolbarBlock, 'margin: 0;', 'Discover toolbar width guard'],
  [discoverListBlock, 'width: 100%;', 'Discover list width guard'],
  [discoverListBlock, 'margin: 0;', 'Discover list margin guard'],
]) {
  expectIncludes(block, rule, description, failures)
}

for (const filePath of uiFiles) {
  const source = read(filePath)
  const relativePath = path.relative(root, filePath)
  if (/font-?weight(?:\s*:|["']?\s*:)\s*(?:6\d\d|[7-9]\d\d)/.test(source)) {
    failures.push(`${relativePath} contains a prohibited heavy font-weight`)
  }
  if (/#(?:f4efe5|f7f6f3|f1eadf|f7f4ee|faf9f6|fbfaf7|eeede8|e7e5de|dddbd3)\b/i.test(source)) {
    failures.push(`${relativePath} contains a retired warm-neutral color`)
  }
  const chromaticColor = findChromaticColor(source)
  if (chromaticColor) {
    failures.push(`${relativePath} contains a prohibited chromatic UI color: ${chromaticColor}`)
  }
}

for (const token of [
  "colorPrimary: '#242529'",
  "colorText: '#202124'",
  "colorSuccess: '#4f5156'",
  "colorWarning: '#62646a'",
  "colorError: '#303136'",
  "colorInfo: '#62646a'",
  "colorBgLayout: '#ffffff'",
  "colorBorder: '#e5e5e7'",
  "controlItemBgHover: '#f4f4f5'",
  "controlItemBgActive: '#f0f0f1'",
  "optionSelectedBg: '#f0f0f1'",
  "optionSelectedColor: '#202124'",
  'optionSelectedFontWeight: 500',
  'fontWeightStrong: 550',
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

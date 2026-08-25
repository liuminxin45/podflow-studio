const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const docsRoot = path.join(projectRoot, 'docs')
const docsIndex = path.join(docsRoot, 'README.md')

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) return markdownFiles(target)
      return entry.isFile() && entry.name.endsWith('.md') ? [target] : []
    })
}

function localMarkdownTargets(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const targets = []
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g
  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '')
    if (!rawTarget || /^(?:https?:|mailto:|#)/i.test(rawTarget)) continue
    const withoutFragment = rawTarget.split('#', 1)[0]
    if (withoutFragment) targets.push(decodeURIComponent(withoutFragment))
  }
  return targets
}

const failures = []
const filesToCheck = [path.join(projectRoot, 'README.md'), ...markdownFiles(docsRoot)]

for (const filePath of filesToCheck) {
  for (const target of localMarkdownTargets(filePath)) {
    const resolved = path.resolve(path.dirname(filePath), target)
    if (!fs.existsSync(resolved)) {
      failures.push(`${path.relative(projectRoot, filePath)} -> ${target}`)
    }
  }
}

const indexContent = fs.readFileSync(docsIndex, 'utf8')
for (const filePath of markdownFiles(docsRoot)) {
  if (filePath === docsIndex) continue
  const relativeTarget = path.relative(docsRoot, filePath).split(path.sep).join('/')
  if (!indexContent.includes(`(${relativeTarget})`)) {
    failures.push(`docs/README.md does not index ${relativeTarget}`)
  }
}

if (failures.length) {
  process.stderr.write(`Documentation verification failed:\n- ${failures.join('\n- ')}\n`)
  process.exit(1)
}

process.stdout.write(`Documentation verification passed for ${filesToCheck.length} Markdown files.\n`)

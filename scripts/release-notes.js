#!/usr/bin/env node
/**
 * Renders the GitHub release notes for one version from lib/changelog.json.
 *
 * The release workflows call this so the notes published with a tag are the
 * same text the application shows in About → Change log. With no argument the
 * version in package.json is used, which is what both workflows want.
 *
 *   node scripts/release-notes.js            -> notes for package.json version
 *   node scripts/release-notes.js 3.1.0      -> notes for one version
 *   node scripts/release-notes.js --list     -> every known version, newest first
 *
 * Exits non-zero when the requested version has no entry: a release must never
 * ship with an empty changelog.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function loadEntries() {
  const raw = fs.readFileSync(path.join(ROOT, 'lib/changelog.json'), 'utf8')
  const parsed = JSON.parse(raw)
  const entries = Array.isArray(parsed) ? parsed : parsed.entries
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('lib/changelog.json has no entries')
  return entries
}

const ORDER = ['added', 'improved', 'fixed', 'removed', 'security']
const HEADINGS = {
  added: '### Added',
  improved: '### Improved',
  fixed: '### Fixed',
  removed: '### Removed',
  security: '### Security'
}

/** One entry → GitHub-flavoured markdown. */
function renderEntry(entry) {
  const changes = entry.changes || {}
  const lines = [`## ${entry.version}`, '']
  if (entry.title) lines.push(`**${entry.title}**`, '')
  if (entry.date) lines.push(`_Released ${entry.date}${entry.channel ? ` · ${entry.channel} channel` : ''}_`, '')
  for (const key of ORDER) {
    const items = changes[key]
    if (!Array.isArray(items) || items.length === 0) continue
    lines.push(HEADINGS[key] || `### ${key}`)
    for (const item of items) lines.push(`- ${item}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

function main(argv) {
  const entries = loadEntries()
  if (argv[0] === '--list') {
    process.stdout.write(`${entries.map((entry) => entry.version).join('\n')}\n`)
    return 0
  }
  const version = (argv[0] || require(path.join(ROOT, 'package.json')).version).replace(/^v/, '')
  const entry = entries.find((row) => row.version === version)
  if (!entry) {
    process.stderr.write(`No changelog entry for version ${version}. Add it to lib/changelog.json before releasing.\n`)
    return 1
  }
  process.stdout.write(`${renderEntry(entry)}\n`)
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { loadEntries, renderEntry }

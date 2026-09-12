const test = require('node:test')
const assert = require('node:assert/strict')
const { loadEntries, renderEntry } = require('../scripts/release-notes')
const { compareVersions } = require('../electron/services/version')
const pkg = require('../package.json')

const CATEGORIES = ['added', 'improved', 'fixed', 'removed', 'security']

test('the shipped version has a changelog entry', () => {
  const entries = loadEntries()
  const current = entries.find((entry) => entry.version === pkg.version)
  assert.ok(current, `lib/changelog.json has no entry for ${pkg.version}`)
  assert.ok(current.title, 'the entry needs a one-line title')
  assert.ok(Object.values(current.changes || {}).some((items) => items.length), 'the entry needs at least one change')
})

test('every changelog entry is complete, ordered and uniquely versioned', () => {
  const entries = loadEntries()
  const seen = new Set()
  for (const entry of entries) {
    assert.match(entry.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, `bad version ${entry.version}`)
    assert.equal(seen.has(entry.version), false, `duplicate changelog entry ${entry.version}`)
    seen.add(entry.version)
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, `${entry.version} needs an ISO date`)
    assert.ok(['main', 'beta'].includes(entry.channel), `${entry.version} needs a main or beta channel`)
    assert.ok(entry.title && entry.title.length > 3, `${entry.version} needs a title`)
    assert.ok(entry.changes && typeof entry.changes === 'object', `${entry.version} needs a changes map`)
    for (const [key, items] of Object.entries(entry.changes)) {
      assert.ok(CATEGORIES.includes(key), `${entry.version} uses the unknown category "${key}"`)
      assert.ok(Array.isArray(items) && items.length > 0, `${entry.version}.${key} must be a non-empty list`)
      for (const item of items) {
        assert.equal(typeof item, 'string', `${entry.version}.${key} contains a non-string`)
        assert.ok(item.length > 12, `${entry.version}.${key} has a change that is too short to read`)
        assert.match(item, /^[A-Z]/, `${entry.version}.${key} entries start with a capital letter`)
      }
    }
  }
  // Newest first, so the About card can render history in order.
  for (let index = 1; index < entries.length; index += 1) {
    assert.equal(compareVersions(entries[index - 1].version, entries[index].version), 1,
      `${entries[index - 1].version} must come before ${entries[index].version}`)
  }
})

test('rendered release notes carry the version, the categories and every change', () => {
  const entries = loadEntries()
  for (const entry of entries.slice(0, 3)) {
    const notes = renderEntry(entry)
    assert.ok(notes.startsWith(`## ${entry.version}`))
    assert.ok(notes.includes(entry.title))
    for (const [key, items] of Object.entries(entry.changes)) {
      assert.ok(notes.includes(`### ${key.charAt(0).toUpperCase()}${key.slice(1)}`), `${entry.version}: missing ${key} heading`)
      for (const item of items) assert.ok(notes.includes(`- ${item}`), `${entry.version}: missing change "${item}"`)
    }
  }
})

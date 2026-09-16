#!/usr/bin/env node
/**
 * Single-source version bump: updates all four version-bearing manifests and
 * guarantees a changelog entry exists for the new version (inserting a
 * template when missing, so `npm test` catches it if it is never filled in).
 *
 * Usage: node scripts/bump-version.js 3.4.0-beta.1
 */
const fs = require('fs')
const path = require('path')
const { compareVersions } = require('../electron/services/version')

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version || '')) {
  console.error('Usage: node scripts/bump-version.js <version>   (e.g. 3.4.0 or 3.4.1-beta.1)')
  process.exit(1)
}

const root = path.resolve(__dirname, '..')
const setJson = (relative, mutate) => {
  const file = path.join(root, relative)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  mutate(data)
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  console.log(`  ${relative} -> ${version}`)
}
setJson('package.json', (d) => {
  d.version = version
})
setJson('package-lock.json', (d) => {
  d.version = version
  if (d.packages && d.packages['']) d.packages[''].version = version
})
setJson('electron/recovery/package.json', (d) => {
  d.version = version
})
setJson('electron/recovery/package-lock.json', (d) => {
  d.version = version
  if (d.packages && d.packages['']) d.packages[''].version = version
})

// The changelog must carry the new version, sorted with the app's own
// comparator so `node --test tests/unit/` keeps passing.
const changelogFile = path.join(root, 'lib', 'changelog.json')
const changelog = JSON.parse(fs.readFileSync(changelogFile, 'utf8'))
if (!changelog.entries.some((entry) => entry.version === version)) {
  const isPrerelease = version.includes('-')
  changelog.entries.push({
    version,
    date: new Date().toISOString().slice(0, 10),
    channel: isPrerelease ? 'beta' : 'main',
    title: `Release ${version}`,
    changes: {
      improved: [`Describe here, in one readable line each, what changed for the operator in ${version}.`]
    }
  })
  changelog.entries.sort((a, b) => compareVersions(b.version, a.version))
  fs.writeFileSync(changelogFile, JSON.stringify(changelog, null, 2) + '\n')
  console.log(`  lib/changelog.json -> template entry added for ${version} (edit it before releasing)`)
} else {
  console.log(`  lib/changelog.json -> entry for ${version} already present`)
}

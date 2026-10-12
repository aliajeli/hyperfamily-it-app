#!/usr/bin/env node
/**
 * Single-source version bump: updates all version-bearing manifests and
 * guarantees a changelog entry exists for the new version (inserting a
 * template when missing, so `npm test` catches it if it is never filled in).
 *
 * Usage: node scripts/bump-version.js 3.4.0-beta.1
 */
const fs = require('fs')
const path = require('path')
const prettier = require('prettier')
const { compareVersions } = require('../electron/services/version')

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version || '')) {
  console.error('Usage: node scripts/bump-version.js <version>   (e.g. 3.4.0 or 3.4.1-beta.1)')
  process.exit(1)
}

const root = path.resolve(__dirname, '..')
// Every JSON this script rewrites must stay Prettier-clean: CI's
// format:check runs on the committed result, and a plain JSON.stringify
// breaks the packed single-element array style (see 3.10.3-beta.2 CI run).
const writeJson = async (relative, data) => {
  const file = path.join(root, relative)
  const raw = JSON.stringify(data, null, 2) + '\n'
  let output = raw
  try {
    output = await prettier.format(raw, { parser: 'json', filepath: file })
  } catch {
    /* prettier unavailable: keep the canonical 2-space serialization */
  }
  fs.writeFileSync(file, output)
}
const setJson = async (relative, mutate) => {
  const file = path.join(root, relative)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  mutate(data)
  await writeJson(relative, data)
  console.log(`  ${relative} -> ${version}`)
}
;(async () => {
  await setJson('package.json', (d) => {
    d.version = version
  })
  await setJson('package-lock.json', (d) => {
    d.version = version
    if (d.packages && d.packages['']) d.packages[''].version = version
  })
  await setJson('electron/recovery/package.json', (d) => {
    d.version = version
  })
  await setJson('electron/recovery/package-lock.json', (d) => {
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
    await writeJson('lib/changelog.json', changelog)
    console.log(`  lib/changelog.json -> template entry added for ${version} (edit it before releasing)`)
  } else {
    console.log(`  lib/changelog.json -> entry for ${version} already present`)
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})

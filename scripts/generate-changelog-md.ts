#!/usr/bin/env node
/**
 * Renders CHANGELOG.md from lib/changelog.json — the same source the About
 * page and the GitHub release notes read — so the three can never disagree.
 * CI regenerates the file and fails when the committed copy is stale.
 */
const fs = require('fs')
const path = require('path')
const { loadEntries, renderEntry } = require('./release-notes')

const body = loadEntries().map(renderEntry).join('\n')
const header =
  '# Changelog\n\nEvery release of HyperFamily Branch Monitor, newest first.\nGenerated from lib/changelog.json by scripts/generate-changelog-md.js — do not edit by hand.\n\n'
fs.writeFileSync(path.resolve(__dirname, '..', 'CHANGELOG.md'), header + body + '\n')
console.log('CHANGELOG.md written')

import raw from './changelog.json'

/**
 * The application changelog.
 *
 * lib/changelog.json is the single source of truth: this module feeds the
 * About → Change log card, and scripts/release-notes.js renders the same file
 * into the notes published with every GitHub release. A version that is not in
 * the file fails `npm test`, so a release can never ship without notes.
 *
 * Each entry: { version, date, channel, title, changes: { added, improved,
 * fixed, removed, security } }.
 */
export const CHANGELOG_ENTRIES = Array.isArray(raw?.entries) ? raw.entries : []

/** The notes of one version, or null when this build predates the entry. */
export function changelogFor(version) {
  const wanted = String(version || '').replace(/^v/, '')
  return CHANGELOG_ENTRIES.find((entry) => entry.version === wanted) || null
}

/** True when the bundled changelog covers the running version. */
export function hasChangelogFor(version) {
  return Boolean(changelogFor(version))
}

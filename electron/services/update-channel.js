/**
 * Update channel logic (main / beta) — pure functions, no Electron imports,
 * so both the UpdateService and the unit tests use them.
 *
 * Channels
 * --------
 *  - `main`  Only stable releases. A prerelease build following this channel
 *            is switched back to the newest stable — even when that version
 *            number is LOWER than the installed beta (an intentional
 *            downgrade-offer, not a bug).
 *  - `beta`  Stable and prerelease entries compete; the newest version wins.
 *
 * This repository publishes one `latest.yml` per GitHub release (beta builds
 * carry it too), so electron-updater needs no separate channel files — just
 * `allowPrerelease`/`allowDowngrade` tuned per channel. See update.service.
 */
'use strict'

const { compareVersions } = require('./version')

const UPDATE_CHANNEL_MAIN = 'main'
const UPDATE_CHANNEL_BETA = 'beta'
const UPDATE_CHANNELS = [UPDATE_CHANNEL_MAIN, UPDATE_CHANNEL_BETA]

function isPrereleaseVersion(version) {
  return String(version || '').includes('-')
}

/**
 * Folds a stored preference (or missing/invalid one) into a valid channel.
 * Default: prerelease builds follow beta, stable builds follow main.
 */
function normalizeChannel(channel, currentVersion) {
  if (UPDATE_CHANNELS.includes(channel)) return channel
  return isPrereleaseVersion(currentVersion) ? UPDATE_CHANNEL_BETA : UPDATE_CHANNEL_MAIN
}

/** electron-updater flags that make the given channel behave as documented. */
function updaterFlags(channel, currentVersion) {
  return {
    allowPrerelease: channel === UPDATE_CHANNEL_BETA,
    allowDowngrade: channel === UPDATE_CHANNEL_MAIN && isPrereleaseVersion(currentVersion)
  }
}

/**
 * Picks the release the channel should offer and whether it counts as an
 * update for `currentVersion`.
 *
 * @param {Array} releases  GitHub release objects (tag_name, prerelease, draft…)
 * @returns {{release: object|null, latestVersion: string, hasUpdate: boolean, isDowngrade: boolean}}
 */
function evaluateChannelUpdate({ releases, channel, currentVersion }) {
  const candidates = (Array.isArray(releases) ? releases : []).filter(
    (item) => item && !item.draft && (channel === UPDATE_CHANNEL_BETA || !item.prerelease)
  )
  if (!candidates.length) {
    return { release: null, latestVersion: currentVersion, hasUpdate: false, isDowngrade: false }
  }

  const newest = candidates
    .map((item) => ({ item, version: String(item.tag_name || '').replace(/^v/, '') }))
    .sort((a, b) => compareVersions(b.version, a.version))[0]

  // On main, a prerelease install adopts the newest stable whatever its
  // number; everywhere else only a strictly newer version is an update.
  const hasUpdate = channel === UPDATE_CHANNEL_MAIN && isPrereleaseVersion(currentVersion)
    ? true
    : compareVersions(newest.version, currentVersion) > 0

  return {
    release: newest.item,
    latestVersion: newest.version,
    hasUpdate,
    isDowngrade: hasUpdate && compareVersions(newest.version, currentVersion) < 0
  }
}

module.exports = {
  UPDATE_CHANNELS,
  UPDATE_CHANNEL_MAIN,
  UPDATE_CHANNEL_BETA,
  isPrereleaseVersion,
  normalizeChannel,
  updaterFlags,
  evaluateChannelUpdate
}

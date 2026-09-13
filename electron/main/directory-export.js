'use strict'

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

/**
 * Headless directory export, used by "Import from another workstation".
 *
 * The database key is protected by this machine's own OS keystore, so the
 * encrypted file can never be decrypted somewhere else. Instead the source
 * workstation runs THIS code (launched by the importer through a one-shot
 * scheduled task) and writes its directory as plain JSON to a path only the
 * importing administrator can read. No window, no lock, then exit.
 */
function runDirectoryExport(targetPath) {
  app.whenReady().then(() => {
    const { SecureVault } = require('../services/crypto.service')
    const { AppDatabase } = require('../database')
    const userDataPath = app.getPath('userData')
    const database = new AppDatabase(userDataPath, new SecureVault(userDataPath))
    const branches = database.listBranches()
    const codeById = new Map(branches.map((branch) => [branch.id, branch.code]))
    const devices = database.listDevices().map((device) => ({
      ...device,
      branch_code: codeById.get(device.branch_id)
    }))
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, JSON.stringify({ branches, devices }, null, 2))
    try { database.close() } catch { /* best effort on the way out */ }
    process.exit(0)
  }).catch((error) => {
    try { fs.appendFileSync(path.join(path.dirname(targetPath), '.hf-export-error'), String(error?.message || error)) } catch { /* ignore */ }
    process.exit(1)
  })
}

module.exports = { runDirectoryExport }

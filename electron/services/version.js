function compareVersions(v1, v2) {
  const a = String(v1).replace(/^v/, '').split('.').map((x) => Number(x.replace(/\D.*$/, '')) || 0)
  const b = String(v2).replace(/^v/, '').split('.').map((x) => Number(x.replace(/\D.*$/, '')) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return 1
    if ((a[i] || 0) < (b[i] || 0)) return -1
  }
  return 0
}

module.exports = { compareVersions }

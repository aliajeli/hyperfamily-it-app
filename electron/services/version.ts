function compareVersions(v1, v2) {
  const parse = (value) => {
    const [core, pre = ''] = String(value).replace(/^v/, '').split('-', 2)
    return { numbers: core.split('.').map((part) => Number(part) || 0), pre: pre.split('+')[0] }
  }
  const a = parse(v1)
  const b = parse(v2)
  for (let i = 0; i < Math.max(a.numbers.length, b.numbers.length); i += 1) {
    if ((a.numbers[i] || 0) > (b.numbers[i] || 0)) return 1
    if ((a.numbers[i] || 0) < (b.numbers[i] || 0)) return -1
  }
  // A stable release always supersedes its own prereleases.
  if (!a.pre || !b.pre) return Number(!a.pre) - Number(!b.pre)
  const left = a.pre.split('.')
  const right = b.pre.split('.')
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] === undefined || right[i] === undefined)
      return Number(right[i] === undefined) - Number(left[i] === undefined)
    const an = /^\d+$/.test(left[i])
    const bn = /^\d+$/.test(right[i])
    if (an && bn && Number(left[i]) !== Number(right[i])) return Number(left[i]) > Number(right[i]) ? 1 : -1
    if (an !== bn) return an ? -1 : 1
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1
  }
  return 0
}

module.exports = { compareVersions }

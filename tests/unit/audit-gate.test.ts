const test = require('node:test')
const assert = require('node:assert/strict')
const { checkAudit } = require('../../scripts/audit-gate')

const dev = (name) => ({ nodes: [`node_modules/${name}`] })
const packages = Object.fromEntries(
  ['braces', 'micromatch', 'fast-glob'].map((name) => [`node_modules/${name}`, { dev: true }])
)
const braces = {
  ...dev('braces'),
  severity: 'high',
  via: [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }]
}
test('only the braces advisory and its transitive dependents are exempt until expiry', () => {
  const report = {
    vulnerabilities: {
      braces,
      micromatch: { ...dev('micromatch'), severity: 'high', via: ['braces'] },
      'fast-glob': { ...dev('fast-glob'), severity: 'high', via: ['micromatch'] }
    }
  }
  assert.deepEqual(checkAudit(report, new Date('2027-01-31'), packages), [])
  assert.equal(checkAudit(report, new Date('2027-02-01'), packages).length, 3)
})

test('fails if braces becomes a production dependency or audit omits dependency paths', () => {
  const issue = { vulnerabilities: { braces } }
  assert.equal(checkAudit(issue, new Date('2026-10-12'), { 'node_modules/braces': { dev: false } }).length, 1)
  assert.equal(checkAudit({ vulnerabilities: { braces: { ...braces, nodes: [] } } }).length, 1)
})

test('rejects unrelated high/critical advisories and incomplete audit results', () => {
  assert.deepEqual(
    checkAudit({ vulnerabilities: { other: { severity: 'critical', via: ['braces'] } } }).length,
    1
  )
  assert.equal(
    checkAudit({
      vulnerabilities: { other: { severity: 'high', via: [{ url: 'https://example.org/other' }] } }
    }).length,
    1
  )
  assert.equal(
    checkAudit({
      vulnerabilities: {
        braces: { severity: 'high', via: [...braces.via, { url: 'https://example.org/other' }] }
      }
    }).length,
    1
  )
  assert.throws(() => checkAudit({ error: 'network down' }))
  assert.deepEqual(checkAudit({ vulnerabilities: { other: { severity: 'moderate', via: [] } } }), [])
})

#!/usr/bin/env node
/** Fail CI on high/critical npm advisories, except the time-limited lint-only braces finding. */
const { spawnSync } = require('node:child_process')

const EXCEPTION = 'GHSA-vfj7-8cjw-p6xm'
const EXPIRES = '2027-01-31'
const SEVERITIES = new Set(['high', 'critical'])

function checkAudit(report, now = new Date(), packages = require('../package-lock.json').packages) {
  if (!report || !report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    throw new Error('npm audit returned no vulnerability data')
  }
  const vulnerabilities: Record<string, any> = report.vulnerabilities
  const allowed = new Set()
  const expired = now.toISOString().slice(0, 10) > EXPIRES
  const devOnly = (issue) =>
    Array.isArray(issue.nodes) &&
    issue.nodes.length > 0 &&
    issue.nodes.every((node) => packages[node.replaceAll('\\', '/')]?.dev === true)

  // An exception may only originate at braces itself, not at another package
  // or at an additional advisory in the same package.
  for (const [name, issue] of Object.entries(vulnerabilities)) {
    if (!SEVERITIES.has(issue.severity)) continue
    const via = Array.isArray(issue.via) ? issue.via : []
    if (
      !expired &&
      devOnly(issue) &&
      name === 'braces' &&
      via.length > 0 &&
      via.every(
        (item) => typeof item === 'object' && item.url === `https://github.com/advisories/${EXCEPTION}`
      )
    ) {
      allowed.add(name)
    }
  }
  // npm also reports each vulnerable ancestor (e.g. micromatch -> braces).
  // Ignore such ancestors only when ALL of their paths lead to the exception.
  let changed = true
  while (changed) {
    changed = false
    for (const [name, issue] of Object.entries(vulnerabilities)) {
      if (!SEVERITIES.has(issue.severity) || allowed.has(name)) continue
      const via = Array.isArray(issue.via) ? issue.via : []
      if (
        devOnly(issue) &&
        via.length > 0 &&
        via.every((item) => typeof item === 'string' && allowed.has(item))
      ) {
        allowed.add(name)
        changed = true
      }
    }
  }
  return Object.entries(vulnerabilities)
    .filter(([name, issue]) => SEVERITIES.has(issue.severity) && !allowed.has(name))
    .map(([name, issue]) => `${name}: ${issue.severity} (${JSON.stringify(issue.via)})`)
}

function main() {
  const result = spawnSync('npm audit --json', { shell: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.error) throw result.error
  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    throw new Error(`npm audit did not return valid JSON: ${result.stderr || result.stdout}`)
  }
  if (report.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`npm audit failed: ${JSON.stringify(report.error || result.stderr)}`)
  }
  const blockers = checkAudit(report)
  if (blockers.length) {
    console.error(`High/critical npm audit findings:\n${blockers.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(`npm audit gate passed (braces exception expires ${EXPIRES}).`)
  }
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

module.exports = { checkAudit }

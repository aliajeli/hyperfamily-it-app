const test = require('node:test')
const assert = require('node:assert/strict')
const pkg = require('../package.json')
const lock = require('../package-lock.json')
const stack = require('../lib/technology-stack.json')

test('release manifests have one consistent version', () => {
  assert.equal(pkg.version, lock.version)
  assert.equal(pkg.version, lock.packages[''].version)
  assert.equal(pkg.version, require('../electron/recovery/package.json').version)
  assert.equal(pkg.version, require('../electron/recovery/package-lock.json').version)
  assert.equal(pkg.version, require('../electron/recovery/package-lock.json').packages[''].version)
})

test('About credits have unique, complete metadata and valid dependency references', () => {
  const names = new Set()
  for (const entry of stack) {
    assert.ok(entry.name && entry.description)
    assert.equal(names.has(entry.name), false, `duplicate credit ${entry.name}`)
    names.add(entry.name)
    assert.match(entry.brand, /^#[0-9A-Fa-f]{6}$/)
    assert.match(entry.brandDark, /^#[0-9A-Fa-f]{6}$/)
    if (entry.package) assert.ok(pkg.dependencies[entry.package] || pkg.devDependencies[entry.package], `unknown package ${entry.package}`)
    if (entry.showMajor) assert.match(pkg.dependencies[entry.package] || pkg.devDependencies[entry.package], /\d+/)
  }
  for (const name of ['React', 'Node.js', 'Radix UI', 'React Hook Form + Zod', 'C++17 / Win32', 'electron-updater', 'CMake / MSVC']) {
    assert.ok(names.has(name), `missing production credit ${name}`)
  }
  assert.equal(names.has('shadcn/ui'), false)
})

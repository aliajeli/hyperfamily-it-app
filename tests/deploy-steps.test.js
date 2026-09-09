const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

/**
 * `lib/utils.js` is an ES module consumed by Next. Rather than pulling a
 * transpiler into `node --test`, the one pure function under test is
 * extracted and evaluated directly — it has no imports of its own.
 */
function loadCollapseSteps() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'utils.js'), 'utf8')
  const start = source.indexOf('export function collapseSteps')
  assert.notEqual(start, -1, 'collapseSteps must exist in lib/utils.js')
  const body = source.slice(start).replace('export function', 'function')
  return new Function(`${body}; return collapseSteps`)()
}

const collapseSteps = loadCollapseSteps()

/**
 * The reported bug: four rows left spinning in the summary even though the
 * pipeline had passed those stages. The backend emits 'running' and then the
 * terminal status as two separate events for the same step.
 */
test('REGRESSION: a finished step shows once, as finished — not as a stuck spinner', () => {
  const steps = [
    { step: 'source', status: 'done', detail: 'Test.txt' },
    { step: 'connectivity', status: 'running', detail: 'Checking…' },
    { step: 'connectivity', status: 'done', detail: 'answered in 4 ms' },
    { step: 'target', status: 'done', detail: 'C:\\Store Commerce' },
    { step: 'backup', status: 'skipped', detail: 'nothing to back up' },
    { step: 'copy', status: 'running', detail: 'Copying…' },
    { step: 'copy', status: 'done', detail: '2048 bytes copied' },
    { step: 'verify', status: 'running', detail: 'Comparing…' },
    { step: 'verify', status: 'done', detail: 'hashes match' },
    { step: 'finish', status: 'done', detail: 'Deployed' }
  ]
  const rows = collapseSteps(steps, true)
  assert.equal(rows.length, 7, 'one row per distinct step')
  assert.equal(rows.filter((row) => row.status === 'running').length, 0, 'nothing may still be spinning')
  assert.deepEqual(rows.map((row) => row.step), ['source', 'connectivity', 'target', 'backup', 'copy', 'verify', 'finish'])
  assert.equal(rows.find((row) => row.step === 'connectivity').detail, 'answered in 4 ms')
})

test('a live run still shows the step in progress', () => {
  const rows = collapseSteps([
    { step: 'source', status: 'done' },
    { step: 'copy', status: 'running' }
  ], false)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].status, 'running', 'an in-flight copy must keep spinning')
})

test('a retry after a hash mismatch is visible as running again', () => {
  const rows = collapseSteps([
    { step: 'copy', status: 'running', detail: 'attempt 1/3' },
    { step: 'copy', status: 'done', detail: 'attempt 1/3' },
    { step: 'verify', status: 'failed', detail: 'mismatch' },
    { step: 'copy', status: 'running', detail: 'attempt 2/3' }
  ], false)
  const copy = rows.find((row) => row.step === 'copy')
  assert.equal(copy.status, 'running')
  assert.equal(copy.detail, 'attempt 2/3', 'the latest attempt wins')
})

test('a failure is preserved once the run has settled', () => {
  const rows = collapseSteps([
    { step: 'connectivity', status: 'running' },
    { step: 'connectivity', status: 'failed', detail: 'did not answer' }
  ], true)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'failed', 'settling must never turn a failure into a success')
})

test('a step orphaned mid-run is shown as done once the run settles', () => {
  // The exact shape of the bug: the completion event never arrived.
  const rows = collapseSteps([{ step: 'verify', status: 'running' }], true)
  assert.equal(rows[0].status, 'done')
})

test('empty and malformed input is handled', () => {
  assert.deepEqual(collapseSteps([], true), [])
  assert.deepEqual(collapseSteps(null), [])
  assert.deepEqual(collapseSteps(undefined), [])
})

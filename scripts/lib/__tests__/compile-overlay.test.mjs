import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const FIXTURE = fileURLToPath(new URL('./fixtures/overlay', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'compile-overlay-'))
const compile = (args, env = {}) => spawnSync(process.execPath, [join(REPO, 'scripts', 'compile.js'), ...args],
  { encoding: 'utf8', env: { ...process.env, ...env } })
const publicCatalog = () => readFileSync(join(REPO, 'patterns.json'), 'utf8')

let passed = 0, failed = 0
function t(name, fn) { try { fn(); passed++ } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`) } }

const before = publicCatalog()

t('overlay build carries only the overlay patterns, with IDs, tags and public keyword lists', () => {
  const out = join(tmp, 'private.json')
  const run = compile(['--overlay', FIXTURE, '--out', out], { SOURCE_DATE_EPOCH: '1700000000' })
  assert.equal(run.status, 0, run.stderr)
  const catalog = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual(catalog.patterns.map(p => p.slug), ['zz-overlay-sample'])
  const [sample] = catalog.patterns
  assert.equal(sample.classifier_id, 'TP-90001')
  assert.equal(sample.package_tags.primary_component, 'government-operations')
  assert.ok(sample.corroborative_evidence.keywords.length > 0, 'public keyword list resolved')
  assert.ok(catalog.dictionaryManifest.dictionaries.length > 0, 'public dictionary manifest carried')
  assert.equal(catalog.generated, '2023-11-14T22:13:20.000Z')
})

t('--overlay without --out is refused', () => {
  const run = compile(['--overlay', FIXTURE])
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /--overlay needs --out/)
})

t('--out inside the repository is refused', () => {
  const run = compile(['--overlay', FIXTURE, '--out', join(REPO, 'patterns.json')])
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /--out must be outside this repository/)
})

function overlayWithIds(name, ids) {
  const dir = join(tmp, name)
  cpSync(FIXTURE, dir, { recursive: true })
  writeFileSync(join(dir, 'classifier-ids.json'), JSON.stringify({ schema: 'testpattern.classifier-ids.v1', patterns: ids }))
  return dir
}
const publicIds = JSON.parse(readFileSync(join(REPO, 'data', 'classifier-ids.json'), 'utf8')).patterns
const [publicSlug, publicId] = Object.entries(publicIds)[0]

t('an overlay slug that is already public is refused', () => {
  const run = compile(['--overlay', overlayWithIds('slug', { [publicSlug]: 'TP-90002' }), '--out', join(tmp, 'x.json')])
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /Overlay slug is already public/)
})

t('an overlay classifier ID that is already public is refused', () => {
  const run = compile(['--overlay', overlayWithIds('id', { 'zz-overlay-sample': publicId }), '--out', join(tmp, 'x.json')])
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /Overlay classifier ID is already public/)
})

t('the public patterns.json is untouched by overlay builds', () => assert.equal(publicCatalog(), before))

rmSync(tmp, { recursive: true, force: true })
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

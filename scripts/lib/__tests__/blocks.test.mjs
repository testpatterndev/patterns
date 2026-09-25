import assert from 'node:assert/strict'
import { validateBlocks, BLOCK_SCHEMA } from '../blocks.mjs'

let passed = 0, failed = 0
function t(name, fn) { try { fn(); passed++ } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`) } }

const active = new Set(['a', 'b', 'c'])
const deprecated = new Set(['old'])
const block = (id, patterns, extra = {}) => [`${id}.json`, {
  schema: BLOCK_SCHEMA, id, name: `Block ${id}`, domain: 'finance', layer: 'core', description: 'Test block.', patterns, ...extra,
}]
const run = (...bs) => validateBlocks(new Map(bs), active, deprecated)

t('valid blocks pass', () => assert.deepEqual(run(block('finance', ['a', 'b']), block('finance-qg', ['c'])), []))
t('overlap fails', () => assert.ok(run(block('finance', ['a']), block('finance-qg', ['a']))[0].includes('must not overlap')))
t('unknown slug fails', () => assert.ok(run(block('finance', ['zzz']))[0].includes("unknown pattern 'zzz'")))
t('deprecated slug fails with the fix', () => assert.ok(run(block('finance', ['old']))[0].includes('replaced_by')))
t('file name must match id', () => assert.ok(run(['other.json', block('finance', ['a'])[1]])[0].includes('file name')))
t('bad layer and domain fail', () => assert.equal(run(block('finance', ['a'], { layer: 'tier', domain: 'money' })).length, 2))
t('empty block fails', () => assert.ok(run(block('finance', []))[0].includes('at least one')))
t('duplicate slug in a block fails', () => assert.ok(run(block('finance', ['a', 'a'])).some(m => m.includes('twice'))))

console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

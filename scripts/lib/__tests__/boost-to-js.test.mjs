// Tests for lib/boost-to-js.mjs. Run: node scripts/lib/__tests__/boost-to-js.test.mjs
import assert from 'node:assert/strict'
import { emulateKeep, expandScopedI } from '../boost-to-js.mjs'

let passed = 0, failed = 0
const t = (name, fn) => { try { fn(); passed++ } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`) } }

t('emulateKeep: prefix\\K becomes a lookbehind', () => assert.equal(emulateKeep(String.raw`ab\Kcd`), '(?<=ab)cd'))
t('emulateKeep: no \\K is unchanged', () => assert.equal(emulateKeep('abc'), 'abc'))
t('emulateKeep: escaped backslash before K is not \\K', () => assert.equal(emulateKeep(String.raw`a\\Kb`), String.raw`a\\Kb`))
t('expandScopedI: letters become both-case classes', () => assert.equal(expandScopedI('(?i:ab)'), '(?:[aA][bB])'))
t('expandScopedI: escapes untouched', () => assert.equal(expandScopedI(String.raw`(?i:a\s+b)`), String.raw`(?:[aA]\s+[bB])`))
t('expandScopedI: letter range gains the other case', () => assert.equal(expandScopedI('(?i:[a-c]x)'), '(?:[a-cA-C][xX])'))
t('expandScopedI: digit class unchanged', () => assert.equal(expandScopedI('(?i:[0-9]{4})'), '(?:[0-9]{4})'))
t('expandScopedI: nested groups', () => assert.equal(expandScopedI('(?i:a(?:b|c)?)'), '(?:[aA](?:[bB]|[cC])?)'))
t('expandScopedI: outside the group untouched', () => assert.equal(expandScopedI('X(?i:y)Z'), 'X(?:[yY])Z'))
t('expanded regex behaves case-insensitively', () => {
  const re = new RegExp(expandScopedI(String.raw`\b(?i:CLASSIFICATION|MARKING)\s*[:=]\s*(?:OFFICIAL|Official)\b`))
  assert.ok(re.test('Classification: Official'))
  assert.ok(re.test('MARKING=OFFICIAL'))
  assert.ok(!re.test('classification: official'))
})

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

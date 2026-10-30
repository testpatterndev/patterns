// Tests for lib/capture-groups.mjs and the scripts/check-capture-groups.mjs gate.
// Run: node scripts/lib/__tests__/capture-groups.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { countCapturingGroups, wrapWholeMatch, checkWholeMatchGroup, nonSpaceAsClass, HandleByHand } from '../capture-groups.mjs'
import { emulateKeep, expandScopedI } from '../boost-to-js.mjs'

let passed = 0, failed = 0
const t = (name, fn) => { try { fn(); passed++ } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`) } }
const R = String.raw

// JS's own count, for the constructs JS shares with Boost: an always-matching alternative
// makes exec() return one slot per capturing group.
const jsCount = (src) => new RegExp(src.replace(/^\(\?i\)/, '') + '|').exec('').length - 1

// ── Counter: what is and is not a capturing group ──
const counts = [
  [R`(?:a)`, 0], [R`(?=a)`, 0], [R`(?!a)`, 0], [R`(?<=a)`, 0], [R`(?<!a)`, 0],
  [R`(?i)a`, 0], [R`(?i:a)b`, 0], [R`(?-i)a`, 0], [R`(?is)a`, 0], [R`(?i-s)a`, 0],
  [R`\(a\)`, 0], [R`[(]a[)]`, 0], [R`[^)]+`, 0], [R`[\(]`, 0], [R`[A-Za-z0-9 /&_'().-]{2,60}`, 0],
  [R`[]()]`, 0], [R`[^]()]`, 0], [R`[[:digit:]()]`, 0], [R`\Q(a)\E`, 0], [R`(?>a)`, 0], [R`(?#a(b)c`, 0], // a comment ends at its first )
  [R`\\(a)`, 1], [R`(a)`, 1], [R`(?<name>a)`, 1], [R`(?P<name>a)`, 1], [R`(?'name'a)`, 1],
  [R`(a)(b)`, 2], [R`((a))`, 2], [R`(?:(a)|(b))`, 2], [R`(?=(a))b`, 1], [R`(?i)\b(a|b)\b`, 1],
]
for (const [src, n] of counts) t(`count ${src} = ${n}`, () => assert.equal(countCapturingGroups(src), n))
// Cross-check against V8 wherever JS reads the construct the same way Boost does.
const JS_SAME = counts.filter(([s]) => !/^\(\?(?:-i|is|i-s)\)|\(\?i:|\[\^?\]|\[\[:|\\Q|\(\?>|\(\?#|\(\?P<|\(\?'/.test(s))
for (const [src, n] of JS_SAME) t(`count ${src} agrees with V8`, () => assert.equal(jsCount(src), n))

// ── Constructs the rewrite refuses ──
for (const src of [R`(a)\1`, R`(?<n>a)\k<n>`, R`(?|(a)|(b))`, R`(?(1)a|b)`, R`(*SKIP)a`, R`a(?i)b`, R`a|b\Kc`]) {
  t(`hand-only: ${src}`, () => assert.throws(() => wrapWholeMatch(src), HandleByHand))
}

// ── Transform ──
const wraps = [
  [R`\bfoo\b`, R`\b(foo)\b`, 'wrap'],
  [R`(?i)\b(?:a|b)\b`, R`(?i)\b(a|b)\b`, 'promote'],
  [R`(?<!\d)(?:\d{6}|\d{9})(?!\d)`, R`(?<!\d)(\d{6}|\d{9})(?!\d)`, 'promote'],
  [R`\b(?:a|b)?\b`, R`\b((?:a|b)?)\b`, 'wrap'],
  [R`\b(?i:ab)\b`, R`\b((?i:ab))\b`, 'wrap'],
  [R`\b(?:a)(?:b)\b`, R`\b((?:a)(?:b))\b`, 'wrap'],
  [R`(?i)\b(?<n>ab|cd)\b`, R`(?i)\b(?<n>ab|cd)\b`, 'unchanged'],
  [R`pre\K(?:a|b)\b`, R`pre\K(a|b)\b`, 'wrap-after-keep'],
  [R`(?i)\ba|b\b`, R`(?i)(\ba|b\b)`, 'wrap'],
  [R`(?<!\d)\d{9}(?!\d)`, R`(?<!\d)(\d{9})(?!\d)`, 'wrap'],
  [R`(?is)\b(?=x)(?<![a-z])\d+\b(?!-)`, R`(?is)\b(?=x)(?<![a-z])(\d+)\b(?!-)`, 'wrap'],
  [R`pre\s*\K(?!x)\d+\b`, R`pre\s*\K(?!x)(\d+)\b`, 'wrap-after-keep'],
  [R`\b(ghp|gho)_[A-Za-z0-9]{36}\b`, R`\b((?:ghp|gho)_[A-Za-z0-9]{36})\b`, 'regroup'],
  [R`(?-i)\b(?<n>x)y`, R`(?-i)\b((?:x)y)`, 'regroup'],
  [R`\b\d{9}(\d{5})?\b`, R`\b(\d{9}(?:\d{5})?)\b`, 'regroup'],
  [R`\b(\d{9})?\b`, R`\b((?:\d{9})?)\b`, 'regroup'],
  [R`(a)(b)c`, R`((?:a)(?:b)c)`, 'regroup'],
  [R`x(?=a)?`, R`(x(?=a)?)`, 'wrap'],
  [R`\b[(]x[)]\b`, R`\b([(]x[)])\b`, 'wrap'],
  [R`(?i)\b(terms|words)\b`, R`(?i)\b(terms|words)\b`, 'unchanged'],
  [R`(?<!\d)(\d{9})(?!\d)`, R`(?<!\d)(\d{9})(?!\d)`, 'unchanged'],
]
for (const [src, want, rule] of wraps) {
  t(`wrap ${src}`, () => {
    const r = wrapWholeMatch(src)
    assert.equal(r.out, want)
    assert.equal(r.rule, rule)
    assert.equal(wrapWholeMatch(r.out).out, r.out, 'idempotent')
    assert.ok(checkWholeMatchGroup(r.out).ok, 'result passes the gate')
    assert.equal(countCapturingGroups(r.out), 1)
  })
}

// Group 0 unchanged and group 1 == group 0, on strings that exercise each case.
const SAMPLES = ['foo', 'a foo b', 'pre 123 x', 'pre x12', 'ghp_' + 'a'.repeat(36), 'gho_' + 'Z9'.repeat(18) + ' tail',
  '123456789', '12345678901234', 'x123456789y', '1234567890', 'xa', 'x', 'ab', 'abc', 'terms words', '(x)', 'a(x)b']
const js = (src) => { const m = src.match(/^\(\?([a-z]+)\)/); const body = expandScopedI(emulateKeep(m ? src.slice(m[0].length) : src.replace(/^\(\?-i\)/, ''))); return new RegExp(body, 'g' + (m?.[1].includes('i') ? 'i' : '')) }
for (const [src] of wraps.filter(([s]) => !/\(\?<n>/.test(s))) {
  t(`group 0 unchanged: ${src}`, () => {
    const out = wrapWholeMatch(src).out
    for (const s of SAMPLES) {
      const a = [...s.matchAll(js(src))].map(m => [m.index, m[0]])
      const b = [...s.matchAll(js(out))]
      assert.deepEqual(b.map(m => [m.index, m[0]]), a, `on ${JSON.stringify(s)}`)
      for (const m of b) assert.equal(m[1], m[0], `group 1 is the whole match on ${JSON.stringify(s)}`)
    }
  })
}

// ── Gate predicate ──
for (const src of [R`\b(x)\b`, R`(?i)(a|b)`, R`p\K(x)`, R`(?<=a)(b)(?!c)`]) t(`gate ok: ${src}`, () => assert.ok(checkWholeMatchGroup(src).ok))
for (const src of [R`x`, R`\bx\b`, R`(a)(b)`, R`((a))`, R`(a)b`, R`(a)|b`, R`(a)+`, R`(?<=(a))b`, R`p(x)\Kq`]) {
  t(`gate rejects: ${src}`, () => assert.equal(checkWholeMatchGroup(src).ok, false))
}

// ── \S as a class ──
t('nonSpaceAsClass: \\S+ and \\S{4,}', () => assert.equal(nonSpaceAsClass(R`a/\S+ b=\S{4,}`), R`a/[^\s]+ b=[^\s]{4,}`))
t('nonSpaceAsClass: bounded, class and escaped forms untouched', () => assert.equal(nonSpaceAsClass(R`\S{2,5}[\S]+\\S+\S?`), R`\S{2,5}[\S]+\\S+\S?`))
t('nonSpaceAsClass: same matches', () => {
  for (const s of ['a/xyz b=1234', 'a/ b=12', 'a/\tq b=abcd ']) assert.deepEqual(s.match(new RegExp(nonSpaceAsClass(R`a/\S+ b=\S{4,}`))), s.match(/a\/\S+ b=\S{4,}/))
})

// ── The CI gate script goes RED on bad regexes and GREEN on good ones ──
const GATE = fileURLToPath(new URL('../../check-capture-groups.mjs', import.meta.url))
const runGate = (patternYaml, identifierYaml) => {
  const root = mkdtempSync(join(tmpdir(), 'capture-gate-'))
  try {
    mkdirSync(join(root, 'data', 'patterns'), { recursive: true })
    mkdirSync(join(root, 'data', 'identifiers'), { recursive: true })
    writeFileSync(join(root, 'data', 'patterns', 'p.yaml'), patternYaml)
    if (identifierYaml) writeFileSync(join(root, 'data', 'identifiers', 'i.yaml'), identifierYaml)
    return spawnSync(process.execPath, [GATE, '--root', root], { encoding: 'utf-8' })
  } finally { rmSync(root, { recursive: true, force: true }) }
}
const pat = (top, rx) => `slug: p\npattern: '${top}'\npurview:\n  regexes:\n    - id: Regex_p\n      pattern: '${rx}'\n`
t('gate RED on a 0-group regex', () => {
  const r = runGate(pat(R`\b(x)\b`, R`\b\d{9}\b`))
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stdout, /purview\.regexes\/Regex_p — 0 capturing groups/)
})
t('gate RED on a 2-group regex', () => {
  const r = runGate(pat(R`\b((x))\b`, R`\b(\d{9})\b`))
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stdout, /p: pattern — 2 capturing groups/)
})
t('gate RED on a group around part of the match', () => {
  const r = runGate(pat(R`\b(x)\b`, R`\b(AKIA)[A-Z0-9]{16}\b`))
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stdout, /does not wrap the whole match/)
})
t('gate RED on an identifier fallback with 0 groups', () => {
  const r = runGate(pat(R`\b(x)\b`, R`\b(\d{9})\b`), `key: i\nfallback:\n  pattern: '\\b\\d{4}\\b'\n`)
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stdout, /i: fallback\.pattern — 0 capturing groups/)
})
t('gate GREEN when every regex has one whole-match group', () => {
  const r = runGate(pat(R`(?i)\b(x)\b`, R`(?<!\d)(\d{9})(?!\d)`), `key: i\nfallback:\n  pattern: '\\b(\\d{4})\\b'\n`)
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /3 regex\(es\), 0 error/)
})

console.log(`capture-groups: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

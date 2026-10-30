#!/usr/bin/env node
// Proves the 2026-10-30 capture-group migration left matching unchanged.
//
// For every regex in data/patterns and data/identifiers, the version at --base (git) is paired
// with the working-tree version by file and field. Each pair is run (JavaScript, global) over a
// shared corpus and the (index, length) of every group-0 match must be identical, under both
// case-insensitive and case-sensitive flags. Every new match must also have group 1 equal to
// group 0. The corpus is:
//   - every test-case value in the repo (should_match / should_not_match, every pattern) and
//     every identifier sample, joined into documents of 40 values, newline separated;
//   - the regex's own file's test values and samples, each on its own;
//   - generated variants: for each regex, every old match found in that corpus is re-tested
//     alone, with neighbouring characters added (letter, digit, space, -, _ , ., newline), with
//     one character deleted / swapped at each position, case-flipped and doubled;
//   - generated noise: random strings over the regex's own literal characters plus digits,
//     letters and separators.
// The key-recovery evidence regex replaced by six per-position regexes is compared as the
// union of the six against the original.
// --exporter <regex-compat.js> also runs the pairs through the testpattern exporter's
// normalizePdfRegex (the text that ships in rule packages) and repeats the comparison.
//
// Usage: node scripts/verify-capture-group-equivalence.mjs --base <git ref> [--base-dir <checkout of that ref>]
//          [--exporter <regex-compat.js>] [--out <dir>]
// --base-dir reads the base files from a checkout (`git worktree add <dir> <ref>`) instead of
// one `git show` per file; the ref is still resolved and recorded.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { regexFields, checkWholeMatchGroup, countCapturingGroups } from './lib/capture-groups.mjs'
import { emulateKeep, expandScopedI } from './lib/boost-to-js.mjs'

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined }
const BASE = arg('--base')
if (!BASE) { console.error('usage: --base <git ref>'); process.exit(2) }
const BASE_DIR = arg('--base-dir')
const EXPORTER = arg('--exporter')
const OUT = arg('--out')
const normalizePdfRegex = EXPORTER ? (await import(pathToFileURL(EXPORTER).href)).normalizePdfRegex : null

const git = (...a) => execFileSync('git', a, { encoding: 'utf-8', maxBuffer: 1 << 28 })
const baseSha = git('rev-parse', BASE).trim()

// ── Load both sides ──
const sides = { old: new Map(), new: new Map() } // key `${file}#${where}` -> { src, slug, cs, file }
const corpus = new Set()
const ownStrings = new Map() // file -> its own test values and samples
const casesOf = (doc) => [...(doc.test_cases?.should_match ?? []), ...(doc.test_cases?.should_not_match ?? [])].map(tc => String(tc?.value ?? ''))
  .concat([...(doc.fallback?.samples ?? []), ...(doc.replacement?.example_overlay?.samples ?? [])].map(String)).filter(Boolean)
for (const [dir, kind] of [['data/patterns', 'pattern'], ['data/identifiers', 'identifier']]) {
  const baseFiles = git('ls-tree', '--name-only', baseSha, dir + '/').split('\n').filter(f => f.endsWith('.yaml'))
  for (const f of baseFiles) {
    const doc = yaml.load(BASE_DIR ? readFileSync(join(BASE_DIR, f), 'utf-8') : git('show', `${baseSha}:${f}`))
    for (const { where, src } of regexFields(doc, kind)) sides.old.set(`${f}#${where}`, { src, slug: doc.slug ?? doc.key, cs: doc.case_sensitive === true, file: f })
  }
  for (const name of readdirSync(dir).filter(n => n.endsWith('.yaml'))) {
    const f = `${dir}/${name}`
    const doc = yaml.load(readFileSync(f, 'utf-8'))
    for (const { where, src } of regexFields(doc, kind)) sides.new.set(`${f}#${where}`, { src, slug: doc.slug ?? doc.key, cs: doc.case_sensitive === true, file: f })
    const own = casesOf(doc)
    ownStrings.set(f, own)
    for (const s of own) corpus.add(s)
  }
}
const singles = [...corpus]
const joined = []
for (let i = 0; i < singles.length; i += 40) joined.push(singles.slice(i, i + 40).join('\n'))

// ── Regex construction (leading flags as the repo checkers read them) ──
function toRe(src, ci) {
  let body = String(src), flags = ci ? 'i' : ''
  if (body.startsWith('(?-i)')) { body = body.slice(5); flags = '' }
  const m = body.match(/^\(\?([ims]+)\)/)
  if (m) { body = body.slice(m[0].length); if (m[1].includes('i')) flags = 'i'; if (m[1].includes('s')) flags += 's'; if (m[1].includes('m')) flags += 'm' }
  return new RegExp(expandScopedI(emulateKeep(body)), flags + 'g')
}
const spans = (re, s) => { const out = []; for (const m of s.matchAll(re)) out.push(m) ; return out }
const key = (ms) => ms.map(m => `${m.index}:${m[0].length}`).join(',')
// Spans reported by one or more regexes, as one ordered set (start, then length).
const unionKey = (lists) => [...new Map(lists.flat().map(m => [`${m.index}:${m[0].length}`, [m.index, m[0].length]])).entries()]
  .sort((x, y) => x[1][0] - y[1][0] || x[1][1] - y[1][1]).map(([k]) => k).join(',')

// ── Generated variants ──
let seed = 20261030
const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
const NEIGH = ['a', 'Z', '7', ' ', '-', '_', '.', '\n', ':', '/']
function variantsOf(m) {
  const v = [m, m + m, m + ' ' + m, m.toUpperCase(), m.toLowerCase()]
  for (const c of NEIGH) v.push(c + m, m + c, c + m + c)
  const step = Math.max(1, Math.floor(m.length / 24))
  for (let i = 0; i < m.length; i += step) {
    v.push(m.slice(0, i) + m.slice(i + 1))
    v.push(m.slice(0, i) + NEIGH[rand(NEIGH.length)] + m.slice(i + 1))
    if (/[0-9]/.test(m[i])) v.push(m.slice(0, i) + String((Number(m[i]) + 1) % 10) + m.slice(i + 1))
  }
  return v
}
function noiseFor(src) {
  const lits = [...new Set(String(src).replace(/\\[a-zA-Z]|\\.|\[[^\]]*\]|\(\?[^)]{0,3}|[(){}|*+?^$]/g, ' ').replace(/\s+/g, ' ').split(''))].join('')
  const alpha = lits + 'abcXYZ0123456789 -_./:\n'
  const out = []
  for (let k = 0; k < 40; k++) { let s = ''; const n = 4 + rand(60); for (let j = 0; j < n; j++) s += alpha[rand(alpha.length)]; out.push(s) }
  return out
}

// ── Compare ──
const RECOVERY = 'data/patterns/global-top500-275-key-recovery-material.yaml#purview.regexes/'
const rows = []
let totalStrings = 0, totalMatches = 0
function compare(label, oldSrcs, newSrcs, cs, own, transform = (s) => s) {
  const row = { label, strings: 0, matches: 0, diffs: 0, group1: 0, error: '', example: '' }
  try {
    for (const ci of cs ? [false] : [true, false]) {
      const olds = oldSrcs.map(s => toRe(transform(s), ci)), news = newSrcs.map(s => toRe(transform(s), ci))
      const run = (s) => {
        row.strings++
        const a = olds.map(re => spans(re, s)), b = news.map(re => spans(re, s))
        const ka = unionKey(a), kb = unionKey(b)
        row.matches += a.reduce((n, x) => n + x.length, 0)
        if (ka !== kb) { row.diffs++; if (!row.example) row.example = JSON.stringify(s).slice(0, 160) + ` old=[${ka}] new=[${kb}]` }
        for (const x of b) for (const m of x) if (m[1] !== m[0]) row.group1++
        return a.flat().map(m => m[0])
      }
      const found = new Set()
      for (const s of [...own, ...joined]) for (const m of run(s)) if (m.length) found.add(m)
      for (const m of [...found].slice(0, 400)) for (const v of variantsOf(m)) run(v)
      for (const src of oldSrcs) for (const s of noiseFor(src)) run(s)
    }
  } catch (e) { row.error = e.message.split('\n')[0] }
  totalStrings += row.strings; totalMatches += row.matches
  rows.push(row)
  return row
}

const pairs = []
const seenPair = new Map()
for (const [k, n] of sides.new) {
  if (k.startsWith(RECOVERY + 'Evidence_recovery_value_pos')) continue
  const o = sides.old.get(k)
  if (!o) { rows.push({ label: k, strings: 0, matches: 0, diffs: 0, group1: 0, error: 'no base regex for this field', example: '' }); continue }
  pairs.push({ k, o, n })
}
const onlyOld = [...sides.old.keys()].filter(k => !sides.new.has(k))
const t0 = Date.now()
const results = new Map()
for (const { k, o, n } of pairs) {
  const id = `${o.src}\u0000${n.src}\u0000${o.cs}`
  if (!seenPair.has(id)) seenPair.set(id, compare(k, [o.src], [n.src], o.cs, ownStrings.get(n.file) ?? []))
  const r = seenPair.get(id)
  results.set(k, { ...r, label: k, oldSrc: o.src, newSrc: n.src, gate: checkWholeMatchGroup(n.src).ok, groups: countCapturingGroups(n.src) })
}
// Key recovery: one regex became six.
const recNew = [...sides.new.keys()].filter(k => k.startsWith(RECOVERY + 'Evidence_recovery_value_pos')).sort()
const recOld = sides.old.get(RECOVERY + 'Evidence_recovery_value')
let recovery = null
if (recOld && recNew.length === 6) {
  const r = compare('key-recovery union', [recOld.src], recNew.map(k => sides.new.get(k).src), false, ownStrings.get(recOld.file) ?? [])
  // Dedicated generated recovery values: blocks equal, all but one equal, differing in one position.
  const extra = []
  for (let k = 0; k < 20000; k++) {
    const b0 = String(rand(1e6)).padStart(6, '0'); const blocks = []
    for (let i = 0; i < 8; i++) { const mode = k % 4; if (mode === 0) blocks.push(b0); else if (mode === 1) blocks.push(i === k % 8 ? String(rand(1e6)).padStart(6, '0') : b0); else if (mode === 2) { const d = b0.split(''); if (rand(3) === 0) d[rand(6)] = String(rand(10)); blocks.push(d.join('')) } else blocks.push(String(rand(1e6)).padStart(6, '0')) }
    extra.push(['', 'key: ', 'x', '9'][k % 4] + blocks.join('-') + ['', ' ok', 'y', '9'][k % 4])
  }
  const olds = [toRe(recOld.src, true)], news = recNew.map(k => toRe(sides.new.get(k).src, true))
  let diffs = 0, hits = 0
  for (const s of extra) { const a = key(spans(olds[0], s)); if (a) hits++; const b = unionKey(news.map(re => spans(re, s))); if (a !== b) diffs++ }
  const edge = '123457-' + Array(7).fill('123456').join('-') + '-123466'
  const edgeOld = key(spans(olds[0], edge)), edgeNew = unionKey(news.map(re => spans(re, edge)))
  const recShape = recNew.filter(k => { const src = sides.new.get(k).src; return !checkWholeMatchGroup(src).ok || countCapturingGroups(src) !== 1 }).length
  recovery = { corpus: r, notExactlyOneWholeGroup: recShape, generated: extra.length, generatedHits: hits, generatedDiffs: diffs, edge, edgeOld, edgeNew }
}
// Exporter normalisation: compare the shipped text of each pair too.
let exported = null
if (normalizePdfRegex) {
  let n = 0, d = 0, notWhole = 0
  const done = new Set()
  for (const { k, o, n: nw } of pairs) {
    const id = o.src + '\u0000' + nw.src
    if (done.has(id) || o.src === nw.src) continue
    done.add(id)
    const r = compare('exported:' + k, [o.src], [nw.src], o.cs, ownStrings.get(nw.file) ?? [], normalizePdfRegex)
    rows.pop(); n++; if (r.diffs || r.error) d++
    if (!checkWholeMatchGroup(normalizePdfRegex(nw.src)).ok) notWhole++
    if (normalizePdfRegex(nw.src).length > 1024) notWhole++
  }
  exported = { pairs: n, pairsWithDiffs: d, exportedNotOneWholeGroupOrOver1024: notWhole }
}

const all = [...results.values()]
const summary = {
  base: baseSha, generatedUtc: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
  regexFields: all.length, uniquePairs: seenPair.size, changed: all.filter(r => r.oldSrc !== r.newSrc).length,
  corpusStrings: singles.length, corpusDocuments: joined.length, stringsRun: totalStrings, matchesCompared: totalMatches,
  pairsWithDiffs: all.filter(r => r.diffs).length, pairsWithErrors: all.filter(r => r.error).length,
  group1NotWholeMatch: all.reduce((n, r) => n + r.group1, 0), notExactlyOneWholeGroup: all.filter(r => !r.gate || r.groups !== 1).length,
  baseOnlyFields: onlyOld, unpairedNewFields: rows.filter(r => r.error === 'no base regex for this field').map(r => r.label),
  recovery, exported,
}
console.log(JSON.stringify(summary, null, 2))
for (const r of all.filter(r => r.diffs || r.error).slice(0, 20)) console.log('DIFF', r.label, r.error || r.example)
if (OUT) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'equivalence-summary.json'), JSON.stringify(summary, null, 2) + '\n')
  const csv = ['file,field,changed,strings_run,old_matches,diffs,group1_not_whole,new_groups,gate_ok']
  for (const r of all.sort((a, b) => a.label.localeCompare(b.label))) {
    const [file, field] = r.label.split('#')
    csv.push([file, field, r.oldSrc !== r.newSrc, r.strings, r.matches, r.diffs, r.group1, r.groups, r.gate].join(','))
  }
  writeFileSync(join(OUT, 'equivalence-per-regex.csv'), csv.join('\n') + '\n')
}
const bad = summary.pairsWithDiffs || summary.pairsWithErrors || summary.group1NotWholeMatch || summary.notExactlyOneWholeGroup ||
  summary.unpairedNewFields.length || summary.baseOnlyFields.some(k => k !== RECOVERY + 'Evidence_recovery_value') ||
  (recovery && (recovery.corpus.diffs || recovery.corpus.error || recovery.corpus.group1 || recovery.notExactlyOneWholeGroup || recovery.generatedDiffs)) || (exported && (exported.pairsWithDiffs || exported.exportedNotOneWholeGroupOrOver1024))
process.exit(bad ? 1 : 0)

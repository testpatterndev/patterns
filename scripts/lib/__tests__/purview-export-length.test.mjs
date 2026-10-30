#!/usr/bin/env node
//
// Plain-node test for purviewExportedRegex() (no test framework in this repo).
// Pinned cases first, then — when a testpattern checkout is present (TESTPATTERN_DIR, default
// ../testpattern next to this repo) — a comparison with the real exporter over every regex in
// data/patterns, so the mirror cannot drift silently. CI has no testpattern checkout and skips it.
// Wired as `npm run test:export-length`.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { purviewExportedRegex } from '../purview-export-length.mjs'

const repo = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
let failed = 0
const check = (name, got, want) => {
  if (got === want) return
  failed++
  console.error(`FAIL ${name}\n  got:  ${got}\n  want: ${want}`)
}

const cases = [
  ['space → \\s+, runs collapse', 'a b  c', 'a\\s+b\\s+c'],
  ['\\s? and \\s{0,1} → (?:\\s+)?', 'a\\s?b\\s{0,1}c', 'a(?:\\s+)?b(?:\\s+)?c'],
  ['. before { + * → [\\s\\S]; bare . and .? stay', 'a.{2}b.+c.*d.e.?', 'a[\\s\\S]{2}b[\\s\\S]+c[\\s\\S]*d.e.?'],
  ['^ and $ dropped outside a class, kept inside', '^[^a$ .]+$', '[^a$ .]+'],
  ['class contents untouched, incl. \\s?', '[ \\s?.*]', '[ \\s?.*]'],
  ['lookbehind body keeps its spaces', '(?<!no (?:x) )y z', '(?<!no (?:x) )y\\s+z'],
  ['escaped space / dot pass through', '\\ \\.+', '\\ \\.+'],
]
for (const [name, src, want] of cases) check(name, purviewExportedRegex(src), want)

// The 2026-10-30 refusal shape: under 1024 in source, over it once exported.
const grown = 'x y'.repeat(205)
check('615 in source exports at 1025', `${grown.length} → ${purviewExportedRegex(grown).length}`, '615 → 1025')

const tpDir = process.env.TESTPATTERN_DIR ?? join(repo, '..', 'testpattern')
const tpFile = join(tpDir, 'src', 'lib', 'regex-compat.js')
if (!existsSync(tpFile)) {
  console.log(`skipped: real-exporter comparison — no testpattern checkout at ${tpDir}`)
} else {
  const { normalizePdfRegex } = await import(pathToFileURL(tpFile).href)
  for (const [name, src] of cases) check(`exporter agrees: ${name}`, purviewExportedRegex(src), normalizePdfRegex(src))
  const patDir = join(repo, 'data', 'patterns')
  let n = 0
  for (const f of readdirSync(patDir).filter(f => f.endsWith('.yaml'))) {
    const p = yaml.load(readFileSync(join(patDir, f), 'utf8'))
    const srcs = [p?.pattern, ...(p?.purview?.regexes ?? []).map(r => r.pattern)].filter(s => typeof s === 'string')
    for (const src of srcs) { n++; check(`exporter agrees: ${f}`, purviewExportedRegex(src), normalizePdfRegex(src)) }
  }
  console.log(`compared ${n} catalogue regexes with the real exporter`)
}

if (failed) { console.error(`${failed} failure(s)`); process.exit(1) }
console.log('purview-export-length: all passed')

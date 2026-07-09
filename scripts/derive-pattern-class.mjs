#!/usr/bin/env node
// C1-T1: derive pattern_class (identifier | concept | marking) for every pattern.
// Census mode (default): read-only report of derived classes + signals for spot review.
// See .superpowers/sdd/progress.md "PLAN: Concept-Strategy C1" and
// testpattern docs/superpowers/plans/2026-07-04-concept-strategy.md §C1.
//
// Heuristic (from the plan):
//   marking    — document_marker type, or the protective-marking slug family
//   concept    — top500 family, or topic-phrase-alternation purview/primary regex
//   identifier — structural value regex (digit runs, fixed-width char classes, literal prefixes)
//
// Usage:
//   node scripts/derive-pattern-class.mjs                 # summary + ambiguous list
//   node scripts/derive-pattern-class.mjs --tsv out.tsv   # full per-pattern TSV
//   node scripts/derive-pattern-class.mjs --apply         # persist pattern_class to YAMLs
//                                                           (line insertion after type: +
//                                                           minor bump via bump-pattern-version)
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { bumpPatternVersion } from './lib/bump-pattern-version.mjs'

const DIR = 'data/patterns'

const MARKING_SLUG = /(^|-)marking(-|$)|banner|pspf-security-classification/
const TOP500_SLUG = /(^|-)top500-/

// Spot-reviewed overrides for patterns whose top-level regex carries neither clear
// structural nor phrase signals (C1-T1 review, 2026-07-09). Keep this list short —
// prefer improving the signals when a whole family lands here.
const REVIEWED = {
  'ai-indirect-injection-hidden-content': 'identifier', // zero-width/bidi unicode marker class
  'snaffler-cisco-config-creds': 'identifier',          // config-directive + value capture
  'global-gcp-service-account-key': 'identifier',       // JSON literal marker ("type":"service_account")
  'global-hl7-message': 'identifier',                   // HL7 segment header literal (MSH|)
  'global-all-credential-types': 'concept',             // bare credential-label alternation — fires on any doc mentioning the labels (decoy-prone, topic behavior)
  'au-foi-exemption-references': 'identifier',          // statutory citation token (s 33–47F) — fires on citations, not topic words
}

// (kept separate from REVIEWED to keep the map single-purpose)
const _classes = new Set(['identifier', 'concept', 'marking'])
for (const [k, v] of Object.entries(REVIEWED)) {
  if (!_classes.has(v)) throw new Error(`REVIEWED[${k}] has invalid class ${v}`)
}

// Structural (identifier) signals in a regex source
const STRUCTURAL = [
  /\\d\{\d/,               // \d{n} digit runs
  /\\d\\d/,                // literal digit runs
  /\\d[+*]/,               // unbounded digit runs
  /\[[^\]]+\]\{\d/,        // any char class with bounded quantifier ([13][a-km-z...]{25,34})
  /\\[wS]\{\d/,            // quantified word/non-space runs (tokens, secrets)
  /\(\?:[^)]*\\d[^)]*\)\{\d/, // quantified digit-bearing group ((?:[\s-]?\d){12})
  /\[A-Za-z0-9+/,          // base64-ish classes
  /:\\?\/\\?\//,           // URI scheme separator :// (with or without escaped slashes)
  /-----BEGIN/,            // PEM/armor headers
  /[A-Z]{3,}\d|_(key|token|secret)/i, // literal credential prefixes
]
// Topic-phrase (concept) signals
const PHRASEY = [
  /\\s\+?[a-z]/i,          // \s+ joined words (multi-word phrases)
  /\b[a-z]+\\s\+[a-z]+/i,
]

function collectRegexes(doc) {
  const out = []
  if (typeof doc.pattern === 'string') out.push(doc.pattern)
  for (const r of doc.purview?.regexes ?? []) if (typeof r.pattern === 'string') out.push(r.pattern)
  return out
}

function scoreRegex(src) {
  const digits = (src.match(/\\d|\[0-9|[0-9]\[|\[1-9/g) ?? []).length
  const structural = STRUCTURAL.some(re => re.test(src)) || digits >= 4
  // phrase alternation: an OR group whose branches are mostly letter words joined by \s+
  const altGroup = /\((\?:|\?i[s]?\)?)?[^()]*\|[^()]*\)/.test(src)
  const phrasey = PHRASEY.some(re => re.test(src)) && altGroup
  const digitDensity = (src.match(/\\d|\[0-9/g) ?? []).length
  return { structural, phrasey, digitDensity }
}

export function deriveClass(doc, slug) {
  const type = doc.type
  const signals = []
  if (REVIEWED[slug]) return { cls: REVIEWED[slug], why: 'spot-reviewed override' }
  if (type === 'document_marker') return { cls: 'marking', why: 'type document_marker' }
  if (MARKING_SLUG.test(slug)) return { cls: 'marking', why: 'marking slug family' }
  if (TOP500_SLUG.test(slug)) return { cls: 'concept', why: 'top500 family' }
  if (type === 'trainable_classifier') return { cls: 'concept', why: 'trainable_classifier type' }

  // Keyword-family types detect topical/keyword presence. A structural regex in a
  // tier is a discriminator on top of a topic detector (crown-solicitor's CS-\d{4},
  // COA's reference number) — it does not change the pattern's class or its decoy
  // behavior in classification testing.
  if (type !== 'regex') return { cls: 'concept', why: `${type} topical detector` }

  // type regex: judge by the top-level `pattern:` field — that is the id_match anchor
  // that decides what documents the pattern fires on.
  if (typeof doc.pattern !== 'string') return { cls: 'AMBIGUOUS', why: 'regex type without top-level pattern field' }
  const s = scoreRegex(doc.pattern)
  // Structural wins even alongside phrases: label+value regexes ("AFSL no: \d{6}")
  // anchor on the value; the label is proximity context, not a topic phrase.
  if (s.structural) return { cls: 'identifier', why: 'structural top-level regex' }
  if (s.phrasey) return { cls: 'concept', why: 'phrase-alternation top-level regex' }
  return { cls: 'AMBIGUOUS', why: 'top-level regex has neither clear structural nor phrase signals' }
}

const args = process.argv.slice(2)
const tsvIdx = args.indexOf('--tsv')
const tsvPath = tsvIdx >= 0 ? args[tsvIdx + 1] : null

const rows = []
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.yaml')).sort()) {
  const slug = f.replace(/\.yaml$/, '')
  let doc
  try { doc = yaml.load(fs.readFileSync(path.join(DIR, f), 'utf8')) } catch (e) {
    rows.push({ slug, type: 'PARSE_FAIL', cls: 'ERROR', why: e.message }); continue
  }
  const existing = doc.pattern_class
  const { cls, why } = deriveClass(doc, slug)
  rows.push({ slug, type: doc.type, cls, why, existing })
}

const counts = {}
for (const r of rows) counts[r.cls] = (counts[r.cls] ?? 0) + 1
console.log('Derived pattern_class census:')
for (const [c, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`)

const amb = rows.filter(r => r.cls === 'AMBIGUOUS' || r.cls === 'ERROR')
if (amb.length) {
  console.log(`\n${amb.length} ambiguous/error (need spot review):`)
  for (const r of amb) console.log(`  ${r.slug} [${r.type}] — ${r.why}`)
}
const drift = rows.filter(r => r.existing && r.existing !== r.cls)
if (drift.length) {
  console.log(`\n${drift.length} existing pattern_class values differ from derivation:`)
  for (const r of drift) console.log(`  ${r.slug}: file says ${r.existing}, derived ${r.cls}`)
}

if (tsvPath) {
  fs.writeFileSync(tsvPath, 'slug\ttype\tclass\twhy\n' +
    rows.map(r => `${r.slug}\t${r.type}\t${r.cls}\t${r.why}`).join('\n') + '\n')
  console.log(`\nTSV written: ${tsvPath}`)
}

if (args.includes('--apply')) {
  if (amb.length) { console.error('\nRefusing to apply with ambiguous/error rows.'); process.exit(1) }
  const NOTE = c => `C1 verdict-model: add pattern_class: ${c} — classification-harness verdict class ` +
    `(concept patterns are scored as topic classifiers with decoy hits expected, not failed detectors; ` +
    `identifier/marking scoring unchanged); derived by scripts/derive-pattern-class.mjs + spot review`
  let inserted = 0, replaced = 0, skipped = 0
  for (const r of rows) {
    const file = path.join(DIR, `${r.slug}.yaml`)
    let text = fs.readFileSync(file, 'utf8')
    const nl = text.includes('\r\n') ? '\r\n' : '\n'
    const line = `pattern_class: ${r.cls}`
    const existing = text.match(/^pattern_class:[ \t]*(\S+)[ \t]*$/m)
    if (existing) {
      if (existing[1] === r.cls) { skipped++; continue }
      text = text.replace(/^pattern_class:[ \t]*\S+[ \t]*$/m, line)
      replaced++
    } else {
      // insert immediately after the top-level type: line (every pattern has one; REQUIRED)
      if (!/^type: /m.test(text)) { console.error(`${r.slug}: no top-level type: line`); process.exit(1) }
      text = text.replace(/^(type: .*(?:\r?\n))/m, `$1${line}${nl}`)
      inserted++
    }
    fs.writeFileSync(file, text)
    bumpPatternVersion(r.slug, NOTE(r.cls))
  }
  console.log(`\napply: ${inserted} inserted, ${replaced} replaced, ${skipped} already current (version-bumped: ${inserted + replaced})`)
}

#!/usr/bin/env node
// One-off migration (2026-10-30): give every regex in data/patterns and data/identifiers one
// capturing group around its reported match (rules in scripts/lib/capture-groups.mjs).
//
// Each regex scalar is rewritten in place in its existing YAML style; nothing else in a file
// is touched. Every rewritten file is re-parsed and must equal the original document with only
// the intended regex values replaced, or the run aborts before writing anything. Where wrapping
// moves a bare `\S+` / `\S{n,}` inside the group (which purviewBanned() rejects), that `\S` is
// written as `[^\s]`. Changed patterns get a minor version bump, `updated` and a changelog entry
// (scripts/lib/bump-pattern-version.mjs). Idempotent: a second run changes nothing.
//
// Usage: node scripts/wrap-capture-groups.mjs            # dry run, prints a summary
//        node scripts/wrap-capture-groups.mjs --write    # rewrite files and bump versions
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import yaml from 'js-yaml'
import { wrapWholeMatch, nonSpaceAsClass, regexFields } from './lib/capture-groups.mjs'
import { purviewBanned } from './lib/purview-banned.mjs'

const WRITE = process.argv.includes('--write')
const DATE = '2026-10-30'
const NOTE = 'Regex shape only: each regex now has one capturing group around the match it reports (our \\b and lookaround boundaries stay outside it). Matching is unchanged; the aim is best-effort Copilot prompt blocking.'
// Hand-edited before this script ran (the backreference cannot keep a group of its own).
const HAND_NOTES = {
  'global-top500-275-key-recovery-material': 'Evidence_recovery_value used a backreference to reject eight identical blocks, which needs a second capturing group. It is replaced by Evidence_recovery_value_pos1..pos6 (one per digit position: that position is not the same in all eight blocks) combined as an any-of group with min_matches 1 in both tiers. "Some position differs" is "not all blocks identical", so evidence presence is unchanged.',
}

// Rewrite one regex; returns { out, rule, nonSpace }.
export function migrateRegex(src) {
  const r = wrapWholeMatch(src)
  const before = new Set(purviewBanned(src))
  const fresh = (s) => purviewBanned(s).filter(i => !before.has(i) && !/^\d+ capturing groups$/.test(i))
  if (!fresh(r.out).length) return { ...r, nonSpace: false }
  const alt = nonSpaceAsClass(r.out)
  const left = fresh(alt)
  if (left.length) throw new Error(`wrapping adds Purview-banned constructs: ${left.join('; ')}`)
  return { ...r, out: alt, nonSpace: true }
}

// ── YAML scalar location and emission (block, plain, single- and double-quoted) ──
const indentOf = (l) => l.match(/^ */)[0].length

function scalarExtent(lines, i) {
  const m = lines[i].match(/^( *)(- )?pattern:(.*)$/)
  const keyIndent = m[1].length + (m[2] ? 2 : 0)
  const rest = m[3].trim()
  let end = i
  if (/^[>|]/.test(rest)) {
    let j = i + 1
    while (j < lines.length && (lines[j].trim() === '' || indentOf(lines[j]) > keyIndent)) j++
    end = j - 1
    while (end > i && lines[end].trim() === '') end--
  } else if (rest.startsWith("'") || rest.startsWith('"')) {
    const q = rest[0]
    let text = rest.slice(1)
    let j = i
    const closed = (s) => q === "'" ? /^(?:[^']|'')*'/.test(s) : /^(?:[^"\\]|\\.)*"/.test(s)
    while (!closed(text)) { j++; if (j >= lines.length) throw new Error(`unterminated ${q} scalar at line ${i + 1}`); text += '\n' + lines[j] }
    end = j
  } else if (i + 1 < lines.length && lines[i + 1].trim() && indentOf(lines[i + 1]) > keyIndent && !/^ *(- |[A-Za-z_]+:)/.test(lines[i + 1])) {
    throw new Error(`multi-line plain scalar at line ${i + 1}`)
  }
  const snippet = ['pattern:' + m[3], ...lines.slice(i + 1, end + 1).map(l => l.slice(Math.min(keyIndent, indentOf(l))))].join('\n')
  return { end, keyIndent, head: m[1] + (m[2] ?? ''), style: rest[0], value: yaml.load(snippet).pattern }
}

function emitScalar(ext, value) {
  const head = `${ext.head}pattern:`
  const loads = (lines) => yaml.load(['pattern:' + lines[0].slice(head.length), ...lines.slice(1).map(l => l.slice(ext.keyIndent))].join('\n')).pattern === value
  const candidates = []
  if (ext.style === '>' || ext.style === '|') candidates.push([`${head} >-`, ' '.repeat(ext.keyIndent + 2) + value])
  if (ext.style === '"') candidates.push([`${head} "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`])
  if (ext.style !== "'" && ext.style !== '"' && ext.style !== '>' && ext.style !== '|') candidates.push([`${head} ${value}`])
  candidates.push([`${head} '${value.replace(/'/g, "''")}'`])
  for (const c of candidates) if (loads(c)) return c
  throw new Error(`cannot emit ${JSON.stringify(value)}`)
}

function rewriteText(text, mapping) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    // A minority of pattern files are JSON (valid YAML): one `"pattern": "..."` per line.
    const json = lines[i].match(/^( *)"pattern": (".*")(,?)$/)
    if (json) {
      const value = JSON.parse(json[2])
      out.push(mapping.has(value) ? `${json[1]}"pattern": ${JSON.stringify(mapping.get(value))}${json[3]}` : lines[i])
      continue
    }
    if (!/^ *(- )?pattern:/.test(lines[i])) { out.push(lines[i]); continue }
    const ext = scalarExtent(lines, i)
    if (typeof ext.value === 'string' && mapping.has(ext.value) && mapping.get(ext.value) !== ext.value) out.push(...emitScalar(ext, mapping.get(ext.value)))
    else out.push(...lines.slice(i, ext.end + 1))
    i = ext.end
  }
  return out.join(eol)
}

// bump-pattern-version.mjs edits YAML lines; the JSON-format pattern files get the same bump here.
function bumpJsonText(text, note) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const at = (re) => { const i = lines.findIndex(l => re.test(l)); if (i < 0) throw new Error(`no line ${re}`); return i }
  const vi = at(/^ {2}"version": "\d+\.\d+\.\d+",$/)
  const [a, b] = lines[vi].match(/(\d+)\.(\d+)\.\d+/).slice(1)
  const version = `${a}.${Number(b) + 1}.0`
  lines[vi] = `  "version": "${version}",`
  lines[at(/^ {2}"updated": ".*",$/)] = `  "updated": "${DATE}",`
  const ci = at(/^ {2}"changelog": \[$/)
  lines.splice(ci + 1, 0, '    {', `      "version": "${version}",`, `      "date": "${DATE}",`, `      "description": ${JSON.stringify(note)}`, '    },')
  const t = lines.join(eol)
  const d = yaml.load(t)
  if (d.version !== version || d.changelog[0].description !== note) throw new Error('JSON bump did not parse back')
  return t
}

// ── Run ──
const plan = [] // { file, kind, slug, text, newText, changes: [{ where, src, out, rule, nonSpace }] }
const failures = []
for (const [dir, kind] of [['data/patterns', 'pattern'], ['data/identifiers', 'identifier']]) {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.yaml')).sort()) {
    const file = join(dir, f)
    const text = readFileSync(file, 'utf-8')
    const doc = yaml.load(text)
    const expected = yaml.load(text)
    const changes = []
    const mapping = new Map()
    const fields = regexFields(expected, kind)
    for (const [k, field] of regexFields(doc, kind).entries()) {
      try {
        const r = migrateRegex(field.src)
        changes.push({ where: field.where, src: field.src, ...r })
        if (mapping.has(field.src) && mapping.get(field.src) !== r.out) throw new Error('same source maps to two results')
        mapping.set(field.src, r.out)
        fields[k].set(r.out)
      } catch (e) { failures.push(`${file}: ${field.where} — ${e.message}`) }
    }
    if (!changes.some(c => c.out !== c.src)) { plan.push({ file, kind, slug: doc.slug ?? doc.key, changes }); continue }
    let newText
    try { newText = rewriteText(text, mapping) } catch (e) { failures.push(`${file}: ${e.message}`); continue }
    if (!isDeepStrictEqual(yaml.load(newText), expected)) { failures.push(`${file}: re-parsed document differs from the intended one`); continue }
    plan.push({ file, kind, slug: doc.slug ?? doc.key, text, newText, changes })
  }
}

const all = plan.flatMap(p => p.changes)
const tally = (key) => all.reduce((m, c) => m.set(c[key], (m.get(c[key]) ?? 0) + 1), new Map())
console.log(`regexes: ${all.length} in ${plan.length} files; rules ${JSON.stringify(Object.fromEntries(tally('rule')))}; \\S as [^\\s]: ${all.filter(c => c.nonSpace).length}`)
console.log(`files to rewrite: ${plan.filter(p => p.newText).length}`)
if (failures.length) { for (const f of failures) console.log('  FAIL ' + f); process.exit(1) }

if (WRITE) {
  const bumps = []
  let jsonBumps = 0
  for (const p of plan.filter(p => p.newText)) {
    const extra = HAND_NOTES[p.slug] ? [HAND_NOTES[p.slug]] : []
    if (p.changes.some(c => c.rule === 'regroup')) extra.push('An existing group around part of the match became (?:...).')
    if (p.changes.some(c => c.rule === 'wrap-after-keep')) extra.push('The group starts after \\K, where the reported match starts.')
    if (p.changes.some(c => c.nonSpace)) extra.push('\\S with an unbounded quantifier is written [^\\s] (same set) so the group does not trip the Purview \\S-in-group rule.')
    const note = [NOTE, ...extra].join(' ')
    if (p.kind === 'pattern' && p.newText.trimStart().startsWith('{')) { writeFileSync(p.file, bumpJsonText(p.newText, note)); jsonBumps++; continue }
    writeFileSync(p.file, p.newText)
    if (p.kind === 'pattern') bumps.push(`${p.slug}\t${note}`)
  }
  const r = spawnSync(process.execPath, ['scripts/lib/bump-pattern-version.mjs', '--stdin'], { input: bumps.join('\n') + '\n', env: { ...process.env, PATTERN_BUMP_DATE: DATE }, encoding: 'utf-8' })
  if (r.status !== 0) { console.error(r.stderr); process.exit(1) }
  console.log(`wrote ${plan.filter(p => p.newText).length} files; bumped ${bumps.length + jsonBumps} pattern versions (${jsonBumps} JSON-format)`)
}

#!/usr/bin/env node
// Writes sensitivity_labels.idcf (and idcf_marker when derived) into every pattern that lacks
// them, deprecated ones included, using idcfForLabels (docs/IDCF-CROSSWALK.md). Label-only
// sweep: no version bump, no changelog entry (precedent: backfill-qgiscf-labels.mjs).
// Line-based text edits only, never yaml.dump — patterns are hand-formatted. Idempotent.
// Usage: node scripts/backfill-idcf-labels.mjs [--dry-run]
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { idcfForLabels } from './lib/classification.mjs'

const DIR = 'data/patterns'
const DRY = process.argv.includes('--dry-run')
// Insert after the first of these present in the block, else at the block's end.
const ANCHORS = ['qgiscf_dlm', 'qgiscf', 'pspf']

// Block-style YAML: `sensitivity_labels:` followed by indented `key: value` lines.
function insertBlock(lines, add) {
  const start = lines.findIndex(l => /^sensitivity_labels:[ \t]*$/.test(l))
  if (start < 0) return false
  let end = start + 1
  while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++
  const block = lines.slice(start + 1, end)
  const indent = block[0]?.match(/^[ \t]*/)[0] ?? '  '
  let at = end
  for (const k of ANCHORS) {
    const i = block.findIndex(l => l.startsWith(`${indent}${k}:`))
    if (i >= 0) { at = start + 1 + i + 1; break }
  }
  lines.splice(at, 0, ...Object.entries(add).map(([k, v]) => `${indent}${k}: ${v}`))
  return true
}

// JSON-flow YAML: `"sensitivity_labels": {` with one `"key": "value",` entry per line.
function insertFlow(lines, add) {
  const start = lines.findIndex(l => /^[ \t]*"sensitivity_labels"[ \t]*:[ \t]*\{[ \t]*$/.test(l))
  if (start < 0) return false
  let end = start + 1
  while (end < lines.length && !/^[ \t]*\}/.test(lines[end])) end++
  const block = lines.slice(start + 1, end)
  const indent = block[0]?.match(/^[ \t]*/)[0] ?? '    '
  let at = end
  for (const k of ANCHORS) {
    const i = block.findIndex(l => l.startsWith(`${indent}"${k}"`))
    if (i >= 0) { at = start + 1 + i + 1; break }
  }
  if (at - 1 > start && !/,[ \t]*$/.test(lines[at - 1])) lines[at - 1] += ','
  const last = /^[ \t]*\}/.test(lines[at]) ? '' : ','
  const entries = Object.entries(add).map(([k, v]) => `${indent}"${k}": ${JSON.stringify(v)}`)
  lines.splice(at, 0, ...entries.map((e, i) => e + (i < entries.length - 1 ? ',' : last)))
  return true
}

const counts = { idcf: {}, idcf_marker: {} }
let updated = 0, unchanged = 0
for (const f of readdirSync(DIR).filter(f => f.endsWith('.yaml'))) {
  const path = join(DIR, f)
  const text = readFileSync(path, 'utf8')
  const sl = yaml.load(text)?.sensitivity_labels
  if (!sl) { console.warn(`${f}: no sensitivity_labels`); continue }
  const { idcf, idcf_marker } = idcfForLabels(sl)
  if (!idcf) { console.warn(`${f}: no IDCF derivable from ${JSON.stringify(sl)}`); continue }
  const add = {}
  if (!('idcf' in sl)) add.idcf = idcf
  if (idcf_marker && !('idcf_marker' in sl)) add.idcf_marker = idcf_marker
  if (!Object.keys(add).length) { unchanged++; continue }

  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(nl)
  const ok = /^[ \t]*"sensitivity_labels"/m.test(text) ? insertFlow(lines, add) : insertBlock(lines, add)
  if (!ok) { console.warn(`${f}: sensitivity_labels block not found, skipped`); continue }
  const next = lines.join(nl)
  const got = yaml.load(next).sensitivity_labels
  if (got.idcf !== idcf || got.idcf_marker !== idcf_marker) throw new Error(`${f}: edit did not round-trip (${JSON.stringify(got)})`)

  for (const [k, v] of Object.entries(add)) counts[k][v] = (counts[k][v] || 0) + 1
  if (!DRY) writeFileSync(path, next)
  updated++
}
console.log(JSON.stringify({ dryRun: DRY, updated, unchanged, counts }, null, 2))

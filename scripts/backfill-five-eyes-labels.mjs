#!/usr/bin/env node
// Writes missing Five Eyes sensitivity_labels keys (us_gov, uk_gov, nz_gov, ca_gov) into every
// pattern that lacks them, deprecated ones included, using fiveEyesForLabels. Existing curated
// values are never overwritten. Label-only sweep: no version bump, no changelog entry (precedent:
// backfill-idcf-labels.mjs). Line-based text edits only, never yaml.dump. Idempotent.
// Usage: node scripts/backfill-five-eyes-labels.mjs [--dry-run]
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { FIVE_EYES_KEYS, fiveEyesForLabels } from './lib/classification.mjs'

const DIR = 'data/patterns'
const DRY = process.argv.includes('--dry-run')

function formatYamlScalar(v) {
  const s = String(v)
  return /[:#{}[\],&*?|<>=!%@`]/.test(s) ? JSON.stringify(s) : s
}

function insertBlock(lines, add) {
  const start = lines.findIndex(l => /^sensitivity_labels:[ \t]*$/.test(l))
  if (start < 0) return false
  let end = start + 1
  while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++
  const block = lines.slice(start + 1, end)
  const indent = block[0]?.match(/^[ \t]*/)[0] ?? '  '
  lines.splice(end, 0, ...Object.entries(add).map(([k, v]) => `${indent}${k}: ${formatYamlScalar(v)}`))
  return true
}

function insertFlow(lines, add) {
  const start = lines.findIndex(l => /^[ \t]*"sensitivity_labels"[ \t]*:[ \t]*\{[ \t]*$/.test(l))
  if (start < 0) return false
  let end = start + 1
  while (end < lines.length && !/^[ \t]*\}/.test(lines[end])) end++
  const block = lines.slice(start + 1, end)
  const indent = block[0]?.match(/^[ \t]*/)[0] ?? '    '
  if (end - 1 > start && !/,[ \t]*$/.test(lines[end - 1])) lines[end - 1] += ','
  const entries = Object.entries(add).map(([k, v]) => `${indent}"${k}": ${JSON.stringify(v)}`)
  lines.splice(end, 0, ...entries.map((e, i) => e + (i < entries.length - 1 ? ',' : '')))
  return true
}

const counts = Object.fromEntries(FIVE_EYES_KEYS.map(k => [k, {}]))
let updated = 0, unchanged = 0
for (const f of readdirSync(DIR).filter(f => f.endsWith('.yaml'))) {
  const path = join(DIR, f)
  const text = readFileSync(path, 'utf8')
  const sl = yaml.load(text)?.sensitivity_labels
  if (!sl || typeof sl !== 'object' || Array.isArray(sl)) continue
  const derived = fiveEyesForLabels(sl)
  if (!derived) continue
  const add = {}
  for (const k of FIVE_EYES_KEYS) {
    if (!(k in sl) || typeof sl[k] !== 'string' || !sl[k].trim()) add[k] = derived[k]
  }
  if (!Object.keys(add).length) { unchanged++; continue }

  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(nl)
  const ok = /^[ \t]*"sensitivity_labels"/m.test(text) ? insertFlow(lines, add) : insertBlock(lines, add)
  if (!ok) { console.warn(`${f}: sensitivity_labels block not found, skipped`); continue }
  const next = lines.join(nl)
  const got = yaml.load(next).sensitivity_labels
  for (const [k, v] of Object.entries(add)) {
    if (got[k] !== v) throw new Error(`${f}: edit did not round-trip for ${k} (${JSON.stringify(got)})`)
    counts[k][v] = (counts[k][v] || 0) + 1
  }
  if (!DRY) writeFileSync(path, next)
  updated++
}
console.log(JSON.stringify({ dryRun: DRY, updated, unchanged, counts }, null, 2))

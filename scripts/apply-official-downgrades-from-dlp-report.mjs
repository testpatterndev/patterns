#!/usr/bin/env node
/**
 * Applies the DLPDeploy aggressive OFFICIAL downgrade report back into source
 * pattern YAML while preserving existing YAML layout.
 *
 * Usage:
 *   node scripts/apply-official-downgrades-from-dlp-report.mjs --dry-run
 *   node scripts/apply-official-downgrades-from-dlp-report.mjs --report C:/.../applied-official-downgrades.csv
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const reportArg = process.argv.indexOf('--report')
const REPORT = reportArg >= 0
  ? process.argv[reportArg + 1]
  : 'C:/claudecode/Compl8DLPDeploy/reports/classification-flush/applied-official-downgrades.csv'
const ROOT = join(import.meta.dirname, '..')
const PATTERNS_DIR = join(ROOT, 'data', 'patterns')
const TODAY = '2026-07-14'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) out.push(full)
  }
  return out
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  const header = rows.shift() ?? []
  return rows
    .filter(r => r.some(v => v !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

function scalar(content, field) {
  const m = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
  if (!m) return ''
  return m[1].trim().replace(/^['"]|['"]$/g, '')
}

function quoteYaml(value) {
  if (value === 'OFFICIAL') return 'OFFICIAL'
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function bumpPatch(version) {
  const parts = String(version || '1.0.0').split('.').map(n => Number.parseInt(n, 10))
  while (parts.length < 3) parts.push(0)
  if (parts.some(Number.isNaN)) return '1.0.1'
  parts[2] += 1
  return parts.slice(0, 3).join('.')
}

function replaceScalar(content, field, value) {
  const line = `${field}: ${value}`
  if (new RegExp(`^${field}:`, 'm').test(content)) {
    return content.replace(new RegExp(`^${field}:.*$`, 'm'), line)
  }
  const anchor = content.match(/^risk_description:/m) ? 'risk_description' : 'sensitivity_labels'
  return content.replace(new RegExp(`^${anchor}:`, 'm'), `${line}\n${anchor}:`)
}

function replaceBlock(content, field, value) {
  const lines = content.split('\n')
  const start = lines.findIndex(line => line.startsWith(`${field}:`))
  const block = [`${field}: >-`, ...String(value).split('\n').map(line => `  ${line}`)]
  if (start < 0) {
    const anchor = lines.findIndex(line => line.startsWith('sensitivity_labels:'))
    if (anchor < 0) return `${content.trimEnd()}\n${block.join('\n')}\n`
    lines.splice(anchor, 0, ...block)
    return lines.join('\n')
  }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i]) && lines[i].trim()) {
      end = i
      break
    }
  }
  lines.splice(start, end - start, ...block)
  return lines.join('\n')
}

function setNestedLabel(content, field, value) {
  if (!/^sensitivity_labels:\s*$/m.test(content)) {
    const insert = [
      'sensitivity_labels:',
      `  pspf: ${quoteYaml('OFFICIAL')}`,
      `  qgiscf: ${quoteYaml('OFFICIAL')}`,
      `  qgiscf_dlm: ${quoteYaml('OFFICIAL')}`,
    ].join('\n')
    return content.replace(/^purview:/m, `${insert}\npurview:`)
  }
  const re = new RegExp(`^  ${field}:.*$`, 'm')
  if (re.test(content)) return content.replace(re, `  ${field}: ${quoteYaml(value)}`)

  const lines = content.split('\n')
  const start = lines.findIndex(line => line === 'sensitivity_labels:')
  let insertAt = start + 1
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i]) && lines[i].trim()) break
    if (/^  [A-Za-z0-9_]+:/.test(lines[i])) insertAt = i + 1
  }
  lines.splice(insertAt, 0, `  ${field}: ${quoteYaml(value)}`)
  return lines.join('\n')
}

function addChangelog(content, version, reason) {
  const entry = [
    '  - version: ' + version,
    `    date: '${TODAY}'`,
    `    description: 'Classification hygiene: downgraded standalone item to OFFICIAL; ${reason.replace(/'/g, "''")}.'`,
  ].join('\n')
  if (/^changelog:\s*$/m.test(content)) {
    return content.replace(/^changelog:\s*$/m, `changelog:\n${entry}`)
  }
  return `${content.trimEnd()}\nchangelog:\n${entry}\n`
}

if (!existsSync(REPORT)) {
  throw new Error(`Report not found: ${REPORT}`)
}

const slugToFile = new Map()
for (const file of walk(PATTERNS_DIR)) {
  const content = readFileSync(file, 'utf-8')
  const slug = scalar(content, 'slug')
  if (slug) slugToFile.set(slug, file)
}

const rows = parseCsv(readFileSync(REPORT, 'utf-8'))
const candidates = rows.filter(row => row.official_candidate_decision === 'downgrade_to_official')
let changed = 0
let missing = 0
for (const row of candidates) {
  const file = slugToFile.get(row.slug)
  if (!file) {
    missing++
    continue
  }
  let content = readFileSync(file, 'utf-8')
  if (/^  qgiscf:\s*['"]?OFFICIAL['"]?\s*$/m.test(content) && /^  pspf:\s*['"]?OFFICIAL['"]?\s*$/m.test(content)) {
    continue
  }
  const oldVersion = scalar(content, 'version')
  const newVersion = bumpPatch(oldVersion)
  content = replaceScalar(content, 'version', newVersion)
  content = replaceScalar(content, 'risk_rating', String(row.candidate_risk || 4))
  content = replaceBlock(content, 'risk_description', row.candidate_risk_description || row.official_candidate_reason)
  content = setNestedLabel(content, 'pspf', 'OFFICIAL')
  content = setNestedLabel(content, 'qgiscf', 'OFFICIAL')
  content = setNestedLabel(content, 'qgiscf_dlm', 'OFFICIAL')
  content = replaceScalar(content, 'updated', `'${TODAY}'`)
  content = addChangelog(content, newVersion, row.official_candidate_reason || 'standalone identifier')
  changed++
  console.log(`${DRY_RUN ? 'would update' : 'updated'} ${relative(ROOT, file)} ${oldVersion} -> ${newVersion}`)
  if (!DRY_RUN) writeFileSync(file, content, 'utf-8')
}

console.log(`${DRY_RUN ? 'Would update' : 'Updated'} ${changed} pattern(s); ${missing} report row(s) had no source YAML.`)

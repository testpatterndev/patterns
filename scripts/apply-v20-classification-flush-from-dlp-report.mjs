#!/usr/bin/env node
/**
 * Applies a DLPDeploy classification flush back into source pattern YAML.
 *
 * The script intentionally skips any row where the workbook value would
 * raise the current source YAML classification. That keeps this pass focused on
 * de-risking over-classification and risk-floor fixes, without undoing earlier
 * OFFICIAL reductions that already exist in the catalog.
 *
 * Usage:
 *   node scripts/apply-v20-classification-flush-from-dlp-report.mjs --dry-run
 *   node scripts/apply-v20-classification-flush-from-dlp-report.mjs --report C:/.../all-current-classifications.csv
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const reportArg = process.argv.indexOf('--report')
const REPORT = reportArg >= 0
  ? process.argv[reportArg + 1]
  : 'C:/claudecode/Compl8DLPDeploy/reports/classification-flush-v21/all-current-classifications.csv'
const labelArg = process.argv.indexOf('--label')
const PASS_LABEL = labelArg >= 0 ? process.argv[labelArg + 1] : 'v21'
const ROOT = join(import.meta.dirname, '..')
const PATTERNS_DIR = join(ROOT, 'data', 'patterns')
const TODAY = '2026-07-14'

const RANK = new Map([
  ['N/A', 0],
  ['OFFICIAL', 1],
  ['OFFICIAL: Sensitive', 2],
  ['SENSITIVE', 2],
  ['PROTECTED', 3],
])

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
  if (rows.length && rows[0][0]?.charCodeAt(0) === 0xfeff) {
    rows[0][0] = rows[0][0].slice(1)
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

function nestedLabel(content, field) {
  const m = content.match(new RegExp(`^  ${field}:\\s*(.+)$`, 'm'))
  if (!m) return ''
  return m[1].trim().replace(/^['"]|['"]$/g, '')
}

function topLevel(value) {
  const text = String(value || '').trim().toUpperCase()
  if (text.startsWith('PROTECTED') || text.startsWith('MARKING PROTECTED')) return 'PROTECTED'
  if (text.startsWith('OFFICIAL: SENSITIVE') || text.startsWith('OFFICIAL:SENSITIVE')) return 'OFFICIAL: Sensitive'
  if (text.startsWith('SENSITIVE') || text.startsWith('MARKING SENSITIVE')) return 'SENSITIVE'
  if (text.startsWith('OFFICIAL') || text.startsWith('MARKING OFFICIAL')) return 'OFFICIAL'
  if (text === 'N/A') return 'N/A'
  return text || ''
}

function quoteYaml(value) {
  if (/^[A-Za-z0-9_./ -]+$/.test(value) && !value.includes(':')) return value
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

function riskDescription(row) {
  if (row.v19_risk_description) return row.v19_risk_description
  const dlm = String(row.v19_qgiscf_dlm || '')
  const reason = String(row.reason || row.v19_change_reason || '')
  const name = String(row.name || '').toLowerCase()
  if (topLevel(row.v19_qgiscf) === 'OFFICIAL') {
    return 'This standalone item is ordinary operational or reference metadata. It should remain OFFICIAL unless combined with stronger personal, financial, health, legal, security, or government-record context.'
  }
  if (topLevel(row.v19_qgiscf) === 'PROTECTED') {
    return 'Disclosure could cause high-consequence harm, including large-scale compromise, serious damage to government operations, or exposure of highly sensitive law-enforcement or protective marking material.'
  }
  if (name.includes('trade secret')) {
    return 'Disclosure could harm commercial confidence or competitive position, but the classifier does not by itself establish the large-scale compromise or high-consequence threshold for PROTECTED.'
  }
  if (dlm.includes('InfoTech') || reason.includes('credential') || reason.includes('security operations')) {
    return 'Exposure could assist unauthorized access, security bypass, or operational misuse in context, but the classifier does not by itself establish privileged, tenant-wide, or large-scale compromise. Treat as SENSITIVE InfoTech unless deployment context adds scale.'
  }
  if (dlm.includes('Financial')) {
    return 'Disclosure could contribute to financial fraud, payment misuse, or commercial harm when linked with account-holder or transaction context, but does not meet the PROTECTED threshold on its own.'
  }
  if (dlm.includes('Legal') || dlm.includes('Law-Enforcement')) {
    return 'Disclosure could prejudice legal, regulatory, or law-enforcement processes, but the classifier metadata does not establish the high-consequence threshold for PROTECTED.'
  }
  if (dlm.includes('Government')) {
    return 'Disclosure could affect government operations or decision-making, but the classifier metadata does not establish the high-consequence threshold for PROTECTED.'
  }
  return 'Disclosure could cause privacy, operational, legal, or commercial harm in context, but the classifier does not by itself meet the PROTECTED threshold.'
}

function shouldReplaceDescription(row, sourceHigher, needsRiskFloor) {
  if (sourceHigher || needsRiskFloor) return true
  return [
    'downgrade_to_official',
    'downgrade_to_sensitive',
    'protected_risk_floor',
    'sensitive_to_official',
    'sensitive_risk_cap',
    'official_risk_cap',
  ].some(changeType => String(row.v19_change_type || '').includes(changeType))
}

function addChangelog(content, version, row) {
  const reason = String(row.reason || row.v19_change_reason || row.v19_change_type || 'classification hygiene')
    .replace(/'/g, "''")
  const changelog = content.match(/^changelog:\s*$/m)
  const afterChangelog = changelog
    ? content.slice(changelog.index + changelog[0].length).split('\n').find(line => line.trim())
    : ''
  const indent = afterChangelog?.startsWith('  -') ? '  ' : ''
  const childIndent = `${indent}  `
  const entry = [
    `${indent}- version: ${version}`,
    `${childIndent}date: '${TODAY}'`,
    `${childIndent}description: 'Classification hygiene ${PASS_LABEL}: align risk and labels with DLPDeploy ${PASS_LABEL} aggressive downgrade pass; ${reason}.'`,
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
const candidates = rows
let changed = 0
let missing = 0
let skippedUpclassify = 0
let skippedNoop = 0
let skippedSourceCatalog = 0

for (const row of candidates) {
  const file = slugToFile.get(row.slug)
  if (!file) {
    missing++
    continue
  }
  let content = readFileSync(file, 'utf-8')
  const sourceTop = topLevel(nestedLabel(content, 'qgiscf'))
  const targetTop = topLevel(row.v19_qgiscf)
  if (!targetTop || targetTop === 'N/A') {
    continue
  }
  const sourceRisk = Number.parseInt(scalar(content, 'risk_rating') || '0', 10)
  const targetRisk = Number.parseInt(row.v19_risk || '0', 10)
  const sourceHigher = (RANK.get(sourceTop) ?? 0) > (RANK.get(targetTop) ?? 0)
  const needsRiskFloor = sourceTop === 'PROTECTED' && targetTop === 'PROTECTED' && targetRisk >= 9 && (!sourceRisk || sourceRisk < 9)
  if (row.v19_applied !== 'Y' && !sourceHigher && !needsRiskFloor) {
    continue
  }
  if (row.v19_change_type === 'source_catalog_downgrade' && !sourceHigher && !needsRiskFloor) {
    skippedSourceCatalog++
    continue
  }
  if ((RANK.get(targetTop) ?? 0) > (RANK.get(sourceTop) ?? 0)) {
    skippedUpclassify++
    continue
  }

  const oldVersion = scalar(content, 'version')
  const newVersion = bumpPatch(oldVersion)
  let next = content
  if (row.v19_change_type !== 'pspf_normalize' || sourceHigher || needsRiskFloor) {
    next = replaceScalar(next, 'risk_rating', String(row.v19_risk || scalar(content, 'risk_rating') || 4))
  }
  if (shouldReplaceDescription(row, sourceHigher, needsRiskFloor)) {
    next = replaceBlock(next, 'risk_description', riskDescription(row))
  }
  next = setNestedLabel(next, 'pspf', row.v19_pspf)
  next = setNestedLabel(next, 'qgiscf', row.v19_qgiscf)
  next = setNestedLabel(next, 'qgiscf_dlm', row.v19_qgiscf_dlm)
  if (next === content) {
    skippedNoop++
    continue
  }
  next = replaceScalar(next, 'version', newVersion)
  next = replaceScalar(next, 'updated', `'${TODAY}'`)
  next = addChangelog(next, newVersion, row)
  changed++
  console.log(`${DRY_RUN ? 'would update' : 'updated'} ${relative(ROOT, file)} ${oldVersion} -> ${newVersion} (${sourceTop} -> ${targetTop}; ${row.v19_change_type})`)
  if (!DRY_RUN) writeFileSync(file, next, 'utf-8')
}

console.log(`${DRY_RUN ? 'Would update' : 'Updated'} ${changed} pattern(s); ${missing} missing; ${skippedUpclassify} skipped up-classifications; ${skippedSourceCatalog} source-catalog rows skipped; ${skippedNoop} no-op.`)

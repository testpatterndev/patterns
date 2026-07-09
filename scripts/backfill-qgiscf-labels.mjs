#!/usr/bin/env node
/**
 * backfill-qgiscf-labels.mjs
 *
 * Adds sensitivity_labels.qgiscf + qgiscf_dlm to patterns that lack them.
 * Preserves existing sensitivity_labels keys (pspf, us_gov, etc.).
 *
 * Heuristic (calibrated against the 590 already-labeled corpus):
 *   risk_rating ≥ 9  → PROTECTED (often bare PROTECTED DLM for secrets/IDs)
 *   risk_rating ≥ 6  → SENSITIVE
 *   else             → OFFICIAL
 * DLM refined by slug/category keywords (health, finance, credentials, legal…).
 *
 * Usage:
 *   node scripts/backfill-qgiscf-labels.mjs --dry-run
 *   node scripts/backfill-qgiscf-labels.mjs
 *   node scripts/backfill-qgiscf-labels.mjs --only phase2  # only phase-1/2 slugs
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PATTERNS_DIR = join(__dirname, '..', 'data', 'patterns')
const DRY_RUN = process.argv.includes('--dry-run')
const ONLY_PHASE = process.argv.includes('--only') && process.argv.includes('phase2')

const PHASE_SLUGS = new Set([
  'uk-vat-number', 'ca-business-number', 'in-ifsc', 'in-upi-vpa', 'in-uan',
  'sg-uen', 'cn-uscc', 'mx-clabe', 'id-npwp', 'br-cnh', 'sa-iqama',
  'ph-sss', 'ph-philhealth', 'global-ndc', 'vn-citizen-id',
  'br-pix-key', 'ca-ohip-number', 'uk-chi-number', 'ng-nin', 'ke-national-id',
  'global-loinc', 'pe-dni',
])

function getTopLevel(content, field) {
  const m = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
  if (!m) return null
  return m[1].trim().replace(/^['"]|['"]$/g, '')
}

function getCategories(content) {
  const m = content.match(/^categories:\s*$([\s\S]*?)(?=^[a-z_]+:|\Z)/m)
  if (!m) return []
  return [...m[1].matchAll(/^\s*-\s*(\S+)/gm)].map((x) => x[1].toLowerCase())
}

function hasQgiscf(content) {
  return /^sensitivity_labels:[\s\S]*?^ {2}qgiscf:\s*\S+/m.test(content)
}

function classify(slug, content) {
  const cats = getCategories(content)
  const blob = `${slug} ${cats.join(' ')}`.toLowerCase()
  const riskRaw = getTopLevel(content, 'risk_rating')
  const risk = riskRaw && /^\d+$/.test(riskRaw) ? parseInt(riskRaw, 10) : null

  const isCred =
    /credential|secret|password|token|api[-_]?key|private[-_]?key|connection[-_]?string|ssh|certificate|saml|oauth|mfa|combolist|htpasswd|unattend|jenkins|kubernetes.*secret|aws|azure|gcp|github-pat|slack-token|npm.*token|snaffler/.test(
      blob
    )
  const isHealth =
    /health|medical|medicare|phi|clinical|diagnosis|ndc|loinc|icd|nhs|ohip|chi|phin|ihi|hpi|philhealth|patient|prescription|hl7/.test(
      blob
    )
  const isFin =
    /financ|bank|payment|tax|vat|iban|swift|bsb|clabe|upi|ifsc|cnpj|cpf|pix|payid|credit[-_]?card|debit|account[-_]?number|routing|salary|payroll|invoice/.test(
      blob
    )
  const isLegal = /legal|litigation|privilege|solicitor|counsel|attorney|contract/.test(blob)
  const isLaw = /law[-_]?enforcement|police|investigation|warrant|criminal/.test(blob)
  const isGov = /cabinet|government|classified|marking|pspf|qgiscf|agency|minister/.test(blob)
  const isIT = /infotech|source[-_]?code|network|infrastructure|architecture|config/.test(blob)
  const isId =
    /national[-_]?id|passport|driver|licence|license|nin|dni|cnh|iqama|uen|uscc|npwp|identity|biometric|fingerprint|voiceprint/.test(
      blob
    )
  const isMarking = /marking|classification[-_]?banner|protective[-_]?mark/.test(blob)

  let qgiscf
  if (isMarking) {
    // markings usually map by name, not risk
    if (/secret|topsecret|protected/.test(blob)) qgiscf = 'PROTECTED'
    else if (/sensitive|restricted|confidential/.test(blob)) qgiscf = 'SENSITIVE'
    else qgiscf = 'OFFICIAL'
  } else if (isCred) {
    qgiscf = 'PROTECTED'
  } else if (risk != null) {
    if (risk >= 9) qgiscf = 'PROTECTED'
    else if (risk >= 6) qgiscf = 'SENSITIVE'
    else qgiscf = 'OFFICIAL'
  } else {
    // no risk: conservative SENSITIVE for identifiers, OFFICIAL otherwise
    qgiscf = isId || isHealth || isFin || isLegal ? 'SENSITIVE' : 'OFFICIAL'
  }

  // DLM
  let dlm
  if (qgiscf === 'OFFICIAL') {
    dlm = 'OFFICIAL'
  } else if (qgiscf === 'PROTECTED') {
    if (isLaw) dlm = 'PROTECTED Law-Enforcement'
    else if (isGov) dlm = 'PROTECTED Government'
    else if (isLegal) dlm = 'PROTECTED Legal'
    else if (isFin) dlm = 'PROTECTED Financial'
    else if (isIT || isCred) dlm = 'PROTECTED' // bare PROTECTED for secrets (corpus majority)
    else if (isHealth) dlm = 'PROTECTED'
    else dlm = 'PROTECTED'
  } else {
    // SENSITIVE
    if (isFin) dlm = 'SENSITIVE Financial'
    else if (isLegal) dlm = 'SENSITIVE Legal'
    else if (isLaw) dlm = 'SENSITIVE Law-Enforcement'
    else if (isGov) dlm = 'SENSITIVE Government'
    else if (isIT) dlm = 'SENSITIVE InfoTech'
    else if (isHealth || isId) dlm = 'SENSITIVE Personal-Privacy'
    else dlm = 'SENSITIVE Personal-Privacy'
  }

  // PSPF companion when missing (optional fill)
  let pspf = null
  if (qgiscf === 'PROTECTED') pspf = 'PROTECTED'
  else if (qgiscf === 'SENSITIVE') pspf = 'OFFICIAL: Sensitive'
  else pspf = 'OFFICIAL'

  return { qgiscf, qgiscf_dlm: dlm, pspf }
}

function quote(val) {
  // quote when has spaces or colon
  if (/[:\s]/.test(val)) return `"${val}"`
  return val
}

function injectLabels(content, { qgiscf, qgiscf_dlm, pspf }) {
  // Case 1: sensitivity_labels block exists but no qgiscf
  if (/^sensitivity_labels:\s*$/m.test(content)) {
    const lines = content.split('\n')
    let start = -1
    for (let i = 0; i < lines.length; i++) {
      if (/^sensitivity_labels:\s*$/.test(lines[i])) {
        start = i
        break
      }
    }
    if (start < 0) throw new Error('sensitivity_labels not found after match')
    // find end of block (next top-level key or EOF)
    let end = lines.length
    for (let j = start + 1; j < lines.length; j++) {
      if (/^\S/.test(lines[j]) && !/^$/.test(lines[j])) {
        end = j
        break
      }
    }
    const block = lines.slice(start + 1, end)
    const has = (k) => block.some((l) => new RegExp(`^ {2}${k}:`).test(l))
    const inserts = []
    if (!has('pspf')) inserts.push(`  pspf: ${quote(pspf)}`)
    if (!has('qgiscf')) inserts.push(`  qgiscf: ${quote(qgiscf)}`)
    if (!has('qgiscf_dlm')) inserts.push(`  qgiscf_dlm: ${quote(qgiscf_dlm)}`)
    // Prefer pspf/qgiscf near top of block
    const newBlock = [...inserts, ...block]
    return [...lines.slice(0, start + 1), ...newBlock, ...lines.slice(end)].join('\n')
  }

  // Case 2: no sensitivity_labels at all — insert before risk_rating or at end of front-matter-ish area
  const block = [
    'sensitivity_labels:',
    `  pspf: ${quote(pspf)}`,
    `  qgiscf: ${quote(qgiscf)}`,
    `  qgiscf_dlm: ${quote(qgiscf_dlm)}`,
    '',
  ].join('\n')

  // Prefer after jurisdictions/regulations/categories, before pattern: or purview:
  const anchors = [/^pattern:/m, /^purview:/m, /^confidence_levels:/m, /^test_cases:/m, /^risk_rating:/m]
  for (const re of anchors) {
    const m = content.match(re)
    if (m && m.index != null) {
      return content.slice(0, m.index) + block + content.slice(m.index)
    }
  }
  return content.trimEnd() + '\n\n' + block
}

const files = readdirSync(PATTERNS_DIR).filter((f) => f.endsWith('.yaml'))
let scanned = 0
let skipped = 0
let updated = 0
const dist = { OFFICIAL: 0, SENSITIVE: 0, PROTECTED: 0 }
const samples = []

for (const file of files) {
  const slug = file.replace(/\.yaml$/, '')
  if (ONLY_PHASE && !PHASE_SLUGS.has(slug)) continue
  scanned++
  const path = join(PATTERNS_DIR, file)
  let content = readFileSync(path, 'utf8')
  // normalize rare CRLF for matching only; write back original line endings style
  const crlf = content.includes('\r\n')
  const norm = crlf ? content.replace(/\r\n/g, '\n') : content
  if (hasQgiscf(norm)) {
    skipped++
    continue
  }
  const labels = classify(slug, norm)
  dist[labels.qgiscf] = (dist[labels.qgiscf] || 0) + 1
  const next = injectLabels(norm, labels)
  if (next === norm) {
    console.warn(`WARN: no change for ${slug}`)
    continue
  }
  const out = crlf ? next.replace(/\n/g, '\r\n') : next
  if (!DRY_RUN) writeFileSync(path, out, 'utf8')
  updated++
  if (samples.length < 12) samples.push({ slug, ...labels })
}

console.log(
  JSON.stringify(
    {
      dryRun: DRY_RUN,
      onlyPhase: ONLY_PHASE,
      scanned,
      alreadyHadQgiscf: skipped,
      updated,
      distribution: dist,
      samples,
    },
    null,
    2
  )
)

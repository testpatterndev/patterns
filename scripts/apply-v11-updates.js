#!/usr/bin/env node
/**
 * apply-v11-updates.js
 *
 * Applies changes from SIT-Risk-Analysis-v11.xlsx to pattern YAML files.
 *
 * Updates: sensitivity_labels (pspf, qgiscf, qgiscf_dlm), risk_rating,
 * risk_description, and adds new fields (classification_rationale,
 * classification_tier, generic_classification, generic_rationale,
 * generic_dlm, label_code, tenant_sizing, classifier_type).
 *
 * Usage: node scripts/apply-v11-updates.js [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const PATTERNS_DIR = join(import.meta.dirname, '..', 'data', 'patterns')

// Load v11 spreadsheet data
const v11Data = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'testpattern', '_sit-risk-v11.json'), 'utf-8'))

// Filter to TestPattern + QLD-Custom only
const ourRows = v11Data.filter(r => r.Source === 'TestPattern' || r.Source === 'QLD-Custom')
console.log(`Loaded ${ourRows.length} TestPattern/QLD-Custom rows from v11`)

// Build lookup by slug
const v11BySlug = new Map()
for (const row of ourRows) {
  const slug = row['GUID / Slug']
  if (slug) v11BySlug.set(slug, row)
}

// YAML field helpers — we do targeted string replacements to preserve formatting
function readYaml(filePath) {
  return readFileSync(filePath, 'utf-8')
}

function getYamlValue(content, field) {
  // Match top-level field (no leading spaces)
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'm')
  const m = content.match(re)
  if (!m) return null
  let val = m[1].trim()
  // Strip quotes
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    val = val.slice(1, -1)
  }
  return val
}

function getNestedValue(content, parent, field) {
  // Match field under a parent block (2-space indent)
  const re = new RegExp(`^${parent}:[\\s\\S]*?^  ${field}:\\s*(.+)$`, 'm')
  const m = content.match(re)
  if (!m) return null
  let val = m[1].trim()
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    val = val.slice(1, -1)
  }
  return val
}

function replaceYamlField(content, field, oldVal, newVal) {
  // Handle quoted values
  const quotedOld = oldVal.includes(':') ? `'${oldVal}'` : oldVal
  const quotedNew = newVal.includes(':') ? `'${newVal}'` : newVal

  // Try exact match with quotes first
  const pattern1 = `${field}: ${quotedOld}`
  const replacement1 = `${field}: ${quotedNew}`
  if (content.includes(pattern1)) {
    return content.replace(pattern1, replacement1)
  }

  // Try without quotes
  const pattern2 = `${field}: ${oldVal}`
  const replacement2 = `${field}: ${quotedNew}`
  if (content.includes(pattern2)) {
    return content.replace(pattern2, replacement2)
  }

  return null // no match found
}

function replaceMultilineField(content, field, newVal) {
  // Replace a top-level field that might be multiline (risk_description)
  // Matches field: value OR field: 'multi\n  line' OR field: >-\n  text
  const lines = content.split('\n')
  let startIdx = -1
  let endIdx = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(new RegExp(`^${field}:`))) {
      startIdx = i
      // Find end: next top-level field (no indent) or EOF
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].match(/^\S/) && !lines[j].match(/^$/)) {
          endIdx = j
          break
        }
      }
      if (endIdx === -1) endIdx = lines.length
      break
    }
  }

  if (startIdx === -1) return null

  // Build replacement
  const escaped = newVal.replace(/'/g, "''")
  const needsQuotes = newVal.includes(':') || newVal.includes('#') || newVal.includes("'")
  let replacement
  if (newVal.length > 100 || newVal.includes('\n')) {
    // Use block scalar for long text
    const indented = newVal.split('\n').map(l => '  ' + l).join('\n')
    replacement = `${field}: >\n${indented}`
  } else if (needsQuotes) {
    replacement = `${field}: '${escaped}'`
  } else {
    replacement = `${field}: ${newVal}`
  }

  lines.splice(startIdx, endIdx - startIdx, replacement)
  return lines.join('\n')
}

function addFieldBeforeSection(content, sectionField, newFieldBlock) {
  // Insert new fields before a known section (e.g., before 'references:')
  const idx = content.indexOf(`\n${sectionField}:`)
  if (idx === -1) {
    // Try end of file
    return content.trimEnd() + '\n' + newFieldBlock + '\n'
  }
  return content.slice(0, idx) + '\n' + newFieldBlock + content.slice(idx)
}

// Stats
const stats = {
  pspf_changed: 0,
  qgiscf_changed: 0,
  qgiscf_dlm_changed: 0,
  risk_rating_changed: 0,
  risk_desc_changed: 0,
  new_fields_added: 0,
  files_modified: 0,
  files_not_found: 0,
  errors: [],
}

for (const [slug, row] of v11BySlug) {
  const filePath = join(PATTERNS_DIR, `${slug}.yaml`)
  if (!existsSync(filePath)) {
    stats.files_not_found++
    continue
  }

  let content = readYaml(filePath)
  let modified = false

  // --- 1. Update sensitivity_labels ---
  const newPspf = row['Australian PSPF Classification']
  const newQgiscf = row['QGISCF']
  const newDlm = row['QGISCF DLM']

  if (newPspf) {
    const curPspf = getNestedValue(content, 'sensitivity_labels', 'pspf')
    if (curPspf && curPspf !== newPspf) {
      const result = replaceYamlField(content, '  pspf', curPspf, newPspf)
      if (result) {
        content = result
        modified = true
        stats.pspf_changed++
      }
    }
  }

  if (newQgiscf) {
    const curQgiscf = getNestedValue(content, 'sensitivity_labels', 'qgiscf')
    if (curQgiscf && curQgiscf !== newQgiscf) {
      const result = replaceYamlField(content, '  qgiscf', curQgiscf, newQgiscf)
      if (result) {
        content = result
        modified = true
        stats.qgiscf_changed++
      }
    }
  }

  if (newDlm) {
    const curDlm = getNestedValue(content, 'sensitivity_labels', 'qgiscf_dlm')
    if (curDlm && curDlm !== newDlm) {
      const result = replaceYamlField(content, '  qgiscf_dlm', curDlm, newDlm)
      if (result) {
        content = result
        modified = true
        stats.qgiscf_dlm_changed++
      }
    }
  }

  // --- 2. Update risk_rating ---
  const newRating = row['Risk Rating (1-10)']
  if (newRating != null) {
    const curRating = getYamlValue(content, 'risk_rating')
    if (curRating && parseInt(curRating) !== newRating) {
      const result = content.replace(
        new RegExp(`^risk_rating:\\s*${curRating}\\s*$`, 'm'),
        `risk_rating: ${newRating}`
      )
      if (result !== content) {
        content = result
        modified = true
        stats.risk_rating_changed++
      }
    }
  }

  // --- 3. Update risk_description ---
  const newDesc = row['Risk Description']
  if (newDesc) {
    const curDesc = getYamlValue(content, 'risk_description')
    // Only update if substantially different (not just whitespace)
    if (curDesc && curDesc.trim() !== newDesc.trim()) {
      const result = replaceMultilineField(content, 'risk_description', newDesc.trim())
      if (result) {
        content = result
        modified = true
        stats.risk_desc_changed++
      }
    }
  }

  // --- 4. Add new v11 fields ---
  // Check if classification_rationale already exists
  if (!content.includes('classification_rationale:')) {
    const newFields = []

    const classRationale = row['Classification Rationale']
    const classTier = row['Classification Tier']
    const genClass = row['Generic Classification']
    const genRationale = row['Generic Rationale']
    const genDlm = row['Generic DLM']
    const labelCode = row['Label Code']
    const classifierType = row['Classifier Type']

    // Tenant sizing
    const tenantSmall = row['Small (tenant)'] === 'Y'
    const tenantMedium = row['Medium (tenant)'] === 'Y'
    const tenantLarge = row['Large (tenant)'] === 'Y'

    if (labelCode) {
      newFields.push(`label_code: ${labelCode}`)
    }
    if (classifierType) {
      newFields.push(`classifier_type: ${classifierType}`)
    }
    if (classTier) {
      newFields.push(`classification_tier: ${classTier}`)
    }
    if (classRationale) {
      const escaped = classRationale.replace(/'/g, "''")
      if (classRationale.length > 100) {
        const indented = classRationale.match(/.{1,78}(\s|$)/g).map(l => '  ' + l.trim()).join('\n')
        newFields.push(`classification_rationale: >\n${indented}`)
      } else {
        newFields.push(`classification_rationale: '${escaped}'`)
      }
    }
    if (genClass) {
      newFields.push(`generic_classification: ${genClass}`)
    }
    if (genRationale) {
      const escaped = genRationale.replace(/'/g, "''")
      if (genRationale.length > 100) {
        const indented = genRationale.match(/.{1,78}(\s|$)/g).map(l => '  ' + l.trim()).join('\n')
        newFields.push(`generic_rationale: >\n${indented}`)
      } else {
        newFields.push(`generic_rationale: '${escaped}'`)
      }
    }
    if (genDlm) {
      newFields.push(`generic_dlm: ${genDlm}`)
    }

    // Tenant sizing as a list
    const tenants = []
    if (tenantSmall) tenants.push('small')
    if (tenantMedium) tenants.push('medium')
    if (tenantLarge) tenants.push('large')
    if (tenants.length > 0) {
      newFields.push(`tenant_sizing:\n${tenants.map(t => `- ${t}`).join('\n')}`)
    }

    if (newFields.length > 0) {
      const block = newFields.join('\n')
      // Insert before 'references:' or 'created:' or at end
      const insertBefore = content.includes('\nreferences:') ? 'references' :
                           content.includes('\ncreated:') ? 'created' : null
      if (insertBefore) {
        content = addFieldBeforeSection(content, insertBefore, block)
      } else {
        content = content.trimEnd() + '\n' + block + '\n'
      }
      modified = true
      stats.new_fields_added++
    }
  }

  // --- Write ---
  if (modified) {
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would update: ${slug}`)
    } else {
      writeFileSync(filePath, content, 'utf-8')
    }
    stats.files_modified++
  }
}

console.log('\n=== Update Summary ===')
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
console.log(`Files modified: ${stats.files_modified}`)
console.log(`Files not found: ${stats.files_not_found}`)
console.log(`PSPF changed: ${stats.pspf_changed}`)
console.log(`QGISCF changed: ${stats.qgiscf_changed}`)
console.log(`QGISCF DLM changed: ${stats.qgiscf_dlm_changed}`)
console.log(`Risk rating changed: ${stats.risk_rating_changed}`)
console.log(`Risk description changed: ${stats.risk_desc_changed}`)
console.log(`New fields added: ${stats.new_fields_added}`)
if (stats.errors.length) {
  console.log(`Errors: ${stats.errors.length}`)
  stats.errors.forEach(e => console.log(`  ${e}`))
}

#!/usr/bin/env node
/**
 * Adds shared_keywords refs to the remaining 242 patterns that have purview:
 * blocks but no shared_keywords: block.
 *
 * For every pattern:
 *   - Always adds template-exclusion (noise/template exclusion)
 *   - Adds data-record-context if any keyword term overlaps
 *   - Adds generic-data-labels if any keyword term overlaps
 *
 * Does NOT modify match trees — just adds the keyword definitions so they're
 * available for future use and resolve at compile time.
 *
 * Usage:
 *   node scripts/migrate-remaining-shared-keywords.mjs              # dry-run
 *   node scripts/migrate-remaining-shared-keywords.mjs --write      # apply
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')

const PATTERNS_DIR = join('data', 'patterns')

// Terms from the shared keyword dictionaries (lowercase for comparison)
const DATA_RECORD_CONTEXT_TERMS = new Set([
  'field', 'column', 'row', 'entry', 'record', 'value', 'form',
  'register', 'database', 'extract', 'export', 'spreadsheet',
  'table', 'schedule', 'appendix', 'attachment', 'registry'
])

const GENERIC_DATA_LABELS_TERMS = new Set([
  'id', 'identifier', 'number', 'reference', 'code', 'index',
  'serial', 'account', 'file number', 'case number', 'record number', 'ref'
])

/**
 * Extract all keyword terms from a pattern's purview.keywords block
 */
function extractAllKeywordTerms(purview) {
  const terms = new Set()
  if (!purview?.keywords) return terms
  for (const kw of purview.keywords) {
    if (!kw.groups) continue
    for (const g of kw.groups) {
      if (!g.terms) continue
      for (const t of g.terms) {
        terms.add(String(t).toLowerCase())
      }
    }
  }
  return terms
}

/**
 * Check if any of the pattern's terms overlap with a dictionary's terms
 */
function hasOverlap(patternTerms, dictTerms) {
  for (const t of patternTerms) {
    if (dictTerms.has(t)) return true
  }
  return false
}

/**
 * Build the shared_keywords YAML block to insert
 */
function buildSharedKeywordsBlock(addDataRecordContext, addGenericDataLabels) {
  let block = '  shared_keywords:\n'
  block += '    - dict: template-exclusion\n'
  block += '      as: Keyword_noise_exclusion\n'
  block += '      match_style: word\n'

  if (addDataRecordContext) {
    block += '    - dict: data-record-context\n'
    block += '      as: Evidence_data_record_context\n'
    block += '      match_style: word\n'
  }

  if (addGenericDataLabels) {
    block += '    - dict: generic-data-labels\n'
    block += '      as: Evidence_generic_data_labels\n'
    block += '      match_style: word\n'
  }

  return block
}

/**
 * Add dictionary refs to corroborative_evidence.keyword_lists if section exists
 */
function addToKeywordLists(content, addDataRecordContext, addGenericDataLabels) {
  const lines = content.split('\n')
  const result = []
  let inKeywordLists = false
  let lastKeywordListLine = -1
  let keywordListsIndent = 0

  // Track what's already present
  const hasTemplateExclusion = content.includes('template-exclusion')
  const hasDataRecordContext = content.includes('data-record-context')
  const hasGenericDataLabels = content.includes('generic-data-labels')

  // Find the corroborative_evidence.keyword_lists section
  for (let i = 0; i < lines.length; i++) {
    // Only match keyword_lists that are inside corroborative_evidence (indented)
    if (/^\s{2,}keyword_lists:\s*$/.test(lines[i])) {
      // Check we're inside corroborative_evidence by looking backwards
      let insideCorroborative = false
      for (let j = i - 1; j >= 0; j--) {
        if (/^corroborative_evidence:/.test(lines[j])) { insideCorroborative = true; break }
        if (/^\S/.test(lines[j]) && lines[j].trim() !== '') break
      }
      if (insideCorroborative) {
        inKeywordLists = true
        keywordListsIndent = lines[i].search(/\S/)
      }
    }

    if (inKeywordLists && i > 0) {
      // Check if this line is a keyword_lists entry
      const entryMatch = lines[i].match(/^(\s+)- (.+)/)
      if (entryMatch && entryMatch[1].length > keywordListsIndent) {
        lastKeywordListLine = i
      } else if (lines[i].trim() !== '' && !lines[i].match(/^\s*$/)) {
        // Non-empty, non-entry line — we've left the keyword_lists section
        // But only if it's not more indented than keyword_lists
        const indent = lines[i].search(/\S/)
        if (indent <= keywordListsIndent) {
          inKeywordLists = false
        }
      }
    }
  }

  if (lastKeywordListLine === -1) {
    // No keyword_lists section found — return content unchanged
    return content
  }

  // Determine indent for new entries (match existing entries)
  const entryMatch = lines[lastKeywordListLine].match(/^(\s+)- /)
  const entryIndent = entryMatch ? entryMatch[1] : '    '

  // Build new entries to add
  const newEntries = []
  if (!hasTemplateExclusion) {
    // template-exclusion is an exclusion dict, not usually added to keyword_lists
    // Skip — it's a noise exclusion, not evidence
  }
  if (addDataRecordContext && !hasDataRecordContext) {
    newEntries.push(`${entryIndent}- data-record-context`)
  }
  if (addGenericDataLabels && !hasGenericDataLabels) {
    newEntries.push(`${entryIndent}- generic-data-labels`)
  }

  if (newEntries.length === 0) return content

  // Insert after last keyword list entry
  const before = lines.slice(0, lastKeywordListLine + 1)
  const after = lines.slice(lastKeywordListLine + 1)
  return [...before, ...newEntries, ...after].join('\n')
}

// --- Main ---

const allFiles = readdirSync(PATTERNS_DIR)
  .filter(f => f.endsWith('.yaml'))
  .map(f => join(PATTERNS_DIR, f))

let updated = 0
let skipped = 0
let errors = 0
let withDRC = 0
let withGDL = 0

for (const filePath of allFiles) {
  let content
  try {
    content = readFileSync(filePath, 'utf8')
  } catch (e) {
    continue
  }

  // Skip if no purview block
  if (!content.includes('purview:')) continue

  // Skip if already has shared_keywords
  if (content.includes('shared_keywords:')) {
    skipped++
    continue
  }

  // Parse YAML to inspect keywords
  let data
  try {
    const normalized = content.replace(/\r\n/g, '\n')
    data = yaml.load(normalized)
  } catch (e) {
    console.error(`PARSE ERROR: ${filePath} — ${e.message}`)
    errors++
    continue
  }

  if (!data.purview) {
    skipped++
    continue
  }

  // Extract all keyword terms from the pattern
  const patternTerms = extractAllKeywordTerms(data.purview)

  // Also check corroborative_evidence keywords
  if (data.corroborative_evidence?.keywords) {
    for (const k of data.corroborative_evidence.keywords) {
      patternTerms.add(String(k).toLowerCase())
    }
  }

  // Check for overlaps
  const addDRC = hasOverlap(patternTerms, DATA_RECORD_CONTEXT_TERMS)
  const addGDL = hasOverlap(patternTerms, GENERIC_DATA_LABELS_TERMS)

  if (addDRC) withDRC++
  if (addGDL) withGDL++

  // Build the shared_keywords block
  const sharedBlock = buildSharedKeywordsBlock(addDRC, addGDL)

  // Insert into file content — after recommended_confidence line, before pattern_tiers
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  // Find the recommended_confidence line inside purview block
  let insertAfter = -1
  let inPurview = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'purview:' || lines[i] === 'purview: ') {
      inPurview = true
      continue
    }
    if (inPurview && /^\S/.test(lines[i]) && lines[i].trim() !== '') {
      inPurview = false
      continue
    }
    if (inPurview && /^\s+recommended_confidence:/.test(lines[i])) {
      insertAfter = i
      break
    }
  }

  if (insertAfter === -1) {
    // Try finding it differently — maybe patterns_proximity is last before pattern_tiers
    for (let i = 0; i < lines.length; i++) {
      if (/^\s+pattern_tiers:/.test(lines[i])) {
        insertAfter = i - 1
        // Skip blank lines
        while (insertAfter >= 0 && lines[insertAfter].trim() === '') insertAfter--
        break
      }
    }
  }

  if (insertAfter === -1) {
    console.error(`ERROR: ${filePath} — could not find insertion point`)
    errors++
    continue
  }

  // Insert shared_keywords block
  const before = lines.slice(0, insertAfter + 1)
  const after = lines.slice(insertAfter + 1)
  let newContent = before.join('\n') + '\n' + sharedBlock + after.join('\n')

  // Also add dict refs to corroborative_evidence.keyword_lists
  newContent = addToKeywordLists(newContent, addDRC, addGDL)

  const slug = data.slug || filePath.replace(/.*\//, '').replace('.yaml', '')
  const extras = []
  if (addDRC) extras.push('DRC')
  if (addGDL) extras.push('GDL')
  const extrasStr = extras.length > 0 ? ` (+${extras.join('+')})` : ''
  console.log(`${dryRun ? 'WOULD' : 'DID'}: ${slug}${extrasStr}`)

  if (!dryRun) {
    writeFileSync(filePath, newContent, 'utf8')
  }
  updated++
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Summary:`)
console.log(`  Updated: ${updated}`)
console.log(`  Skipped (already has shared_keywords): ${skipped}`)
console.log(`  Errors: ${errors}`)
console.log(`  With data-record-context: ${withDRC}`)
console.log(`  With generic-data-labels: ${withGDL}`)
if (dryRun) console.log('\nRun with --write to apply changes')

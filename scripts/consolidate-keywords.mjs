/**
 * consolidate-keywords.mjs
 *
 * Migrates inline keyword definitions in pattern YAML files to shared_keywords
 * references. Targets three keyword types:
 *
 *   1. Evidence_template_exclusion  → shared dict: template-exclusion
 *   2. Keyword_*_noise_exclusion    → shared dict: template-exclusion
 *   3. Evidence_data_record_context → shared dict: data-record-context
 *
 * Usage:
 *   node scripts/consolidate-keywords.mjs --dry-run   # preview changes
 *   node scripts/consolidate-keywords.mjs             # apply changes
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url))
const PATTERNS_DIR = join(DATA_DIR, 'patterns')

const dryRun = process.argv.includes('--dry-run')

// ── Shared dict term lists (for optional validation) ──

const SHARED_TEMPLATE_TERMS = [
  'template', 'sample', 'example', 'placeholder', 'dummy',
  'mock', 'tutorial', 'demo', 'training exercise', 'test data',
  'training data', 'documentation', 'boilerplate'
]

const SHARED_NOISE_TERMS = [
  'sample', 'template', 'example', 'dummy', 'test data',
  'training data', 'placeholder', 'mock', 'boilerplate'
]

const SHARED_DRC_TERMS = [
  'field', 'column', 'row', 'entry', 'record', 'value', 'form',
  'register', 'database', 'extract', 'export', 'spreadsheet',
  'table', 'schedule', 'appendix', 'attachment', 'registry'
]

// ── Stats ──

let templateCount = 0
let noiseCount = 0
let drcCount = 0
let totalModified = 0
let totalSkipped = 0
const warnings = []

// ── Helpers ──

/**
 * Recursively walk pattern_tiers and rename refs in-place.
 */
function renameRefsInTiers(tiers, renames) {
  if (!tiers || !Array.isArray(tiers)) return
  for (const tier of tiers) {
    renameRefsInMatches(tier.matches, renames)
  }
}

function renameRefsInMatches(matches, renames) {
  if (!matches || !Array.isArray(matches)) return
  for (const match of matches) {
    // Direct ref
    if (match.ref && renames.has(match.ref)) {
      match.ref = renames.get(match.ref)
    }
    // Refs array (used in type: any blocks)
    if (match.refs && Array.isArray(match.refs)) {
      for (let i = 0; i < match.refs.length; i++) {
        if (renames.has(match.refs[i])) {
          match.refs[i] = renames.get(match.refs[i])
        }
      }
    }
    // Recurse into nested matches
    if (match.matches) {
      renameRefsInMatches(match.matches, renames)
    }
  }
}

/**
 * Check if inline terms differ significantly from shared dict.
 * Returns true if safe to replace, false if should skip.
 * "Significantly different" = has more than 2 terms not in the shared dict.
 */
function isSubsetOrClose(inlineTerms, sharedTerms) {
  const extra = inlineTerms.filter(t => !sharedTerms.includes(t))
  return extra.length <= 2
}

/**
 * Custom YAML dump that produces clean, readable output.
 * Uses specific options to avoid excessive quoting and wrapping.
 */
function dumpYaml(data) {
  return yaml.dump(data, {
    lineWidth: 200,
    noRefs: true,
    quotingType: "'",
    forceQuotes: false,
    sortKeys: false,
    noCompatMode: true
  })
}

// ── Main ──

console.log(`${dryRun ? '[DRY RUN] ' : ''}Consolidating inline keywords to shared_keywords refs...`)
console.log(`Patterns directory: ${PATTERNS_DIR}`)
console.log()

const files = readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
console.log(`Found ${files.length} pattern files`)

for (const file of files) {
  const filePath = join(PATTERNS_DIR, file)
  const raw = readFileSync(filePath, 'utf-8')
  let data

  try {
    data = yaml.load(raw)
  } catch (e) {
    warnings.push(`PARSE ERROR: ${file}: ${e.message}`)
    continue
  }

  if (!data?.purview?.keywords || !Array.isArray(data.purview.keywords)) continue

  let modified = false
  const sharedEntries = []
  const keywordIdsToRemove = new Set()
  const refRenames = new Map()

  for (const kw of data.purview.keywords) {
    if (!kw.id) continue

    // ── Step 1: Evidence_template_exclusion ──
    if (kw.id === 'Evidence_template_exclusion') {
      const terms = kw.groups?.[0]?.terms || []
      if (!isSubsetOrClose(terms, SHARED_TEMPLATE_TERMS)) {
        warnings.push(`SKIP template_exclusion in ${file}: ${terms.filter(t => !SHARED_TEMPLATE_TERMS.includes(t)).length} extra terms not in shared dict`)
        continue
      }
      sharedEntries.push({
        dict: 'template-exclusion',
        as: 'Evidence_template_exclusion',
        match_style: 'word'
      })
      keywordIdsToRemove.add(kw.id)
      templateCount++
      modified = true
    }

    // ── Step 2: Keyword_*_noise_exclusion ──
    else if (/^Keyword_.*_noise_exclusion$/.test(kw.id)) {
      const terms = kw.groups?.[0]?.terms || []
      if (!isSubsetOrClose(terms, SHARED_NOISE_TERMS)) {
        warnings.push(`SKIP noise_exclusion in ${file}: ${terms.filter(t => !SHARED_NOISE_TERMS.includes(t)).length} extra terms not in shared dict`)
        continue
      }
      sharedEntries.push({
        dict: 'template-exclusion',
        as: 'Keyword_noise_exclusion',
        match_style: 'word'
      })
      keywordIdsToRemove.add(kw.id)
      refRenames.set(kw.id, 'Keyword_noise_exclusion')
      noiseCount++
      modified = true
    }

    // ── Step 3: Evidence_data_record_context ──
    else if (kw.id === 'Evidence_data_record_context') {
      const terms = kw.groups?.[0]?.terms || []
      if (!isSubsetOrClose(terms, SHARED_DRC_TERMS)) {
        warnings.push(`SKIP data_record_context in ${file}: ${terms.filter(t => !SHARED_DRC_TERMS.includes(t)).length} extra terms not in shared dict`)
        continue
      }
      sharedEntries.push({
        dict: 'data-record-context',
        as: 'Evidence_data_record_context',
        match_style: 'word'
      })
      keywordIdsToRemove.add(kw.id)
      drcCount++
      modified = true
    }
  }

  if (!modified) {
    totalSkipped++
    continue
  }

  // ── Apply modifications to the parsed object ──

  // 1. Add shared_keywords (deduplicating by dict name)
  if (!data.purview.shared_keywords) {
    data.purview.shared_keywords = []
  }
  const existingDicts = new Set(data.purview.shared_keywords.map(e => e.dict))
  for (const entry of sharedEntries) {
    if (!existingDicts.has(entry.dict)) {
      data.purview.shared_keywords.push(entry)
      existingDicts.add(entry.dict)
    }
  }

  // 2. Remove inline keyword entries that were replaced
  data.purview.keywords = data.purview.keywords.filter(kw => !keywordIdsToRemove.has(kw.id))

  // 3. Rename refs in pattern_tiers if needed
  if (refRenames.size > 0) {
    renameRefsInTiers(data.purview.pattern_tiers, refRenames)
  }

  // 4. Reorder purview keys: put shared_keywords right after recommended_confidence
  //    (before pattern_tiers) for readability
  const purview = data.purview
  const reorderedPurview = {}
  for (const key of Object.keys(purview)) {
    if (key === 'pattern_tiers') {
      // Insert shared_keywords before pattern_tiers
      if (purview.shared_keywords) {
        reorderedPurview.shared_keywords = purview.shared_keywords
      }
    }
    if (key !== 'shared_keywords') {
      reorderedPurview[key] = purview[key]
    }
  }
  // If pattern_tiers wasn't in the keys (shouldn't happen), ensure shared_keywords is still there
  if (!reorderedPurview.shared_keywords && purview.shared_keywords) {
    reorderedPurview.shared_keywords = purview.shared_keywords
  }
  data.purview = reorderedPurview

  // ── Serialize and write ──
  if (!dryRun) {
    const output = dumpYaml(data)

    // Validate round-trip
    try {
      const reparsed = yaml.load(output)
      if (!reparsed.purview?.shared_keywords || reparsed.purview.shared_keywords.length === 0) {
        warnings.push(`VALIDATION FAILED: ${file}: shared_keywords missing after round-trip`)
        continue
      }
      // Verify removed keywords are gone
      for (const id of keywordIdsToRemove) {
        if (reparsed.purview.keywords?.some(k => k.id === id)) {
          warnings.push(`VALIDATION FAILED: ${file}: inline keyword ${id} still present after removal`)
          continue
        }
      }
    } catch (e) {
      warnings.push(`VALIDATION FAILED: ${file}: ${e.message}`)
      continue
    }

    writeFileSync(filePath, output, 'utf-8')
  }

  totalModified++
}

// ── Report ──

console.log()
console.log('═══════════════════════════════════════════════')
console.log(`${dryRun ? '[DRY RUN] ' : ''}Consolidation complete`)
console.log('═══════════════════════════════════════════════')
console.log(`Total pattern files scanned:    ${files.length}`)
console.log(`Patterns modified:              ${totalModified}`)
console.log(`Patterns skipped (no purview):  ${totalSkipped}`)
console.log()
console.log(`Evidence_template_exclusion:    ${templateCount} replacements`)
console.log(`Keyword_*_noise_exclusion:      ${noiseCount} replacements`)
console.log(`Evidence_data_record_context:   ${drcCount} replacements`)
console.log(`Total keyword entries removed:  ${templateCount + noiseCount + drcCount}`)
console.log()

if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`)
  for (const w of warnings) {
    console.log(`  ${w}`)
  }
}

if (dryRun) {
  console.log()
  console.log('No files were modified (dry run). Run without --dry-run to apply changes.')
}

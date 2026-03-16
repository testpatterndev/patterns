#!/usr/bin/env node
/**
 * Extracts shared terms from domain_context keywords across 903 patterns.
 * Shared terms (from data-record-context and generic-data-labels dictionaries)
 * are removed from inline Keyword_<slug>_domain_context entries and replaced
 * with shared_keywords references.
 *
 * Usage:
 *   node scripts/extract-domain-context.mjs                # dry-run
 *   node scripts/extract-domain-context.mjs --write        # apply changes
 *   node scripts/extract-domain-context.mjs --write --verbose
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')
const verbose = args.includes('--verbose')

// ── Step 1: Load shared term sets ──
const drc = yaml.load(readFileSync('data/keywords/data-record-context.yaml', 'utf-8'))
const gdl = yaml.load(readFileSync('data/keywords/generic-data-labels.yaml', 'utf-8'))

const drcTerms = new Set(drc.keywords.map(t => String(t).toLowerCase().trim()))
const gdlTerms = new Set(gdl.keywords.map(t => String(t).toLowerCase().trim()))

// Combined set of all terms to remove (including "top500" noise)
const sharedTerms = new Set([...drcTerms, ...gdlTerms, 'top500'])

console.log(`DRC terms (${drcTerms.size}): ${[...drcTerms].join(', ')}`)
console.log(`GDL terms (${gdlTerms.size}): ${[...gdlTerms].join(', ')}`)
console.log(`Combined shared terms (${sharedTerms.size}): includes top500\n`)

// ── Step 2: Process patterns ──
const PATTERNS_DIR = 'data/patterns'
const files = readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.yaml')).sort()

let modified = 0
let skipped = 0
let errors = 0
let totalTermsRemoved = 0
let totalTermsKept = 0
let keywordsFullyRemoved = 0
let matchTreeRefsRemoved = 0
let drcRefsAdded = 0
let gdlRefsAdded = 0
let drcKwListAdded = 0
let gdlKwListAdded = 0

for (const file of files) {
  const filePath = join(PATTERNS_DIR, file)
  let content
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch (e) {
    console.log(`ERROR reading: ${file} — ${e.message}`)
    errors++
    continue
  }

  // Normalise line endings
  const norm = content.replace(/\r\n/g, '\n')
  const lines = norm.split('\n')

  // ── Find domain_context keyword block ──
  // Look for: `    - id: Keyword_<slug>_domain_context`
  let dcIdLineIdx = -1
  let dcId = ''
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s+)- id:\s*(Keyword_\S+_domain_context)\s*$/)
    if (m) {
      dcIdLineIdx = i
      dcId = m[2]
      break
    }
  }

  if (dcIdLineIdx === -1) {
    // No domain_context keyword
    continue
  }

  // ── Parse the terms from this keyword block ──
  // Structure:
  //     - id: Keyword_xxx_domain_context
  //       groups:
  //         - match_style: word
  //           terms:
  //             - term1
  //             - term2
  let termsStartIdx = -1
  let termsEndIdx = -1
  const termLines = []

  // Find `terms:` line after dcIdLineIdx
  for (let i = dcIdLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    // If we hit a new keyword block (same or lower indent level) or a new section, stop
    if (line.match(/^\s{4}- id:/) || line.match(/^\s{2}[a-z_]+:/) || line.match(/^\S/)) break
    if (line.match(/^\s+terms:\s*$/)) {
      termsStartIdx = i
      continue
    }
    if (termsStartIdx >= 0) {
      const termMatch = line.match(/^(\s+)- (.+)$/)
      if (termMatch) {
        termLines.push({ idx: i, term: termMatch[2].trim() })
        termsEndIdx = i
      } else if (line.trim() === '') {
        // blank line within terms block, continue
        continue
      } else {
        // End of terms block
        break
      }
    }
  }

  if (termsStartIdx === -1 || termLines.length === 0) {
    if (verbose) console.log(`SKIP (no terms): ${file}`)
    skipped++
    continue
  }

  // ── Split terms into shared vs entity-specific ──
  const allTerms = termLines.map(t => t.term)
  const entityTerms = []
  const removedTerms = []
  let hasDrcTerms = false
  let hasGdlTerms = false

  for (const term of allTerms) {
    const key = String(term).toLowerCase().trim()
    if (sharedTerms.has(key)) {
      removedTerms.push(term)
      if (drcTerms.has(key)) hasDrcTerms = true
      if (gdlTerms.has(key)) hasGdlTerms = true
    } else {
      entityTerms.push(term)
    }
  }

  if (removedTerms.length === 0) {
    if (verbose) console.log(`SKIP (no shared terms): ${file}`)
    skipped++
    continue
  }

  totalTermsRemoved += removedTerms.length
  totalTermsKept += entityTerms.length

  if (verbose) {
    console.log(`${file}:`)
    console.log(`  removed: ${removedTerms.join(', ')}`)
    console.log(`  kept:    ${entityTerms.join(', ')}`)
  }

  // ── Build modified content ──
  let newLines = [...lines]

  if (entityTerms.length === 0) {
    // All terms were shared — remove the entire keyword block
    keywordsFullyRemoved++

    // Find the full extent of this keyword block
    // Start: the `    - id:` line
    // End: next `    - id:` line or next section at same/lower indent
    let blockStart = dcIdLineIdx
    let blockEnd = dcIdLineIdx + 1
    for (let i = dcIdLineIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.match(/^\s{4}- id:/) || line.match(/^\s{2}[a-z_]+:/) || line.match(/^\S/)) {
        blockEnd = i
        break
      }
      blockEnd = i + 1
    }

    // Remove the keyword block lines
    newLines.splice(blockStart, blockEnd - blockStart)

    // Also remove match tree refs to this keyword
    // Look for lines like: `        - ref: Keyword_xxx_domain_context`
    for (let i = newLines.length - 1; i >= 0; i--) {
      if (newLines[i].match(new RegExp(`^\\s+- ref:\\s*${dcId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`))) {
        newLines.splice(i, 1)
        matchTreeRefsRemoved++
      }
    }
  } else {
    // Keep keyword with only entity-specific terms — replace the terms block
    // Find the term lines and replace them
    // We know termLines[0].idx through termLines[last].idx are the term lines
    const firstTermIdx = termLines[0].idx
    const lastTermIdx = termLines[termLines.length - 1].idx
    const indent = lines[firstTermIdx].match(/^(\s+)/)?.[1] || '            '

    const newTermLines = entityTerms.map(t => `${indent}- ${t}`)
    newLines.splice(firstTermIdx, lastTermIdx - firstTermIdx + 1, ...newTermLines)
  }

  // ── Ensure shared_keywords entries exist ──
  // Find the shared_keywords block or the insertion point for it
  let newContent = newLines.join('\n')

  // Check existing shared_keywords
  const hasExistingDrc = newContent.includes('dict: data-record-context')
  const hasExistingGdl = newContent.includes('dict: generic-data-labels')

  // Also check if Evidence_data_record_context is already an inline keyword (not via shared_keywords)
  const hasInlineDrc = /id:\s*Evidence_data_record_context/.test(newContent) && !hasExistingDrc
  const hasInlineGdl = /id:\s*Evidence_generic_data_labels/.test(newContent) && !hasExistingGdl

  const needDrc = hasDrcTerms && !hasExistingDrc && !hasInlineDrc
  const needGdl = hasGdlTerms && !hasExistingGdl && !hasInlineGdl

  if (needDrc || needGdl) {
    // Re-split into lines after previous modifications
    const contentLines = newContent.split('\n')

    // Find shared_keywords block
    let sharedKwIdx = -1
    for (let i = 0; i < contentLines.length; i++) {
      if (contentLines[i].match(/^\s{2}shared_keywords:\s*$/)) {
        sharedKwIdx = i
        break
      }
    }

    if (sharedKwIdx >= 0) {
      // Find end of shared_keywords block (next purview sub-section)
      let insertIdx = sharedKwIdx + 1
      for (let i = sharedKwIdx + 1; i < contentLines.length; i++) {
        if (contentLines[i].match(/^\s{2}[a-z_]+:/) && !contentLines[i].match(/^\s{4}/)) {
          insertIdx = i
          break
        }
        if (contentLines[i].match(/^\s{4}- dict:/)) {
          insertIdx = i + 1
          // Skip following lines of same entry
          while (insertIdx < contentLines.length &&
                 contentLines[insertIdx].match(/^\s{6}/) &&
                 !contentLines[insertIdx].match(/^\s{4}- /)) {
            insertIdx++
          }
        }
      }

      // Insert new entries at end of shared_keywords block
      const newEntries = []
      if (needDrc) {
        newEntries.push(
          '    - dict: data-record-context',
          '      as: Evidence_data_record_context',
          '      match_style: word'
        )
        drcRefsAdded++
      }
      if (needGdl) {
        newEntries.push(
          '    - dict: generic-data-labels',
          '      as: Evidence_generic_data_labels',
          '      match_style: word'
        )
        gdlRefsAdded++
      }
      contentLines.splice(insertIdx, 0, ...newEntries)
    } else {
      // No shared_keywords block — create one after recommended_confidence or patterns_proximity
      let insertAfter = -1
      for (let i = 0; i < contentLines.length; i++) {
        if (contentLines[i].match(/^\s{2}recommended_confidence:/)) {
          insertAfter = i
          break
        }
        if (contentLines[i].match(/^\s{2}patterns_proximity:/)) {
          insertAfter = i
        }
      }

      if (insertAfter >= 0) {
        const newEntries = ['  shared_keywords:']
        if (needDrc) {
          newEntries.push(
            '    - dict: data-record-context',
            '      as: Evidence_data_record_context',
            '      match_style: word'
          )
          drcRefsAdded++
        }
        if (needGdl) {
          newEntries.push(
            '    - dict: generic-data-labels',
            '      as: Evidence_generic_data_labels',
            '      match_style: word'
          )
          gdlRefsAdded++
        }
        contentLines.splice(insertAfter + 1, 0, ...newEntries)
      }
    }

    newContent = contentLines.join('\n')
  }

  // ── Also ensure corroborative_evidence.keyword_lists has the dicts ──
  if (hasDrcTerms && !newContent.includes('- data-record-context')) {
    // Add data-record-context to keyword_lists
    const kwListMatch = newContent.match(/(keyword_lists:\n(?:\s+- .+\n)*)/)
    if (kwListMatch) {
      newContent = newContent.replace(
        kwListMatch[0],
        kwListMatch[0] + '    - data-record-context\n'
      )
      drcKwListAdded++
    }
  }
  if (hasGdlTerms && !newContent.includes('- generic-data-labels')) {
    const kwListMatch = newContent.match(/(keyword_lists:\n(?:\s+- .+\n)*)/)
    if (kwListMatch) {
      newContent = newContent.replace(
        kwListMatch[0],
        kwListMatch[0] + '    - generic-data-labels\n'
      )
      gdlKwListAdded++
    }
  }

  // ── Write back ──
  if (!dryRun) {
    writeFileSync(filePath, newContent, 'utf-8')
  }

  modified++
  if (!verbose) {
    const slug = file.replace('.yaml', '')
    const short = slug.replace(/au-top500-\d+-|global-top500-\d+-/, '')
    const action = dryRun ? 'WOULD' : 'DID'
    const removedStr = removedTerms.length
    const keptStr = entityTerms.length
    if (entityTerms.length === 0) {
      process.stdout.write(`${action}: ${short} (removed ${removedStr} shared, keyword DELETED)\n`)
    } else {
      process.stdout.write(`${action}: ${short} (removed ${removedStr} shared, kept ${keptStr} entity)\n`)
    }
  }
}

// ── Summary ──
console.log(`\n${'='.repeat(60)}`)
console.log(`${dryRun ? 'DRY RUN' : 'APPLIED'} — Summary:`)
console.log(`  Patterns modified:      ${modified}`)
console.log(`  Patterns skipped:       ${skipped}`)
console.log(`  Errors:                 ${errors}`)
console.log(`  Terms removed (shared): ${totalTermsRemoved}`)
console.log(`  Terms kept (entity):    ${totalTermsKept}`)
console.log(`  Keywords fully deleted: ${keywordsFullyRemoved}`)
console.log(`  Match tree refs removed:${matchTreeRefsRemoved}`)
console.log(`  DRC shared_kw added:    ${drcRefsAdded}`)
console.log(`  GDL shared_kw added:    ${gdlRefsAdded}`)
console.log(`  DRC corr_ev list added: ${drcKwListAdded}`)
console.log(`  GDL corr_ev list added: ${gdlKwListAdded}`)
if (dryRun) console.log(`\nRun with --write to apply changes`)

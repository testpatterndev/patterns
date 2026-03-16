#!/usr/bin/env node
/**
 * Extracts shared terms from ALL domain_context and classification_markers
 * keywords across all 1,479 patterns.
 *
 * Part 1: domain_context — removes shared terms (data-record-context +
 *   generic-data-labels + "top500") from inline _domain_context keywords,
 *   adds shared_keywords refs, fixes inline GDL keywords that should be
 *   shared_keywords refs.
 *
 * Part 2: classification_markers — removes shared terms
 *   (en-government-classification) from inline _classification_markers
 *   keywords, adds shared_keywords refs.
 *
 * Usage:
 *   node scripts/extract-nontop500-shared-terms.mjs                # dry-run
 *   node scripts/extract-nontop500-shared-terms.mjs --write        # apply
 *   node scripts/extract-nontop500-shared-terms.mjs --write --verbose
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')
const verbose = args.includes('--verbose')

// ── Load shared term sets ──────────────────────────────────────────────
const drc = yaml.load(readFileSync('data/keywords/data-record-context.yaml', 'utf-8'))
const gdl = yaml.load(readFileSync('data/keywords/generic-data-labels.yaml', 'utf-8'))
const cls = yaml.load(readFileSync('data/keywords/en-government-classification.yaml', 'utf-8'))

const drcTerms = new Set(drc.keywords.map(t => String(t).toLowerCase().trim()))
const gdlTerms = new Set(gdl.keywords.map(t => String(t).toLowerCase().trim()))
const clsTerms = new Set(cls.keywords.map(t => String(t).toLowerCase().trim()))

// Combined DC shared terms (including "top500" noise)
const dcSharedTerms = new Set([...drcTerms, ...gdlTerms, 'top500'])

console.log(`DRC terms (${drcTerms.size}): ${[...drcTerms].join(', ')}`)
console.log(`GDL terms (${gdlTerms.size}): ${[...gdlTerms].join(', ')}`)
console.log(`CLS terms (${clsTerms.size}): ${[...clsTerms].join(', ')}`)
console.log()

// ── Process patterns ───────────────────────────────────────────────────
const PATTERNS_DIR = 'data/patterns'
const files = readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.yaml')).sort()

// Counters
let totalChecked = 0
let dcModified = 0
let cmModified = 0
let gdlInlineFixed = 0
let gdlSharedAdded = 0
let dcTermsRemoved = 0
let dcTermsKept = 0
let dcKeywordsDeleted = 0
let dcMatchTreeRefsRemoved = 0
let cmTermsRemoved = 0
let cmTermsKept = 0
let cmKeywordsDeleted = 0
let cmMatchTreeRefsRemoved = 0
let cmSharedAdded = 0
let cmCorrEvAdded = 0
let errors = 0

/**
 * Find a YAML block starting with `    - id: <targetId>` and return
 * { blockStart, blockEnd, termsStartIdx, termLines[] }
 */
function findKeywordBlock(lines, targetIdRegex) {
  let dcIdLineIdx = -1
  let dcId = ''
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s+)- id:\s*(\S+)\s*$/)
    if (m && targetIdRegex.test(m[2])) {
      dcIdLineIdx = i
      dcId = m[2]
      break
    }
  }
  if (dcIdLineIdx === -1) return null

  // Find block end
  let blockEnd = dcIdLineIdx + 1
  for (let i = dcIdLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.match(/^\s{4}- id:/) || line.match(/^\s{2}[a-z_]+:/) || line.match(/^\S/)) {
      blockEnd = i
      break
    }
    blockEnd = i + 1
  }

  // Find terms
  let termsStartIdx = -1
  const termLines = []
  for (let i = dcIdLineIdx + 1; i < blockEnd; i++) {
    const line = lines[i]
    if (line.match(/^\s+terms:\s*$/)) {
      termsStartIdx = i
      continue
    }
    if (termsStartIdx >= 0) {
      const termMatch = line.match(/^(\s+)- (.+)$/)
      if (termMatch) {
        termLines.push({ idx: i, term: termMatch[2].trim() })
      } else if (line.trim() === '') {
        continue
      } else {
        break
      }
    }
  }

  return { blockStart: dcIdLineIdx, blockEnd, termsStartIdx, termLines, id: dcId }
}

/**
 * Remove a keyword block from lines array and any match tree refs to its ID.
 * Returns number of match tree refs removed.
 */
function removeKeywordBlock(lines, blockStart, blockEnd, kwId) {
  lines.splice(blockStart, blockEnd - blockStart)
  let refsRemoved = 0
  const escaped = kwId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].match(new RegExp(`^\\s+- ref:\\s*${escaped}\\s*$`))) {
      lines.splice(i, 1)
      refsRemoved++
    }
  }
  return refsRemoved
}

/**
 * Replace terms in a keyword block, keeping only entityTerms.
 */
function replaceTerms(lines, termLinesArr, entityTerms) {
  const firstIdx = termLinesArr[0].idx
  const lastIdx = termLinesArr[termLinesArr.length - 1].idx
  const indent = lines[firstIdx].match(/^(\s+)/)?.[1] || '            '
  const newTermLines = entityTerms.map(t => `${indent}- ${t}`)
  lines.splice(firstIdx, lastIdx - firstIdx + 1, ...newTermLines)
}

/**
 * Find a keyword block by exact ID and remove it entirely.
 */
function findAndRemoveInlineKeyword(lines, exactId) {
  let idLineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s+)- id:\s*(\S+)\s*$/)
    if (m && m[2] === exactId) {
      idLineIdx = i
      break
    }
  }
  if (idLineIdx === -1) return false

  let blockEnd = idLineIdx + 1
  for (let i = idLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.match(/^\s{4}- id:/) || line.match(/^\s{2}[a-z_]+:/) || line.match(/^\S/)) {
      blockEnd = i
      break
    }
    blockEnd = i + 1
  }

  lines.splice(idLineIdx, blockEnd - idLineIdx)
  return true
}

/**
 * Add a shared_keywords entry to the purview block.
 */
function addSharedKeyword(lines, dict, asName, matchStyle) {
  // Find shared_keywords block
  let sharedKwIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s{2}shared_keywords:\s*$/)) {
      sharedKwIdx = i
      break
    }
  }

  const entry = [
    `    - dict: ${dict}`,
    `      as: ${asName}`,
    `      match_style: ${matchStyle}`
  ]

  if (sharedKwIdx >= 0) {
    // Find end of shared_keywords block
    let insertIdx = sharedKwIdx + 1
    for (let i = sharedKwIdx + 1; i < lines.length; i++) {
      if (lines[i].match(/^\s{2}[a-z_]+:/) && !lines[i].match(/^\s{4}/)) {
        insertIdx = i
        break
      }
      if (lines[i].match(/^\s{4}- dict:/)) {
        insertIdx = i + 1
        while (insertIdx < lines.length &&
               lines[insertIdx].match(/^\s{6}/) &&
               !lines[insertIdx].match(/^\s{4}- /)) {
          insertIdx++
        }
      }
    }
    lines.splice(insertIdx, 0, ...entry)
  } else {
    // No shared_keywords block — create one after recommended_confidence or patterns_proximity
    let insertAfter = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\s{2}recommended_confidence:/)) {
        insertAfter = i
        break
      }
      if (lines[i].match(/^\s{2}patterns_proximity:/)) {
        insertAfter = i
      }
    }
    if (insertAfter >= 0) {
      lines.splice(insertAfter + 1, 0, '  shared_keywords:', ...entry)
    }
  }
}

/**
 * Add a keyword list to corroborative_evidence.keyword_lists.
 */
function addCorrEvKeywordList(content, listName) {
  // Check if it already has the list
  if (content.includes(`- ${listName}`)) return content

  const kwListMatch = content.match(/(keyword_lists:\n(?:\s+- .+\n)*)/)
  if (kwListMatch) {
    return content.replace(
      kwListMatch[0],
      kwListMatch[0] + `    - ${listName}\n`
    )
  }
  return content
}

// ── Main loop ──────────────────────────────────────────────────────────
for (const file of files) {
  const filePath = join(PATTERNS_DIR, file)
  let content
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch (e) {
    console.error(`ERROR reading: ${file} — ${e.message}`)
    errors++
    continue
  }

  totalChecked++
  const norm = content.replace(/\r\n/g, '\n')
  let lines = norm.split('\n')
  let fileModified = false

  // ── Part 1a: Extract shared terms from _domain_context ──
  const dcBlock = findKeywordBlock(lines, /_domain_context$/)
  if (dcBlock && dcBlock.termLines.length > 0) {
    const allTerms = dcBlock.termLines.map(t => t.term)
    const entityTerms = []
    const removedTerms = []
    let hasDrc = false
    let hasGdl = false

    for (const term of allTerms) {
      const key = String(term).toLowerCase().trim()
      if (dcSharedTerms.has(key)) {
        removedTerms.push(term)
        if (drcTerms.has(key)) hasDrc = true
        if (gdlTerms.has(key)) hasGdl = true
      } else {
        entityTerms.push(term)
      }
    }

    if (removedTerms.length > 0) {
      dcTermsRemoved += removedTerms.length
      dcTermsKept += entityTerms.length

      if (entityTerms.length === 0) {
        dcKeywordsDeleted++
        const refs = removeKeywordBlock(lines, dcBlock.blockStart, dcBlock.blockEnd, dcBlock.id)
        dcMatchTreeRefsRemoved += refs
      } else {
        replaceTerms(lines, dcBlock.termLines, entityTerms)
      }

      // Add shared_keywords refs if needed
      const joinedLines = lines.join('\n')
      if (hasDrc && !joinedLines.includes('dict: data-record-context')) {
        addSharedKeyword(lines, 'data-record-context', 'Evidence_data_record_context', 'word')
      }
      if (hasGdl && !joinedLines.includes('dict: generic-data-labels')) {
        addSharedKeyword(lines, 'generic-data-labels', 'Evidence_generic_data_labels', 'word')
      }

      dcModified++
      fileModified = true
      if (verbose) {
        console.log(`DC ${file}: removed [${removedTerms.join(', ')}], kept [${entityTerms.join(', ')}]`)
      }
    }
  }

  // ── Part 1b: Fix inline Evidence_generic_data_labels keywords ──
  // Some patterns have GDL as an inline keyword instead of a shared_keywords ref
  const joinedCheck = lines.join('\n')
  const hasInlineGDL = /- id:\s*Evidence_generic_data_labels/.test(joinedCheck)
  const hasSharedGDL = joinedCheck.includes('dict: generic-data-labels')
  if (hasInlineGDL && !hasSharedGDL) {
    // Remove the inline keyword block
    findAndRemoveInlineKeyword(lines, 'Evidence_generic_data_labels')
    // Add shared_keywords ref
    addSharedKeyword(lines, 'generic-data-labels', 'Evidence_generic_data_labels', 'word')
    gdlInlineFixed++
    gdlSharedAdded++
    fileModified = true
    if (verbose) {
      console.log(`GDL-FIX ${file}: inline Evidence_generic_data_labels -> shared_keywords ref`)
    }
  }

  // ── Part 2: Extract shared terms from _classification_markers ──
  // Re-find the block after possible Part 1 modifications
  const cmBlock = findKeywordBlock(lines, /_classification_markers$/)
  if (cmBlock && cmBlock.termLines.length > 0) {
    const allTerms = cmBlock.termLines.map(t => t.term)
    const entityTerms = []
    const removedTerms = []

    for (const term of allTerms) {
      const key = String(term).toLowerCase().trim()
      if (clsTerms.has(key)) {
        removedTerms.push(term)
      } else {
        entityTerms.push(term)
      }
    }

    if (removedTerms.length > 0) {
      cmTermsRemoved += removedTerms.length
      cmTermsKept += entityTerms.length

      if (entityTerms.length === 0) {
        cmKeywordsDeleted++
        const refs = removeKeywordBlock(lines, cmBlock.blockStart, cmBlock.blockEnd, cmBlock.id)
        cmMatchTreeRefsRemoved += refs
      } else {
        // Re-find block after potential line shifts from Part 1
        const freshBlock = findKeywordBlock(lines, /_classification_markers$/)
        if (freshBlock && freshBlock.termLines.length > 0) {
          replaceTerms(lines, freshBlock.termLines, entityTerms)
        }
      }

      // Add shared_keywords ref for en-government-classification
      const joinedAfter = lines.join('\n')
      if (!joinedAfter.includes('dict: en-government-classification')) {
        addSharedKeyword(lines, 'en-government-classification', 'Evidence_classification_markers', 'word')
        cmSharedAdded++
      }

      cmModified++
      fileModified = true
      if (verbose) {
        console.log(`CM ${file}: removed [${removedTerms.join(', ')}], kept [${entityTerms.join(', ')}]`)
      }
    }
  }

  // ── Write back ──
  if (fileModified) {
    let newContent = lines.join('\n')

    // Part 2 cont: Add en-government-classification to corroborative_evidence.keyword_lists
    if (cmBlock) {
      const before = newContent
      newContent = addCorrEvKeywordList(newContent, 'en-government-classification')
      if (newContent !== before) cmCorrEvAdded++
    }

    if (!dryRun) {
      writeFileSync(filePath, newContent, 'utf-8')
    }

    const slug = file.replace('.yaml', '')
    const action = dryRun ? 'WOULD' : 'DID'
    if (!verbose) {
      process.stdout.write(`${action}: ${slug}\n`)
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`)
console.log(`${dryRun ? 'DRY RUN' : 'APPLIED'} — Summary:`)
console.log(`  Total patterns checked:           ${totalChecked}`)
console.log()
console.log('Part 1: domain_context')
console.log(`  Patterns with DC terms extracted: ${dcModified}`)
console.log(`  DC shared terms removed:          ${dcTermsRemoved}`)
console.log(`  DC entity terms kept:             ${dcTermsKept}`)
console.log(`  DC keywords fully deleted:        ${dcKeywordsDeleted}`)
console.log(`  DC match tree refs removed:        ${dcMatchTreeRefsRemoved}`)
console.log()
console.log('Part 1b: inline GDL fix')
console.log(`  Inline GDL keywords -> shared:    ${gdlInlineFixed}`)
console.log(`  GDL shared_kw refs added:         ${gdlSharedAdded}`)
console.log()
console.log('Part 2: classification_markers')
console.log(`  Patterns with CM terms extracted: ${cmModified}`)
console.log(`  CM shared terms removed:          ${cmTermsRemoved}`)
console.log(`  CM entity terms kept:             ${cmTermsKept}`)
console.log(`  CM keywords fully deleted:        ${cmKeywordsDeleted}`)
console.log(`  CM match tree refs removed:        ${cmMatchTreeRefsRemoved}`)
console.log(`  CM shared_kw refs added:          ${cmSharedAdded}`)
console.log(`  CM corr_ev keyword_lists added:   ${cmCorrEvAdded}`)
console.log()
console.log(`  Total files modified:             ${dcModified + gdlInlineFixed + cmModified}`)
console.log(`  Errors:                           ${errors}`)
if (dryRun) console.log(`\nRun with --write to apply changes`)

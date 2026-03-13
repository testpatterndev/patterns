#!/usr/bin/env node
/**
 * Converts 64 QLD-Custom patterns from descriptive purview schema to operational schema.
 *
 * Usage:
 *   node scripts/convert-descriptive-purview.js                              # dry-run
 *   node scripts/convert-descriptive-purview.js --write                      # apply
 *   node scripts/convert-descriptive-purview.js --slug=bail-condition-document  # single
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')
const singleSlug = args.find(a => a.startsWith('--slug='))?.split('=')[1]

const slugListFile = join('..', 'testpattern', 'testpattern-empty-exports.md')
const slugs = readFileSync(slugListFile, 'utf8')
  .split('\n')
  .filter(l => l.startsWith('- '))
  .map(l => l.replace('- ', '').trim())

const targetSlugs = singleSlug ? [singleSlug] : slugs

function toId(s) { return s.replace(/-/g, '_') }

function parsePurviewSection(content) {
  const lines = content.split('\n')

  // Find the indented purview sub-sections
  const regexes = []
  const keywords = []
  const filters = []
  let proximity = 300
  let recConf = 85

  let section = null // 'tiers', 'regexes', 'keywords', 'filters'
  let currentItem = null
  let inList = null // 'words', 'keywords' (filter), 'terms'

  for (const line of lines) {
    // Top-level purview fields
    const proxM = line.match(/^\s{2}patterns_proximity:\s*(\d+)/)
    if (proxM) { proximity = parseInt(proxM[1]); continue }
    const rcM = line.match(/^\s{2}recommended_confidence:\s*(\d+)/)
    if (rcM) { recConf = parseInt(rcM[1]); continue }

    // Section headers (2-space indent)
    if (line.match(/^\s{2}pattern_tiers:\s*$/)) { section = 'tiers'; continue }
    if (line.match(/^\s{2}regexes:\s*$/)) {
      section = 'regexes'
      if (currentItem) finishItem()
      currentItem = null
      inList = null
      continue
    }
    if (line.match(/^\s{2}keywords:\s*$/)) {
      section = 'keywords'
      if (currentItem) finishItem()
      currentItem = null
      inList = null
      continue
    }
    if (line.match(/^\s{2}filters:\s*$/)) {
      section = 'filters'
      if (currentItem) finishItem()
      currentItem = null
      inList = null
      continue
    }

    // Skip tiers section (we rebuild it)
    if (section === 'tiers') continue

    // Regexes section — handles both formats:
    //   Format A: - name: xxx \n   pattern: ...
    //   Format B: - pattern: ... \n   description: ...
    if (section === 'regexes') {
      // Format A: name field
      const dashName = line.match(/^\s{4}-\s*name:\s*(.+)/)
      if (dashName) {
        if (currentItem) finishItem()
        currentItem = { type: 'regex', name: dashName[1].trim(), pattern: '' }
        continue
      }
      // Format B: pattern on the dash line itself
      const dashPattern = line.match(/^\s{4}-\s*pattern:\s*(.+)/)
      if (dashPattern) {
        if (currentItem) finishItem()
        currentItem = { type: 'regex', name: '', pattern: dashPattern[1].trim() }
        continue
      }
      // Indented pattern (Format A continuation)
      const pat = line.match(/^\s{6}pattern:\s*(.+)/)
      if (pat && currentItem) {
        currentItem.pattern = pat[1].trim()
        continue
      }
      // Format B: description field — use as name if no name yet
      const desc = line.match(/^\s{6}description:\s*(.+)/)
      if (desc && currentItem && !currentItem.name) {
        // Convert description to a snake_case name
        currentItem.name = desc[1].trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .substring(0, 40)
        continue
      }
    }

    // Keywords section — handles both formats:
    //   Format A: - name: xxx \n   words: \n     - term
    //   Format B: - group: xxx \n   values: \n     - term
    if (section === 'keywords') {
      // Format A: name field
      const dashName = line.match(/^\s{4}-\s*name:\s*(.+)/)
      if (dashName) {
        if (currentItem) finishItem()
        currentItem = { type: 'keyword', name: dashName[1].trim(), words: [] }
        inList = null
        continue
      }
      // Format B: group field
      const dashGroup = line.match(/^\s{4}-\s*group:\s*(.+)/)
      if (dashGroup) {
        if (currentItem) finishItem()
        currentItem = { type: 'keyword', name: dashGroup[1].trim(), words: [] }
        inList = null
        continue
      }
      // Words list header (Format A)
      if (line.match(/^\s{6}words:\s*$/)) { inList = 'words'; continue }
      // Values list header (Format B)
      if (line.match(/^\s{6}values:\s*$/)) { inList = 'words'; continue }
      // List items
      if (inList === 'words' && currentItem) {
        const wordM = line.match(/^\s{8}-\s+(.+)/)
        if (wordM) {
          currentItem.words.push(wordM[1].replace(/^['"]|['"]$/g, '').trim())
        }
      }
    }

    // Filters section — handles both formats:
    //   Format A: - type: exclude \n   keywords: \n     - term
    //   Format B: - type: exclude_keywords \n   values: \n     - term
    if (section === 'filters') {
      if (line.match(/^\s{6}keywords:\s*$/) || line.match(/^\s{6}values:\s*$/)) {
        inList = 'filter_kw'
        continue
      }
      if (inList === 'filter_kw') {
        const wordM = line.match(/^\s{8}-\s+(.+)/)
        if (wordM) {
          filters.push(wordM[1].replace(/^['"]|['"]$/g, '').trim())
        }
      }
    }
  }
  if (currentItem) finishItem()

  function finishItem() {
    if (currentItem.type === 'regex') regexes.push(currentItem)
    if (currentItem.type === 'keyword') keywords.push(currentItem)
  }

  return { regexes, keywords, filters, proximity, recConf }
}

function convertFile(filePath) {
  const content = readFileSync(filePath, 'utf8')
  const slug = basename(filePath, '.yaml')
  const idBase = toId(slug)

  // Already operational?
  // Normalize CRLF before checking
  if (content.includes('id_match:') && content.includes('confidence_level:')) {
    return { skipped: true, reason: 'already operational' }
  }

  // Normalize line endings for parsing
  const norm = content.replace(/\r\n/g, '\n')
  const purviewIdx = norm.indexOf('\npurview:\n')
  if (purviewIdx === -1) return { skipped: true, reason: 'no purview block' }

  const beforePurview = norm.substring(0, purviewIdx + 1)
  const afterPurviewContent = norm.substring(purviewIdx + '\npurview:\n'.length)

  // Find end of purview block — next top-level (0-indent) key
  const topLevelMatch = afterPurviewContent.match(/\n[a-z_]+:/m)
  let purviewText, afterPurview
  if (topLevelMatch) {
    const endIdx = afterPurviewContent.indexOf(topLevelMatch[0])
    purviewText = afterPurviewContent.substring(0, endIdx)
    afterPurview = afterPurviewContent.substring(endIdx)
  } else {
    purviewText = afterPurviewContent
    afterPurview = ''
  }

  const { regexes, keywords, filters, proximity, recConf } = parsePurviewSection(purviewText)

  if (regexes.length === 0) return { skipped: true, reason: 'no regexes parsed' }

  const positiveKw = keywords.filter(k => !k.name.toLowerCase().includes('negative'))
  const negativeKw = keywords.filter(k => k.name.toLowerCase().includes('negative'))

  // Combine negative keyword terms with filter terms (deduped)
  const negTermsSet = new Set()
  for (const kw of negativeKw) kw.words.forEach(w => negTermsSet.add(w))
  filters.forEach(w => negTermsSet.add(w))
  const negTerms = [...negTermsSet]

  const primaryRegexId = `Pattern_${idBase}_${toId(regexes[0].name)}`
  const negId = negTerms.length > 0 ? `Filter_${idBase}_exclusion` : null

  // Build operational YAML
  let y = 'purview:\n'
  y += `  patterns_proximity: ${proximity}\n`
  y += `  recommended_confidence: ${recConf}\n`

  // Pattern tiers: 85 (all evidence), 75 (primary kw), 65 (broadest)
  y += '  pattern_tiers:\n'
  const confLevels = [85, 75, 65]
  for (const conf of confLevels) {
    y += `    - confidence_level: ${conf}\n`
    y += `      id_match: ${primaryRegexId}\n`

    const matches = []
    if (conf >= 85) {
      for (const kw of positiveKw) {
        matches.push(`        - ref: Evidence_${idBase}_${toId(kw.name)}`)
      }
      for (let i = 1; i < regexes.length; i++) {
        matches.push(`        - ref: Pattern_${idBase}_${toId(regexes[i].name)}`)
      }
    } else if (conf >= 75 && positiveKw.length > 0) {
      matches.push(`        - ref: Evidence_${idBase}_${toId(positiveKw[0].name)}`)
    }
    // 65: broadest — no additional evidence

    if (negId) {
      matches.push('        - type: any')
      matches.push('          min_matches: 0')
      matches.push('          max_matches: 0')
      matches.push('          refs:')
      matches.push(`            - ${negId}`)
    }

    if (matches.length > 0) {
      y += '      matches:\n'
      y += matches.join('\n') + '\n'
    }
  }

  // Regexes
  y += '  regexes:\n'
  for (const r of regexes) {
    y += `    - id: Pattern_${idBase}_${toId(r.name)}\n`
    y += `      pattern: ${r.pattern}\n`
  }

  // Keywords
  y += '  keywords:\n'
  for (const kw of positiveKw) {
    y += `    - id: Evidence_${idBase}_${toId(kw.name)}\n`
    y += '      groups:\n'
    y += '        - match_style: word\n'
    y += '          terms:\n'
    for (const w of kw.words) {
      y += `            - ${w}\n`
    }
  }

  // Negative exclusion keyword (for NOT gate reference)
  if (negTerms.length > 0) {
    y += `    - id: ${negId}\n`
    y += '      groups:\n'
    y += '        - match_style: word\n'
    y += '          terms:\n'
    for (const w of negTerms) {
      y += `            - ${w}\n`
    }
  }

  const newContent = beforePurview + y + afterPurview
  return {
    content: newContent,
    stats: { regexes: regexes.length, posKw: positiveKw.length, negTerms: negTerms.length }
  }
}

// Process
let converted = 0, skipped = 0, errors = 0

for (const slug of targetSlugs) {
  const filePath = join('data', 'patterns', `${slug}.yaml`)
  if (!existsSync(filePath)) {
    console.log(`NOT FOUND: ${slug}`)
    errors++
    continue
  }
  try {
    const result = convertFile(filePath)
    if (result.skipped) {
      console.log(`SKIP: ${slug} — ${result.reason}`)
      skipped++
    } else {
      const s = result.stats
      console.log(`${dryRun ? 'WOULD CONVERT' : 'CONVERTED'}: ${slug} — ${s.regexes}r ${s.posKw}kw ${s.negTerms}neg`)
      if (!dryRun) writeFileSync(filePath, result.content, 'utf8')
      converted++
    }
  } catch (e) {
    console.log(`ERROR: ${slug} — ${e.message}`)
    errors++
  }
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Converted: ${converted}, Skipped: ${skipped}, Errors: ${errors}`)
if (dryRun) console.log('Run with --write to apply changes')

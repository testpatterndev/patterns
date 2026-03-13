#!/usr/bin/env node
/**
 * Upgrades the 85-confidence tier for standard concept patterns to require
 * stronger evidence gating (min_count:2, unique_results:true on evidence keywords).
 *
 * Design principle:
 *   65: pattern only (wide net) — LEAVE AS-IS
 *   75: pattern + evidence — LEAVE AS-IS, add NOT(exclusion) if missing
 *   85: pattern + strong evidence — UPGRADE: min_count:2 unique_results:true + DRC + NOT(exclusion)
 *
 * Usage:
 *   node scripts/upgrade-tier-gating.mjs                     # dry-run
 *   node scripts/upgrade-tier-gating.mjs --write             # apply
 *   node scripts/upgrade-tier-gating.mjs --slug=au-top500-083-employer-payroll-tax-filings
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')
const singleSlug = args.find(a => a.startsWith('--slug='))?.split('=')[1]

const patternsDir = 'data/patterns'
const files = readdirSync(patternsDir).filter(f => f.startsWith('au-top500-') && f.endsWith('.yaml'))

function findLine(lines, pattern) {
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i
  }
  return -1
}

function parsePurviewBlock(content) {
  const lines = content.split('\n')
  const purviewIdx = findLine(lines, /^purview:/)
  if (purviewIdx === -1) return null

  let endIdx = lines.length
  for (let i = purviewIdx + 1; i < lines.length; i++) {
    if (lines[i].match(/^\S/) && !lines[i].match(/^\s*$/)) {
      endIdx = i
      break
    }
  }

  // Collect keyword IDs by category
  const evidenceIds = []
  const filterIds = []
  const drcIds = []

  let inKeywords = false
  for (let i = purviewIdx; i < endIdx; i++) {
    const line = lines[i]
    if (line.match(/^\s{2}keywords:\s*$/)) { inKeywords = true; continue }
    if (line.match(/^\s{2}[a-z_]+:/) && !line.match(/^\s{2}keywords/)) { inKeywords = false }
    if (inKeywords) {
      const idMatch = line.match(/^\s{4}- id:\s*(.+)/)
      if (idMatch) {
        const id = idMatch[1].trim()
        if (id.includes('_data_record_context')) {
          drcIds.push(id)
        } else if (id.includes('template_exclusion') || id.includes('noise_exclusion') || id.startsWith('Filter_')) {
          filterIds.push(id)
        } else if (id.startsWith('Evidence_') || id.startsWith('Keyword_')) {
          evidenceIds.push(id)
        }
      }
    }
  }

  // Parse tiers
  const tiers = []
  for (let i = purviewIdx; i < endIdx; i++) {
    const confMatch = lines[i].match(/^\s+- confidence_level:\s*(\d+)/)
    if (confMatch) {
      const tier = { confidence: parseInt(confMatch[1]), idMatch: '', lineIdx: i }
      tiers.push(tier)
    }
    const idMatchLine = lines[i].match(/^\s+id_match:\s*(.+)/)
    if (idMatchLine && tiers.length > 0) {
      tiers[tiers.length - 1].idMatch = idMatchLine[1].trim()
    }
  }

  const confs = tiers.map(t => t.confidence).sort((a, b) => a - b)

  return { purviewIdx, endIdx, tiers, confs: confs.join(','), evidenceIds, filterIds, drcIds }
}

function buildNewTiers(info, existingContent) {
  const { tiers, evidenceIds, filterIds, drcIds } = info
  if (evidenceIds.length === 0) return null

  const primaryIdMatch = tiers[0]?.idMatch || ''
  if (!primaryIdMatch) return null

  const primaryEvidence = evidenceIds[0]
  const hasDrc = drcIds.length > 0
  const drcRef = drcIds[0]

  // Parse existing 65 and 75 tier match structures to preserve them
  const norm = existingContent
  const lines = norm.split('\n')

  // Find each tier's block boundaries
  function getTierBlock(confLevel) {
    const tierLine = findLine(lines, new RegExp(`^\\s+- confidence_level:\\s*${confLevel}`))
    if (tierLine === -1) return ''
    let end = lines.length
    for (let i = tierLine + 1; i < lines.length; i++) {
      // Next tier or next top-level purview key
      if (lines[i].match(/^\s{4}- confidence_level:/) || lines[i].match(/^\s{2}[a-z_]+:/)) {
        end = i
        break
      }
    }
    return lines.slice(tierLine, end).join('\n')
  }

  const existing65 = getTierBlock(65)
  const existing75 = getTierBlock(75)

  // Check if 75 already has a NOT gate
  const has75Not = existing75.includes('max_matches: 0')

  let yaml = ''

  // --- 85: UPGRADED — evidence(min_count:2, unique_results) + DRC + NOT ---
  yaml += `    - confidence_level: 85\n`
  yaml += `      id_match: ${primaryIdMatch}\n`
  yaml += `      matches:\n`
  yaml += `        - ref: ${primaryEvidence}\n`
  yaml += `          min_count: 2\n`
  yaml += `          unique_results: true\n`
  if (hasDrc) {
    yaml += `        - ref: ${drcRef}\n`
  }
  if (filterIds.length > 0) {
    yaml += `        - type: any\n`
    yaml += `          min_matches: 0\n`
    yaml += `          max_matches: 0\n`
    yaml += `          refs:\n`
    for (const ref of filterIds) {
      yaml += `            - ${ref}\n`
    }
  }

  // --- 75: PRESERVE existing, add NOT gate if missing ---
  if (!has75Not && filterIds.length > 0) {
    // Rebuild 75 with NOT gate added
    yaml += `    - confidence_level: 75\n`
    yaml += `      id_match: ${primaryIdMatch}\n`
    yaml += `      matches:\n`
    yaml += `        - ref: ${primaryEvidence}\n`
    if (hasDrc) {
      yaml += `        - ref: ${drcRef}\n`
    }
    yaml += `        - type: any\n`
    yaml += `          min_matches: 0\n`
    yaml += `          max_matches: 0\n`
    yaml += `          refs:\n`
    for (const ref of filterIds) {
      yaml += `            - ${ref}\n`
    }
  } else {
    // Keep existing 75 as-is
    yaml += existing75 + '\n'
  }

  // --- 65: PRESERVE exactly as-is ---
  yaml += existing65 + '\n'

  return yaml
}

let updated = 0, skipped = 0, errors = 0

for (const f of files) {
  const slug = f.replace('.yaml', '')
  if (singleSlug && slug !== singleSlug) continue

  const filePath = join(patternsDir, f)
  const content = readFileSync(filePath, 'utf8')
  const norm = content.replace(/\r\n/g, '\n')

  const info = parsePurviewBlock(norm)
  if (!info) { skipped++; continue }

  // Only process standard 65/75/85 patterns
  if (info.confs !== '65,75,85') {
    if (singleSlug) console.log(`SKIP: ${slug} — non-standard tiers: ${info.confs}`)
    skipped++
    continue
  }

  if (info.evidenceIds.length === 0) {
    console.log(`SKIP: ${slug} — no evidence keywords`)
    skipped++
    continue
  }

  const newTiers = buildNewTiers(info, norm)
  if (!newTiers) {
    console.log(`SKIP: ${slug} — could not build new tiers`)
    skipped++
    continue
  }

  // Replace pattern_tiers block
  const lines = norm.split('\n')
  const tiersStart = findLine(lines, /^\s{2}pattern_tiers:/)
  if (tiersStart === -1) {
    console.log(`SKIP: ${slug} — no pattern_tiers line`)
    skipped++
    continue
  }

  // Find end of pattern_tiers
  let tiersEnd = info.endIdx
  for (let i = tiersStart + 1; i < info.endIdx; i++) {
    if (lines[i].match(/^\s{2}[a-z_]+:/) && !lines[i].match(/^\s{4}/)) {
      tiersEnd = i
      break
    }
  }

  const before = lines.slice(0, tiersStart).join('\n')
  const after = lines.slice(tiersEnd).join('\n')
  const newContent = before + '\n  pattern_tiers:\n' + newTiers + after

  // Sanity: keyword/regex definitions preserved
  const origKwCount = (norm.match(/^\s{4}- id:/gm) || []).length
  const newKwCount = (newContent.match(/^\s{4}- id:/gm) || []).length
  if (origKwCount !== newKwCount) {
    console.log(`ERROR: ${slug} — keyword def count changed ${origKwCount} → ${newKwCount}`)
    errors++
    continue
  }

  const shortSlug = slug.replace('au-top500-', '')
  const changes = []
  changes.push('85:min_count=2+unique')
  if (!norm.includes('max_matches: 0') || norm.split('max_matches: 0').length < 3) {
    // Check if we added NOT gate to 75
    const oldHas75Not = norm.includes('confidence_level: 75') &&
      norm.substring(norm.indexOf('confidence_level: 75'), norm.indexOf('confidence_level: 65')).includes('max_matches: 0')
    if (!oldHas75Not && info.filterIds.length > 0) changes.push('75:+NOT')
  }

  console.log(`${dryRun ? 'WOULD' : 'DID'}: ${shortSlug} — ${changes.join(', ')}`)

  if (!dryRun) {
    writeFileSync(filePath, newContent, 'utf8')
  }
  updated++
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`)
if (dryRun) console.log('Run with --write to apply changes')

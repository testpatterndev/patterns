#!/usr/bin/env node
/**
 * Collapses all non-standard tier patterns down to 3 tiers (65/75/85).
 * Folds extra evidence from 90/95 tiers into 85.
 * Applies progressive gating: 65 (wide), 75 (evidence + NOT), 85 (evidence min_count:2 + DRC + NOT).
 *
 * Usage:
 *   node scripts/collapse-to-3-tiers.mjs                # dry-run
 *   node scripts/collapse-to-3-tiers.mjs --write        # apply
 *   node scripts/collapse-to-3-tiers.mjs --slug=au-top500-004-place-of-birth
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')
const singleSlug = args.find(a => a.startsWith('--slug='))?.split('=')[1]

const patternsDir = 'data/patterns'
const files = readdirSync(patternsDir).filter(f => f.startsWith('au-top500-') && f.endsWith('.yaml'))

let updated = 0, skipped = 0, errors = 0

for (const f of files) {
  const slug = f.replace('.yaml', '')
  if (singleSlug && slug !== singleSlug) continue

  const filePath = join(patternsDir, f)
  const raw = readFileSync(filePath, 'utf8')
  const norm = raw.replace(/\r\n/g, '\n')

  let p
  try {
    p = yaml.load(norm)
  } catch (e) {
    console.log(`ERROR parse: ${slug} — ${e.message}`)
    errors++
    continue
  }

  if (!p.purview || !p.purview.pattern_tiers) { skipped++; continue }

  const tiers = p.purview.pattern_tiers
  const confs = tiers.map(t => t.confidence_level).sort((a, b) => a - b)

  // Skip already-standard 3-tier patterns
  if (confs.join(',') === '65,75,85') { skipped++; continue }

  // Collect keyword IDs by category
  const kws = p.purview.keywords || []
  const evidenceIds = []
  const filterIds = []
  const drcIds = []

  for (const kw of kws) {
    const id = kw.id
    if (id.includes('_data_record_context')) {
      drcIds.push(id)
    } else if (id.includes('template_exclusion') || id.includes('noise_exclusion') || id.startsWith('Filter_')) {
      filterIds.push(id)
    } else if (id.startsWith('Evidence_') || id.startsWith('Keyword_')) {
      evidenceIds.push(id)
    }
  }

  // Get idMatch from first tier
  const primaryIdMatch = tiers[0]?.id_match || ''
  if (!primaryIdMatch) {
    console.log(`SKIP: ${slug} — no id_match`)
    skipped++
    continue
  }

  if (evidenceIds.length === 0) {
    console.log(`SKIP: ${slug} — no evidence keywords`)
    skipped++
    continue
  }

  const primaryEvidence = evidenceIds[0]
  const hasDrc = drcIds.length > 0
  const drcRef = drcIds[0]

  // Build new 3-tier structure
  const newTiers = []

  // 85: strongest gating — evidence min_count:2, DRC, NOT
  const tier85 = {
    confidence_level: 85,
    id_match: primaryIdMatch,
    matches: [
      { ref: primaryEvidence, min_count: 2, unique_results: true }
    ]
  }
  if (hasDrc) tier85.matches.push({ ref: drcRef })
  if (filterIds.length > 0) {
    tier85.matches.push({
      type: 'any',
      min_matches: 0,
      max_matches: 0,
      refs: [...filterIds]
    })
  }
  newTiers.push(tier85)

  // 75: moderate — evidence, DRC, NOT
  const tier75 = {
    confidence_level: 75,
    id_match: primaryIdMatch,
    matches: [
      { ref: primaryEvidence }
    ]
  }
  if (hasDrc) tier75.matches.push({ ref: drcRef })
  if (filterIds.length > 0) {
    tier75.matches.push({
      type: 'any',
      min_matches: 0,
      max_matches: 0,
      refs: [...filterIds]
    })
  }
  newTiers.push(tier75)

  // 65: wide — evidence only
  const tier65 = {
    confidence_level: 65,
    id_match: primaryIdMatch,
    matches: [
      { ref: primaryEvidence }
    ]
  }
  newTiers.push(tier65)

  // Replace pattern_tiers in the parsed object
  p.purview.pattern_tiers = newTiers

  // Rebuild YAML — replace just the pattern_tiers block in the raw text
  // Find pattern_tiers block boundaries
  const lines = norm.split('\n')
  let tiersStart = -1
  let tiersEnd = -1
  let purviewStart = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^purview:/)) purviewStart = i
    if (lines[i].match(/^\s{2}pattern_tiers:/)) tiersStart = i
  }

  if (tiersStart === -1) {
    console.log(`SKIP: ${slug} — no pattern_tiers line`)
    skipped++
    continue
  }

  // Find end of purview block
  let purviewEnd = lines.length
  for (let i = purviewStart + 1; i < lines.length; i++) {
    if (lines[i].match(/^\S/) && !lines[i].match(/^\s*$/)) {
      purviewEnd = i
      break
    }
  }

  // Find end of pattern_tiers — next 2-indent key within purview
  tiersEnd = purviewEnd
  for (let i = tiersStart + 1; i < purviewEnd; i++) {
    if (lines[i].match(/^\s{2}[a-z_]+:/) && !lines[i].match(/^\s{4}/)) {
      tiersEnd = i
      break
    }
  }

  // Build new pattern_tiers YAML manually (for consistent formatting)
  let tiersYaml = '  pattern_tiers:\n'
  for (const t of newTiers) {
    tiersYaml += `    - confidence_level: ${t.confidence_level}\n`
    tiersYaml += `      id_match: ${t.id_match}\n`
    if (t.matches && t.matches.length > 0) {
      tiersYaml += '      matches:\n'
      for (const m of t.matches) {
        if (m.ref) {
          tiersYaml += `        - ref: ${m.ref}\n`
          if (m.min_count > 1) tiersYaml += `          min_count: ${m.min_count}\n`
          if (m.unique_results) tiersYaml += `          unique_results: true\n`
        } else if (m.type === 'any') {
          tiersYaml += `        - type: any\n`
          tiersYaml += `          min_matches: ${m.min_matches}\n`
          tiersYaml += `          max_matches: ${m.max_matches}\n`
          tiersYaml += `          refs:\n`
          for (const r of m.refs) {
            tiersYaml += `            - ${r}\n`
          }
        }
      }
    }
  }

  const before = lines.slice(0, tiersStart).join('\n')
  const after = lines.slice(tiersEnd).join('\n')
  const newContent = before + '\n' + tiersYaml + after

  // Sanity: check keyword/regex definitions still present
  const origRegexIds = (norm.match(/^\s{4}- id: Pattern_/gm) || []).length
  const newRegexIds = (newContent.match(/^\s{4}- id: Pattern_/gm) || []).length
  if (origRegexIds !== newRegexIds) {
    console.log(`ERROR: ${slug} — regex def count changed ${origRegexIds} → ${newRegexIds}`)
    errors++
    continue
  }

  const shortSlug = slug.replace('au-top500-', '')
  console.log(`${dryRun ? 'WOULD' : 'DID'}: ${shortSlug} — ${confs.join(',')} → 65,75,85`)

  if (!dryRun) {
    writeFileSync(filePath, newContent, 'utf8')
  }
  updated++
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`)
if (dryRun) console.log('Run with --write to apply changes')

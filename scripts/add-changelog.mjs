#!/usr/bin/env node
/**
 * Adds changelog entries to patterns that were modified by tier gating scripts.
 * Inserts changelog block between `updated:` and `author:` lines.
 *
 * Usage:
 *   node scripts/add-changelog.mjs                # dry-run
 *   node scripts/add-changelog.mjs --write        # apply
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')

const patternsDir = 'data/patterns'

// Global patterns modified by wire-generic-labels
const globalSlugs = new Set([
  'global-top500-007-biometric-identifiers',
  'global-top500-026-voter-registration-number',
  'global-top500-031-immigration-file-number',
  'global-top500-034-refugee-or-asylum-case-number',
  'global-top500-037-firearm-license-number',
  'global-top500-038-professional-license-number',
  'global-top500-052-sim-card-identifiers',
  'global-top500-089-pension-account-identifiers',
  'global-top500-096-superannuation-identifiers',
  'global-top500-097-overpayment-recovery-records',
  'global-top500-101-consumer-bank-account-numbers',
  'global-top500-102-bank-routing-numbers',
  'global-top500-105-payment-card-primary-account-numbers',
  'global-top500-110-mobile-payment-account-ids',
  'global-top500-115-card-dispute-case-records',
  'global-top500-136-guarantor-identity-and-financial-data',
  'global-top500-337-provider-identifier-records',
  'global-top500-481-voter-roll-extract-files',
  'global-top500-499-central-bank-intervention-plans',
])

let updated = 0, skipped = 0

const files = readdirSync(patternsDir).filter(f => f.endsWith('.yaml'))

for (const f of files) {
  const slug = f.replace('.yaml', '')
  const isAuTop500 = slug.startsWith('au-top500-')
  const isTargetGlobal = globalSlugs.has(slug)

  if (!isAuTop500 && !isTargetGlobal) { skipped++; continue }

  const filePath = join(patternsDir, f)
  let content = readFileSync(filePath, 'utf8')

  // Skip if already has changelog
  if (content.includes('changelog:')) {
    skipped++
    continue
  }

  // Get current version and created date
  const versionMatch = content.match(/^version:\s*(.+)$/m)
  const createdMatch = content.match(/^created:\s*'?([^'\n]+)'?$/m)
  const updatedMatch = content.match(/^updated:\s*'?([^'\n]+)'?$/m)

  if (!versionMatch || !createdMatch) {
    console.log(`SKIP: ${slug} — missing version or created`)
    skipped++
    continue
  }

  const currentVersion = versionMatch[1].trim().replace(/['"]/g, '')
  const createdDate = createdMatch[1].trim()
  const updatedDate = updatedMatch ? updatedMatch[1].trim() : createdDate

  // Build changelog entries based on version
  let changelog = 'changelog:\n'

  if (isAuTop500) {
    // au-top500: went 1.0.0 → 1.1.0 (topic phrases) → 1.2.0 (tier gating)
    changelog += `  - version: ${currentVersion}\n`
    changelog += `    date: '${updatedDate}'\n`
    changelog += `    description: Standardise to 3-tier 65/75/85 gating with progressive evidence\n`
    changelog += `  - version: 1.1.0\n`
    changelog += `    date: '2026-03-06'\n`
    changelog += `    description: Embed topic-specific phrase regex, wire domain keyword lists\n`
    changelog += `  - version: 1.0.0\n`
    changelog += `    date: '${createdDate}'\n`
    changelog += `    description: Initial release\n`
  } else {
    // global-top500: went 1.0.0 → 1.1.0 (generic-labels wiring)
    changelog += `  - version: ${currentVersion}\n`
    changelog += `    date: '${updatedDate}'\n`
    changelog += `    description: Wire generic-data-labels evidence keywords at 75/85 tiers\n`
    changelog += `  - version: 1.0.0\n`
    changelog += `    date: '${createdDate}'\n`
    changelog += `    description: Initial release\n`
  }

  // Insert changelog between updated: and author: lines
  const insertPoint = content.match(/^updated:.*\n/m)
  if (insertPoint) {
    const idx = content.indexOf(insertPoint[0]) + insertPoint[0].length
    content = content.slice(0, idx) + changelog + content.slice(idx)
  } else {
    // Fallback: insert before author line
    content = content.replace(/^(author:)/m, changelog + '$1')
  }

  const shortSlug = slug.replace(/au-top500-|global-top500-/, '')
  if (dryRun) {
    if (updated < 3) console.log(`WOULD: ${shortSlug}`)
  } else {
    writeFileSync(filePath, content, 'utf8')
  }
  updated++
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Updated: ${updated}, Skipped: ${skipped}`)
if (dryRun) console.log('Run with --write to apply changes')

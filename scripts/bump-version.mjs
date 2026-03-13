#!/usr/bin/env node
/**
 * Bumps version (minor) and updated date on patterns modified by tier gating scripts.
 *
 * Usage:
 *   node scripts/bump-version.mjs                # dry-run
 *   node scripts/bump-version.mjs --write        # apply
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')
const TODAY = '2026-03-14'

const patternsDir = 'data/patterns'

// All au-top500 patterns were modified by collapse-to-3-tiers + upgrade-tier-gating
// 18 global-top500 patterns were modified by wire-generic-labels
const globalSlugs = [
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
]

function bumpMinor(version) {
  const parts = version.split('.')
  if (parts.length !== 3) return version
  parts[1] = String(parseInt(parts[1], 10) + 1)
  parts[2] = '0'
  return parts.join('.')
}

let updated = 0, skipped = 0

const files = readdirSync(patternsDir).filter(f => f.endsWith('.yaml'))

for (const f of files) {
  const slug = f.replace('.yaml', '')
  const isAuTop500 = slug.startsWith('au-top500-')
  const isTargetGlobal = globalSlugs.includes(slug)

  if (!isAuTop500 && !isTargetGlobal) { skipped++; continue }

  const filePath = join(patternsDir, f)
  let content = readFileSync(filePath, 'utf8')

  // Bump version
  const versionMatch = content.match(/^version:\s*(.+)$/m)
  if (!versionMatch) {
    console.log(`SKIP: ${slug} — no version field`)
    skipped++
    continue
  }

  const oldVersion = versionMatch[1].trim().replace(/['"]/g, '')
  const newVersion = bumpMinor(oldVersion)

  // Replace version line
  content = content.replace(
    /^version:\s*.+$/m,
    `version: ${newVersion}`
  )

  // Replace updated line
  if (content.match(/^updated:/m)) {
    content = content.replace(
      /^updated:\s*.+$/m,
      `updated: '${TODAY}'`
    )
  } else {
    // Add updated field before the last line
    content = content.trimEnd() + `\nupdated: '${TODAY}'\n`
  }

  const shortSlug = slug.replace(/au-top500-|global-top500-/, '')
  console.log(`${dryRun ? 'WOULD' : 'DID'}: ${shortSlug} — ${oldVersion} → ${newVersion}`)

  if (!dryRun) {
    writeFileSync(filePath, content, 'utf8')
  }
  updated++
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Updated: ${updated}, Skipped: ${skipped}`)
if (dryRun) console.log('Run with --write to apply changes')

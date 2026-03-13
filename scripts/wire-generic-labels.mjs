#!/usr/bin/env node
/**
 * Wires generic-data-labels keyword dictionary into 36 generic-anchor patterns.
 * Adds Evidence_generic_data_labels keyword block and references it at 75+85 tiers.
 *
 * Usage:
 *   node scripts/wire-generic-labels.mjs                # dry-run
 *   node scripts/wire-generic-labels.mjs --write        # apply
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

const args = process.argv.slice(2)
const dryRun = !args.includes('--write')

const slugs = [
  'au-top500-026-voter-registration-number',
  'au-top500-031-immigration-file-number',
  'au-top500-034-refugee-or-asylum-case-number',
  'au-top500-037-firearm-license-number',
  'au-top500-038-professional-license-number',
  'au-top500-052-sim-card-identifiers',
  'au-top500-089-pension-account-identifiers',
  'au-top500-096-superannuation-identifiers',
  'au-top500-097-overpayment-recovery-records',
  'au-top500-102-bank-routing-numbers',
  'au-top500-105-payment-card-primary-account-numbers',
  'au-top500-110-mobile-payment-account-ids',
  'au-top500-115-card-dispute-case-records',
  'au-top500-136-guarantor-identity-and-financial-data',
  'au-top500-337-provider-identifier-records',
  'au-top500-481-voter-roll-extract-files',
  'au-top500-499-central-bank-intervention-plans',
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

const EVIDENCE_ID = 'Evidence_generic_data_labels'
const genericLabelTerms = [
  'ID', 'identifier', 'number', 'reference', 'code',
  'index', 'serial', 'account', 'file number', 'case number',
  'record number', 'ref'
]

let updated = 0, skipped = 0, errors = 0

for (const slug of slugs) {
  const filePath = join('data/patterns', slug + '.yaml')
  let content
  try {
    content = readFileSync(filePath, 'utf8')
  } catch (e) {
    console.log(`NOT FOUND: ${slug}`)
    errors++
    continue
  }

  let p
  try {
    p = yaml.load(content.replace(/\r\n/g, '\n'))
  } catch (e) {
    console.log(`PARSE ERROR: ${slug} — ${e.message}`)
    errors++
    continue
  }

  if (!p.purview || !p.purview.keywords || !p.purview.pattern_tiers) {
    console.log(`SKIP: ${slug} — no purview/keywords/tiers`)
    skipped++
    continue
  }

  // Skip if already wired
  if (p.purview.keywords.some(k => k.id === EVIDENCE_ID)) {
    console.log(`SKIP: ${slug} — already has ${EVIDENCE_ID}`)
    skipped++
    continue
  }

  // 1. Add generic-data-labels to keyword_lists
  if (!p.corroborative_evidence) p.corroborative_evidence = {}
  if (!p.corroborative_evidence.keyword_lists) p.corroborative_evidence.keyword_lists = []
  if (!p.corroborative_evidence.keyword_lists.includes('generic-data-labels')) {
    p.corroborative_evidence.keyword_lists.push('generic-data-labels')
  }

  // 2. Add Evidence_generic_data_labels keyword block
  p.purview.keywords.push({
    id: EVIDENCE_ID,
    groups: [{
      match_style: 'word',
      terms: [...genericLabelTerms]
    }]
  })

  // 3. Add ref to 85 and 75 tiers
  for (const tier of p.purview.pattern_tiers) {
    if (tier.confidence_level === 85 || tier.confidence_level === 75) {
      if (!tier.matches) tier.matches = []
      // Add after existing refs but before any NOT gates
      const notGateIdx = tier.matches.findIndex(m => m.type === 'any' && m.max_matches === 0)
      const ref = { ref: EVIDENCE_ID }
      if (notGateIdx >= 0) {
        tier.matches.splice(notGateIdx, 0, ref)
      } else {
        tier.matches.push(ref)
      }
    }
  }

  // Write back — use text manipulation to preserve formatting
  // Rebuild the purview block only
  const norm = content.replace(/\r\n/g, '\n')
  const lines = norm.split('\n')

  // Find purview block boundaries
  let purviewStart = -1, purviewEnd = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'purview:') purviewStart = i
    if (purviewStart >= 0 && i > purviewStart && /^\S/.test(lines[i]) && lines[i].trim() !== '') {
      purviewEnd = i
      break
    }
  }

  if (purviewStart === -1) {
    console.log(`ERROR: ${slug} — no purview: line`)
    errors++
    continue
  }

  // Also update keyword_lists in corroborative_evidence
  let beforePurview = lines.slice(0, purviewStart).join('\n')
  if (!beforePurview.includes('generic-data-labels') && beforePurview.includes('keyword_lists:')) {
    // Add generic-data-labels to the keyword_lists
    beforePurview = beforePurview.replace(
      /(keyword_lists:\n(?:\s+- .+\n)*)/,
      '$1    - generic-data-labels\n'
    )
  }

  const afterPurview = lines.slice(purviewEnd).join('\n')

  // Rebuild purview YAML
  let purviewYaml = 'purview:\n'
  purviewYaml += `  patterns_proximity: ${p.purview.patterns_proximity || 300}\n`
  purviewYaml += `  recommended_confidence: ${p.purview.recommended_confidence || 75}\n`

  // Pattern tiers
  purviewYaml += '  pattern_tiers:\n'
  for (const tier of p.purview.pattern_tiers) {
    purviewYaml += `    - confidence_level: ${tier.confidence_level}\n`
    purviewYaml += `      id_match: ${tier.id_match}\n`
    if (tier.matches && tier.matches.length > 0) {
      purviewYaml += '      matches:\n'
      for (const m of tier.matches) {
        if (m.ref) {
          purviewYaml += `        - ref: ${m.ref}\n`
          if (m.min_count > 1) purviewYaml += `          min_count: ${m.min_count}\n`
          if (m.unique_results) purviewYaml += `          unique_results: true\n`
        } else if (m.type === 'any') {
          purviewYaml += `        - type: any\n`
          purviewYaml += `          min_matches: ${m.min_matches}\n`
          purviewYaml += `          max_matches: ${m.max_matches}\n`
          if (m.refs) {
            purviewYaml += `          refs:\n`
            for (const r of m.refs) {
              purviewYaml += `            - ${r}\n`
            }
          }
        }
      }
    }
  }

  // Regexes
  purviewYaml += '  regexes:\n'
  for (const r of p.purview.regexes || []) {
    purviewYaml += `    - id: ${r.id}\n`
    purviewYaml += `      pattern: ${r.pattern}\n`
  }

  // Keywords
  purviewYaml += '  keywords:\n'
  for (const kw of p.purview.keywords) {
    purviewYaml += `    - id: ${kw.id}\n`
    if (kw.groups) {
      purviewYaml += '      groups:\n'
      for (const g of kw.groups) {
        purviewYaml += `        - match_style: ${g.match_style}\n`
        if (g.terms) {
          purviewYaml += '          terms:\n'
          for (const t of g.terms) {
            purviewYaml += `            - ${t}\n`
          }
        }
      }
    }
  }

  const newContent = beforePurview + '\n' + purviewYaml + afterPurview

  const shortSlug = slug.replace(/au-top500-|global-top500-/, '')
  console.log(`${dryRun ? 'WOULD' : 'DID'}: ${shortSlug}`)

  if (!dryRun) {
    writeFileSync(filePath, newContent, 'utf8')
  }
  updated++
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`)
if (dryRun) console.log('Run with --write to apply changes')

#!/usr/bin/env node
/**
 * wire-domain-keywords.js
 *
 * Phase 3C: Wire patterns to shared domain keyword lists based on data_categories.
 * Also consolidates old HR keyword references into industry-hr.
 *
 * Usage:
 *   node scripts/wire-domain-keywords.js --dry-run    # Report changes
 *   node scripts/wire-domain-keywords.js --apply      # Apply changes
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PATTERNS_DIR = join(__dirname, '..', 'data', 'patterns')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const apply = args.includes('--apply')

if (!dryRun && !apply) {
  console.error('Usage: node scripts/wire-domain-keywords.js [--dry-run|--apply]')
  process.exit(1)
}

const YAML_OPTS = { lineWidth: -1, noRefs: true, sortKeys: false }

// ── HR slug consolidation map ─────────────────────────────────────────
const HR_CONSOLIDATION = {
  'hr-employment-records': 'industry-hr',
  'hr-compensation': 'industry-hr',
  'hr-disciplinary': 'industry-hr',
  'hr-performance': 'industry-hr',
  'hr-leave-welfare': 'industry-hr',
}

// ── Domain keyword mapping ────────────────────────────────────────────
// Maps data_categories → domain keyword list slugs
const CATEGORY_TO_DOMAIN = {
  'corporate': ['corporate-governance'],
  'governance': ['corporate-governance'],
  'legal': ['corporate-legal'],
  'financial': ['corporate-finance'],
  'ip': ['corporate-ip'],
  'government': ['government-services'],
  'government-id': ['government-services'],
  'healthcare': ['healthcare-clinical'],
  'phi': ['healthcare-clinical'],
  'law-enforcement': ['law-enforcement'],
  'hr': ['industry-hr'],
}

// ── Main ──────────────────────────────────────────────────────────────
const files = readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.yaml'))
const stats = { processed: 0, hrConsolidated: 0, domainWired: 0, skipped: 0 }

for (const file of files) {
  const filePath = join(PATTERNS_DIR, file)
  const raw = readFileSync(filePath, 'utf-8')
  const data = yaml.load(raw)
  const slug = file.replace('.yaml', '')

  // Skip non-regex patterns (keyword_dictionary, keyword_list, fingerprint)
  if (!data.corroborative_evidence) {
    stats.skipped++
    continue
  }

  stats.processed++
  let changed = false
  const changes = []

  // ── Step 1: Consolidate old HR refs ──
  if (data.corroborative_evidence.keyword_lists) {
    const oldLists = [...data.corroborative_evidence.keyword_lists]
    const newLists = oldLists.map(ref => HR_CONSOLIDATION[ref] || ref)
    // Deduplicate
    const deduped = [...new Set(newLists)]
    if (JSON.stringify(oldLists) !== JSON.stringify(deduped)) {
      data.corroborative_evidence.keyword_lists = deduped
      changes.push(`HR consolidation: ${oldLists.join(', ')} → ${deduped.join(', ')}`)
      stats.hrConsolidated++
      changed = true
    }
  }

  // ── Step 2: Wire to domain keyword lists based on data_categories ──
  if (data.data_categories && !data.corroborative_evidence.keyword_lists?.length) {
    // Only wire patterns that have NO keyword_lists yet
    const domainLists = new Set()
    for (const cat of data.data_categories) {
      const lists = CATEGORY_TO_DOMAIN[cat]
      if (lists) lists.forEach(l => domainLists.add(l))
    }

    if (domainLists.size > 0) {
      if (!data.corroborative_evidence.keyword_lists) {
        data.corroborative_evidence.keyword_lists = []
      }
      const toAdd = [...domainLists].filter(l => !data.corroborative_evidence.keyword_lists.includes(l))
      if (toAdd.length > 0) {
        data.corroborative_evidence.keyword_lists.push(...toAdd)
        changes.push(`Domain wiring: added ${toAdd.join(', ')}`)
        stats.domainWired++
        changed = true
      }
    }
  }

  if (changed) {
    data.updated = '2026-03-06'
    if (dryRun) {
      console.log(`${slug}: ${changes.join('; ')}`)
    }
    if (apply) {
      writeFileSync(filePath, yaml.dump(data, YAML_OPTS))
      console.log(`UPDATED: ${slug}`)
    }
  }
}

console.log(`\n${'─'.repeat(40)}`)
console.log(`Summary`)
console.log(`${'─'.repeat(40)}`)
console.log(`Processed: ${stats.processed}`)
console.log(`HR consolidated: ${stats.hrConsolidated}`)
console.log(`Domain wired: ${stats.domainWired}`)
console.log(`Skipped (no corroborative_evidence): ${stats.skipped}`)

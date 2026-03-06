#!/usr/bin/env node
/**
 * fix-operation-hr-slugs.js
 *
 * Fixes operation: text in patterns that still mention old HR keyword list slugs.
 * Replaces: hr-employment-records, hr-compensation, hr-disciplinary, hr-performance, hr-leave-welfare
 * With: industry-hr
 *
 * Usage:
 *   node scripts/fix-operation-hr-slugs.js --dry-run    # Report changes
 *   node scripts/fix-operation-hr-slugs.js --apply      # Apply changes
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PATTERNS_DIR = join(__dirname, '..', 'data', 'patterns')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const apply = args.includes('--apply')

if (!dryRun && !apply) {
  console.error('Usage: node scripts/fix-operation-hr-slugs.js [--dry-run|--apply]')
  process.exit(1)
}

const YAML_OPTS = { lineWidth: -1, noRefs: true, sortKeys: false }

const OLD_SLUGS = [
  'hr-employment-records',
  'hr-compensation',
  'hr-disciplinary',
  'hr-performance',
  'hr-leave-welfare'
]

const files = readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.yaml'))
let fixed = 0

for (const file of files) {
  const filePath = join(PATTERNS_DIR, file)
  const raw = readFileSync(filePath, 'utf-8')
  const data = yaml.load(raw)

  if (!data.operation) continue

  let newOp = data.operation
  let changed = false

  for (const slug of OLD_SLUGS) {
    if (newOp.includes(slug)) {
      // Replace each old slug mention, dedup if industry-hr already present
      newOp = newOp.replace(new RegExp(`, ${slug}`, 'g'), '')
      newOp = newOp.replace(new RegExp(`${slug}, `, 'g'), '')
      newOp = newOp.replace(new RegExp(slug, 'g'), 'industry-hr')
      changed = true
    }
  }

  // Deduplicate "industry-hr, industry-hr" → "industry-hr"
  while (newOp.includes('industry-hr, industry-hr')) {
    newOp = newOp.replace('industry-hr, industry-hr', 'industry-hr')
  }

  if (changed) {
    fixed++
    if (dryRun) {
      console.log(`${file}:`)
      console.log(`  OLD: ${data.operation}`)
      console.log(`  NEW: ${newOp}`)
      console.log()
    }
    if (apply) {
      data.operation = newOp
      writeFileSync(filePath, yaml.dump(data, YAML_OPTS))
      console.log(`UPDATED: ${file}`)
    }
  }
}

console.log(`\nTotal fixed: ${fixed}`)

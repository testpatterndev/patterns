#!/usr/bin/env node
/**
 * Mark every low-confidence tier (confidence_level < 75) as discovery_only: true
 * when the flag is missing. Low tiers are inventory/discovery by contract
 * (testpattern/v1 + profile quality LOW_TIER_ENFORCES).
 *
 * Line-preserving via apply-remediation-ops.
 *
 * Usage:
 *   node scripts/fix-low-tier-discovery-only.mjs           # dry-run
 *   node scripts/fix-low-tier-discovery-only.mjs --write  # apply
 *   node scripts/fix-low-tier-discovery-only.mjs --write --slugs=a,b
 */
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { applyOpsToObject, applyOpsToText } from './lib/apply-remediation-ops.mjs'

const PATTERN_DIR = path.join('data', 'patterns')
const write = process.argv.includes('--write')
const slugFilter = process.argv.find(a => a.startsWith('--slugs='))?.slice('--slugs='.length)
  ?.split(',').map(s => s.trim()).filter(Boolean)

const files = fs.readdirSync(PATTERN_DIR).filter(f => f.endsWith('.yaml')).sort()
const opsByFile = []
let tierCount = 0

for (const file of files) {
  const slug = file.replace(/\.yaml$/, '')
  if (slugFilter && !slugFilter.includes(slug)) continue
  const filePath = path.join(PATTERN_DIR, file)
  const text = fs.readFileSync(filePath, 'utf8')
  const data = yaml.load(text)
  const tiers = data?.purview?.pattern_tiers
  if (!Array.isArray(tiers)) continue

  const ops = []
  tiers.forEach((tier, tierIndex) => {
    const level = Number(tier.confidence_level ?? tier.confidence ?? 0)
    if (!(level > 0 && level < 75)) return
    if (tier.discovery_only === true) return
    ops.push({ op: 'add_tier_field', tierIndex, field: 'discovery_only', value: true })
    tierCount++
  })
  if (!ops.length) continue
  opsByFile.push({ file: filePath, slug, ops, text, data })
}

console.log(`Files needing fix: ${opsByFile.length}`)
console.log(`Low tiers to mark discovery_only: ${tierCount}`)
if (!opsByFile.length) process.exit(0)

let failed = 0
const writes = []
for (const item of opsByFile) {
  try {
    const expected = applyOpsToObject(item.data, item.ops)
    const nextText = applyOpsToText(item.text, item.ops)
    const parsed = yaml.load(nextText)
    // Key insertion order can differ (text insert vs object append); compare
    // normalized tier payloads.
    const norm = tiers => JSON.stringify(
      (tiers || []).map(t => ({
        confidence_level: t.confidence_level ?? t.confidence,
        discovery_only: t.discovery_only === true,
        id_match: t.id_match,
        matches: t.matches,
      })),
    )
    if (norm(expected.purview.pattern_tiers) !== norm(parsed.purview.pattern_tiers)) {
      console.error(`ORACLE FAIL ${item.slug}`)
      failed++
      continue
    }
    // Every targeted low tier must now be discovery_only
    for (const op of item.ops) {
      const tier = parsed.purview.pattern_tiers[op.tierIndex]
      if (tier?.discovery_only !== true) {
        console.error(`MISSING FLAG ${item.slug} tier ${op.tierIndex}`)
        failed++
      }
    }
    writes.push({ file: item.file, slug: item.slug, text: nextText, ops: item.ops.length })
  } catch (error) {
    console.error(`ERROR ${item.slug}: ${error.message}`)
    failed++
  }
}

if (failed) {
  console.error(`Skipped ${failed} file(s) that failed oracle/apply (pre-existing YAML edge cases).`)
}

if (!writes.length) {
  console.error('Nothing to write.')
  process.exit(failed ? 1 : 0)
}

if (!write) {
  console.log('Dry-run only. Pass --write to apply.')
  console.log(`Ready: ${writes.length} files. Sample:`, writes.slice(0, 10).map(w => `${w.slug}(${w.ops})`).join(', '))
  process.exit(0)
}

for (const item of writes) {
  fs.writeFileSync(item.file, item.text)
}
console.log(`Wrote ${writes.length} files (${failed} skipped).`)

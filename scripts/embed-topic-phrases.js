#!/usr/bin/env node
/**
 * embed-topic-phrases.js
 *
 * Transforms top500 concept patterns from shared broad regex templates
 * to topic-specific multi-word phrase regexes.
 *
 * Usage:
 *   node scripts/embed-topic-phrases.js --dry-run                        # Report all matching patterns
 *   node scripts/embed-topic-phrases.js --dry-run --slugs=slug1,slug2    # Report specific patterns
 *   node scripts/embed-topic-phrases.js --apply                          # Apply to all matching patterns
 *   node scripts/embed-topic-phrases.js --apply --slugs=slug1,slug2      # Apply to specific patterns
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PATTERNS_DIR = join(__dirname, '..', 'data', 'patterns')

// ── CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const apply = args.includes('--apply')
const slugsArg = args.find(a => a.startsWith('--slugs='))
const targetSlugs = slugsArg ? slugsArg.split('=')[1].split(',') : null

if (!dryRun && !apply) {
  console.error('Usage: node scripts/embed-topic-phrases.js [--dry-run|--apply] [--slugs=slug1,slug2,...]')
  process.exit(1)
}

// ── YAML dump options ─────────────────────────────────────────────────
const YAML_OPTS = { lineWidth: -1, noRefs: true, sortKeys: false }

// ── Pattern loading ───────────────────────────────────────────────────
function loadPattern(slug) {
  const filePath = join(PATTERNS_DIR, `${slug}.yaml`)
  if (!existsSync(filePath)) return null
  const raw = readFileSync(filePath, 'utf-8')
  return { data: yaml.load(raw), filePath, raw }
}

function loadAllPatterns() {
  const files = readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.yaml'))
  const results = []
  for (const file of files) {
    const slug = file.replace('.yaml', '')
    const p = loadPattern(slug)
    if (p) results.push({ slug, ...p })
  }
  return results
}

// ── Broad template detection ──────────────────────────────────────────
function isBroadTemplate(pattern) {
  // Detect two-group broad regex templates with large proximity gaps:
  //   (?is)\b(?:word1|word2|...)\b\s{0,NNN}\b(?:word1|word2|...)\b
  if (!pattern.startsWith('(?is)')) return false
  const gapMatch = pattern.match(/\\b\\s\{0,(\d+)\}\\b/)
  if (!gapMatch) return false
  return parseInt(gapMatch[1]) >= 100
}

// ── Evidence keyword extraction ───────────────────────────────────────
function findEvidenceKeywords(purview) {
  if (!purview?.keywords) return null
  for (const kw of purview.keywords) {
    // AU simple: Evidence_xxx (not Evidence_template_exclusion)
    if (kw.id.startsWith('Evidence_') && !kw.id.includes('template_exclusion')) {
      return kw
    }
  }
  for (const kw of purview.keywords) {
    // Global / hybrid: Keyword_xxx (not _domain_context, not _noise_exclusion)
    if (kw.id.startsWith('Keyword_') &&
        !kw.id.endsWith('_domain_context') &&
        !kw.id.endsWith('_noise_exclusion')) {
      return kw
    }
  }
  return null
}

function extractMultiWordPhrases(keywordGroup) {
  const phrases = []
  for (const group of keywordGroup.groups || []) {
    for (const term of group.terms || []) {
      const str = String(term).trim()
      if (!str) continue
      const words = str.split(/\s+/)
      if (words.length >= 2) {
        phrases.push(str)
      }
    }
  }
  return phrases
}

// ── Regex building ────────────────────────────────────────────────────
function phraseToRegex(phrase) {
  // Split on whitespace and hyphens, keeping delimiters
  const parts = phrase.split(/(\s+|-)/g)
  return parts.map(part => {
    if (/^\s+$/.test(part)) return '\\s+'
    if (part === '-') return '[\\s-]+'
    // Escape regex special characters in word tokens
    return part.replace(/[.*+?^${}()|\\[\]\/]/g, '\\$&')
  }).join('')
}

function buildTopicRegex(phrases) {
  const fragments = phrases.map(phraseToRegex)
  return `(?is)\\b(?:${fragments.join('|')})\\b`
}

// ── Extract old generic words from broad template ─────────────────────
function extractOldGenericWords(regex) {
  // Parse: (?is)\b(?:group1)\b\s{0,N}\b(?:group2)\b
  const m = regex.match(/\(\?is\)\\b\(\?:(.*?)\)\\b.*?\\b\(\?:(.*?)\)\\b/)
  if (!m) return []
  return m[1].split('|').concat(m[2].split('|'))
    .map(w => w.replace(/\\s\+/g, ' ').replace(/\\s\*/, ' '))
    .filter(w => /^[\w\s]+$/.test(w))
}

// ── Pattern transformation ────────────────────────────────────────────
function findPrimaryRegexId(purview) {
  if (!purview?.pattern_tiers?.length) return null
  return purview.pattern_tiers[0].id_match
}

function transformPattern(slug, data) {
  const changes = []
  const warnings = []

  // Check prerequisites
  if (!data.purview) return { skip: true, reason: 'no purview block' }
  if (!data.pattern) return { skip: true, reason: 'no pattern field' }
  if (!isBroadTemplate(data.pattern)) return { skip: true, reason: 'not a broad template' }

  const oldRegex = data.pattern

  // Find evidence keywords
  const evidenceKw = findEvidenceKeywords(data.purview)
  if (!evidenceKw) return { skip: true, reason: 'no evidence keywords found' }

  // Extract multi-word phrases
  const phrases = extractMultiWordPhrases(evidenceKw)
  if (phrases.length === 0) {
    return { skip: true, reason: `no multi-word phrases in ${evidenceKw.id}` }
  }
  if (phrases.length < 3) {
    warnings.push(`Only ${phrases.length} multi-word phrase(s) in ${evidenceKw.id}: ${phrases.join(', ')}`)
  }

  // Build new regex
  const newRegex = buildTopicRegex(phrases)
  changes.push({ field: 'pattern', old: oldRegex, new: newRegex })

  // 1. Update top-level pattern
  data.pattern = newRegex

  // 2. Update purview regex (the primary one referenced by id_match)
  const primaryId = findPrimaryRegexId(data.purview)
  if (primaryId && data.purview.regexes) {
    const idx = data.purview.regexes.findIndex(r => r.id === primaryId)
    if (idx >= 0) {
      data.purview.regexes[idx].pattern = newRegex
      changes.push({ field: `purview.regexes[${idx}].pattern (${primaryId})`, updated: true })
    }
  }

  // 3. Gate 65-confidence tier — require evidence keyword match
  if (data.purview.pattern_tiers) {
    const tier65 = data.purview.pattern_tiers.find(t => t.confidence_level === 65)
    if (tier65) {
      const evidenceRef = evidenceKw.id
      const hasPositiveEvidence = tier65.matches?.some(m => m.ref === evidenceRef)
      if (!hasPositiveEvidence) {
        if (!tier65.matches) tier65.matches = []
        // Insert evidence requirement at the beginning (before any noise exclusion NOT match)
        tier65.matches.unshift({ ref: evidenceRef })
        changes.push({ field: '65-tier', action: `Added evidence requirement: ${evidenceRef}` })
      }
    }
  }

  // 4. Update test_cases
  const oldWords = extractOldGenericWords(oldRegex)
  data.test_cases = buildNewTestCases(phrases, oldWords)
  changes.push({ field: 'test_cases', action: 'Rebuilt with topic-specific phrases' })

  // 5. Update metadata
  data.updated = '2026-03-06'

  return { skip: false, changes, warnings, phrases, evidenceId: evidenceKw.id, oldRegex, newRegex }
}

function buildNewTestCases(phrases, oldWords) {
  // should_match: use actual multi-word phrases that match the new regex
  const shouldMatch = []
  if (phrases.length >= 1) {
    shouldMatch.push({ value: phrases[0], description: 'Primary topic phrase match' })
  }
  if (phrases.length >= 2) {
    shouldMatch.push({ value: phrases[1].toLowerCase(), description: 'Case-insensitive topic phrase match' })
  }
  if (phrases.length >= 3) {
    shouldMatch.push({ value: phrases[2], description: 'Alternative topic phrase match' })
  }
  if (phrases.length >= 4) {
    shouldMatch.push({ value: phrases[3], description: 'Additional topic phrase match' })
  }

  // should_not_match: generic text + old broad words that shouldn't match specific regex
  const shouldNotMatch = [
    { value: 'unrelated generic text without domain phrases', description: 'No relevant topic phrases present' },
    { value: 'placeholder value 12345', description: 'Random text should not match topic-specific regex' },
  ]

  // Add old generic word pair that would have matched the broad template but not the new specific regex
  if (oldWords.length >= 2) {
    const w1 = oldWords[0]
    const w2 = oldWords[Math.min(Math.floor(oldWords.length / 2), oldWords.length - 1)]
    shouldNotMatch.push({
      value: `${w1} ${w2}`,
      description: 'Generic word pair from old broad template should not match'
    })
  }

  return { should_match: shouldMatch, should_not_match: shouldNotMatch }
}

// ── Main ──────────────────────────────────────────────────────────────
let patterns
if (targetSlugs) {
  patterns = targetSlugs.map(slug => {
    const p = loadPattern(slug)
    return p ? { slug, ...p } : { slug, data: null, filePath: null }
  })
} else {
  patterns = loadAllPatterns()
}

const stats = { processed: 0, transformed: 0, skipped: 0, warnings: 0, missing: 0 }
const results = []

for (const { slug, data, filePath } of patterns) {
  if (!data) {
    console.error(`MISSING: ${slug}.yaml not found`)
    stats.missing++
    continue
  }

  stats.processed++
  const result = transformPattern(slug, data)

  if (result.skip) {
    if (targetSlugs) {
      console.log(`SKIP ${slug}: ${result.reason}`)
    }
    stats.skipped++
    continue
  }

  stats.transformed++
  if (result.warnings?.length) stats.warnings += result.warnings.length

  results.push({ slug, ...result })

  if (dryRun) {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`${slug}`)
    console.log(`${'='.repeat(70)}`)
    console.log(`Evidence: ${result.evidenceId} (${result.phrases.length} multi-word phrases)`)
    console.log(`Phrases:`)
    for (const p of result.phrases) {
      console.log(`  - "${p}" → ${phraseToRegex(p)}`)
    }
    console.log(`\nOLD regex:`)
    console.log(`  ${result.oldRegex}`)
    console.log(`NEW regex:`)
    console.log(`  ${result.newRegex}`)
    for (const c of result.changes) {
      if (!c.old) {
        console.log(`\n${c.field}: ${c.action || (c.updated ? 'updated' : '')}`)
      }
    }
    if (result.warnings?.length) {
      console.log(`\nWARNINGS:`)
      for (const w of result.warnings) console.log(`  ⚠ ${w}`)
    }
  }

  if (apply && filePath) {
    writeFileSync(filePath, yaml.dump(data, YAML_OPTS))
    console.log(`UPDATED: ${slug}`)
  }
}

console.log(`\n${'─'.repeat(40)}`)
console.log(`Summary`)
console.log(`${'─'.repeat(40)}`)
console.log(`Processed: ${stats.processed}`)
console.log(`Transformed: ${stats.transformed}`)
console.log(`Skipped: ${stats.skipped}`)
console.log(`Missing: ${stats.missing}`)
console.log(`Warnings: ${stats.warnings}`)

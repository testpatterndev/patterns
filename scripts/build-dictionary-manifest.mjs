/**
 * Build dictionary manifest — resolves keyword dictionary definitions from YAML
 * source files and writes a manifest JSON with merged terms, hashes, and usage counts.
 *
 * Usage: node scripts/build-dictionary-manifest.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import yaml from 'js-yaml'

const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url))
const KEYWORDS_DIR = join(DATA_DIR, 'keywords')
const PATTERNS_DIR = join(DATA_DIR, 'patterns')
const OUT_FILE = join(DATA_DIR, 'dictionary-manifest.json')

// ── Dictionary registry ─────────────────────────────────────────────

const DICTIONARY_REGISTRY = [
  {
    placeholder: '{{DICT_NOISE_EXCLUSION}}',
    name: 'TestPattern - Noise Exclusion',
    description: 'Universal false positive suppression terms',
    scope: 'universal',
    matchStyle: 'word',
    sources: ['template-exclusion']
  },
  {
    placeholder: '{{DICT_EN_GOVERNMENT_EXCLUSION}}',
    name: 'TestPattern - EN Government Exclusion',
    description: 'English-language government/enterprise noise terms',
    scope: 'en-government',
    matchStyle: 'word',
    sources: ['en-government-exclusion']
  },
  {
    placeholder: '{{DICT_DOMAIN_CONTEXT}}',
    name: 'TestPattern - Domain Context',
    description: 'Structural data-handling context terms',
    scope: 'universal',
    matchStyle: 'word',
    sources: ['data-record-context', 'generic-data-labels']
  },
  {
    placeholder: '{{DICT_DATA_LABELS}}',
    name: 'TestPattern - Data Labels',
    description: 'Generic structured data identifier labels',
    scope: 'universal',
    matchStyle: 'word',
    sources: ['generic-data-labels']
  },
  {
    placeholder: '{{DICT_EN_GOVERNMENT_CLASSIFICATION}}',
    name: 'TestPattern - EN Government Classification',
    description: 'English-language government security classification markers',
    scope: 'en-government',
    matchStyle: 'word',
    sources: ['en-government-classification']
  },
  {
    placeholder: '{{DICT_AU_FORENAMES_MALE}}',
    name: 'TestPattern - AU Forenames (Male, Very Common)',
    description: '200 most common Australian male forenames',
    scope: 'au',
    matchStyle: 'word',
    sources: ['au-forenames-male-very-common']
  },
  {
    placeholder: '{{DICT_AU_FORENAMES_FEMALE}}',
    name: 'TestPattern - AU Forenames (Female, Very Common)',
    description: '200 most common Australian female forenames',
    scope: 'au',
    matchStyle: 'word',
    sources: ['au-forenames-female-very-common']
  },
  {
    placeholder: '{{DICT_AU_FAMILY_NAMES}}',
    name: 'TestPattern - AU Family Names (Top Tier)',
    description: '1,286 most common Australian family names',
    scope: 'au',
    matchStyle: 'word',
    sources: ['au-family-names-top-tier']
  },
  {
    placeholder: '{{DICT_AU_FORENAMES}}',
    name: 'TestPattern - Australian Forenames',
    description: 'Consolidated Australian forenames from BDM, QLD Unclaimed Money Register, and cultural sources',
    scope: 'au',
    matchStyle: 'word',
    sources: ['au-forenames-australian']
  },
  {
    placeholder: '{{DICT_AU_SURNAMES}}',
    name: 'TestPattern - Australian Surnames',
    description: 'Consolidated Australian surnames from immigration, QLD Unclaimed Money Register, and cultural sources',
    scope: 'au',
    matchStyle: 'word',
    sources: ['au-surnames-australian']
  }
]

// ── Helpers ──────────────────────────────────────────────────────────

function walkDir(dir) {
  const files = []
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full))
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      files.push(full)
    }
  }
  return files
}

function loadKeywordDict(slug) {
  const filePath = join(KEYWORDS_DIR, `${slug}.yaml`)
  if (!existsSync(filePath)) {
    console.error(`  ERROR: keyword dict not found: ${slug}`)
    return null
  }
  const raw = readFileSync(filePath, 'utf-8')
  const data = yaml.load(raw)
  if (!data?.keywords || !Array.isArray(data.keywords)) {
    console.error(`  ERROR: keyword dict has no keywords array: ${slug}`)
    return null
  }
  return data.keywords.map(t => typeof t === 'string' ? t : String(t))
}

function computeHash(terms) {
  return createHash('md5')
    .update(terms.map(t => t.toLowerCase()).sort().join('\n'))
    .digest('hex')
    .slice(0, 12)
}

// ── Count pattern references ─────────────────────────────────────────

function countPatternReferences(sourceSlugs) {
  const patternFiles = walkDir(PATTERNS_DIR)
  let count = 0

  for (const file of patternFiles) {
    const raw = readFileSync(file, 'utf-8')
    const data = yaml.load(raw)
    if (!data?.slug) continue

    // Check corroborative_evidence.keyword_lists
    const kwLists = data.corroborative_evidence?.keyword_lists || []
    const hasKwRef = kwLists.some(ref => sourceSlugs.includes(ref))

    // Check purview.shared_keywords
    const sharedKw = data.purview?.shared_keywords || []
    const hasSharedRef = sharedKw.some(ref => sourceSlugs.includes(ref.dict))

    if (hasKwRef || hasSharedRef) count++
  }

  return count
}

// ── Main ─────────────────────────────────────────────────────────────

console.log('Building dictionary manifest...')

// Pre-load all pattern files once for reference counting
const patternFiles = walkDir(PATTERNS_DIR)
const patternData = []
for (const file of patternFiles) {
  try {
    const raw = readFileSync(file, 'utf-8')
    const data = yaml.load(raw)
    if (data?.slug) patternData.push(data)
  } catch { /* skip */ }
}

function countRefsFromCache(sourceSlugs) {
  let count = 0
  for (const data of patternData) {
    const kwLists = data.corroborative_evidence?.keyword_lists || []
    const hasKwRef = kwLists.some(ref => sourceSlugs.includes(ref))

    const sharedKw = data.purview?.shared_keywords || []
    const hasSharedRef = sharedKw.some(ref => sourceSlugs.includes(ref.dict))

    if (hasKwRef || hasSharedRef) count++
  }
  return count
}

const dictionaries = []
let errors = 0

for (const entry of DICTIONARY_REGISTRY) {
  // Load and merge terms from all sources
  const allTerms = []
  let hasError = false

  for (const sourceSlug of entry.sources) {
    const terms = loadKeywordDict(sourceSlug)
    if (!terms) {
      hasError = true
      errors++
      continue
    }
    allTerms.push(...terms)
  }

  if (hasError && allTerms.length === 0) {
    console.error(`  SKIP: ${entry.placeholder} — no valid sources`)
    continue
  }

  // Deduplicate (case-insensitive), sort
  const seen = new Map()
  for (const term of allTerms) {
    const lower = term.toLowerCase()
    if (!seen.has(lower)) {
      seen.set(lower, term)
    }
  }
  const terms = [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

  // Compute hash
  const hash = computeHash(terms)

  // Count pattern references
  const requiredBy = countRefsFromCache(entry.sources)

  dictionaries.push({
    placeholder: entry.placeholder,
    name: entry.name,
    description: entry.description,
    scope: entry.scope,
    matchStyle: entry.matchStyle,
    sources: entry.sources,
    hash,
    requiredBy,
    termCount: terms.length,
    terms
  })

  console.log(`  ${entry.placeholder}: ${terms.length} terms, ${requiredBy} patterns, hash ${hash}`)
}

const manifest = {
  version: '1.0',
  generated: new Date().toISOString(),
  dictionaries
}

writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2))

console.log(`\nDone: ${dictionaries.length} dictionaries → data/dictionary-manifest.json`)
if (errors > 0) {
  console.error(`${errors} source(s) had errors`)
  process.exit(1)
}

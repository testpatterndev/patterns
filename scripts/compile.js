import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url))
const OUT_FILE = fileURLToPath(new URL('../patterns.json', import.meta.url))

const REQUIRED_PATTERN_FIELDS = ['schema', 'name', 'slug', 'type', 'confidence', 'jurisdictions', 'regulations', 'data_categories', 'test_cases']
const REQUIRED_COLLECTION_FIELDS = ['schema', 'name', 'slug', 'description', 'patterns']
const REQUIRED_KEYWORD_FIELDS = ['schema', 'name', 'slug', 'type', 'keywords']
const PACKAGE_TAGS_FILE = join(DATA_DIR, 'package-tags.json')
const CLASSIFIER_IDS_FILE = join(DATA_DIR, 'classifier-ids.json')

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

function validate(obj, requiredFields, file) {
  const missing = requiredFields.filter(f => !(f in obj))
  if (missing.length > 0) {
    console.error(`  WARN: ${relative(DATA_DIR, file)} missing fields: ${missing.join(', ')}`)
    return false
  }
  return true
}

function loadPackageTags() {
  if (!existsSync(PACKAGE_TAGS_FILE)) return null
  const data = JSON.parse(readFileSync(PACKAGE_TAGS_FILE, 'utf-8'))
  if (data.schema !== 'testpattern.package-tags.v1') {
    throw new Error(`Unsupported package tags schema '${data.schema}' in ${relative(DATA_DIR, PACKAGE_TAGS_FILE)}`)
  }
  if (!data.patterns || typeof data.patterns !== 'object' || Array.isArray(data.patterns)) {
    throw new Error(`${relative(DATA_DIR, PACKAGE_TAGS_FILE)} must contain a patterns object`)
  }
  const { patterns: packagePatterns, ...metadata } = data
  return {
    metadata,
    patterns: packagePatterns
  }
}

function loadClassifierIds() {
  if (!existsSync(CLASSIFIER_IDS_FILE)) {
    throw new Error(`${relative(DATA_DIR, CLASSIFIER_IDS_FILE)} is required; run npm run sync:classifier-ids`)
  }
  const data = JSON.parse(readFileSync(CLASSIFIER_IDS_FILE, 'utf-8'))
  if (data.schema !== 'testpattern.classifier-ids.v1' || !data.patterns || typeof data.patterns !== 'object') {
    throw new Error(`Invalid classifier ID registry: ${relative(DATA_DIR, CLASSIFIER_IDS_FILE)}`)
  }
  return data
}

console.log('Compiling patterns...')
const packageTags = loadPackageTags()
const classifierIds = loadClassifierIds()

// ── Load keyword dictionaries first (for reference resolution) ──
const keywordFiles = walkDir(join(DATA_DIR, 'keywords'))
const keywordDicts = []
const keywordMap = new Map() // slug → keywords array

for (const file of keywordFiles) {
  const raw = readFileSync(file, 'utf-8')
  const data = yaml.load(raw)
  if (validate(data, REQUIRED_KEYWORD_FIELDS, file)) {
    keywordDicts.push(data)
    keywordMap.set(data.slug, data.keywords)
  }
}

// ── Load patterns ──
const patternFiles = walkDir(join(DATA_DIR, 'patterns'))
const patterns = []
let resolvedCount = 0
let unresolvedKeywordRefs = 0

for (const file of patternFiles) {
  const raw = readFileSync(file, 'utf-8')
  const data = yaml.load(raw)

  // keyword_dictionary patterns don't need a 'pattern' field
  const reqFields = data.type === 'keyword_dictionary' || data.type === 'keyword_list'
    ? REQUIRED_KEYWORD_FIELDS
    : REQUIRED_PATTERN_FIELDS

  if (!validate(data, reqFields, file)) continue
  const classifierId = classifierIds.patterns[data.slug]
  if (!classifierId) {
    console.error(`  ERROR missing classifier ID for pattern: ${data.slug}`)
    process.exit(1)
  }
  data.classifier_id = classifierId
  if (packageTags) {
    const tags = packageTags.patterns[data.slug]
    if (tags) data.package_tags = tags
  }

  // Deprecated patterns must never outrank an active replacement on shared
  // evidence: floor their compiled confidence to this catalog's lowest
  // canonical tier. Source YAML confidence/purview values are left
  // untouched (historical record of what the pattern originally claimed);
  // only the compiled patterns.json output is demoted.
  const DEPRECATED_CONFIDENCE_FLOOR = 'low'
  const DEPRECATED_TIER_FLOOR = 65
  if (data.status === 'deprecated') {
    data.confidence = DEPRECATED_CONFIDENCE_FLOOR
    if (typeof data.purview?.recommended_confidence === 'number') {
      data.purview.recommended_confidence = Math.min(data.purview.recommended_confidence, DEPRECATED_TIER_FLOOR)
    }
    if (Array.isArray(data.purview?.pattern_tiers)) {
      for (const tier of data.purview.pattern_tiers) {
        if (typeof tier.confidence_level === 'number') {
          tier.confidence_level = Math.min(tier.confidence_level, DEPRECATED_TIER_FLOOR)
        }
      }
    }
    // confidence_justification/operation prose describes the pre-floor tier
    // levels verbatim (e.g. "medium confidence (75)") and would otherwise
    // read as contradictory next to the floored confidence above. Append a
    // note rather than rewriting the prose, so the original justification/
    // mechanism description is preserved for audit purposes.
    const DEPRECATED_NOTE = `Compiled confidence is floored to '${DEPRECATED_CONFIDENCE_FLOOR}' because this pattern is deprecated (see deprecation_reason) — any confidence levels described above reflect the pre-deprecation source values, not the compiled output.`
    if (typeof data.confidence_justification === 'string') {
      data.confidence_justification = `${data.confidence_justification} ${DEPRECATED_NOTE}`
    }
    if (typeof data.operation === 'string') {
      data.operation = `${data.operation} ${DEPRECATED_NOTE}`
    }
  }

  // Resolve keyword_lists references in corroborative_evidence
  if (data.corroborative_evidence?.keyword_lists) {
    const resolved = []
    for (const ref of data.corroborative_evidence.keyword_lists) {
      const words = keywordMap.get(ref)
      if (words) {
        if (Array.isArray(words)) {
          resolved.push(...words)
        }
      } else {
        console.error(`  WARN: ${relative(DATA_DIR, file)} references unknown keyword list: ${ref}`)
        unresolvedKeywordRefs++
      }
    }
    // Merge with any inline keywords
    const inline = data.corroborative_evidence.keywords || []
    data.corroborative_evidence.keywords = [...new Set([...inline, ...resolved])]
    resolvedCount++
  }

  // Resolve purview.shared_keywords references
  if (data.purview?.shared_keywords) {
    if (!data.purview.keywords) data.purview.keywords = []
    for (const ref of data.purview.shared_keywords) {
      const terms = keywordMap.get(ref.dict)
      if (terms) {
        data.purview.keywords.push({
          id: ref.as,
          shared: true,
          dictSlug: ref.dict,
          groups: [{
            match_style: ref.match_style || 'word',
            // Terms are either plain strings or {text, case_sensitive} objects
            // (see data/keywords/*.yaml). Pass them through unchanged — do NOT
            // coerce with String(t), which stringifies objects to "[object Object]".
            terms: terms.slice()
          }]
        })
      } else {
        console.error(`  WARN: ${relative(DATA_DIR, file)} references unknown shared keyword dict: ${ref.dict}`)
        unresolvedKeywordRefs++
      }
    }
  }

  patterns.push(data)
}

if (packageTags) {
  const patternSlugs = new Set(patterns.map(pattern => pattern.slug))
  const missingTags = patterns.filter(pattern => !packageTags.patterns[pattern.slug]).map(pattern => pattern.slug)
  const extraTags = Object.keys(packageTags.patterns).filter(slug => !patternSlugs.has(slug))
  if (missingTags.length || extraTags.length) {
    for (const slug of missingTags.slice(0, 20)) console.error(`  ERROR missing package_tags for pattern: ${slug}`)
    if (missingTags.length > 20) console.error(`  ERROR ${missingTags.length - 20} additional pattern(s) missing package_tags`)
    for (const slug of extraTags.slice(0, 20)) console.error(`  ERROR package_tags references unknown pattern: ${slug}`)
    if (extraTags.length > 20) console.error(`  ERROR ${extraTags.length - 20} additional package_tags row(s) reference unknown patterns`)
    process.exit(1)
  }
}

// ── Load collections ──
const collectionFiles = walkDir(join(DATA_DIR, 'collections'))
const collections = []

for (const file of collectionFiles) {
  const raw = readFileSync(file, 'utf-8')
  const data = yaml.load(raw)
  if (validate(data, REQUIRED_COLLECTION_FIELDS, file)) {
    collections.push(data)
  }
}

// ── Load dictionary manifest (if present) ──
let dictionaryManifest = null
const manifestPath = join(DATA_DIR, 'dictionary-manifest.json')
if (existsSync(manifestPath)) {
  try { dictionaryManifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) } catch { /* skip */ }
}

// ── Load classification results (if present) ──
let classificationResults = null
const classResultsPath = join(DATA_DIR, 'classification-results.json')
if (existsSync(classResultsPath)) {
  try { classificationResults = JSON.parse(readFileSync(classResultsPath, 'utf-8')) } catch { /* skip */ }
}

const output = {
  version: '1.0.0',
  generated: new Date().toISOString(),
  patterns,
  collections,
  keywords: keywordDicts,
  packageTags: packageTags?.metadata ?? null,
  dictionaryManifest,
  classificationResults
}

// Compact JSON for Cloudflare KV (25 MiB value limit). Pretty-print would
// push the full catalog over the limit (~26 MB pretty vs ~17 MB compact).
writeFileSync(OUT_FILE, JSON.stringify(output))

console.log(`Done: ${patterns.length} patterns, ${collections.length} collections, ${keywordDicts.length} keyword dictionaries → patterns.json`)
if (resolvedCount > 0) {
  console.log(`  (${resolvedCount} patterns had keyword_lists references resolved)`)
}
if (unresolvedKeywordRefs > 0) {
  console.error(`Compile failed: ${unresolvedKeywordRefs} unresolved keyword_list reference(s).`)
  process.exit(1)
}

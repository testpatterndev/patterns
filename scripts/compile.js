import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative, resolve, isAbsolute, sep } from 'path'
import { fileURLToPath } from 'url'
import { parseArgs } from 'util'
import yaml from 'js-yaml'
import { resolveCustomisationFallbacks, TOKEN_LITERAL } from './lib/customisation.mjs'
import { loadIdentifiers } from './lib/identifiers.mjs'

const REPO_DIR = fileURLToPath(new URL('..', import.meta.url))
const DATA_DIR = join(REPO_DIR, 'data')

// --overlay <dir> --out <file> compiles a private catalogue. <dir> has the data/ layout
// (patterns/*.yaml, classifier-ids.json, package-tags.json) and lives outside this repo.
// The public data is loaded as usual, so overlay patterns can use the public keyword lists
// and dictionary manifest, but the output carries the overlay's patterns only, and it is
// never written into this checkout, so private classifiers cannot reach patterns.json.
const { values: cli } = parseArgs({ options: { overlay: { type: 'string' }, out: { type: 'string' } } })
const OVERLAY_DIR = cli.overlay ? resolve(cli.overlay) : null
let OUT_FILE = join(REPO_DIR, 'patterns.json')
if (OVERLAY_DIR) {
  if (!cli.out) throw new Error('--overlay needs --out <file> outside this repository')
  OUT_FILE = resolve(cli.out)
  const inRepo = relative(REPO_DIR, OUT_FILE)
  if (inRepo !== '..' && !inRepo.startsWith(`..${sep}`) && !isAbsolute(inRepo)) throw new Error(`--out must be outside this repository: ${OUT_FILE}`)
} else if (cli.out) {
  throw new Error('--out is only for --overlay builds')
}

const REQUIRED_PATTERN_FIELDS = ['schema', 'name', 'slug', 'type', 'confidence', 'jurisdictions', 'regulations', 'data_categories', 'test_cases']
const REQUIRED_COLLECTION_FIELDS = ['schema', 'name', 'slug', 'description', 'patterns']
const REQUIRED_KEYWORD_FIELDS = ['schema', 'name', 'slug', 'type', 'keywords']

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

function loadPackageTags(dataDir) {
  const file = join(dataDir, 'package-tags.json')
  if (!existsSync(file)) return null
  const data = JSON.parse(readFileSync(file, 'utf-8'))
  if (data.schema !== 'testpattern.package-tags.v1') {
    throw new Error(`Unsupported package tags schema '${data.schema}' in ${relative(DATA_DIR, file)}`)
  }
  if (!data.patterns || typeof data.patterns !== 'object' || Array.isArray(data.patterns)) {
    throw new Error(`${relative(DATA_DIR, file)} must contain a patterns object`)
  }
  const { patterns: packagePatterns, ...metadata } = data
  return {
    metadata,
    patterns: packagePatterns
  }
}

function loadClassifierIds(dataDir) {
  const file = join(dataDir, 'classifier-ids.json')
  if (!existsSync(file)) {
    throw new Error(`${relative(DATA_DIR, file)} is required; run npm run sync:classifier-ids`)
  }
  const data = JSON.parse(readFileSync(file, 'utf-8'))
  if (data.schema !== 'testpattern.classifier-ids.v1' || !data.patterns || typeof data.patterns !== 'object') {
    throw new Error(`Invalid classifier ID registry: ${relative(DATA_DIR, file)}`)
  }
  return data
}

console.log('Compiling patterns...')
const packageTags = loadPackageTags(DATA_DIR)
const classifierIds = loadClassifierIds(DATA_DIR)

// ── Load keyword dictionaries first (for reference resolution) ──
const keywordFiles = walkDir(join(DATA_DIR, 'keywords'))
const keywordDicts = []
const keywordMap = new Map() // slug → keywords array

for (const file of keywordFiles) {
  const raw = readFileSync(file, 'utf-8')
  const parsedDict = yaml.load(raw)
  if (validate(parsedDict, REQUIRED_KEYWORD_FIELDS, file)) {
    const resolvedDict = resolveCustomisationFallbacks(parsedDict, true)
    keywordDicts.push(resolvedDict)
    keywordMap.set(resolvedDict.slug, resolvedDict.keywords)
  }
}

// ── Load patterns (the public ones, then any overlay's) ──
const sources = [{ dir: DATA_DIR, ids: classifierIds, tags: packageTags, patterns: [] }]
if (OVERLAY_DIR) {
  const overlay = { dir: OVERLAY_DIR, ids: loadClassifierIds(OVERLAY_DIR), tags: loadPackageTags(OVERLAY_DIR), patterns: [] }
  // An overlay slug or classifier ID that is also public would collide in deployment GUIDs.
  const publicIds = new Set(Object.values(classifierIds.patterns))
  for (const [slug, id] of Object.entries(overlay.ids.patterns)) {
    if (slug in classifierIds.patterns) throw new Error(`Overlay slug is already public: ${slug}`)
    if (publicIds.has(id)) throw new Error(`Overlay classifier ID is already public: ${id} (${slug})`)
  }
  sources.push(overlay)
}
const patternFiles = sources.flatMap(source => walkDir(join(source.dir, 'patterns')).map(file => ({ file, source })))
let resolvedCount = 0
let unresolvedKeywordRefs = 0

for (const { file, source } of patternFiles) {
  const { ids: classifierIds, tags: packageTags } = source
  const raw = readFileSync(file, 'utf-8')
  let data = yaml.load(raw)
  data = resolveCustomisationFallbacks(data, false)

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

  source.patterns.push(data)
}

for (const { tags: packageTags, patterns } of sources) {
  if (!packageTags) continue
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
// An overlay build publishes the overlay's patterns only.
const patterns = sources.at(-1).patterns

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

// ── Load dictionary manifest ──
// The checked-in catalog is also consumed directly by deployment tooling. A
// catalog without this manifest still looks valid, but dictionary-backed
// exports then inline the same large dictionaries into every classifier.
// Treat the manifest as required source data instead of silently publishing a
// degraded catalog when the file is missing or malformed.
let dictionaryManifest
const manifestPath = join(DATA_DIR, 'dictionary-manifest.json')
if (!existsSync(manifestPath)) {
  throw new Error(`${relative(DATA_DIR, manifestPath)} is required; run npm run build-manifest`)
}
try {
  dictionaryManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
} catch (error) {
  throw new Error(`Invalid ${relative(DATA_DIR, manifestPath)}: ${error.message}`)
}
if (!Array.isArray(dictionaryManifest?.dictionaries) || dictionaryManifest.dictionaries.length === 0) {
  throw new Error(`${relative(DATA_DIR, manifestPath)} must contain a non-empty dictionaries array; run npm run build-manifest`)
}

// ── Load classification results (if present) ──
let classificationResults = null
const classResultsPath = join(DATA_DIR, 'classification-results.json')
if (existsSync(classResultsPath)) {
  try { classificationResults = JSON.parse(readFileSync(classResultsPath, 'utf-8')) } catch { /* skip */ }
}

// Deprecated classifiers stay in source YAML for audit, but are omitted from
// the compiled catalog so consumers do not process retired SITs and so the
// pretty-printed KV payload stays under Cloudflare's 25 MiB value limit.
const deprecatedCount = patterns.filter(p => p.status === 'deprecated').length
const publishedPatterns = patterns.filter(p => p.status !== 'deprecated')

// Deprecated slugs are still published as a compact `retired` map so consumers
// can answer old links: the website 301s to `replaced_by` or returns 410 Gone.
// replaced_by follows chains to the final live slug; null when there is none.
const liveSlugs = new Set(publishedPatterns.map(p => p.slug))
const deprecatedBySlug = new Map(patterns.filter(p => p.status === 'deprecated').map(p => [p.slug, p]))
function liveReplacement(slug) {
  const seen = new Set([slug])
  let next = deprecatedBySlug.get(slug)?.replaced_by
  while (next && deprecatedBySlug.has(next) && !seen.has(next)) {
    seen.add(next)
    next = deprecatedBySlug.get(next).replaced_by
  }
  return next && liveSlugs.has(next) ? next : null
}
const retired = Object.fromEntries([...deprecatedBySlug.keys()].sort().map(slug => {
  const p = deprecatedBySlug.get(slug)
  return [slug, {
    name: p.name,
    reason: String(p.deprecation_reason || '').replace(/\s+/g, ' ').trim(),
    replaced_by: liveReplacement(slug)
  }]
}))

const output = {
  version: '1.0.0',
  // SOURCE_DATE_EPOCH (seconds) pins the timestamp, so the same inputs compile byte-identical.
  generated: (process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000) : new Date()).toISOString(),
  patterns: publishedPatterns,
  retired,
  collections,
  keywords: keywordDicts,
  packageTags: packageTags?.metadata ?? null,
  dictionaryManifest,
  // Documented identifier types referenced by identifier-format customisation entries
  // (definition, public-format evidence, fallback and replacement steps) for deploy tooling.
  identifierTypes: Object.fromEntries([...loadIdentifiers(join(DATA_DIR, 'identifiers'))].map(([k, v]) => { const { __file, ...rest } = v; return [k, rest] })),
  classificationResults
}

// Pretty-print for readable diffs and safe downstream processing. Catalog
// size is controlled by excluding deprecated classifiers, not by minifying.
const outString = JSON.stringify(output, null, 2)
if (outString.includes(TOKEN_LITERAL)) {
  console.error('FATAL: unresolved {{CUSTOMISE:*}} token in compiled output — declaration/fallback mismatch upstream')
  process.exit(1)
}
writeFileSync(OUT_FILE, outString)

console.log(`Done: ${publishedPatterns.length} patterns (${deprecatedCount} deprecated excluded, ${Object.values(retired).filter(r => r.replaced_by).length} with a replacement), ${collections.length} collections, ${keywordDicts.length} keyword dictionaries → ${OUT_FILE}`)
if (resolvedCount > 0) {
  console.log(`  (${resolvedCount} patterns had keyword_lists references resolved)`)
}
if (unresolvedKeywordRefs > 0) {
  console.error(`Compile failed: ${unresolvedKeywordRefs} unresolved keyword_list reference(s).`)
  process.exit(1)
}

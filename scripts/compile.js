import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url))
const OUT_FILE = fileURLToPath(new URL('../patterns.json', import.meta.url))

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

console.log('Compiling patterns...')

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

for (const file of patternFiles) {
  const raw = readFileSync(file, 'utf-8')
  const data = yaml.load(raw)

  // keyword_dictionary patterns don't need a 'pattern' field
  const reqFields = data.type === 'keyword_dictionary' || data.type === 'keyword_list'
    ? REQUIRED_KEYWORD_FIELDS
    : REQUIRED_PATTERN_FIELDS

  if (!validate(data, reqFields, file)) continue

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
      }
    }
    // Merge with any inline keywords
    const inline = data.corroborative_evidence.keywords || []
    data.corroborative_evidence.keywords = [...new Set([...inline, ...resolved])]
    resolvedCount++
  }

  patterns.push(data)
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

const output = {
  version: '1.0.0',
  generated: new Date().toISOString(),
  patterns,
  collections,
  keywords: keywordDicts
}

writeFileSync(OUT_FILE, JSON.stringify(output, null, 2))

console.log(`Done: ${patterns.length} patterns, ${collections.length} collections, ${keywordDicts.length} keyword dictionaries → patterns.json`)
if (resolvedCount > 0) {
  console.log(`  (${resolvedCount} patterns had keyword_lists references resolved)`)
}

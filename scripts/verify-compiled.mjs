import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join } from 'path'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const data = JSON.parse(readFileSync(join(BASE, 'patterns.json'), 'utf-8'))

const catalogErrors = []
if (!Array.isArray(data.patterns) || data.patterns.length === 0) {
  catalogErrors.push('patterns.json must contain a non-empty patterns array')
}
if (!Array.isArray(data.dictionaryManifest?.dictionaries) || data.dictionaryManifest.dictionaries.length === 0) {
  catalogErrors.push('patterns.json must contain dictionaryManifest.dictionaries; do not replace it with the stripped public /patterns.json response')
}

let patternsWithShared = 0
let patternsWithDictSlug = 0
let missingShared = []
let missingDictSlug = []

for (const p of data.patterns) {
  if (!p.purview) continue
  const sharedKws = (p.purview.keywords || []).filter(k => k.shared)
  if (sharedKws.length > 0) patternsWithShared++
  else missingShared.push(p.slug)

  for (const kw of sharedKws) {
    if (kw.dictSlug) patternsWithDictSlug++
    else missingDictSlug.push(`${p.slug}: ${kw.id}`)
  }
}

console.log(`\n=== COMPILED OUTPUT ===`)
console.log(`Patterns with shared=true keywords: ${patternsWithShared}`)
console.log(`Missing shared keywords in compiled: ${missingShared.length}`)
if (missingShared.length > 0) for (const s of missingShared.slice(0, 20)) console.log(`  ${s}`)
console.log(`Keywords with dictSlug: ${patternsWithDictSlug}`)
console.log(`Keywords missing dictSlug: ${missingDictSlug.length}`)
if (missingDictSlug.length > 0) for (const s of missingDictSlug.slice(0, 20)) console.log(`  ${s}`)

if (catalogErrors.length > 0) {
  for (const error of catalogErrors) console.error(`ERROR: ${error}`)
  process.exit(1)
}

console.log(`Dictionary manifest entries: ${data.dictionaryManifest.dictionaries.length}`)
console.log('COMPILED CATALOG: PASS')

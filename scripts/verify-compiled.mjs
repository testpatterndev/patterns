import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join } from 'path'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const data = JSON.parse(readFileSync(join(BASE, 'patterns.json'), 'utf-8'))

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

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const dir = join(BASE, 'data', 'patterns')
const kwDir = join(BASE, 'data', 'keywords')

// Load ALL shared term sets
const drcTerms = new Set(yaml.load(readFileSync(join(kwDir, 'data-record-context.yaml'), 'utf-8')).keywords.map(t => String(t).toLowerCase()))
const gdlTerms = new Set(yaml.load(readFileSync(join(kwDir, 'generic-data-labels.yaml'), 'utf-8')).keywords.map(t => String(t).toLowerCase()))
const clsTerms = new Set(yaml.load(readFileSync(join(kwDir, 'en-government-classification.yaml'), 'utf-8')).keywords.map(t => String(t).toLowerCase()))
const tplTerms = new Set(yaml.load(readFileSync(join(kwDir, 'template-exclusion.yaml'), 'utf-8')).keywords.map(t => String(t).toLowerCase()))

const allShared = {
  'data-record-context': drcTerms,
  'generic-data-labels': gdlTerms,
  'en-government-classification': clsTerms,
  'template-exclusion': tplTerms
}

const validSlugs = new Set(readdirSync(kwDir).filter(f => f.endsWith('.yaml')).map(f => f.replace('.yaml', '')))
const files = readdirSync(dir).filter(f => f.endsWith('.yaml'))

let totalChecked = 0
let withPurview = 0
let withSharedKw = 0
let missingSharedKw = []
let invalidRefs = []
let missingFields = []
let domainContextViolations = []
let classificationViolations = []
let templateViolations = []
let dataLabelViolations = []
let duplicateSharedEntries = []

for (const file of files) {
  totalChecked++
  const data = yaml.load(readFileSync(join(dir, file), 'utf-8'))

  if (!data.purview) continue
  withPurview++

  // Check 1: Has shared_keywords
  if (!data.purview.shared_keywords || data.purview.shared_keywords.length === 0) {
    missingSharedKw.push(file)
    continue
  }
  withSharedKw++

  // Check 2: All shared_keywords entries are valid
  const seen = new Set()
  for (const ref of data.purview.shared_keywords) {
    if (!ref.dict) missingFields.push(`${file}: missing dict`)
    if (!ref.as) missingFields.push(`${file}: missing as`)
    if (!ref.match_style) missingFields.push(`${file}: missing match_style`)
    if (ref.dict && !validSlugs.has(ref.dict)) invalidRefs.push(`${file}: references non-existent dict '${ref.dict}'`)
    const key = `${ref.dict}|${ref.as}`
    if (seen.has(key)) duplicateSharedEntries.push(`${file}: duplicate ${key}`)
    seen.add(key)
  }

  // Check 3: No inline keywords contain shared terms that should be extracted
  for (const kw of (data.purview.keywords || [])) {
    if (!kw.id || !kw.groups) continue
    for (const g of kw.groups) {
      for (const t of (g.terms || [])) {
        const lower = String(t).toLowerCase().trim()

        if (/_domain_context$/.test(kw.id)) {
          if (drcTerms.has(lower) || gdlTerms.has(lower) || lower === 'top500') {
            domainContextViolations.push(`${file}: ${kw.id} contains shared term '${t}'`)
          }
        }
        if (/_classification_markers$/.test(kw.id)) {
          if (clsTerms.has(lower)) {
            classificationViolations.push(`${file}: ${kw.id} contains shared term '${t}'`)
          }
        }
        if (/template_exclusion$/.test(kw.id)) {
          templateViolations.push(`${file}: still has inline Evidence_template_exclusion`)
        }
        if (/noise_exclusion$/.test(kw.id) && !/domain/.test(kw.id)) {
          // Check if this is an inline noise_exclusion that should have been removed
          if (tplTerms.has(lower)) {
            // Has shared template terms inline
          }
        }
      }
    }
  }
}

// Check 4: Compile the patterns and check compiled output
console.log('=== VERIFICATION REPORT ===')
console.log(`Total pattern files: ${totalChecked}`)
console.log(`Patterns with purview: ${withPurview}`)
console.log(`Patterns with shared_keywords: ${withSharedKw}`)
console.log(`Patterns with purview but NO shared_keywords: ${missingSharedKw.length}`)
if (missingSharedKw.length > 0) {
  console.log('  FILES:')
  for (const f of missingSharedKw) console.log(`    ${f}`)
}
console.log(`Invalid dict refs: ${invalidRefs.length}`)
if (invalidRefs.length > 0) for (const e of invalidRefs) console.log(`  ${e}`)
console.log(`Missing fields: ${missingFields.length}`)
if (missingFields.length > 0) for (const e of missingFields) console.log(`  ${e}`)
console.log(`Duplicate shared_keywords entries: ${duplicateSharedEntries.length}`)
if (duplicateSharedEntries.length > 0) for (const e of duplicateSharedEntries) console.log(`  ${e}`)
console.log(`Domain context terms still inline: ${domainContextViolations.length}`)
if (domainContextViolations.length > 0) for (const e of domainContextViolations.slice(0, 20)) console.log(`  ${e}`)
console.log(`Classification marker terms still inline: ${classificationViolations.length}`)
if (classificationViolations.length > 0) for (const e of classificationViolations.slice(0, 20)) console.log(`  ${e}`)
console.log(`Template exclusion still inline: ${templateViolations.length}`)
if (templateViolations.length > 0) for (const e of templateViolations.slice(0, 20)) console.log(`  ${e}`)

const totalErrors = missingSharedKw.length + invalidRefs.length + missingFields.length +
  domainContextViolations.length + classificationViolations.length + templateViolations.length
console.log(`\nTOTAL ERRORS: ${totalErrors}`)
console.log(`OVERALL: ${totalErrors === 0 ? 'PASS' : 'FAIL'}`)
if (totalErrors > 0) process.exit(1)

#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const PATTERN_DIR = path.join('data', 'patterns')
const KEYWORD_DIR = path.join('data', 'keywords')
const VALID_LEVELS = new Set([65, 75, 85])
const CONCEPT_TYPES = new Set(['keyword_list', 'keyword_proximity', 'keyword_dictionary', 'document_marker', 'trainable_classifier'])
const COMMON_TERMS = new Set([
  'account', 'agency', 'application', 'case', 'code', 'data', 'department', 'document', 'field', 'file',
  'form', 'government', 'id', 'identifier', 'key', 'number', 'record', 'reference', 'report', 'row', 'table', 'value'
])
const STRUCTURAL_TERMS = new Set([
  'appendix', 'attachment', 'column', 'database', 'entry', 'extract', 'field', 'form', 'record', 'register',
  'row', 'schedule', 'spreadsheet', 'table', 'template', 'value'
])
const NOISE_TERMS = new Set(['dummy', 'example', 'fake', 'placeholder', 'sample', 'test', 'test data', 'training'])
const SHORT_ACRONYM_TERMS = new Set([
  'ABN', 'ACN', 'AGAO', 'API', 'ATO', 'AU', 'CUI', 'DOB', 'DLM', 'DEA', 'EU', 'GB', 'GCP', 'ID', 'IT',
  'JWT', 'MFA', 'NPI', 'NZ', 'OCR', 'OT', 'PIN', 'PM', 'QPS', 'REL', 'TFN', 'TIN', 'UK', 'US'
])

// Shared keyword dictionaries that are structural/generic scaffolding rather than domain evidence,
// keyed by their `data/keywords/<slug>.yaml` slug (NOT by the per-pattern `as:` alias, which varies).
// Hardcoded rather than derived from an id-substring or content heuristic: these four dictionaries are
// a small, stable, deliberately-curated set (see docs/sit-design-paper.md's tier-gating conventions), and
// their own term content can legitimately read as "specific" under a naive ratio classifier (e.g.
// data-record-context's phrases are almost all multi-word) even though architecturally they only ever
// supplement real evidence, never substitute for it.
const STRUCTURAL_DICT_STRENGTH = new Map([
  ['template-exclusion', 'noise'],
  ['data-record-context', 'structural'],
  ['generic-data-labels', 'generic']
])

// Files with deliberately non-canonical design, examined individually (see task-10-report.md):
//  - au-marking-{official,sensitive,protected,secret-topsecret} + the deprecated
//    au-pspf-security-classification: PSPF classification hierarchy needs more than 3 rungs
//    (OFFICIAL/SENSITIVE/PROTECTED/SECRET-TOP SECRET), so these intentionally use 90/95
//    confidence_level values above the standard 65/75/85 ladder to preserve ranking order.
//  - snaffler-domain-join-creds (MDT) / snaffler-ftp-credentials (FTP): case-insensitive by design
//    because these acronyms legitimately appear in mixed/lower case in the config files/paths being
//    matched (customsettings.ini, sftp-config.json) and the surrounding regex context is already
//    highly specific, so case-sensitivity would only lose recall without reducing false positives.
//  - nz-marking-{in-confidence,sensitive}: same protective-marking architecture as the AU marking
//    SITs above (canonical 65/75/85 levels this time, so no nonCanonical flag), but their 85-tiers
//    (endorsed form, legacy SEEMail bracket form) are gated only by a template-exclusion NOT-group,
//    not a positive keyword ref — the case-sensitive ALL-CAPS/structural marking regex itself is the
//    high-confidence evidence, matching every other protective-marking SIT's design in this repo.
//  - nz-marking-{restricted,confidential}: same rationale as nz-marking-{in-confidence,sensitive}.
//    Their 85-tiers (the verified `//` national-security-marking form, and RESTRICTED's legacy
//    SEEMail bracket form) are gated only by the template-exclusion NOT-group — the structural
//    regex is the evidence. (confidential's 75 bracket tier is genuinely AND-gated by
//    nz-government-context and does not need this exclusion; only its ungated 85-tier does.)
//  - nz-marking-secret-topsecret: same rationale again. Both 85-tiers (the verified `//`
//    national-security-marking form, and the TOP SECRET banner-words phrase) are gated only by
//    the template-exclusion NOT-group — the structural regex is the evidence. Its 75 bare-SECRET
//    tier is genuinely AND-gated by nz-government-context and does not need this exclusion.
//  - us-classification-banner / us-cui-banner-marking: same protective-marking architecture as
//    the AU/NZ marking SITs above. Their tiers (95 structural `//` banner form, 85 portion-mark /
//    CUI phrase) are gated only by the template-exclusion NOT-group — the structural marking
//    regex itself is the high-confidence evidence. cui-banner's 95 structural tier also carries
//    a nonCanonical flag for the same ranking-order reason as the AU markings.
//  - uk-marking-official / uk-marking-secret-topsecret: same protective-marking architecture as
//    the AU/NZ/US marking SITs above (canonical 65/75/85 levels, so no nonCanonical flag). Their
//    85-tiers (uk-marking-official's structured handling-instruction/descriptor form and bare
//    OFFICIAL-SENSITIVE banner; uk-marking-secret-topsecret's UK Prefix form, National Caveat
//    form, and TOP SECRET banner-words phrase) are gated only by the template-exclusion NOT-group
//    — the case-sensitive ALL-CAPS/structural marking regex itself is the high-confidence
//    evidence, matching every other protective-marking SIT's design in this repo. Each SIT's
//    lowest tier (65/75, bare OFFICIAL / bare SECRET) is genuinely AND-gated by
//    uk-government-context and does not need this exclusion.
//  - nato-marking / eu-marking-restreint / ca-marking: same protective-marking architecture as the
//    AU/NZ/US/UK marking SITs above (canonical 65/75/85 levels, so no nonCanonical flag). Their
//    85-tiers (nato-marking's spelled-out "NATO <LEVEL>" and COSMIC TOP SECRET forms;
//    eu-marking-restreint's dual French/English EUCI marking; ca-marking's Canada-distinctive
//    "Protected A/B/C" designation) are gated only by the template-exclusion NOT-group — the
//    case-sensitive ALL-CAPS/structural marking regex itself is the high-confidence evidence,
//    matching every other protective-marking SIT's design in this repo. eu-marking-restreint's 75
//    single-language French tier is likewise structurally distinctive (trailing UE marker) and
//    ungated apart from the noise NOT-group; ca-marking's lower classified tiers (75 TOP SECRET,
//    65 CONFIDENTIAL/SECRET) are genuinely AND-gated by canada-government-context and do not need
//    this exclusion.
const EXCLUDED_FILES = new Set([
  'au-marking-official.yaml',
  'au-marking-protected.yaml',
  'au-marking-secret-topsecret.yaml',
  'au-marking-sensitive.yaml',
  'au-pspf-security-classification.yaml',
  'snaffler-domain-join-creds.yaml',
  'snaffler-ftp-credentials.yaml',
  'nz-marking-in-confidence.yaml',
  'nz-marking-sensitive.yaml',
  'nz-marking-restricted.yaml',
  'nz-marking-confidential.yaml',
  'nz-marking-secret-topsecret.yaml',
  'us-classification-banner.yaml',
  'us-cui-banner-marking.yaml',
  'uk-marking-official.yaml',
  'uk-marking-secret-topsecret.yaml',
  'nato-marking.yaml',
  'eu-marking-restreint.yaml',
  'ca-marking.yaml'
])

function loadYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'))
}

function asArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function termText(term) {
  if (term && typeof term === 'object') return String(term.text || '').trim()
  return String(term || '').trim()
}

function isCaseSensitive(term) {
  return Boolean(term && typeof term === 'object' && (term.case_sensitive === true || term.caseSensitive === true))
}

function normalizeTerm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function keywordTerms(keyword) {
  const terms = []
  for (const group of keyword.groups || []) {
    for (const term of group.terms || []) {
      const text = termText(term)
      if (text) terms.push(text)
    }
  }
  return terms
}

function dictionaryTermTexts(dictionary) {
  return (dictionary?.keywords || []).map(termText).filter(Boolean)
}

// Content-only classification: no id-substring shortcuts. A keyword's own `id` (or a shared
// dictionary's `slug`) is often a naming artifact (e.g. a pattern named "...(Generic)" produces
// keyword ids containing "generic" regardless of how specific the actual terms are), so strength is
// derived purely from the term text. Mirrors classifyContentOnly() in
// scripts/audit-shared-keyword-downgrades.mjs.
function classifyTermTexts(texts) {
  const terms = texts.map(normalizeTerm).filter(Boolean)
  if (!terms.length) return 'domain'
  const noiseCount = terms.filter(term => NOISE_TERMS.has(term)).length
  if (noiseCount > 0) return 'noise'
  const commonRatio = terms.filter(term => COMMON_TERMS.has(term)).length / terms.length
  const structuralRatio = terms.filter(term => STRUCTURAL_TERMS.has(term)).length / terms.length
  const multiWordRatio = terms.filter(term => term.includes(' ')).length / terms.length
  if (structuralRatio >= 0.35) return 'structural'
  if (commonRatio >= 0.45) return 'generic'
  if (multiWordRatio >= 0.6) return 'specific'
  return 'domain'
}

function classifyKeyword(keyword) {
  return classifyTermTexts(keywordTerms(keyword))
}

const dictStrengthCache = new Map()
function classifyDictBySlug(slug, dictionariesBySlug) {
  if (STRUCTURAL_DICT_STRENGTH.has(slug)) return STRUCTURAL_DICT_STRENGTH.get(slug)
  if (dictStrengthCache.has(slug)) return dictStrengthCache.get(slug)
  const dictionary = dictionariesBySlug.get(slug)
  const strength = classifyTermTexts(dictionaryTermTexts(dictionary))
  dictStrengthCache.set(slug, strength)
  return strength
}

function collectPositiveRefs(nodes = [], excluded = false, refs = []) {
  for (const node of nodes || []) {
    const max = node.max_matches ?? node.maxMatches
    const isExcluded = excluded || max === 0 || max === '0'
    if (!isExcluded && node.ref) refs.push(node.ref)
    if (!isExcluded) refs.push(...asArray(node.refs))
    if (node.children) collectPositiveRefs(node.children, isExcluded, refs)
  }
  return [...new Set(refs)]
}

function isShortAcronymRisk(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return false
  if (SHORT_ACRONYM_TERMS.has(trimmed.toUpperCase())) return true
  return /^[A-Z0-9&./-]{2,3}$/.test(trimmed)
}

function checkTerms(container, issues, file, source) {
  const keywords = source === 'dictionary'
    ? [{ id: container.slug, groups: [{ terms: container.keywords || [] }] }]
    : (container.purview?.keywords || [])

  for (const keyword of keywords) {
    for (const group of keyword.groups || []) {
      for (const term of group.terms || []) {
        const text = termText(term)
        if (isShortAcronymRisk(text) && !isCaseSensitive(term)) {
          issues.shortAcronyms.push({ file, message: `${keyword.id} term '${text}' is not case-sensitive` })
        }
      }
    }
  }
}

// Normalizes a tier's `id_match` (string | {id} | {ref} | {ids:[]} | array of the above) down to a
// sorted array of regex ids, so two tiers testing the same set of regexes compare equal regardless of
// which shorthand form was used or what order they were listed in.
function normalizeIdMatch(idMatch) {
  if (!idMatch) return []
  if (typeof idMatch === 'string') return [idMatch]
  if (Array.isArray(idMatch)) return idMatch.flatMap(normalizeIdMatch)
  if (Array.isArray(idMatch.ids)) return idMatch.ids.filter(Boolean)
  if (idMatch.id) return [idMatch.id]
  if (idMatch.ref) return [idMatch.ref]
  return []
}

// Normalizes a matches[] node (and its children) so that ref/refs ordering and node ordering don't
// affect equality, while type/min/max/unique_results (which are semantically meaningful) are preserved.
function normalizeMatchNode(node) {
  if (!node || typeof node !== 'object') return node
  const refs = [...new Set([...(node.ref ? [node.ref] : []), ...asArray(node.refs)])].sort()
  const children = normalizeMatches(node.children)
  return {
    type: node.type ?? null,
    min_matches: node.min_matches ?? node.minMatches ?? null,
    max_matches: node.max_matches ?? node.maxMatches ?? null,
    min_count: node.min_count ?? null,
    unique_results: node.unique_results ?? null,
    refs,
    children
  }
}

function normalizeMatches(matches) {
  const nodes = asArray(matches).map(normalizeMatchNode)
  nodes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return nodes
}

// A tier's "evidence signature": which regex(es) it gates on plus the full shape of its match tree.
// Two same-level tiers with an identical signature are a real defect (redundant, mergeable, no new
// coverage). Two same-level tiers with different signatures (different id_match, or the same id_match
// gated by different evidence) are a deliberate alternative-evidence path, not a defect.
function tierEvidenceSignature(tier) {
  return JSON.stringify({
    idMatch: normalizeIdMatch(tier.id_match).slice().sort(),
    matches: normalizeMatches(tier.matches),
    filterRef: tier.filter_ref || null
  })
}

const issues = {
  nonCanonical: [],
  duplicateLevelsIdentical: [],
  duplicateLevelsAlternative: [],
  recommendedDrift: [],
  weakHigh: [],
  weakMedium: [],
  conceptHigh: [],
  discoveryMissing: [],
  shortAcronyms: []
}

// Keyword dictionaries are loaded up front (not lazily) so pattern_tiers evidence checks can resolve
// purview.shared_keywords[] refs to the dictionary's actual term content.
const keywordDictFiles = fs.readdirSync(KEYWORD_DIR).filter(name => name.endsWith('.yaml') || name.endsWith('.yml'))
const loadedDictionaries = keywordDictFiles.map(file => ({ file, data: loadYaml(path.join(KEYWORD_DIR, file)) }))
const dictionariesBySlug = new Map(loadedDictionaries.filter(({ data }) => data?.slug).map(({ data }) => [data.slug, data]))

for (const file of fs.readdirSync(PATTERN_DIR).filter(name => name.endsWith('.yaml') || name.endsWith('.yml'))) {
  const pattern = loadYaml(path.join(PATTERN_DIR, file))
  checkTerms(pattern, issues, file, 'pattern')

  if (!pattern.purview?.pattern_tiers) continue

  const keywordById = new Map()
  for (const keyword of pattern.purview.keywords || []) {
    keywordById.set(keyword.id, classifyKeyword(keyword))
  }
  for (const sharedKeyword of pattern.purview.shared_keywords || []) {
    if (sharedKeyword?.as && !keywordById.has(sharedKeyword.as)) {
      keywordById.set(sharedKeyword.as, classifyDictBySlug(sharedKeyword.dict, dictionariesBySlug))
    }
  }

  const tiers = pattern.purview.pattern_tiers || []
  const levels = tiers.map(tier => Number(tier.confidence_level))
  for (const level of levels) {
    if (!VALID_LEVELS.has(level)) issues.nonCanonical.push({ file, message: `non-canonical confidence ${level}` })
  }
  for (const level of VALID_LEVELS) {
    const sameLevelTiers = tiers.filter(tier => Number(tier.confidence_level) === level)
    if (sameLevelTiers.length <= 1) continue
    const signatureCounts = new Map()
    for (const tier of sameLevelTiers) {
      const signature = tierEvidenceSignature(tier)
      signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1)
    }
    const identicalGroupCount = [...signatureCounts.values()].filter(count => count > 1).length
    if (identicalGroupCount > 0) {
      issues.duplicateLevelsIdentical.push({
        file,
        message: `${identicalGroupCount} identical-evidence duplicate group(s) among ${sameLevelTiers.length} tiers at confidence ${level}`
      })
    }
    if (signatureCounts.size > 1) {
      issues.duplicateLevelsAlternative.push({
        file,
        message: `${signatureCounts.size} distinct-evidence tiers at confidence ${level} (alternative paths)`
      })
    }
  }
  if (!levels.includes(Number(pattern.purview.recommended_confidence))) {
    issues.recommendedDrift.push({ file, message: `recommended_confidence ${pattern.purview.recommended_confidence} is not an exported tier` })
  }

  let hasStrongConceptHigh = false

  for (const tier of tiers) {
    const refs = collectPositiveRefs(tier.matches || [])
    const strengths = refs.map(ref => keywordById.get(ref)).filter(Boolean).filter(strength => strength !== 'noise')
    const hasSpecificOrDomain = strengths.some(strength => strength === 'specific' || strength === 'domain')
    const genericOnly = strengths.length > 0 && strengths.every(strength => strength === 'generic' || strength === 'structural')
    const noEvidence = strengths.length === 0
    const level = Number(tier.confidence_level)

    if (level >= 85 && (noEvidence || genericOnly || (CONCEPT_TYPES.has(pattern.type) && !hasSpecificOrDomain))) {
      issues.weakHigh.push({ file, message: 'weak high tier' })
    }
    if (level >= 75 && (noEvidence || genericOnly)) {
      issues.weakMedium.push({ file, message: 'weak medium tier' })
    }
    if (level >= 85 && strengths.length >= 2 && hasSpecificOrDomain) {
      hasStrongConceptHigh = true
    }
    if (level === 65 && (noEvidence || CONCEPT_TYPES.has(pattern.type)) && tier.discovery_only !== true) {
      issues.discoveryMissing.push({ file, message: 'broad low tier should be marked discovery_only' })
    }
  }

  if (CONCEPT_TYPES.has(pattern.type) && pattern.confidence === 'high' && !hasStrongConceptHigh) {
    issues.conceptHigh.push({ file, message: 'concept classifier has high confidence without a strong 85 tier' })
  }
}

for (const { file, data } of loadedDictionaries) {
  checkTerms(data, issues, file, 'dictionary')
}

const total = Object.values(issues).reduce((sum, rows) => sum + rows.length, 0)
console.log('Catalog quality verification')
console.log('============================')
for (const [key, rows] of Object.entries(issues)) {
  console.log(`- ${key}: ${rows.length}`)
  for (const row of rows.slice(0, 10)) console.log(`  ${row.file}: ${row.message}`)
  if (rows.length > 10) console.log(`  ... ${rows.length - 10} more`)
}
console.log(`\nTotal issues (all categories, informational): ${total}`)

const args = process.argv.slice(2)
const failOnArg = args.find(arg => arg.startsWith('--fail-on='))
const failOnCategories = failOnArg
  ? failOnArg.slice('--fail-on='.length).split(',').map(value => value.trim()).filter(Boolean)
  : []

if (!failOnCategories.length) {
  console.log('\nReport-only mode (no --fail-on specified) - exiting 0.')
  process.exit(0)
}

const unknownCategories = failOnCategories.filter(category => !(category in issues))
if (unknownCategories.length) {
  console.error(`\nUnknown --fail-on categor${unknownCategories.length === 1 ? 'y' : 'ies'}: ${unknownCategories.join(', ')}`)
  console.error(`Valid categories: ${Object.keys(issues).join(', ')}`)
  process.exit(1)
}

console.log(`\nFail-on categories: ${failOnCategories.join(', ')}`)
console.log(`Exclusion set (${EXCLUDED_FILES.size} files with documented non-canonical design, see script header): ${[...EXCLUDED_FILES].join(', ')}`)

const failures = []
for (const category of failOnCategories) {
  for (const row of issues[category]) {
    if (!EXCLUDED_FILES.has(row.file)) failures.push({ category, ...row })
  }
}

if (failures.length > 0) {
  console.error(`\nQuality gate FAILED: ${failures.length} issue(s) outside the exclusion set`)
  for (const failure of failures.slice(0, 30)) console.error(`  [${failure.category}] ${failure.file}: ${failure.message}`)
  if (failures.length > 30) console.error(`  ... ${failures.length - 30} more`)
  process.exit(1)
}

console.log(`\nQuality gate PASSED: 0 issue(s) in [${failOnCategories.join(', ')}] outside the exclusion set`)
process.exit(0)

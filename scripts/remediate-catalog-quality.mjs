#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const PATTERN_DIR = path.join('data', 'patterns')
const KEYWORD_DIR = path.join('data', 'keywords')
const TODAY = '2026-07-04'
const args = process.argv.slice(2)
const write = args.includes('--write')
const slugArg = args.find(arg => arg.startsWith('--slug='))?.slice('--slug='.length)

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

function loadYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'))
}

function dumpYaml(data) {
  return yaml.dump(data, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: "'"
  })
}

function canonicalLevel(value) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    if (numeric >= 85) return 85
    if (numeric >= 75) return 75
    return 65
  }
  const label = String(value || '').toLowerCase()
  if (label === 'high') return 85
  if (label === 'medium') return 75
  return 65
}

function confidenceLabel(level) {
  if (level >= 85) return 'high'
  if (level >= 75) return 'medium'
  return 'low'
}

function termText(term) {
  if (term && typeof term === 'object') return String(term.text || '').trim()
  return String(term || '').trim()
}

function normalizeTerm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function classifyKeyword(keyword) {
  const id = String(keyword.id || '').toLowerCase()
  const terms = keywordTerms(keyword).map(normalizeTerm).filter(Boolean)
  const commonCount = terms.filter(term => COMMON_TERMS.has(term)).length
  const structuralCount = terms.filter(term => STRUCTURAL_TERMS.has(term)).length
  const noiseCount = terms.filter(term => NOISE_TERMS.has(term)).length
  const multiWordCount = terms.filter(term => term.includes(' ')).length
  const commonRatio = terms.length ? commonCount / terms.length : 0
  const structuralRatio = terms.length ? structuralCount / terms.length : 0
  const multiWordRatio = terms.length ? multiWordCount / terms.length : 0

  if (/noise|exclusion|template|filter/.test(id) || noiseCount > 0) return 'noise'
  if (/data_record|structural/.test(id) || structuralRatio >= 0.35) return 'structural'
  if (/generic_data|generic|label/.test(id) || commonRatio >= 0.45) return 'generic'
  if (multiWordRatio >= 0.6) return 'specific'
  return 'domain'
}

function normalizeIdMatch(idMatch) {
  if (!idMatch) return []
  if (typeof idMatch === 'string') return [idMatch]
  if (Array.isArray(idMatch)) return idMatch.flatMap(normalizeIdMatch)
  if (Array.isArray(idMatch.ids)) return idMatch.ids.filter(Boolean)
  if (idMatch.id) return [idMatch.id]
  if (idMatch.ref) return [idMatch.ref]
  return []
}

function normalizedIdMatchFor(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length <= 1) return unique[0] || ''
  return { type: 'any', ids: unique }
}

function collectRefs(nodes = [], excluded = false, out = { positive: [], negative: [] }) {
  for (const node of nodes || []) {
    if (!node) continue
    const max = node.max_matches ?? node.maxMatches
    const isExcluded = excluded || max === 0 || max === '0'
    if (node.ref) {
      out[isExcluded ? 'negative' : 'positive'].push(node.ref)
    }
    for (const ref of node.refs || []) {
      out[isExcluded ? 'negative' : 'positive'].push(ref)
    }
    if (node.children) collectRefs(node.children, isExcluded, out)
  }
  out.positive = [...new Set(out.positive)]
  out.negative = [...new Set(out.negative)]
  return out
}

function tierScore(tier, keywordById) {
  const refs = collectRefs(tier.matches || [])
  let score = refs.positive.length * 10 + refs.negative.length * 3
  for (const ref of refs.positive) {
    const strength = keywordById.get(ref)?.strength
    if (strength === 'specific') score += 10
    else if (strength === 'domain') score += 7
    else if (strength === 'structural') score += 3
    else if (strength === 'generic') score += 1
    else if (strength === 'noise') score -= 5
  }
  for (const node of tier.matches || []) {
    if (Number(node.min_count || 1) > 1) score += Number(node.min_count)
    if (node.unique_results) score += 2
  }
  return score
}

function compactTierShape(tier) {
  return JSON.stringify({
    matches: tier.matches || [],
    filter_ref: tier.filter_ref || null
  })
}

function mergeDuplicateTiers(tiers, keywordById, notes) {
  const groups = new Map()
  for (const tier of tiers) {
    const level = tier.confidence_level
    if (!groups.has(level)) groups.set(level, [])
    groups.get(level).push(tier)
  }

  const merged = []
  for (const level of [85, 75, 65]) {
    const group = groups.get(level) || []
    if (group.length === 0) continue
    if (group.length === 1) {
      merged.push(group[0])
      continue
    }

    const byShape = new Map()
    for (const tier of group) {
      const shape = compactTierShape(tier)
      if (!byShape.has(shape)) byShape.set(shape, [])
      byShape.get(shape).push(tier)
    }

    const candidates = []
    for (const shapeGroup of byShape.values()) {
      const base = structuredClone(shapeGroup[0])
      base.id_match = normalizedIdMatchFor(shapeGroup.flatMap(tier => normalizeIdMatch(tier.id_match)))
      candidates.push(base)
    }

    candidates.sort((a, b) => tierScore(b, keywordById) - tierScore(a, keywordById))
    const selected = candidates[0]
    notes.push(`Collapsed ${group.length} duplicate ${level}-confidence tier(s) into the strictest canonical tier.`)
    merged.push(selected)
  }

  return merged
}

function tierWeakness(tier, keywordById, isConcept) {
  const refs = collectRefs(tier.matches || [])
  const positive = refs.positive
    .map(ref => keywordById.get(ref))
    .filter(Boolean)
    .filter(item => item.strength !== 'noise')
  const strengths = new Set(positive.map(item => item.strength))
  const hasSpecificOrDomain = strengths.has('specific') || strengths.has('domain')
  const genericOnly = positive.length > 0 && [...strengths].every(strength => strength === 'generic' || strength === 'structural')
  const noEvidence = positive.length === 0
  return {
    noEvidence,
    genericOnly,
    hasSpecificOrDomain,
    weakHigh: tier.confidence_level >= 85 && (noEvidence || genericOnly || (!hasSpecificOrDomain && isConcept)),
    weakMedium: tier.confidence_level >= 75 && (noEvidence || genericOnly)
  }
}

function remediateTiers(pattern, notes) {
  if (!pattern.purview?.pattern_tiers) return false

  const isConcept = CONCEPT_TYPES.has(pattern.type)
  const keywordById = new Map()
  for (const keyword of pattern.purview.keywords || []) {
    const strength = keyword.strength || classifyKeyword(keyword)
    keyword.strength = strength
    keywordById.set(keyword.id, { keyword, strength })
  }

  let changed = false
  const tiers = []
  for (const sourceTier of pattern.purview.pattern_tiers || []) {
    const tier = structuredClone(sourceTier)
    const sourceLevel = Number(tier.confidence_level ?? tier.confidence ?? pattern.purview.recommended_confidence ?? 65)
    tier.confidence_level = canonicalLevel(sourceLevel)
    delete tier.confidence

    if (tier.confidence_level !== sourceLevel) {
      changed = true
      notes.push(`Mapped non-canonical confidence ${sourceLevel} to ${tier.confidence_level}.`)
    }

    const weakness = tierWeakness(tier, keywordById, isConcept)
    if (weakness.weakHigh) {
      tier.confidence_level = weakness.noEvidence || weakness.genericOnly ? 65 : 75
      changed = true
      notes.push(`Downgraded weak high-confidence tier to ${tier.confidence_level} because independent specific/domain evidence was insufficient.`)
    }
    if (tier.confidence_level >= 75 && weakness.weakMedium) {
      tier.confidence_level = 65
      changed = true
      notes.push('Downgraded weak medium-confidence tier to low because evidence was generic, structural, or absent.')
    }

    if (tier.confidence_level === 65 && (weakness.noEvidence || isConcept)) {
      tier.discovery_only = true
      changed = true
    }

    tiers.push(tier)
  }

  const merged = mergeDuplicateTiers(tiers, keywordById, notes)
  if (JSON.stringify(merged) !== JSON.stringify(pattern.purview.pattern_tiers)) changed = true
  pattern.purview.pattern_tiers = merged

  const levels = [...new Set(merged.map(tier => tier.confidence_level))].sort((a, b) => b - a)
  const highestTier = levels[0] || 65
  let recommended = Math.min(canonicalLevel(pattern.purview.recommended_confidence ?? highestTier), highestTier)
  if (!levels.includes(recommended)) recommended = levels.find(level => level >= recommended) || highestTier
  if (pattern.purview.recommended_confidence !== recommended) {
    pattern.purview.recommended_confidence = recommended
    changed = true
    notes.push(`Aligned recommended_confidence to ${recommended}.`)
  }

  if (isConcept && pattern.confidence === 'high' && highestTier < 85) {
    pattern.confidence = 'medium'
    changed = true
    notes.push('Capped concept classifier top-level confidence at medium after tier remediation.')
  } else if (pattern.confidence && confidenceLabel(highestTier) !== pattern.confidence && highestTier < canonicalLevel(pattern.confidence)) {
    pattern.confidence = confidenceLabel(highestTier)
    changed = true
  }

  return changed
}

function isShortAcronymRisk(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return false
  if (SHORT_ACRONYM_TERMS.has(trimmed.toUpperCase())) return true
  return /^[A-Z0-9&./-]{2,3}$/.test(trimmed)
}

function remediateTermCase(term) {
  const text = termText(term)
  if (!isShortAcronymRisk(text)) return { term, changed: false }
  if (term && typeof term === 'object') {
    if (term.case_sensitive === true || term.caseSensitive === true) return { term, changed: false }
    return { term: { ...term, case_sensitive: true }, changed: true }
  }
  return { term: { text, case_sensitive: true }, changed: true }
}

function remediateKeywordTerms(container) {
  let changed = false
  for (const keyword of container.purview?.keywords || []) {
    for (const group of keyword.groups || []) {
      if (!Array.isArray(group.terms)) continue
      group.terms = group.terms.map(term => {
        const result = remediateTermCase(term)
        if (result.changed) changed = true
        return result.term
      })
    }
  }
  return changed
}

function remediateKeywordDictionary(data) {
  if (!Array.isArray(data.keywords)) return false
  let changed = false
  data.keywords = data.keywords.map(term => {
    const result = remediateTermCase(term)
    if (result.changed) changed = true
    return result.term
  })
  return changed
}

function uniqueNotes(notes) {
  return [...new Set(notes)]
}

function updateRemediationMetadata(pattern, notes) {
  const unique = uniqueNotes(notes)
  if (!unique.length) return
  pattern.remediation = {
    ...(pattern.remediation || {}),
    catalog_quality_2026_06_02: {
      status: 'applied',
      changes: unique
    }
  }
  pattern.updated = TODAY
}

function processPatterns() {
  const files = fs.readdirSync(PATTERN_DIR).filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
  const results = []

  for (const file of files) {
    const filePath = path.join(PATTERN_DIR, file)
    const pattern = loadYaml(filePath)
    if (slugArg && pattern.slug !== slugArg) continue

    const before = JSON.stringify(pattern)
    const notes = []
    let changed = false

    changed = remediateTiers(pattern, notes) || changed
    changed = remediateKeywordTerms(pattern) || changed

    if (changed && JSON.stringify(pattern) !== before) {
      updateRemediationMetadata(pattern, notes)
      if (write) fs.writeFileSync(filePath, dumpYaml(pattern), 'utf8')
      results.push({ file, slug: pattern.slug, notes: uniqueNotes(notes) })
    }
  }

  return results
}

function processKeywordDictionaries() {
  const files = fs.readdirSync(KEYWORD_DIR).filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
  const results = []

  for (const file of files) {
    const filePath = path.join(KEYWORD_DIR, file)
    const data = loadYaml(filePath)
    const before = JSON.stringify(data)
    const changed = remediateKeywordDictionary(data)
    if (changed && JSON.stringify(data) !== before) {
      data.updated = TODAY
      if (write) fs.writeFileSync(filePath, dumpYaml(data), 'utf8')
      results.push({ file, slug: data.slug })
    }
  }

  return results
}

const patternResults = processPatterns()
const keywordResults = processKeywordDictionaries()

console.log(`${write ? 'Applied' : 'Would apply'} catalog quality remediation`)
console.log(`Patterns changed: ${patternResults.length}`)
console.log(`Keyword dictionaries changed: ${keywordResults.length}`)
for (const result of patternResults.slice(0, 30)) {
  console.log(`- ${result.slug}: ${result.notes.slice(0, 2).join('; ') || 'case/evidence metadata update'}`)
}
if (patternResults.length > 30) console.log(`... ${patternResults.length - 30} more pattern(s)`)
if (!write) console.log('Run with --write to apply changes.')

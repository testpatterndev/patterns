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

function classifyKeyword(keyword) {
  const id = String(keyword.id || '').toLowerCase()
  const terms = keywordTerms(keyword).map(normalizeTerm).filter(Boolean)
  const commonRatio = terms.length ? terms.filter(term => COMMON_TERMS.has(term)).length / terms.length : 0
  const structuralRatio = terms.length ? terms.filter(term => STRUCTURAL_TERMS.has(term)).length / terms.length : 0
  const noiseCount = terms.filter(term => NOISE_TERMS.has(term)).length
  const multiWordRatio = terms.length ? terms.filter(term => term.includes(' ')).length / terms.length : 0

  if (/noise|exclusion|template|filter/.test(id) || noiseCount > 0) return 'noise'
  if (/data_record|structural/.test(id) || structuralRatio >= 0.35) return 'structural'
  if (/generic_data|generic|label/.test(id) || commonRatio >= 0.45) return 'generic'
  if (multiWordRatio >= 0.6) return 'specific'
  return 'domain'
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
          issues.shortAcronyms.push(`${file}: ${keyword.id} term '${text}' is not case-sensitive`)
        }
      }
    }
  }
}

const issues = {
  nonCanonical: [],
  duplicateLevels: [],
  recommendedDrift: [],
  weakHigh: [],
  weakMedium: [],
  conceptHigh: [],
  discoveryMissing: [],
  shortAcronyms: []
}

for (const file of fs.readdirSync(PATTERN_DIR).filter(name => name.endsWith('.yaml') || name.endsWith('.yml'))) {
  const pattern = loadYaml(path.join(PATTERN_DIR, file))
  checkTerms(pattern, issues, file, 'pattern')

  if (!pattern.purview?.pattern_tiers) continue

  const keywordById = new Map()
  for (const keyword of pattern.purview.keywords || []) {
    keywordById.set(keyword.id, classifyKeyword(keyword))
  }

  const tiers = pattern.purview.pattern_tiers || []
  const levels = tiers.map(tier => Number(tier.confidence_level))
  for (const level of levels) {
    if (!VALID_LEVELS.has(level)) issues.nonCanonical.push(`${file}: non-canonical confidence ${level}`)
  }
  for (const level of VALID_LEVELS) {
    if (levels.filter(item => item === level).length > 1) issues.duplicateLevels.push(`${file}: duplicate ${level} tier`)
  }
  if (!levels.includes(Number(pattern.purview.recommended_confidence))) {
    issues.recommendedDrift.push(`${file}: recommended_confidence ${pattern.purview.recommended_confidence} is not an exported tier`)
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
      issues.weakHigh.push(`${file}: weak high tier`)
    }
    if (level >= 75 && (noEvidence || genericOnly)) {
      issues.weakMedium.push(`${file}: weak medium tier`)
    }
    if (level >= 85 && strengths.length >= 2 && hasSpecificOrDomain) {
      hasStrongConceptHigh = true
    }
    if (level === 65 && (noEvidence || CONCEPT_TYPES.has(pattern.type)) && tier.discovery_only !== true) {
      issues.discoveryMissing.push(`${file}: broad low tier should be marked discovery_only`)
    }
  }

  if (CONCEPT_TYPES.has(pattern.type) && pattern.confidence === 'high' && !hasStrongConceptHigh) {
    issues.conceptHigh.push(`${file}: concept classifier has high confidence without a strong 85 tier`)
  }
}

for (const file of fs.readdirSync(KEYWORD_DIR).filter(name => name.endsWith('.yaml') || name.endsWith('.yml'))) {
  const dictionary = loadYaml(path.join(KEYWORD_DIR, file))
  checkTerms(dictionary, issues, file, 'dictionary')
}

const total = Object.values(issues).reduce((sum, rows) => sum + rows.length, 0)
console.log('Catalog quality verification')
console.log('============================')
for (const [key, rows] of Object.entries(issues)) {
  console.log(`- ${key}: ${rows.length}`)
  for (const row of rows.slice(0, 10)) console.log(`  ${row}`)
  if (rows.length > 10) console.log(`  ... ${rows.length - 10} more`)
}

if (total > 0) {
  console.error(`Catalog quality verification failed with ${total} issue(s)`)
  process.exit(1)
}

console.log('Catalog quality verification passed')

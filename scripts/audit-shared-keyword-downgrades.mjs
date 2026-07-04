#!/usr/bin/env node
// Audits the bulk catalog-quality remediation (commit 8fb564f5) for a specific blind spot in
// scripts/remediate-catalog-quality.mjs's classifyKeyword()/tierWeakness(): that tool only builds
// its evidence-strength map from `purview.keywords[]` (locally-defined keyword groups). It never
// looks at:
//   - a tier's `matches[].ref` (or nested `children[].ref`) pointing at a `purview.regexes[].id`
//     (a "this other regex must also match nearby" evidentiary ref, not a keyword ref)
//   - a tier's `matches[].ref` pointing at a `purview.shared_keywords[].as` alias for a
//     DOMAIN-SPECIFIC shared dictionary (e.g. ai-context-markers, en-government-classification) —
//     only the four generic/structural aliases are common enough to have been noticed in review
// Both cases make `keywordById.get(ref)` return undefined, so `tierWeakness()` silently treats that
// evidence as if it didn't exist (`refs.positive.filter(Boolean)` drops it). Compounding this, the
// same tool's classifyKeyword() derives "strength" partly from a naive substring test on the
// keyword's `id` (`/generic_data|generic|label/.test(id)` -> 'generic'). Any pattern whose OWN name
// ends in "(Generic)" or "generic-..." (a real Microsoft SIT naming convention for a broad variant,
// not a comment on evidence quality) produces keyword ids that inherit that substring, so their
// otherwise rich, multi-word, domain-specific terms get mislabelled 'generic' anyway.
//
// Both mechanisms show up downstream as the SAME observable symptom, which is what this script
// actually detects (rather than re-deriving *why* the tool erred, which is unnecessary once the
// symptom is checked directly): a tier that had genuine domain-specific evidence pre-bulk was
// downgraded/collapsed away post-bulk, OR a purview.keywords/regexes definition that carried real
// evidence became unreferenced by every surviving tier once the collapse picked a different,
// weaker-shaped tier as the "canonical" survivor for its confidence bucket.
//
// Usage: node scripts/audit-shared-keyword-downgrades.mjs [--json]
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

const BULK_COMMIT = '8fb564f5f06b7546ea3efe3cfe65737aabdf2aa6'
const PRE_BULK_COMMIT = '4f98842c10eae768e5af6e322990a21e98ac05e1'
const PATTERN_DIR = join('data', 'patterns')
const GENERIC_STRUCTURAL_DICTS = new Set(['template-exclusion', 'data-record-context', 'generic-data-labels'])
const asJson = process.argv.includes('--json')

// Mirrors classifyKeyword()'s ratio-based rules from scripts/remediate-catalog-quality.mjs, but
// WITHOUT its `id`-substring shortcuts. Those shortcuts are what caused the second observed blind
// spot: a keyword's id inherits the substring "generic" whenever the PATTERN ITSELF is named
// "...(Generic)" (a real Microsoft SIT naming convention for a broad credential/PII variant, not a
// comment on evidence quality) or the slug is "xxx-generic"/"generic-xxx". `classifyKeyword` tests
// `/generic_data|generic|label/.test(id)` before ever looking at the actual terms, so a keyword
// with rich, multi-word, clearly domain-specific terms (e.g. "core.windows.net", "connection
// string", "jdbc") gets short-circuited to 'generic' purely because its id contains that
// inherited substring. Recomputing strength from terms alone reveals the disagreement.
const COMMON_TERMS = new Set(['account', 'agency', 'application', 'case', 'code', 'data', 'department', 'document', 'field', 'file', 'form', 'government', 'id', 'identifier', 'key', 'number', 'record', 'reference', 'report', 'row', 'table', 'value'])
const STRUCTURAL_TERMS = new Set(['appendix', 'attachment', 'column', 'database', 'entry', 'extract', 'field', 'form', 'record', 'register', 'row', 'schedule', 'spreadsheet', 'table', 'template', 'value'])
function termText(term) { return term && typeof term === 'object' ? String(term.text || '').trim() : String(term || '').trim() }
function normalizeTerm(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() }
function keywordTerms(keyword) {
  const terms = []
  for (const group of keyword.groups || []) for (const term of group.terms || []) { const t = termText(term); if (t) terms.push(t) }
  return terms
}
function classifyContentOnly(keyword) {
  const terms = keywordTerms(keyword).map(normalizeTerm).filter(Boolean)
  if (!terms.length) return 'unknown'
  const commonRatio = terms.filter(t => COMMON_TERMS.has(t)).length / terms.length
  const structuralRatio = terms.filter(t => STRUCTURAL_TERMS.has(t)).length / terms.length
  const multiWordRatio = terms.filter(t => t.includes(' ')).length / terms.length
  if (structuralRatio >= 0.35) return 'structural'
  if (commonRatio >= 0.45) return 'generic'
  if (multiWordRatio >= 0.6) return 'specific'
  return 'domain'
}
const STRENGTH_RANK = { noise: -1, generic: 0, structural: 1, domain: 2, specific: 2, unknown: 0 }

function sh(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
}

function showFile(commit, relPath) {
  try {
    // git needs forward slashes even on Windows for the `commit:path` object spec
    return sh(['show', `${commit}:${relPath.replace(/\\/g, '/')}`])
  } catch {
    return null // file didn't exist at that commit (added later)
  }
}

function tryLoad(text) {
  if (text == null) return null
  try { return yaml.load(text) } catch { return null }
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

// Walks a tier's `matches` tree (arbitrarily nested `children`) and returns every `ref`/`refs[]`
// encountered, regardless of min/max_matches (an exclusion still "uses" — and so shouldn't orphan —
// the keyword it excludes).
function collectAllRefs(nodes = [], out = []) {
  for (const node of nodes || []) {
    if (!node) continue
    if (node.ref) out.push(node.ref)
    for (const ref of node.refs || []) out.push(ref)
    if (node.children) collectAllRefs(node.children, out)
  }
  return out
}

function sharedAliasToDict(purview) {
  const map = new Map()
  for (const sk of purview?.shared_keywords ?? []) if (sk?.as && sk?.dict) map.set(sk.as, sk.dict)
  return map
}

function tierSignature(tier) {
  // Confidence level + the exact evidence shape, independent of file position — used to test
  // whether a given pre-bulk tier "survived" (a tier at the same level with equivalent-or-superset
  // evidence still exists post-bulk) or was downgraded/dropped by the merge.
  return JSON.stringify({ level: Number(tier.confidence_level ?? tier.confidence ?? 0), matches: tier.matches ?? null, id_match: normalizeIdMatch(tier.id_match).sort() })
}

function auditFile(relPath) {
  const preText = showFile(PRE_BULK_COMMIT, relPath)
  const pre = tryLoad(preText)
  if (!pre?.purview?.pattern_tiers?.length) return null // nothing to compare (no purview tiers pre-bulk)

  let curText
  try { curText = readFileSync(relPath, 'utf8') } catch { return null } // file deleted since
  const cur = tryLoad(curText)
  if (!cur?.purview) return null

  const preTiers = pre.purview.pattern_tiers
  const curTiers = cur.purview.pattern_tiers ?? []
  const preMax = Math.max(...preTiers.map(t => Number(t.confidence_level ?? t.confidence ?? 0)))
  const curMax = curTiers.length ? Math.max(...curTiers.map(t => Number(t.confidence_level ?? 0))) : 0
  const preAliasMap = sharedAliasToDict(pre.purview)

  const reasons = []

  // --- (a)+(b): a pre-bulk tier vanished/was downgraded AND its evidence referenced a
  // domain-specific (non generic-structural) shared_keywords dict. ---
  const curSignatures = new Set(curTiers.map(tierSignature))
  const downgradedPreTiers = preTiers.filter(t => !curSignatures.has(tierSignature(t)))
  // Only meaningful if the catalog actually got weaker (fewer/lower tiers), not just reshuffled.
  const gotWeaker = curTiers.length < preTiers.length || curMax < preMax
  if (gotWeaker) {
    for (const tier of downgradedPreTiers) {
      const refs = collectAllRefs(tier.matches)
      for (const ref of refs) {
        const dict = preAliasMap.get(ref)
        if (dict && !GENERIC_STRUCTURAL_DICTS.has(dict)) {
          reasons.push({ type: 'shared_dict_blind_spot', tierLevel: tier.confidence_level ?? tier.confidence, ref, dict })
        }
      }
    }
  }

  // --- (c): a purview.keywords/regexes definition became orphaned post-bulk (defined, but
  // referenced by zero surviving tiers) that was NOT already orphaned pre-bulk (i.e. the bulk
  // commit's tier collapse/downgrade is what orphaned it, not a pre-existing authoring gap). ---
  function orphanSet(doc) {
    const tiers = doc.purview.pattern_tiers ?? []
    const reachable = new Set()
    for (const tier of tiers) {
      for (const id of normalizeIdMatch(tier.id_match)) reachable.add(id)
      for (const ref of collectAllRefs(tier.matches)) reachable.add(ref)
    }
    const definedKeywords = (doc.purview.keywords ?? []).map(k => k.id).filter(Boolean)
    const definedRegexes = (doc.purview.regexes ?? []).map(r => r.id).filter(Boolean)
    const orphanedKeywords = definedKeywords.filter(id => !reachable.has(id))
    const orphanedRegexes = definedRegexes.filter(id => !reachable.has(id))
    return { orphanedKeywords, orphanedRegexes }
  }
  const preOrphans = orphanSet(pre)
  const curOrphans = orphanSet(cur)
  const newlyOrphanedKeywords = curOrphans.orphanedKeywords.filter(id => !preOrphans.orphanedKeywords.includes(id))
  const newlyOrphanedRegexes = curOrphans.orphanedRegexes.filter(id => !preOrphans.orphanedRegexes.includes(id))
  // Quality gate: only flag an orphaned keyword if it was carrying evidence the bulk tool
  // UNDERVALUED — i.e. a content-only reclassification (ignoring the id-substring shortcuts) beats
  // the strength the file actually recorded for it. This is what separates a real regression (rich
  // multi-word terms mislabelled 'generic' because the id happened to contain that substring) from
  // routine, correctly-judged simplification (a keyword that really was weak/generic, now merged
  // away harmlessly).
  // Look the keyword up in CUR, not PRE: pre-bulk files mostly predate the `strength` field
  // entirely (the bulk commit is what added it), and the orphaned definition still physically
  // exists post-bulk (only its tier reference was dropped) — CUR is the copy actually carrying
  // the recorded `strength` that fed the wrong tierScore comparison.
  const curKeywordById = new Map((cur.purview.keywords ?? []).map(k => [k.id, k]))
  for (const id of newlyOrphanedKeywords) {
    const keyword = curKeywordById.get(id)
    if (!keyword) continue
    const recorded = keyword.strength || 'unknown'
    const contentOnly = classifyContentOnly(keyword)
    // Two independent ways this is a real regression, not routine correctly-judged cleanup:
    //  (i)  the catalog's OWN recorded strength was already domain/specific — the collapse
    //       dropped genuinely strong evidence regardless of any misclassification, or
    //  (ii) recorded strength is weak (generic/noise/structural) but a content-only
    //       reclassification (ignoring the id-substring shortcuts) says it should have been
    //       domain/specific — the classic "id contains 'generic'/'template' as a naming
    //       artifact" misjudgment.
    const recordedAlreadyStrong = STRENGTH_RANK[recorded] >= 2
    const contentDisagreesUpward = STRENGTH_RANK[contentOnly] > STRENGTH_RANK[recorded]
    if (recordedAlreadyStrong || contentDisagreesUpward) {
      reasons.push({ type: 'orphaned_keyword', id, recordedStrength: recorded, contentStrength: contentOnly, terms: keywordTerms(keyword) })
    }
  }
  for (const id of newlyOrphanedRegexes) reasons.push({ type: 'orphaned_regex', id })

  if (!reasons.length) return null
  return {
    file: relPath,
    slug: cur.slug ?? pre.slug,
    preMaxConfidence: preMax,
    curMaxConfidence: curMax,
    preTierCount: preTiers.length,
    curTierCount: curTiers.length,
    reasons
  }
}

// --- driver ---
const bulkChangedFiles = sh(['show', '--stat', '--name-only', BULK_COMMIT])
  .split('\n')
  .filter(l => l.startsWith('data/patterns/') && l.endsWith('.yaml'))

// git's --name-only output always uses forward slashes; `join()` would emit backslashes on
// Windows, so build this set with forward slashes explicitly to keep the two comparable.
const existing = new Set(readdirSync(PATTERN_DIR).filter(f => f.endsWith('.yaml')).map(f => `data/patterns/${f}`))

const results = []
for (const relPath of bulkChangedFiles) {
  if (!existing.has(relPath)) continue
  const result = auditFile(relPath)
  if (result) results.push(result)
}
results.sort((a, b) => a.slug.localeCompare(b.slug))

if (asJson) {
  console.log(JSON.stringify(results, null, 2))
} else {
  console.log(`Audited ${bulkChangedFiles.length} bulk-touched files still present in the catalog; ${results.length} flagged.\n`)
  for (const r of results) {
    console.log(`${r.slug}  (pre max ${r.preMaxConfidence} / ${r.preTierCount} tiers -> cur max ${r.curMaxConfidence} / ${r.curTierCount} tiers)`)
    for (const reason of r.reasons) {
      if (reason.type === 'shared_dict_blind_spot') console.log(`    shared_dict_blind_spot: tier ${reason.tierLevel} referenced ${reason.ref} -> shared dict '${reason.dict}' (domain-specific, invisible to classifyKeyword)`)
      if (reason.type === 'orphaned_keyword') console.log(`    orphaned_keyword: ${reason.id} defined in purview.keywords but referenced by zero surviving tiers`)
      if (reason.type === 'orphaned_regex') console.log(`    orphaned_regex: ${reason.id} defined in purview.regexes but referenced by zero surviving tiers`)
    }
  }
  console.log(`\nTotal flagged: ${results.length}`)
}

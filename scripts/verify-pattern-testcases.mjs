// Tier-aware test-case harness for pattern YAMLs.
//
// Usage: node scripts/verify-pattern-testcases.mjs <slug> [<slug> ...]
//        node scripts/verify-pattern-testcases.mjs --all
//
// Purpose: catch test cases that cannot possibly behave as declared. Evidence /
// label-context regexes and keyword groups are NEVER evaluated as standalone
// detectors of the whole test value — they only participate through the tier
// structure (purview.pattern_tiers) they belong to.
//
// Detection semantics (mirrors how purview.pattern_tiers compose — see
// scripts/compile.js for shared_keywords resolution and the report in
// .superpowers/sdd/backlog-tier-harness-report.md for the full write-up):
//
//   A tier = { confidence_level, id_match, matches?, excludes?/exclusion? }.
//   - id_match: the PRIMARY detector — a regex id, a keyword-group id, or
//     { type: any, ids: [...] } (any one of the listed primaries).
//   - matches entries are supporting evidence found within the proximity
//     window around the primary match:
//       { ref }                            -> ref must match (AND)
//       { ref, min_count, unique_results } -> ref must match >= min_count times
//       { type: any, min_matches, max_matches, refs|children }
//                                          -> count of matching members must be
//                                             >= min_matches (default 1) and
//                                             <= max_matches (default inf).
//                                             min=0/max=0 is a NOT-group (exclusion).
//   - tier.excludes: [{ref}] and tier.exclusion: [any-group] are exclusions too.
//   - purview.filters (AllDigitsSameFilter, TextMatchFilter Exclude, and the
//     legacy exclude/exclude_keyword/exclude_pattern shapes) suppress matches.
//
// Test-case evaluation:
//   should_match     PASSES if the tier logic CAN pass for the value: some
//                    tier's id_match matches the value (surviving filters) and
//                    the value itself does not trip that tier's exclusions.
//                    Positive evidence may be supplied by surrounding document
//                    context in deployment, so it is NOT required to be present
//                    in the test value. Top-level `pattern` (the universal-
//                    engine detector) matching also counts, as does the
//                    keywords array for keyword_list/keyword_dictionary types.
//   should_not_match FAILS only if the detector WOULD fire on the value taken
//                    as a whole document: some tier's id_match matches AND all
//                    of that tier's required evidence is found in the value AND
//                    no exclusion/filter suppresses it. (A top-level `pattern`
//                    hit alone on a tier-gated pattern is a warning, not a
//                    failure — mirroring scripts/ci-check.mjs.)
//
// Exits non-zero on any failure. Reports JS-incompatible regex as ENGINE-DIVERGENT.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

const ROOT = join(import.meta.dirname, '..')
const PAT_DIR = join(ROOT, 'data', 'patterns')
const KW_DIR = join(ROOT, 'data', 'keywords')
const KW_TYPES = new Set(['keyword_list', 'keyword_dictionary'])
// keyword_proximity / trainable_classifier have no single-regex detector; they are
// only evaluable through their tiers (if any) — never failed for lacking a regex.
const NON_REGEX_TYPES = new Set(['keyword_proximity', 'trainable_classifier'])

let failures = 0
let warnings = 0

// ---------- regex / keyword compilation ----------

// Strip a leading inline-flag group like (?i)/(?is)/(?s) (invalid in JS) and map to JS
// flags. Case-insensitive is forced by repo convention unless p.case_sensitive — but a
// regex that INTENTIONALLY carries (?i) keeps case-insensitivity even on a
// case_sensitive pattern (the inline flag is authored per-regex and wins).
const toRe = (src, caseSensitive, extraFlags = '') => {
  let body = String(src)
  let flags = (caseSensitive ? '' : 'i') + extraFlags
  const m = body.match(/^\(\?([ims]+)\)/)
  if (m) {
    body = body.slice(m[0].length)
    if (m[1].includes('i')) flags += 'i'
    if (m[1].includes('s')) flags += 's'
    if (m[1].includes('m')) flags += 'm'
  }
  return new RegExp(body, [...new Set(flags)].join(''))
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A keyword term is a string or {text, case_sensitive}. match_style 'word' anchors on
// word boundaries (only where the term edge is a word char); 'string' is substring.
function compileTerm(term, matchStyle) {
  const text = typeof term === 'string' ? term : term?.text
  if (!text || typeof text !== 'string') return null
  const cs = typeof term === 'object' && term?.case_sensitive === true
  if (matchStyle === 'string') {
    const needle = cs ? text : text.toLowerCase()
    const norm = (v) => (cs ? v : v.toLowerCase())
    const count = (v) => {
      const hay = norm(v)
      let n = 0
      for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++
      return n
    }
    return { text, test: (v) => norm(v).includes(needle), count }
  }
  const lead = /^[A-Za-z0-9_]/.test(text) ? '(?<![A-Za-z0-9_])' : ''
  const trail = /[A-Za-z0-9_]$/.test(text) ? '(?![A-Za-z0-9_])' : ''
  const re = new RegExp(lead + escRe(text) + trail, cs ? '' : 'i')
  const reG = new RegExp(re.source, re.flags + 'g')
  return { text, test: (v) => re.test(v), count: (v) => [...v.matchAll(reG)].length }
}

const dictCache = new Map()
function loadDict(slug) {
  if (dictCache.has(slug)) return dictCache.get(slug)
  const file = join(KW_DIR, `${slug}.yaml`)
  let terms = null
  if (existsSync(file)) {
    try { terms = yaml.load(readFileSync(file, 'utf-8'))?.keywords ?? [] } catch { terms = null }
  }
  dictCache.set(slug, terms)
  return terms
}

// ---------- matcher registry ----------
// Every referenceable id (purview.regexes[].id, purview.keywords[].id,
// shared_keywords[].as) maps to a matcher:
//   { kind: 'regex', re, reG }         — reG is the same regex with /g for counting
//   { kind: 'keyword', terms: [...] }  — compiled term matchers
//   { kind: 'divergent' }              — regex that JS cannot compile
function buildRegistry(p, slug) {
  const reg = new Map()
  let divergent = 0
  for (const r of p.purview?.regexes ?? []) {
    const id = r.id ?? r.name
    if (!id || typeof r.pattern !== 'string') continue
    try {
      reg.set(id, { kind: 'regex', re: toRe(r.pattern, p.case_sensitive), reG: toRe(r.pattern, p.case_sensitive, 'g') })
    } catch (e) {
      divergent++
      console.log(`  ENGINE-DIVERGENT ${slug}: ${e.message} :: ${String(r.pattern).slice(0, 60)}`)
      reg.set(id, { kind: 'divergent' })
    }
  }
  for (const k of p.purview?.keywords ?? []) {
    const id = k.id ?? k.name ?? k.group
    if (!id) continue
    const groups = k.groups ?? (Array.isArray(k.values) ? [{ match_style: 'word', terms: k.values }]
      : Array.isArray(k.words) ? [{ match_style: 'word', terms: k.words }] : [])
    const terms = []
    for (const g of groups) for (const t of g.terms ?? []) {
      const c = compileTerm(t, g.match_style ?? 'word')
      if (c) terms.push(c)
    }
    reg.set(id, { kind: 'keyword', terms })
  }
  for (const sk of p.purview?.shared_keywords ?? []) {
    if (!sk?.as || !sk?.dict) continue
    const dictTerms = loadDict(sk.dict)
    if (!dictTerms) { console.log(`  warn  ${slug}: shared dict '${sk.dict}' missing/unreadable`); warnings++; continue }
    const terms = []
    for (const t of dictTerms) {
      const c = compileTerm(t, sk.match_style ?? 'word')
      if (c) terms.push(c)
    }
    reg.set(sk.as, { kind: 'keyword', terms })
  }
  return { reg, divergent }
}

// Count how many times a matcher hits in `text` (unique -> distinct match strings /
// distinct keyword terms; non-unique -> total occurrences, so two occurrences of the
// same term count as 2). Returns null when the matcher cannot be evaluated.
function matchCount(matcher, text, unique) {
  if (!matcher || matcher.kind === 'divergent') return null
  if (matcher.kind === 'regex') {
    const hits = [...text.matchAll(matcher.reG)].map((m) => m[0])
    return unique ? new Set(hits).size : hits.length
  }
  if (unique) return matcher.terms.filter((t) => t.test(text)).length // distinct terms
  return matcher.terms.reduce((n, t) => n + t.count(text), 0) // total occurrences
}
const matches = (matcher, text) => {
  if (!matcher || matcher.kind === 'divergent') return null
  return matcher.kind === 'regex' ? matcher.re.test(text) : matcher.terms.some((t) => t.test(text))
}

// ---------- purview.filters ----------
// Split into match-level filters (suppress an individual id_match hit) and
// document-level filters (suppress the whole detection when tripped by the text).
function compileFilters(p, slug) {
  const matchLevel = []
  const docLevel = []
  for (const f of p.purview?.filters ?? []) {
    if (f.type === 'AllDigitsSameFilter') {
      // Rejects a matched value whose digits are all the same digit (e.g. all-zeros IDs).
      matchLevel.push((m) => {
        const digits = m.match(/[0-9]/g)
        return !(digits && digits.length >= 2 && digits.every((d) => d === digits[0]))
      })
    } else if (f.type === 'TextMatchFilter' && f.logic === 'Exclude') {
      // direction: Full — the FULL matched value is compared against each term.
      const terms = new Set((f.terms ?? []).map((t) => String(t).toLowerCase()))
      matchLevel.push((m) => !terms.has(m.toLowerCase()))
    } else if (f.type === 'exclude_keyword' || f.type === 'exclude') {
      const terms = (f.values ?? f.keywords ?? []).map((t) => String(t).toLowerCase())
      docLevel.push((text) => { const lt = text.toLowerCase(); return terms.some((t) => lt.includes(t)) })
    } else if (f.type === 'exclude_pattern' && typeof f.pattern === 'string') {
      try { const re = toRe(f.pattern, p.case_sensitive); docLevel.push((text) => re.test(text)) }
      catch { console.log(`  warn  ${slug}: exclude_pattern filter is ENGINE-DIVERGENT, skipped`); warnings++ }
    }
  }
  return { matchLevel, docLevel }
}

// ---------- tier structure ----------

const idMatchIds = (tier) => {
  if (typeof tier.id_match === 'string') return tier.id_match ? [tier.id_match] : []
  if (tier.id_match && Array.isArray(tier.id_match.ids)) return tier.id_match.ids.filter(Boolean)
  return []
}

// Normalize a tier's constraint nodes: matches[] plus the exclusion spellings
// (tier.excludes -> NOT-group per ref; tier.exclusion -> any-group nodes).
function tierNodes(tier) {
  const nodes = [...(tier.matches ?? [])]
  for (const ex of tier.excludes ?? []) {
    if (ex?.ref) nodes.push({ type: 'any', min_matches: 0, max_matches: 0, refs: [ex.ref] })
  }
  nodes.push(...(tier.exclusion ?? []))
  return nodes
}

const isAnyGroup = (node) => node?.type === 'any' || node?.refs !== undefined || node?.children !== undefined

// How many members of an any-group match the text. Members are refs and/or child nodes.
function groupMatchedCount(node, text, reg) {
  let count = 0
  for (const ref of node.refs ?? []) if (matches(reg.get(ref), text) === true) count++
  for (const child of node.children ?? []) {
    if (isAnyGroup(child)) { if (nodeSatisfied(child, text, reg)) count++ }
    else if (child?.ref && matches(reg.get(child.ref), text) === true) count++
  }
  return count
}

// Full (document == text) satisfaction of a constraint node — used for should_not_match.
// Unresolvable/divergent refs make a positive requirement UNSATISFIED (lenient: the
// harness will not claim the tier fires when it cannot evaluate the evidence).
function nodeSatisfied(node, text, reg) {
  if (isAnyGroup(node)) {
    const count = groupMatchedCount(node, text, reg)
    const min = node.min_matches ?? 1
    const max = node.max_matches ?? Infinity
    return count >= min && count <= max
  }
  if (node?.ref) {
    const need = node.min_count ?? 1
    const c = matchCount(reg.get(node.ref), text, node.unique_results === true)
    return c !== null && c >= need
  }
  return true // unknown node shape: don't block
}

// Can the value itself never satisfy this node in ANY surrounding document?
// Only max-bounded groups can be permanently violated by content of the value
// (whatever is inside the value is always inside the proximity window); positive
// (min/AND) requirements can be supplied by surrounding context, so they never veto.
function nodeVetoedByValue(node, text, reg) {
  if (!isAnyGroup(node)) return false
  const max = node.max_matches
  if (max === undefined || max === null) return false
  return groupMatchedCount(node, text, reg) > max
}

// id_match hit that survives match-level filters.
function idMatchSurvives(tier, text, reg, filters) {
  for (const id of idMatchIds(tier)) {
    const m = reg.get(id)
    if (!m || m.kind === 'divergent') continue
    if (m.kind === 'keyword') {
      for (const t of m.terms) if (t.test(text)) return true
      continue
    }
    for (const hit of text.matchAll(m.reG)) {
      if (filters.matchLevel.every((ok) => ok(hit[0]))) return true
    }
  }
  return false
}

// Does the tier have at least one resolvable primary matcher?
const tierEvaluable = (tier, reg) =>
  idMatchIds(tier).some((id) => { const m = reg.get(id); return m && m.kind !== 'divergent' })

// should_match: the tier logic CAN pass for this value.
function tierCanPass(tier, text, reg, filters) {
  if (!idMatchSurvives(tier, text, reg, filters)) return false
  if (filters.docLevel.some((trips) => trips(text))) return false
  for (const node of tierNodes(tier)) if (nodeVetoedByValue(node, text, reg)) return false
  return true
}

// should_not_match: the tier WOULD fire on this value taken as a whole document.
function tierWouldFire(tier, text, reg, filters) {
  if (!idMatchSurvives(tier, text, reg, filters)) return false
  if (filters.docLevel.some((trips) => trips(text))) return false
  // min_count/unique_results on the tier itself gate the id_match occurrence count.
  if (tier.min_count !== undefined && tier.min_count > 1) {
    const total = idMatchIds(tier)
      .map((id) => matchCount(reg.get(id), text, tier.unique_results === true))
      .filter((c) => c !== null)
      .reduce((a, b) => a + b, 0)
    if (total < tier.min_count) return false
  }
  for (const node of tierNodes(tier)) if (!nodeSatisfied(node, text, reg)) return false
  return true
}

// ---------- failure diagnostics ----------

// Which members of an any-group matched the value (names the NOT-group culprits).
function groupMatchedMembers(node, text, reg) {
  const out = []
  for (const ref of node.refs ?? []) if (matches(reg.get(ref), text) === true) out.push(ref)
  for (const child of node.children ?? []) {
    if (isAnyGroup(child)) { if (nodeSatisfied(child, text, reg)) out.push('(nested group)') }
    else if (child?.ref && matches(reg.get(child.ref), text) === true) out.push(child.ref)
  }
  return out
}

// Explain WHY no tier can pass for a should_match value: report the actual veto
// (document-level filter, match-level filter, or a violated NOT-group) instead of
// blaming id_match when the primary in fact matched.
function shouldMatchFailReason(v, tiers, reg, filters) {
  if (filters.docLevel.some((trips) => trips(v))) return 'document-level exclude filter suppresses the value'
  const reasons = []
  for (const t of tiers) {
    if (!idMatchIds(t).some((id) => matches(reg.get(id), v) === true)) continue // primary never hit
    if (!idMatchSurvives(t, v, reg, filters)) {
      reasons.push(`tier@${t.confidence_level}: every id_match hit is vetoed by a match-level filter`)
      continue
    }
    const veto = tierNodes(t).find((n) => nodeVetoedByValue(n, v, reg))
    if (veto) reasons.push(`tier@${t.confidence_level}: NOT-group violated (matched: ${groupMatchedMembers(veto, v, reg).join(', ') || 'nested members'})`)
  }
  return reasons.length ? reasons.join('; ') : 'id_match never matches the value (nor top-level pattern/keyword terms)'
}

// ---------- per-pattern verification ----------

function verifyPattern(slug) {
  const file = join(PAT_DIR, `${slug}.yaml`)
  let p
  try { p = yaml.load(readFileSync(file, 'utf-8')) }
  catch (e) { failures++; console.log(`  MISSING/UNREADABLE ${slug}: ${e.message}`); return }

  const { reg, divergent } = buildRegistry(p, slug)
  const filters = compileFilters(p, slug)
  const tiers = (p.purview?.pattern_tiers ?? []).filter((t) => tierEvaluable(t, reg))

  // Dangling refs make positive evidence unsatisfiable and exclusions unverifiable — surface them.
  const collectRefs = (nodes, out) => {
    for (const n of nodes ?? []) {
      if (n?.ref) out.add(n.ref)
      for (const r of n?.refs ?? []) out.add(r)
      collectRefs(n?.children, out)
    }
  }
  const usedRefs = new Set()
  for (const t of p.purview?.pattern_tiers ?? []) {
    for (const id of idMatchIds(t)) usedRefs.add(id)
    collectRefs(tierNodes(t), usedRefs)
  }
  for (const ref of usedRefs) if (!reg.has(ref)) { warnings++; console.log(`  warn  ${slug}: tier references unknown id '${ref}'`) }

  let top = null
  if (typeof p.pattern === 'string') {
    try { top = toRe(p.pattern, p.case_sensitive) }
    catch (e) { console.log(`  ENGINE-DIVERGENT ${slug}: ${e.message} :: ${p.pattern.slice(0, 60)}`) }
  }

  // keyword_list/keyword_dictionary: the primary detector is the keywords array.
  // Terms go through compileTerm so per-term { text, case_sensitive: true } objects
  // keep their case-sensitivity (substring semantics, matching the previous behavior).
  const normKwTerm = (t) => {
    if (typeof t === 'object' && t !== null) return { ...t, text: String(t.text ?? '').trim() }
    return String(t).trim()
  }
  const kwTerms = KW_TYPES.has(p.type)
    ? (p.keywords ?? []).map((t) => compileTerm(normKwTerm(t), 'string')).filter(Boolean)
    : []
  const kwHit = (v) => kwTerms.some((t) => t.test(v))

  const shouldMatch = p.test_cases?.should_match ?? []
  const shouldNot = p.test_cases?.should_not_match ?? []

  const hasDetector = top || tiers.length > 0 || kwTerms.length > 0
  if (!hasDetector) {
    if (NON_REGEX_TYPES.has(p.type) || KW_TYPES.has(p.type)) {
      console.log(`  checked ${slug}: SKIP (${p.type} with no evaluable detector)`)
    } else if (shouldMatch.length > 0) {
      failures++
      console.log(`  FAIL ${slug}: no evaluable detector (${divergent} ENGINE-DIVERGENT) — cannot validate should_match`)
    }
    return
  }

  const docFiltered = (v) => filters.docLevel.some((trips) => trips(v))

  for (const tc of shouldMatch) {
    const v = String(tc.value)
    const ok = !docFiltered(v) && ((top && top.test(v)) || kwHit(v) || tiers.some((t) => tierCanPass(t, v, reg, filters)))
    if (!ok) {
      failures++
      console.log(`  FAIL ${slug} should_match: ${JSON.stringify(tc.value).slice(0, 80)} — no tier can pass: ${shouldMatchFailReason(v, tiers, reg, filters)}`)
    }
  }

  // discovery_only tiers are deliberately broad inventory tiers — matching one is not a
  // should_not_match violation (negatives are authored against the enforcement tiers),
  // but it IS worth a warning: the value would still surface in discovery inventory.
  const enforcementTiers = tiers.filter((t) => t.discovery_only !== true)

  for (const tc of shouldNot) {
    const v = String(tc.value)
    const firing = enforcementTiers.find((t) => tierWouldFire(t, v, reg, filters))
    if (firing) {
      failures++
      console.log(`  FAIL ${slug} should_not_match: ${JSON.stringify(tc.value).slice(0, 80)} — tier@${firing.confidence_level} fires (id_match ${JSON.stringify(firing.id_match).slice(0, 60)})`)
      continue
    }
    if (docFiltered(v)) continue // a document-level exclude filter suppresses any hit
    if (kwTerms.length && kwHit(v)) {
      failures++
      console.log(`  FAIL ${slug} should_not_match: ${JSON.stringify(tc.value).slice(0, 80)} — keyword_list term present in value`)
      continue
    }
    const discoveryFiring = tiers.find((t) => t.discovery_only === true && tierWouldFire(t, v, reg, filters))
    if (discoveryFiring) {
      warnings++
      console.log(`  warn  ${slug} should_not_match fires discovery_only tier@${discoveryFiring.confidence_level} (inventory tier — not a failure, but the value would surface in discovery): ${JSON.stringify(tc.value).slice(0, 60)}`)
      continue
    }
    if (tiers.length === 0 && top && top.test(v)) {
      failures++
      console.log(`  FAIL ${slug} should_not_match: ${JSON.stringify(tc.value).slice(0, 80)} — top-level pattern matches (no tiers to gate it)`)
      continue
    }
    if (tiers.length > 0 && top && top.test(v)) {
      warnings++
      console.log(`  warn  ${slug} should_not_match matches top-level pattern but no tier fires (tier-gated negative): ${JSON.stringify(tc.value).slice(0, 60)}`)
    }
  }

  console.log(`  checked ${slug}: ${tiers.length} evaluable tier(s), ${reg.size} matcher(s)${top ? ', top-level pattern' : ''}${kwTerms.length ? `, ${kwTerms.length} keyword term(s)` : ''}`)
}

// ---------- main ----------

let slugs = process.argv.slice(2)
if (slugs.includes('--all')) {
  if (slugs.length > 1) {
    console.error('Error: --all cannot be combined with explicit slugs — pass either --all or a slug list, not both.')
    process.exit(2)
  }
  slugs = readdirSync(PAT_DIR).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.ya?ml$/, ''))
}
if (slugs.length === 0) {
  console.log('Usage: node scripts/verify-pattern-testcases.mjs <slug> [<slug> ...] | --all')
  process.exit(2)
}
for (const slug of slugs) verifyPattern(slug)
console.log(failures ? `\n${failures} failure(s)${warnings ? `, ${warnings} warning(s)` : ''}` : `\nall test_cases pass${warnings ? ` (${warnings} warning(s))` : ''}`)
process.exit(failures ? 1 : 0)

// CI gate for the patterns repo. Fails (exit 1) on any of:
//   - YAML parse / missing required fields
//   - a top-level pattern or purview.regexes[].pattern that does not compile as a regex
//     (checked for EVERY pattern regardless of its type field — keyword_list &c. included)
//   - double-escaped regex (\\b instead of \b)
//   - |top500 generator token left in a regex
//   - a purview validators[].ref that is not a real MS validator function nor a local definition
//   - a should_match that no regex in the file matches, or a should_not_match that the
//     top-level pattern matches (filter-documented negatives are reported as warnings only)
//   - a collection member (data/collections/**/*.yaml patterns list, recursive like
//     compile.js walkDir) that does not reference an existing pattern slug (dangling member)
// Usage: node scripts/ci-check.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const patDir = join(BASE, 'data', 'patterns')
const kwDir = join(BASE, 'data', 'keywords')
const REQUIRED = ['schema', 'name', 'slug', 'type', 'confidence', 'jurisdictions', 'regulations', 'data_categories', 'test_cases']
const KW_TYPES = new Set(['keyword_list', 'keyword_dictionary'])

// MS functions documented as "Is a validator: yes" (sit-functions, 2025-11-18)
const MS_VALIDATORS = new Set(['Func_aba_routing','Func_australian_tax_file_number','Func_brazil_cnpj','Func_brazil_cpf','Func_canadian_sin','Func_credit_card','Func_dea_number','Func_formatted_itin','Func_iban','Func_india_aadhaar','Func_japanese_my_number_corporate','Func_japanese_my_number_personal','Func_randomized_formatted_ssn','Func_randomized_unformatted_ssn','Func_south_africa_identification_number','Func_ssn','Func_swedish_national_identifier','Func_Turkish_National_Id','Func_uk_nhs_number','Func_unformatted_itin','Func_unformatted_ssn','Func_usa_uk_passport'])

const kwSlugs = new Set(readdirSync(kwDir).filter(f => f.endsWith('.yaml')).map(f => f.replace('.yaml', '')))
const patternSlugs = new Set()
const errors = [], warns = []

const toRe = (src, caseSensitive = false) => { let b = String(src), fl = caseSensitive ? '' : 'i'; const m = b.match(/^\(\?([ims]+)\)/); if (m) { b = b.slice(m[0].length); if (m[1].includes('s')) fl += 's'; if (m[1].includes('m')) fl += 'm' } return new RegExp(b, fl) }

// Purview (Boost.RegEx) banned constructs — patterns with a purview block fail CI; others warn.
const stripClasses = (src) => src.replace(/\[(?:[^\]\\]|\\.)*\]/g, '[]')
function purviewBanned(src) {
  const s = stripClasses(src)
  const issues = []
  if (/[+*]\)[*+]|[+*]\)\{/.test(s)) issues.push('nested quantifier')
  if (/(?<!\\)\.(?:[*+]|\{\d+,?\d*\})/.test(s)) issues.push('unbounded/braced dot quantifier')
  // Char classes are already stripped to literal `[]`, so any surviving ^ or $ is outside
  // a class. Only unescaped anchors count — `\^`/`\$` are literal chars, not anchors.
  if (/(?<!\\)\^|(?<!\\)\$/.test(s)) issues.push('^/$ anchor')
  // Strip escaped characters first so literal `\(` / `\)` (e.g. parenthesised phone
  // renderings like `\(020\)`) are not miscounted as capturing groups — Boost/Purview
  // accepts literal parens fine; only real unnamed capture groups are the concern.
  const captures = (s.replace(/\\./g, '').replace(/\(\?[:=!<]/g, '(?x').match(/\((?!\?)/g) || []).length
  if (captures > 1) issues.push(`${captures} capturing groups`)
  // Boost.RegEx allows FIXED-length lookbehinds (e.g. `\s{3}`) — only variable-length
  // quantifiers (*, +, ?, {n,}, {n,m}) inside the body are banned. Note this also flags a
  // `?` belonging to a nested (?:...) group inside the lookbehind body; that's acceptable
  // since a nested group makes the lookbehind's length variable-risk regardless.
  if (/\(\?<[=!][^)]*(?:[*+?]|\{\d+,)/.test(s)) issues.push('variable-length lookbehind')
  return issues
}

for (const f of readdirSync(patDir).filter(f => f.endsWith('.yaml'))) {
  let p
  try { p = yaml.load(readFileSync(join(patDir, f), 'utf-8')) }
  catch (e) { errors.push(`${f}: YAML parse — ${e.message.split('\n')[0]}`); continue }
  for (const k of REQUIRED) if (!(k in p)) errors.push(`${f}: missing field '${k}'`)
  if (typeof p.slug === 'string') patternSlugs.add(p.slug)

  const idMatchIds = new Set((p.purview?.pattern_tiers ?? []).map(t => t.id_match).filter(Boolean))
  const regexes = []
  if (typeof p.pattern === 'string') regexes.push({ id: 'TOP', src: p.pattern })
  for (const r of p.purview?.regexes ?? []) if (typeof r.pattern === 'string') regexes.push({ id: r.id, src: r.pattern })

  // Per-regex validation runs for EVERY collected regex (top-level + all purview.regexes),
  // regardless of p.type — keyword_list/keyword_dictionary purview phrase regexes ship to the
  // tenant exactly like regex-typed ones do, so they get the same gate. Compilation results
  // are kept for the test-case execution below (compiled once, not twice).
  const compiled = []
  for (const { id, src } of regexes) {
    try { compiled.push(toRe(src, p.case_sensitive)) }
    catch (e) { errors.push(`${p.slug}: ${id} regex does not compile — ${e.message.split('\n')[0]}`) }
    if (/\\\\[bdswWDSnrt]/.test(src)) errors.push(`${p.slug}: ${id} double-escaped regex`)
    if (/\|top500\)/.test(src)) errors.push(`${p.slug}: ${id} contains |top500 generator token`)
    for (const bad of purviewBanned(src)) {
      const msg = `${p.slug}: ${id} Purview-banned construct — ${bad}`
      if (p.purview) errors.push(msg); else warns.push(msg)
    }
  }
  for (const kl of p.corroborative_evidence?.keyword_lists ?? []) if (!kwSlugs.has(kl)) errors.push(`${p.slug}: missing keyword_list '${kl}'`)
  for (const sk of p.purview?.shared_keywords ?? []) if (sk.dict && !kwSlugs.has(sk.dict)) errors.push(`${p.slug}: missing shared dict '${sk.dict}'`)
  const localVal = new Set((p.purview?.validators ?? []).map(v => v.id))
  for (const r of p.purview?.regexes ?? []) for (const v of r.validators ?? [])
    if (v.ref && !MS_VALIDATORS.has(v.ref) && !localVal.has(v.ref)) errors.push(`${p.slug}: validator ref '${v.ref}' is not a real MS validator nor local`)

  // test-case execution (uses the `compiled` array built during per-regex validation above)
  const top = (typeof p.pattern === 'string') ? (() => { try { return toRe(p.pattern, p.case_sensitive) } catch { return null } })() : null
  // keyword_proximity uses keyword+proximity detection (not a single regex), so don't
  // regex-test its cases here. keyword_list/dictionary with no compiled regex: skip too.
  if (p.type === 'keyword_proximity' || p.type === 'trainable_classifier') continue
  if (KW_TYPES.has(p.type)) {
    // keyword_list/dictionary: detection is the keywords array (not the purview phrase regexes)
    const terms = (p.keywords ?? []).map(t => String(t).toLowerCase().trim()).filter(Boolean)
    if (!terms.length) continue
    for (const tc of p.test_cases?.should_match ?? []) { const v = String(tc.value).toLowerCase(); if (!terms.some(t => v.includes(t))) errors.push(`${p.slug}: keyword_list should_match has no listed keyword — ${JSON.stringify(tc.value).slice(0, 50)}`) }
    for (const tc of p.test_cases?.should_not_match ?? []) { const v = String(tc.value).toLowerCase(); if (terms.some(t => v.includes(t))) errors.push(`${p.slug}: keyword_list should_not_match contains a listed keyword — ${JSON.stringify(tc.value).slice(0, 50)}`) }
    continue
  }
  for (const tc of p.test_cases?.should_match ?? []) if (compiled.length && !compiled.some(re => re.test(String(tc.value)))) errors.push(`${p.slug}: should_match not matched — ${JSON.stringify(tc.value).slice(0, 60)}`)
  // should_not_match matching the top-level is reported as a WARNING: many are filter/tier
  // -dependent negatives the SIT excludes downstream. Errors stay focused on hard regressions.
  for (const tc of p.test_cases?.should_not_match ?? []) if (top && top.test(String(tc.value))) warns.push(`${p.slug}: should_not_match matched top-level — ${JSON.stringify(tc.value).slice(0, 50)}`)
}

// ── Collection integrity: every collection member must reference an existing pattern slug ──
// Recursive walk (mirrors compile.js walkDir) so a collection placed in a subdirectory —
// which compile.js WOULD ship — cannot be silently skipped by this integrity check.
const colDir = join(BASE, 'data', 'collections')
const walkYaml = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const full = join(dir, e.name)
  return e.isDirectory() ? walkYaml(full) : (/\.ya?ml$/.test(e.name) ? [full] : [])
})
for (const file of walkYaml(colDir)) {
  const f = relative(colDir, file).replace(/\\/g, '/')
  let c
  try { c = yaml.load(readFileSync(file, 'utf-8')) }
  catch (e) { errors.push(`collections/${f}: YAML parse — ${e.message.split('\n')[0]}`); continue }
  const label = `collections/${typeof c?.slug === 'string' ? c.slug : f}`
  if (!Array.isArray(c?.patterns) || !c.patterns.length) { errors.push(`${label}: missing or empty 'patterns' member list`); continue }
  const seen = new Set()
  for (const m of c.patterns) {
    if (typeof m !== 'string' || !patternSlugs.has(m)) errors.push(`${label}: dangling member '${m}' — no pattern with that slug exists`)
    if (seen.has(m)) warns.push(`${label}: duplicate member '${m}'`)
    seen.add(m)
  }
}

console.log(`CI check: ${errors.length} error(s), ${warns.length} warning(s)`)
for (const e of errors) console.log('  ERROR ' + e)
if (process.env.CI_VERBOSE) for (const w of warns) console.log('  warn  ' + w)
process.exit(errors.length ? 1 : 0)

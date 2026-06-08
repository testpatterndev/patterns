// Usage: node scripts/verify-pattern-testcases.mjs <slug> [<slug> ...]
// Loads data/patterns/<slug>.yaml, collects every regex (top-level `pattern`
// plus purview.regexes[].pattern), and checks test_cases:
//   should_match    -> at least one regex matches the value
//   should_not_match -> NO regex matches the value
// Exits non-zero on any failure. Reports JS-incompatible regex as ENGINE-DIVERGENT.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

const ROOT = join(import.meta.dirname, '..')
let failures = 0

for (const slug of process.argv.slice(2)) {
  const file = join(ROOT, 'data', 'patterns', `${slug}.yaml`)
  let p
  try { p = yaml.load(readFileSync(file, 'utf-8')) }
  catch (e) { failures++; console.log(`  MISSING/UNREADABLE ${slug}: ${e.message}`); continue }
  const sources = []
  if (p.pattern) sources.push(p.pattern)
  for (const r of p.purview?.regexes ?? []) if (r.pattern) sources.push(r.pattern)
  const regexes = []
  let divergent = 0
  for (const src of sources) {
    // Strip a leading inline-flag group like (?i)/(?is)/(?s) (invalid in JS) and map to JS flags.
    // Case-insensitive is forced by repo convention; per-regex case-sensitivity is not modelled.
    let body = src
    let flags = 'i'
    const m = body.match(/^\(\?([ims]+)\)/)
    if (m) {
      body = body.slice(m[0].length)
      if (m[1].includes('s')) flags += 's'
      if (m[1].includes('m')) flags += 'm'
    }
    try { regexes.push(new RegExp(body, flags)) }
    catch (e) { divergent++; console.log(`  ENGINE-DIVERGENT ${slug}: ${e.message} :: ${src.slice(0, 60)}`) }
  }
  if ((p.test_cases?.should_match ?? []).length > 0 && regexes.length === 0) {
    failures++; console.log(`  FAIL ${slug}: no compilable regex (${divergent} ENGINE-DIVERGENT) — cannot validate should_match`)
  }
  const matchesAny = (v) => regexes.some((re) => re.test(v))
  for (const tc of p.test_cases?.should_match ?? []) {
    if (!matchesAny(tc.value)) { failures++; console.log(`  FAIL ${slug} should_match: ${JSON.stringify(tc.value).slice(0,80)}`) }
  }
  for (const tc of p.test_cases?.should_not_match ?? []) {
    if (matchesAny(tc.value)) { failures++; console.log(`  FAIL ${slug} should_not_match: ${JSON.stringify(tc.value).slice(0,80)}`) }
  }
  console.log(`  checked ${slug}: ${regexes.length} regex(es)`)
}
console.log(failures ? `\n${failures} failure(s)` : '\nall test_cases pass')
process.exit(failures ? 1 : 0)

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
  const p = yaml.load(readFileSync(file, 'utf-8'))
  const sources = []
  if (p.pattern) sources.push(p.pattern)
  for (const r of p.purview?.regexes ?? []) if (r.pattern) sources.push(r.pattern)
  const regexes = []
  for (const src of sources) {
    try { regexes.push(new RegExp(src, 'i')) }
    catch (e) { console.log(`  ENGINE-DIVERGENT ${slug}: ${e.message} :: ${src.slice(0, 60)}`) }
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

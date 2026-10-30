// CI gate: every regex in data/patterns and data/identifiers has exactly one capturing group,
// and that group wraps the reported match (scripts/lib/capture-groups.mjs explains why and
// what may sit outside it). Fails (exit 1) on any regex with 0 groups, 2+ groups, or a group
// around only part of the match. No exemptions.
// Usage: node scripts/check-capture-groups.mjs [--root <repo dir>]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { checkWholeMatchGroup, regexFields } from './lib/capture-groups.mjs'

const args = process.argv.slice(2)
const rootArg = args.indexOf('--root')
const ROOT = rootArg >= 0 ? args[rootArg + 1] : fileURLToPath(new URL('..', import.meta.url))

const errors = []
let checked = 0
for (const [dir, kind] of [['patterns', 'pattern'], ['identifiers', 'identifier']]) {
  const full = join(ROOT, 'data', dir)
  if (!existsSync(full)) continue
  for (const f of readdirSync(full).filter(f => f.endsWith('.yaml'))) {
    let doc
    try { doc = yaml.load(readFileSync(join(full, f), 'utf-8')) }
    catch (e) { errors.push(`${dir}/${f}: YAML parse — ${e.message.split('\n')[0]}`); continue }
    for (const { where, src } of regexFields(doc, kind)) {
      checked++
      const r = checkWholeMatchGroup(src)
      if (!r.ok) errors.push(`${doc?.slug ?? doc?.key ?? f}: ${where} — ${r.reason}`)
    }
  }
}

console.log(`Capture-group check: ${checked} regex(es), ${errors.length} error(s)`)
for (const e of errors) console.log('  ERROR ' + e)
process.exit(errors.length ? 1 : 0)

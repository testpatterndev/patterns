#!/usr/bin/env node
// Regenerate docs/identifiers.md from data/identifiers/*.yaml and the identifier-format
// customisation entries in data/patterns/. CI (scripts/ci-check.mjs) fails if the committed
// file differs from this output.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { loadIdentifiers, validateIdentifier, renderIdentifierDocs } from './lib/identifiers.mjs'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const identifiers = loadIdentifiers(join(BASE, 'data', 'identifiers'))
let bad = 0
for (const [k, d] of identifiers) for (const msg of validateIdentifier(d)) { bad++; console.error(`identifier ${k}: ${msg}`) }
if (bad) { console.error(`${bad} identifier definition error(s) — fix before generating docs`); process.exit(1) }

const usage = new Map()
for (const f of readdirSync(join(BASE, 'data', 'patterns')).filter((x) => x.endsWith('.yaml'))) {
  const p = yaml.load(readFileSync(join(BASE, 'data', 'patterns', f), 'utf-8'))
  if (!p || p.status === 'deprecated') continue
  for (const c of Array.isArray(p.customisation) ? p.customisation : []) {
    if (c?.kind === 'identifier-format' && c.identifier) {
      if (!usage.has(c.identifier)) usage.set(c.identifier, [])
      usage.get(c.identifier).push(p.slug)
    }
  }
}
writeFileSync(join(BASE, 'docs', 'identifiers.md'), renderIdentifierDocs(identifiers, usage))
console.log(`docs/identifiers.md: ${identifiers.size} identifier types, ${[...usage.values()].reduce((a, v) => a + v.length, 0)} classifier references`)

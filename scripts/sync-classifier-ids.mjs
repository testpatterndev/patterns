#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const PATTERNS_DIR = join(BASE, 'data', 'patterns')
const REGISTRY_PATH = join(BASE, 'data', 'classifier-ids.json')
const SCHEMA = 'testpattern.classifier-ids.v1'
const ID_PATTERN = /^TP-\d{5}$/
const checkOnly = process.argv.includes('--check')

function loadPatternSlugs() {
  const slugs = []
  for (const fileName of readdirSync(PATTERNS_DIR).filter(name => /\.ya?ml$/.test(name)).sort()) {
    const pattern = yaml.load(readFileSync(join(PATTERNS_DIR, fileName), 'utf8'))
    if (!pattern?.slug) throw new Error(`${fileName}: missing slug`)
    slugs.push(pattern.slug)
  }
  return [...new Set(slugs)].sort()
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return { schema: SCHEMA, nextNumber: 1, patterns: {} }
  }
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
  if (registry.schema !== SCHEMA || !registry.patterns || typeof registry.patterns !== 'object') {
    throw new Error(`Invalid registry at ${REGISTRY_PATH}`)
  }
  return registry
}

function validateExisting(registry) {
  const seen = new Map()
  let maximum = 0
  for (const [slug, classifierId] of Object.entries(registry.patterns)) {
    if (!ID_PATTERN.test(classifierId)) throw new Error(`${slug}: invalid classifier ID '${classifierId}'`)
    if (seen.has(classifierId)) throw new Error(`${slug}: classifier ID '${classifierId}' is already assigned to '${seen.get(classifierId)}'`)
    seen.set(classifierId, slug)
    maximum = Math.max(maximum, Number(classifierId.slice(3)))
  }
  if (!Number.isInteger(registry.nextNumber) || registry.nextNumber <= maximum || registry.nextNumber > 100000) {
    throw new Error(`nextNumber must be an integer greater than ${maximum} and no greater than 100000`)
  }
}

const slugs = loadPatternSlugs()
const registry = loadRegistry()
validateExisting(registry)

const missing = slugs.filter(slug => !registry.patterns[slug])
if (checkOnly) {
  if (missing.length) {
    console.error(`Classifier ID registry is missing ${missing.length} pattern(s): ${missing.slice(0, 20).join(', ')}`)
    process.exit(1)
  }
  console.log(`Classifier ID registry OK: ${slugs.length} active pattern(s), ${Object.keys(registry.patterns).length} retained assignment(s)`)
  process.exit(0)
}

for (const slug of missing) {
  if (registry.nextNumber > 99999) throw new Error('Classifier ID space exhausted at TP-99999')
  registry.patterns[slug] = `TP-${String(registry.nextNumber).padStart(5, '0')}`
  registry.nextNumber++
}

const ordered = Object.fromEntries(Object.entries(registry.patterns).sort(([a], [b]) => a.localeCompare(b)))
const output = { schema: SCHEMA, nextNumber: registry.nextNumber, patterns: ordered }
writeFileSync(REGISTRY_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
console.log(`Classifier ID registry updated: ${missing.length} allocated, ${Object.keys(ordered).length} retained assignment(s)`)

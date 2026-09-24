// Identifier type registry (testpattern/identifier-v1).
// Design: docs/superpowers/specs/2026-09-24-identifier-format-customisation-design.md
//
// Each file in data/identifiers/ documents ONE identifier type that classifiers may
// depend on: what it is, who issues it, the labels it appears under, whether its format
// is publicly verified, the public fallback regex, and how a customer replaces it.
// Classifiers reference these through `customisation` entries of kind `identifier-format`.
// The registry is the single source of truth for the generated docs/identifiers.md guide.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { purviewBanned } from './purview-banned.mjs'

export const IDENTIFIER_SCHEMA = 'testpattern/identifier-v1'
const KEY_RE = /^[a-z0-9-]{3,48}$/
const FORMAT_STATUS = new Set(['verified', 'partial', 'unpublished', 'customer-defined'])
const MODES = new Set(['extend', 'replace'])
const MIN_TEXT = 40

const nonEmptyList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.trim())
const longText = (v, n = MIN_TEXT) => typeof v === 'string' && v.trim().length >= n
const toJsRe = (src) => {
  let body = String(src).trim(), flags = ''
  const m = body.match(/^\(\?([ims]+)\)/)
  if (m) { body = body.slice(m[0].length); if (m[1].includes('i')) flags += 'i' }
  return new RegExp(body, flags)
}

export function loadIdentifiers(dir) {
  const out = new Map()
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort()) {
    let d
    try { d = yaml.load(readFileSync(join(dir, f), 'utf-8')) } catch (e) { out.set(f.replace(/\.yaml$/, ''), { __error: `YAML parse — ${e.message.split('\n')[0]}` }); continue }
    out.set(d?.key ?? f.replace(/\.yaml$/, ''), { ...d, __file: f })
  }
  return out
}

// Validate one identifier definition. Every field that a customer or reviewer needs to
// understand and replace the identifier is mandatory: missing documentation is an error.
export function validateIdentifier(d) {
  const errs = []
  if (d.__error) return [d.__error]
  if (d.schema !== IDENTIFIER_SCHEMA) errs.push(`schema must be ${IDENTIFIER_SCHEMA}`)
  if (!KEY_RE.test(String(d.key ?? ''))) errs.push('key must match [a-z0-9-]{3,48}')
  if (d.__file && d.__file !== `${d.key}.yaml`) errs.push(`file name must be ${d.key}.yaml`)
  for (const f of ['name', 'issuer']) if (typeof d[f] !== 'string' || !d[f].trim()) errs.push(`${f} is required`)
  if (!longText(d.description)) errs.push(`description must explain what the identifier identifies (>= ${MIN_TEXT} chars)`)
  if (!nonEmptyList(d.appears_in)) errs.push('appears_in must list the documents/systems where the identifier appears')
  if (!nonEmptyList(d.labels)) errs.push('labels must list the label text the identifier is printed under')

  const pf = d.public_format ?? {}
  if (!FORMAT_STATUS.has(pf.status)) errs.push('public_format.status must be verified|partial|unpublished|customer-defined')
  if (pf.status === 'verified' || pf.status === 'partial') {
    if (typeof pf.pattern !== 'string' || !pf.pattern.trim()) errs.push(`public_format.pattern is required when status is ${pf.status}`)
    if (typeof pf.source !== 'string' || !/^https?:\/\//.test(pf.source)) errs.push(`public_format.source (URL) is required when status is ${pf.status}`)
  }
  if (!longText(pf.notes, 20)) errs.push('public_format.notes must state what is and is not known about the format (>= 20 chars)')

  const fb = d.fallback ?? {}
  if (typeof fb.pattern !== 'string' || !fb.pattern.trim()) errs.push('fallback.pattern is required (the public regex used when no customer format is supplied)')
  else {
    for (const issue of purviewBanned(fb.pattern)) errs.push(`fallback.pattern Purview-banned construct — ${issue}`)
    try { toJsRe(fb.pattern) } catch (e) { errs.push(`fallback.pattern does not compile — ${e.message}`) }
  }
  if (!['low', 'medium', 'high'].includes(fb.precision)) errs.push('fallback.precision must be low|medium|high')
  if (!longText(fb.rationale)) errs.push(`fallback.rationale must explain why the fallback is as accurate as the evidence allows (>= ${MIN_TEXT} chars)`)
  if (!nonEmptyList(fb.samples)) errs.push('fallback.samples must list fictional values that the fallback matches')
  else if (typeof fb.pattern === 'string') {
    try { const re = toJsRe(fb.pattern); for (const s of fb.samples) if (!re.test(s)) errs.push(`fallback.samples value does not match fallback.pattern: ${JSON.stringify(s)}`) } catch { /* reported above */ }
  }

  const rp = d.replacement ?? {}
  if (!nonEmptyList(rp.customer_supplies)) errs.push('replacement.customer_supplies must list what the customer provides at engagement')
  if (!nonEmptyList(rp.steps)) errs.push('replacement.steps must describe how the identifier is replaced, step by step')
  if (!nonEmptyList(rp.validation)) errs.push('replacement.validation must list the checks a customer overlay must pass')
  const ex = rp.example_overlay
  if (!ex || typeof ex !== 'object') errs.push('replacement.example_overlay is required')
  else {
    if (typeof ex.pattern !== 'string' || !ex.pattern.trim()) errs.push('replacement.example_overlay.pattern is required')
    if (!nonEmptyList(ex.samples) || ex.samples.length < 3) errs.push('replacement.example_overlay.samples needs at least 3 fictional values')
    if (typeof ex.pattern === 'string' && nonEmptyList(ex.samples)) {
      try { const re = toJsRe(ex.pattern); for (const s of ex.samples) if (!re.test(s)) errs.push(`replacement.example_overlay sample does not match its pattern: ${JSON.stringify(s)}`) } catch (e) { errs.push(`replacement.example_overlay.pattern does not compile — ${e.message}`) }
      for (const issue of purviewBanned(ex.pattern)) errs.push(`replacement.example_overlay.pattern Purview-banned construct — ${issue}`)
    }
  }
  if (!longText(d.sensitivity, 20)) errs.push('sensitivity must describe why the identifier matters (>= 20 chars)')
  return errs
}

// Validate a pattern's identifier-format customisation entry against the registry.
export function validateIdentifierFormatEntry(doc, d, registry) {
  const errs = []
  const key = d.key
  const id = registry?.get?.(d.identifier)
  if (!d.identifier) errs.push(`customisation '${key}': identifier-format requires identifier: <key in data/identifiers/>`)
  else if (!id) errs.push(`customisation '${key}': unknown identifier '${d.identifier}' (add data/identifiers/${d.identifier}.yaml)`)
  else if (validateIdentifier(id).length) errs.push(`customisation '${key}': identifier '${d.identifier}' definition is incomplete — fix data/identifiers/${d.identifier}.yaml`)
  if (!MODES.has(d.mode)) errs.push(`customisation '${key}': mode must be extend|replace`)
  if ('fallback' in d) errs.push(`customisation '${key}': identifier-format has no fallback field — the target regex in the file IS the public fallback`)
  const m = String(d.target ?? '').match(/^purview\.regexes\/([A-Za-z0-9_]+)$/)
  const regex = m && (doc.purview?.regexes ?? []).find((r) => (r.id ?? r.name) === m[1])
  if (!m || !regex) { errs.push(`customisation '${key}': target must be purview.regexes/<existing-regex-id>`); return errs }
  // Tiers that positively reference the target regex (as primary or evidence).
  const uses = new Set()
  for (const t of doc.purview?.pattern_tiers ?? []) {
    const im = t.id_match
    const prim = typeof im === 'string' ? [im] : (im?.ids ?? [])
    let used = prim.includes(m[1])
    for (const n of t.matches ?? []) {
      const isNot = n?.min_matches === 0 && n?.max_matches === 0
      if (!isNot && (n?.ref === m[1] || (Array.isArray(n?.refs) && n.refs.includes(m[1])))) used = true
    }
    if (used) uses.add(t.confidence_level)
  }
  if (!uses.size) errs.push(`customisation '${key}': target regex '${m[1]}' is not used by any tier`)
  const declared = Array.isArray(d.affects_tiers) ? d.affects_tiers : null
  if (!declared || !declared.length) errs.push(`customisation '${key}': affects_tiers must list the tiers that use the target regex (${[...uses].sort().join(', ')})`)
  else {
    const want = [...uses].sort().join(',')
    const got = [...declared].sort().join(',')
    if (want !== got) errs.push(`customisation '${key}': affects_tiers [${got}] must equal the tiers that use '${m[1]}' [${want}]`)
  }
  // An unpublished / customer-defined identifier cannot silently carry an enforce tier on a
  // format regex: the in-file target must be the documented label-anchored fallback, or the
  // tier must require customisation.
  if (id && (id.public_format?.status === 'unpublished' || id.public_format?.status === 'customer-defined')) {
    const inFile = String(regex.pattern).trim()
    const fbPat = String(id.fallback?.pattern ?? '').trim()
    const enforce = [...uses].some((l) => l >= 75)
    if (enforce && d.required_for_enforcement === false && inFile !== fbPat && d.mode === 'replace') {
      errs.push(`customisation '${key}': target regex differs from the documented fallback for unpublished identifier '${d.identifier}' — use the registry fallback.pattern or set required_for_enforcement: true`)
    }
  }
  return errs
}

// Human-readable guide generated from the registry (docs/identifiers.md).
export function renderIdentifierDocs(registry, usage = new Map()) {
  const L = []
  L.push('# Identifier types', '')
  L.push('> Generated by `npm run build-identifier-docs` from `data/identifiers/*.yaml`. Do not edit by hand — CI fails if this file is stale.', '')
  L.push('Classifiers that depend on an organisation-specific or unpublished identifier declare a `customisation` entry of kind `identifier-format`. The public catalogue ships the documented **fallback** regex; a customer deployment replaces or extends it with the real format using the steps below.', '')
  L.push('| Identifier | Issuer | Public format | Fallback precision | Classifiers |', '|---|---|---|---|---|')
  for (const [k, d] of [...registry].sort()) L.push(`| [${d.name}](#${k}) | ${d.issuer} | ${d.public_format?.status} | ${d.fallback?.precision} | ${(usage.get(k) ?? []).length} |`)
  L.push('')
  for (const [k, d] of [...registry].sort()) {
    L.push(`## ${k}`, '', `**${d.name}** — issued by ${d.issuer}.`, '', String(d.description).trim(), '')
    L.push(`**Appears in:** ${d.appears_in.join('; ')}.`, '')
    L.push(`**Labels:** ${d.labels.map((l) => `\`${l}\``).join(', ')}`, '')
    L.push(`**Public format:** ${d.public_format.status}${d.public_format.pattern ? ` — \`${d.public_format.pattern}\`` : ''}${d.public_format.source ? ` ([source](${d.public_format.source}))` : ''}. ${String(d.public_format.notes).trim()}`, '')
    L.push(`**Public fallback** (precision: ${d.fallback.precision}):`, '', '```', d.fallback.pattern, '```', '', String(d.fallback.rationale).trim(), '')
    L.push('**Customer supplies at engagement:**', '', ...d.replacement.customer_supplies.map((s) => `- ${s}`), '')
    L.push('**How to replace:**', '', ...d.replacement.steps.map((s, i) => `${i + 1}. ${s}`), '')
    L.push('**Overlay must pass:**', '', ...d.replacement.validation.map((s) => `- ${s}`), '')
    L.push('**Example overlay (fictional):**', '', '```yaml', `pattern: ${d.replacement.example_overlay.pattern}`, `samples: [${d.replacement.example_overlay.samples.map((s) => JSON.stringify(s)).join(', ')}]`, '```', '')
    L.push(`**Sensitivity:** ${String(d.sensitivity).trim()}`, '')
    const used = usage.get(k) ?? []
    L.push(`**Used by:** ${used.length ? used.map((u) => `\`${u}\``).join(', ') : '_no classifiers yet_'}`, '')
  }
  return L.join('\n')
}

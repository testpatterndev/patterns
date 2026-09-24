// Customisation placeholders (testpattern/v1 extension).
// Design: docs/superpowers/specs/2026-07-25-customisation-placeholders-design.md
// Four kinds: dictionary-subset (full public dictionary IS the fallback),
// keyword-set (in-file fictional terms ARE the fallback), value ({{CUSTOMISE:key}}
// tokens substituted with the declared fallback string at compile time), and
// identifier-format (v2: a whole target regex is the public fallback for a documented
// identifier type in data/identifiers/; the deployment overlay extends or replaces it —
// design: docs/superpowers/specs/2026-09-24-identifier-format-customisation-design.md).

import { validateIdentifierFormatEntry } from './identifiers.mjs'

export const TOKEN_LITERAL = '{{CUSTOMISE:'
const TOKEN_RE = /\{\{CUSTOMISE:([a-z0-9-]{3,40})\}\}/g
const KEY_RE = /^[a-z0-9-]{3,40}$/
const KINDS = new Set(['dictionary-subset', 'keyword-set', 'value', 'identifier-format'])
const MIN_NOTE = 40

const termText = (t) => (typeof t === 'string' ? t : String(t?.text ?? ''))

// Permitted token sites. visit(text) is called once per keyword term string.
function visitTokenSites(doc, isDictionary, visit) {
  if (isDictionary) {
    for (const t of doc.keywords ?? []) visit(termText(t))
    return
  }
  for (const k of doc.corroborative_evidence?.keywords ?? []) visit(String(k))
  for (const kw of doc.purview?.keywords ?? [])
    for (const g of kw.groups ?? [])
      for (const t of g.terms ?? []) visit(termText(t))
}

function tokensInPermittedSites(doc, isDictionary) {
  const found = []
  visitTokenSites(doc, isDictionary, (text) => {
    for (const m of text.matchAll(TOKEN_RE)) found.push(m[1])
  })
  return found
}

export function validateCustomisations(doc, { kwSlugs = new Set(), isDictionary = false, identifiers = null } = {}) {
  const errs = []
  const raw = doc.customisation
  if (raw != null && !Array.isArray(raw)) return ['customisation must be a list']
  const decls = raw ?? []
  const byKey = new Map()

  for (const d of decls) {
    if (!d || typeof d !== 'object') { errs.push('customisation entries must be objects'); continue }
    const key = String(d.key ?? '')
    if (!KEY_RE.test(key)) errs.push(`customisation key '${key}' must match [a-z0-9-]{3,40}`)
    if (byKey.has(key)) errs.push(`duplicate customisation key '${key}'`)
    byKey.set(key, d)
    if (!KINDS.has(d.kind)) errs.push(`customisation '${key}': kind must be dictionary-subset|keyword-set|value|identifier-format`)
    if (typeof d.note !== 'string' || d.note.trim().length < MIN_NOTE) errs.push(`customisation '${key}': note must explain the localisation (>= ${MIN_NOTE} chars)`)
    if (typeof d.required_for_enforcement !== 'boolean') errs.push(`customisation '${key}': required_for_enforcement must be boolean`)

    if (d.kind === 'identifier-format') {
      if (isDictionary) { errs.push(`customisation '${key}': identifier-format is only valid on patterns`); continue }
      errs.push(...validateIdentifierFormatEntry(doc, d, identifiers ?? new Map()))
      continue
    }

    if (d.kind === 'value') {
      if (typeof d.fallback !== 'string' || !d.fallback.trim()) errs.push(`customisation '${key}': value kind requires a non-empty string fallback`)
      if ('target' in d) errs.push(`customisation '${key}': value kind locates via {{CUSTOMISE:${key}}} tokens, not target`)
    } else if ('fallback' in d) {
      errs.push(`customisation '${key}': fallback is only valid for the value kind (keyword-set uses the in-file terms as fallback; dictionary-subset uses the full public dictionary)`)
    }

    if (isDictionary) {
      if (d.kind === 'keyword-set') errs.push(`customisation '${key}': dictionaries support dictionary-subset and value kinds only`)
      if (d.kind === 'dictionary-subset' && 'target' in d) errs.push(`customisation '${key}': target is implicit on a dictionary file`)
      continue
    }

    if (d.kind === 'dictionary-subset') {
      const m = String(d.target ?? '').match(/^corroborative_evidence\.keyword_lists\/([a-z0-9-]+)$/)
      if (!m) { errs.push(`customisation '${key}': dictionary-subset target must be corroborative_evidence.keyword_lists/<slug>`); continue }
      if (!(doc.corroborative_evidence?.keyword_lists ?? []).includes(m[1])) errs.push(`customisation '${key}': pattern does not reference keyword_list '${m[1]}'`)
      else if (kwSlugs.size && !kwSlugs.has(m[1])) errs.push(`customisation '${key}': unknown keyword_list '${m[1]}'`)
    } else if (d.kind === 'keyword-set') {
      const target = String(d.target ?? '')
      if (target === 'corroborative_evidence.keywords') {
        if (!(doc.corroborative_evidence?.keywords ?? []).length) errs.push(`customisation '${key}': corroborative_evidence.keywords must carry fallback terms`)
      } else {
        const m = target.match(/^purview\.keywords\/([A-Za-z0-9_]+)$/)
        const group = m && (doc.purview?.keywords ?? []).find((k) => k.id === m[1])
        if (!m || !group) { errs.push(`customisation '${key}': keyword-set target '${target}' must be corroborative_evidence.keywords or purview.keywords/<existing-group-id> (checked: ${m ? m[1] : target})`); continue }
        if (!(group.groups ?? []).some((g) => (g.terms ?? []).length)) errs.push(`customisation '${key}': keyword-set group '${m[1]}' must carry in-file fallback terms`)
        // Load-bearing check: a positive (non-NOT) reference at >=75 with
        // required_for_enforcement false means the fictional fallback would
        // silently carry an enforce tier — force the author to pick a side.
        if (d.required_for_enforcement === false) {
          for (const tier of doc.purview?.pattern_tiers ?? []) {
            if ((tier.confidence_level ?? 0) < 75) continue
            for (const node of tier.matches ?? []) {
              const isNot = node?.min_matches === 0 && node?.max_matches === 0
              const carries = node?.ref === m[1] || (Array.isArray(node?.refs) && node.refs.includes(m[1]))
              if (carries && !isNot) errs.push(`customisation '${key}': group '${m[1]}' is load-bearing at tier ${tier.confidence_level} — set required_for_enforcement: true or remove it from the tier`)
            }
          }
        }
      }
    }
  }

  const siteTokens = tokensInPermittedSites(doc, isDictionary)
  for (const key of siteTokens) {
    const d = byKey.get(key)
    if (!d) errs.push(`token {{CUSTOMISE:${key}}} has no customisation declaration`)
    else if (d.kind !== 'value') errs.push(`token {{CUSTOMISE:${key}}} may only reference a value-kind declaration`)
  }
  for (const [key, d] of byKey) {
    if (d.kind === 'value' && !siteTokens.includes(key)) errs.push(`customisation '${key}': no {{CUSTOMISE:${key}}} token references it`)
  }

  // Stray-token gate: tokens anywhere in the document outside the permitted
  // keyword sites (descriptions, regexes, test cases, notes...) are errors.
  const total = (JSON.stringify(doc).match(/\{\{CUSTOMISE:/g) ?? []).length
  if (total !== siteTokens.length) errs.push(`{{CUSTOMISE:*}} token found outside permitted keyword locations (${total} in document, ${siteTokens.length} in permitted sites)`)

  return errs
}

export function resolveCustomisationFallbacks(doc, isDictionary = false) {
  const decls = Array.isArray(doc.customisation) ? doc.customisation : []
  const values = new Map(decls.filter((d) => d?.kind === 'value' && typeof d.fallback === 'string').map((d) => [d.key, d.fallback]))
  const out = JSON.parse(JSON.stringify(doc))
  if (!values.size) return out
  const sub = (s) => String(s).replace(TOKEN_RE, (whole, key) => (values.has(key) ? values.get(key) : whole))
  const mapTerm = (t) => (typeof t === 'string' ? sub(t) : { ...t, text: sub(t?.text ?? '') })
  if (isDictionary) {
    if (Array.isArray(out.keywords)) out.keywords = out.keywords.map(mapTerm)
    return out
  }
  if (Array.isArray(out.corroborative_evidence?.keywords)) out.corroborative_evidence.keywords = out.corroborative_evidence.keywords.map((k) => sub(k))
  for (const kw of out.purview?.keywords ?? []) for (const g of kw.groups ?? []) if (Array.isArray(g.terms)) g.terms = g.terms.map(mapTerm)
  return out
}

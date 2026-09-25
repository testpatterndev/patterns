// Content every active pattern must carry for SIT-Reference: the classification reasoning
// (docs/SIT-QUALITY-BAR.md, "Classification reasoning") and titled references.
// PurviewDeploy regenerates SIT-Reference from these fields, so a gap here is a blank or
// misleading cell in every customer workbook.

export const TIERS = ['Low', 'Medium', 'High', 'Alert']
export const GENERIC_CLASSIFICATIONS = ['Low', 'Medium', 'High', 'N/A']
const MIN_RATIONALE = 80

const text = v => (typeof v === 'string' ? v.trim() : '')

export function validateClassification(p) {
  const out = []
  const c = p.classification
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['classification block is required (tier, rationale, generic)']
  if (!TIERS.includes(c.tier)) out.push(`classification.tier must be ${TIERS.join('|')}, got '${c.tier}'`)
  if (text(c.rationale).length < MIN_RATIONALE) out.push(`classification.rationale must explain the classification (>= ${MIN_RATIONALE} chars)`)
  const g = c.generic
  if (!g || typeof g !== 'object') {
    out.push('classification.generic is required (classification, dlm, rationale)')
  } else {
    if (!GENERIC_CLASSIFICATIONS.includes(g.classification)) out.push(`classification.generic.classification must be ${GENERIC_CLASSIFICATIONS.join('|')}, got '${g.classification}'`)
    if (!text(g.dlm)) out.push('classification.generic.dlm is required')
    if (!text(g.rationale)) out.push('classification.generic.rationale is required')
    const expected = g.classification === 'N/A' ? 'Alert' : g.classification
    if (TIERS.includes(c.tier) && GENERIC_CLASSIFICATIONS.includes(g.classification) && c.tier !== expected)
      out.push(`classification.tier '${c.tier}' must equal the generic classification ('${expected}')`)
  }
  // A rationale that opens by stating a different risk than the pattern carries is stale
  // (house style opens "Risk N ..."; later mentions such as "the next higher risk 10" are fine).
  const opening = text(c.rationale).match(/^Risk (\d{1,2})\b/)
  if (opening && Number(opening[1]) !== Number(p.risk_rating))
    out.push(`classification.rationale opens with risk ${opening[1]} but risk_rating is ${p.risk_rating} — rewrite it with the rating`)
  return out
}

export function validateReferences(p) {
  const refs = p.references
  if (!Array.isArray(refs) || !refs.length) return ['references must list at least one authoritative source']
  const out = []
  refs.forEach((r, i) => {
    if (!r || typeof r !== 'object') { out.push(`references[${i}] must be {title, url}, got ${JSON.stringify(r).slice(0, 60)}`); return }
    if (!text(r.title)) out.push(`references[${i}].title is required`)
    if (!/^https?:\/\/\S+$/.test(text(r.url))) out.push(`references[${i}].url must be an http(s) URL`)
  })
  return out
}

export function validateRegulations(p) {
  const regs = Array.isArray(p.regulations) ? p.regulations.filter(r => typeof r === 'string' && r.trim()) : []
  return regs.length ? [] : ['regulations must name at least one binding law (frameworks such as PCI-DSS or NIST belong in frameworks)']
}

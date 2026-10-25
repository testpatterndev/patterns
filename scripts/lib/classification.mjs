// Content every active pattern must carry for SIT-Reference: the classification reasoning
// (docs/SIT-QUALITY-BAR.md, "Classification reasoning") and titled references.
// PurviewDeploy regenerates SIT-Reference from these fields, so a gap here is a blank or
// misleading cell in every customer workbook.

export const TIERS = ['Low', 'Medium', 'High', 'Alert']
export const GENERIC_CLASSIFICATIONS = ['Low', 'Medium', 'High', 'N/A']
const MIN_RATIONALE = 80

const text = v => (typeof v === 'string' ? v.trim() : '')

// Handling tier for a qgiscf_dlm: OFFICIAL -> Low, SENSITIVE -> Medium, PROTECTED -> High,
// N/A -> Alert (markings by their level). Null when the label is missing or unrecognised.
export function tierForLabel(dlm) {
  const d = text(dlm)
  if (!d) return null
  if (d === 'N/A') return 'Alert'
  if (/^(PROTECTED|Marking Protected)\b/.test(d)) return 'High'
  if (/^(SENSITIVE|Marking Sensitive)\b/.test(d)) return 'Medium'
  if (/^(OFFICIAL|Marking Official)\b/.test(d)) return 'Low'
  return null
}

// IDCF (docs/IDCF-CROSSWALK.md): the Data Security Level follows qgiscf_dlm, falling back to
// qgiscf then pspf when the DLM is absent; the marker comes only from the DLM's domain suffix.
export const IDCF_LEVELS = ['DSL-0', 'DSL-2', 'DSL-3', 'DSL-4', 'N/A']
export const IDCF_MARKERS = ['Personal Privacy', 'Legal Privilege', 'Confidential']
const IDCF_MARKER_BY_SUFFIX = { 'Personal-Privacy': 'Personal Privacy', Legal: 'Legal Privilege', 'Commercial-in-Confidence': 'Confidential' }

function idcfForLevel(label) {
  const d = text(label)
  if (!d) return null
  if (d === 'N/A' || d === 'Marking PSPF') return 'N/A'
  if (d === 'PUBLIC') return 'DSL-0'
  if (/^(PROTECTED|Marking Protected)\b/.test(d)) return 'DSL-4'
  if (/^(SENSITIVE|Marking Sensitive|OFFICIAL: Sensitive)\b/.test(d)) return 'DSL-3'
  if (/^(OFFICIAL|Marking Official)\b/.test(d)) return 'DSL-2'
  return null
}

// { idcf, idcf_marker } for a sensitivity_labels object. idcf is null when nothing derives it;
// idcf_marker is undefined when the DLM carries no mapped suffix.
export function idcfForLabels(labels) {
  const l = labels && typeof labels === 'object' ? labels : {}
  const dlm = text(l.qgiscf_dlm)
  const idcf = idcfForLevel(dlm || text(l.qgiscf) || text(l.pspf))
  const idcf_marker = IDCF_MARKER_BY_SUFFIX[dlm.match(/^(?:SENSITIVE|PROTECTED) (.+)$/)?.[1]]
  return { idcf, idcf_marker }
}

export function validateIdcf(p) {
  const l = p.sensitivity_labels
  const { idcf, idcf_marker } = idcfForLabels(l)
  if (!idcf) return []
  const basis = ['qgiscf_dlm', 'qgiscf', 'pspf'].find(k => text(l[k]))
  const fix = `— rerun node scripts/backfill-idcf-labels.mjs`
  const out = []
  if (l.idcf !== idcf)
    out.push(`sensitivity_labels.idcf ${l.idcf === undefined ? 'is missing' : `'${l.idcf}' does not match`} ${basis} '${l[basis]}' (expected '${idcf}') ${fix}`)
  if (l.idcf_marker !== idcf_marker)
    out.push(`sensitivity_labels.idcf_marker ${l.idcf_marker === undefined ? 'is missing' : `'${l.idcf_marker}' does not match`} qgiscf_dlm '${l.qgiscf_dlm}' (expected ${idcf_marker ? `'${idcf_marker}'` : 'none'}) ${fix}`)
  return out
}

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
  // The tier follows the label: a relabel that leaves the tier behind leaves stale reasoning.
  const expected = tierForLabel(p.sensitivity_labels?.qgiscf_dlm)
  if (expected && TIERS.includes(c.tier) && c.tier !== expected)
    out.push(`classification.tier '${c.tier}' does not match qgiscf_dlm '${p.sensitivity_labels.qgiscf_dlm}' (expected '${expected}') — rewrite the classification block with the label`)
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

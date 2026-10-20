// Package blocks (data/blocks/*.json): named, non-overlapping groups of patterns by domain and
// layer. PurviewDeploy package recipes are built from them (whole blocks, plus single-SIT
// includes and excludes), so every SIT in a package traces back to exactly one block.
// See data/blocks/README.md.

export const BLOCK_SCHEMA = 'testpattern.block.v1'
export const BLOCK_LAYERS = ['core', 'queensland-government', 'sector', 'extended', 'optional']
export const BLOCK_DOMAINS = ['privacy', 'workforce', 'education', 'finance', 'health', 'legal', 'government', 'business',
  'security-ops', 'credentials', 'ai', 'critical-infrastructure', 'council']
const ID = /^[a-z][a-z0-9-]*$/

// blocks: Map<file, parsed JSON>; activeSlugs / deprecatedSlugs: Set<string>
export function validateBlocks(blocks, activeSlugs, deprecatedSlugs) {
  const errors = []
  const owner = new Map()
  for (const [file, b] of blocks) {
    const at = `data/blocks/${file}`
    if (!b || typeof b !== 'object' || Array.isArray(b)) { errors.push(`${at}: must be a JSON object`); continue }
    if (b.schema !== BLOCK_SCHEMA) errors.push(`${at}: schema must be ${BLOCK_SCHEMA}`)
    if (typeof b.id !== 'string' || !ID.test(b.id)) errors.push(`${at}: id must be kebab-case`)
    else if (`${b.id}.json` !== file) errors.push(`${at}: file name must be ${b.id}.json`)
    if (!BLOCK_DOMAINS.includes(b.domain)) errors.push(`${at}: domain must be one of ${BLOCK_DOMAINS.join('|')}, got '${b.domain}'`)
    if (!BLOCK_LAYERS.includes(b.layer)) errors.push(`${at}: layer must be one of ${BLOCK_LAYERS.join('|')}, got '${b.layer}'`)
    for (const k of ['name', 'description']) if (typeof b[k] !== 'string' || !b[k].trim()) errors.push(`${at}: ${k} is required`)
    if (!Array.isArray(b.patterns) || !b.patterns.length) { errors.push(`${at}: patterns must list at least one slug`); continue }
    for (const s of b.patterns) {
      if (deprecatedSlugs.has(s)) errors.push(`${at}: '${s}' is deprecated — move the block to its replaced_by pattern`)
      else if (!activeSlugs.has(s)) errors.push(`${at}: unknown pattern '${s}'`)
      if (owner.has(s) && owner.get(s) !== b.id) errors.push(`${at}: '${s}' is also in block '${owner.get(s)}' — blocks must not overlap`)
      else owner.set(s, b.id)
    }
    if (new Set(b.patterns).size !== b.patterns.length) errors.push(`${at}: patterns lists a slug twice`)
  }
  // An optional block holds the lower-priority members of one source block: it is named
  // <source>-optional and shares the source block's domain. Full packages take both; lean
  // packages take only the source block.
  const byId = new Map([...blocks.values()].filter(b => b && typeof b.id === 'string').map(b => [b.id, b]))
  for (const [file, b] of blocks) {
    if (!b || typeof b !== 'object' || (b.layer !== 'optional' && !String(b.id || '').endsWith('-optional'))) continue
    const at = `data/blocks/${file}`
    if (b.layer !== 'optional') { errors.push(`${at}: a block named *-optional must have layer 'optional'`); continue }
    if (!String(b.id || '').endsWith('-optional')) { errors.push(`${at}: an optional block must be named <source block>-optional`); continue }
    const source = byId.get(b.id.slice(0, -'-optional'.length))
    if (!source || source.layer === 'optional') errors.push(`${at}: no source block '${b.id.slice(0, -'-optional'.length)}' for this optional block`)
    else if (source.domain !== b.domain) errors.push(`${at}: domain must match its source block '${source.id}' (${source.domain})`)
  }
  return errors
}

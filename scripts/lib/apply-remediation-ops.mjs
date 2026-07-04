#!/usr/bin/env node
//
// Applies the structured ops manifest produced by
// `remediate-catalog-quality.mjs --ops=<file>` to pattern/keyword-dictionary
// YAML files, either as a line-based text edit (byte-fidelity for every
// untouched line) or as a structural object edit (used as the independent
// correctness oracle for the text edit).
//
// Exports: applyOpsToText(text, ops), applyOpsToObject(parsedObj, ops).
// CLI: node scripts/lib/apply-remediation-ops.mjs <ops.json> [--write]
// (dry-run by default; aborts before writing ANYTHING if any file fails
// either correctness oracle).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import {
  detectEol,
  splitLines,
  joinLines,
  leadingSpaces,
  blockEnd,
  findTopLevelKeyLine,
  findKeyLineInRange,
  detectItemIndent,
  listItemSpans,
  encodeScalar
} from './yaml-line-nav.mjs'

// ============================================================================
// applyOpsToObject — structural (JS-object) application. Independent of the
// line-based text editor below; used as the "expected" oracle it is checked
// against.
// ============================================================================

export function applyOpsToObject(parsedObj, ops) {
  const obj = structuredClone(parsedObj)
  for (const op of ops) {
    applyOneOpToObject(obj, op)
  }
  return obj
}

function applyOneOpToObject(obj, op) {
  switch (op.op) {
    case 'set_keyword_strength': {
      const kw = keywordAt(obj, op.keywordIndex)
      kw.strength = op.value
      return
    }
    case 'set_tier_confidence_level': {
      const tier = requireTier(obj, op.tierIndex)
      delete tier.confidence
      tier.confidence_level = op.newValue
      return
    }
    case 'add_tier_field': {
      const tier = requireTier(obj, op.tierIndex)
      tier[op.field] = op.value
      return
    }
    case 'set_tier_id_match': {
      const tier = requireTier(obj, op.tierIndex)
      tier.id_match = op.newValue
      return
    }
    case 'set_tier_order': {
      const tiers = obj.purview.pattern_tiers
      obj.purview.pattern_tiers = op.finalOrder.map(i => tiers[i])
      return
    }
    case 'set_recommended_confidence': {
      obj.purview.recommended_confidence = op.newValue
      return
    }
    case 'set_pattern_confidence': {
      obj.confidence = op.newValue
      return
    }
    case 'convert_term_to_object': {
      const terms = termsArrayFor(obj, op)
      terms[op.termIndex] = { text: op.text, case_sensitive: true }
      return
    }
    case 'set_term_case_sensitive': {
      const terms = termsArrayFor(obj, op)
      const current = terms[op.termIndex]
      terms[op.termIndex] = { ...current, case_sensitive: true }
      return
    }
    case 'set_remediation_metadata': {
      obj.remediation = {
        ...(obj.remediation || {}),
        catalog_quality_2026_06_02: { status: 'applied', changes: op.notes }
      }
      return
    }
    case 'set_updated': {
      obj.updated = op.newValue
      return
    }
    default:
      throw new Error(`applyOpsToObject: unknown op type '${op.op}'`)
  }
}

function keywordAt(obj, keywordIndex) {
  const kw = obj.purview?.keywords?.[keywordIndex]
  if (!kw) throw new Error(`purview.keywords[${keywordIndex}] not found`)
  return kw
}

function requireTier(obj, tierIndex) {
  const tier = obj.purview?.pattern_tiers?.[tierIndex]
  if (!tier) throw new Error(`pattern_tiers[${tierIndex}] not found`)
  return tier
}

function termsArrayFor(obj, op) {
  if (op.keywordIndex !== undefined) {
    const kw = keywordAt(obj, op.keywordIndex)
    return kw.groups[op.groupIndex].terms
  }
  return obj.keywords
}

// ============================================================================
// applyOpsToText — line-based text application, byte-fidelity for untouched
// lines, preserving the file's original line-ending style.
// ============================================================================

const TIER_OP_TYPES = new Set(['set_tier_confidence_level', 'add_tier_field', 'set_tier_id_match', 'set_tier_order'])

export function applyOpsToText(text, ops) {
  const eol = detectEol(text)
  const { lines, hasTrailingNewline } = splitLines(text)

  const tierOps = ops.filter(op => TIER_OP_TYPES.has(op.op))
  const otherOps = ops.filter(op => !TIER_OP_TYPES.has(op.op))

  const edits = []
  if (tierOps.length) edits.push(buildTierEdit(lines, tierOps))
  for (const op of otherOps) edits.push(buildSimpleEdit(lines, op))

  return reconstruct(lines, edits, eol, hasTrailingNewline)
}

function reconstruct(lines, edits, eol, hasTrailingNewline) {
  const sorted = edits.slice().sort((a, b) => a.start - b.start)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new Error(`overlapping edits at line ${sorted[i].start}`)
    }
  }
  const out = []
  let cursor = 0
  for (const edit of sorted) {
    out.push(...lines.slice(cursor, edit.start))
    out.push(...edit.replacement)
    cursor = edit.end
  }
  out.push(...lines.slice(cursor))
  return joinLines(out, eol, hasTrailingNewline)
}

// --- purview navigation helpers ---------------------------------------------

function purviewBody(lines) {
  const purviewLine = findTopLevelKeyLine(lines, 'purview')
  if (purviewLine === -1) throw new Error('purview: key not found at top level')
  const end = blockEnd(lines, purviewLine + 1, 0)
  return { start: purviewLine + 1, end }
}

function findKeywordItemSpan(lines, keywordIndex) {
  const { start: pStart, end: pEnd } = purviewBody(lines)
  const kwKey = findKeyLineInRange(lines, pStart, pEnd, 'keywords', 2)
  if (!kwKey) throw new Error('keywords: not found under purview')
  const bodyStart = kwKey.index + 1
  const bodyEnd = blockEnd(lines, bodyStart, 2)
  const spans = listItemSpans(lines, bodyStart, bodyEnd, 4)
  const span = spans[keywordIndex]
  if (!span) throw new Error(`purview.keywords[${keywordIndex}] not found in text`)
  return span
}

function findTermsBodySpanForPattern(lines, keywordIndex, groupIndex) {
  const [kwStart, kwEnd] = findKeywordItemSpan(lines, keywordIndex)
  const groupsKey = findKeyLineInRange(lines, kwStart, kwEnd, 'groups', 6)
  if (!groupsKey) throw new Error(`groups: not found in purview.keywords[${keywordIndex}]`)
  const groupsBodyStart = groupsKey.index + 1
  const groupsBodyEnd = blockEnd(lines, groupsBodyStart, 6)
  const groupSpans = listItemSpans(lines, groupsBodyStart, groupsBodyEnd, 8)
  const groupSpan = groupSpans[groupIndex]
  if (!groupSpan) throw new Error(`groups[${groupIndex}] not found in purview.keywords[${keywordIndex}]`)
  const [gs, ge] = groupSpan
  const termsKey = findKeyLineInRange(lines, gs, ge, 'terms', 10)
  if (!termsKey) throw new Error(`terms: not found in purview.keywords[${keywordIndex}].groups[${groupIndex}]`)
  const termsBodyStart = termsKey.index + 1
  const termsBodyEnd = blockEnd(lines, termsBodyStart, 10)
  return { termsBodyStart, termsBodyEnd, itemIndent: 12 }
}

function findTermsBodySpanForDictionary(lines) {
  const kwKeyIdx = findTopLevelKeyLine(lines, 'keywords')
  if (kwKeyIdx === -1) throw new Error('keywords: not found at top level')
  const termsBodyStart = kwKeyIdx + 1
  const termsBodyEnd = blockEnd(lines, termsBodyStart, 0)
  // Keyword dictionaries are NOT consistently indented: most use the
  // js-yaml-dump convention (`keywords:\n  - term`, indent 2), but some
  // hand-authored ones are flush-left (`keywords:\n- term`, indent 0).
  const itemIndent = detectItemIndent(lines, termsBodyStart, termsBodyEnd)
  if (itemIndent === null) throw new Error('keywords: list has no items')
  return { termsBodyStart, termsBodyEnd, itemIndent }
}

// --- tier block editing ------------------------------------------------------

function buildTierEdit(lines, tierOps) {
  const { start: pStart, end: pEnd } = purviewBody(lines)
  const tiersKey = findKeyLineInRange(lines, pStart, pEnd, 'pattern_tiers', 2)
  if (!tiersKey) throw new Error('pattern_tiers: not found under purview')
  const tiersBodyStart = tiersKey.index + 1
  const tiersBodyEnd = blockEnd(lines, tiersBodyStart, 2)
  const itemIndent = 4
  const spans = listItemSpans(lines, tiersBodyStart, tiersBodyEnd, itemIndent)

  const fieldOpsByIndex = new Map()
  let orderOp = null
  for (const op of tierOps) {
    if (op.op === 'set_tier_order') {
      orderOp = op
      continue
    }
    if (!fieldOpsByIndex.has(op.tierIndex)) fieldOpsByIndex.set(op.tierIndex, [])
    fieldOpsByIndex.get(op.tierIndex).push(op)
  }

  const editedBlocks = spans.map(([s, e], idx) => {
    let block = lines.slice(s, e)
    for (const op of fieldOpsByIndex.get(idx) || []) {
      block = applyTierFieldOp(block, itemIndent, op)
    }
    return block
  })

  const finalOrder = orderOp ? orderOp.finalOrder : spans.map((_, i) => i)
  const newBody = finalOrder.flatMap(i => {
    if (!editedBlocks[i]) throw new Error(`set_tier_order references unknown tierIndex ${i}`)
    return editedBlocks[i]
  })

  return { start: tiersBodyStart, end: tiersBodyEnd, replacement: newBody }
}

function applyTierFieldOp(block, itemIndent, op) {
  const fieldIndent = itemIndent + 2
  if (op.op === 'set_tier_confidence_level') {
    const found = findKeyLineInRange(block, 0, block.length, op.oldField, fieldIndent)
    if (!found) throw new Error(`tier field '${op.oldField}' not found for set_tier_confidence_level`)
    const next = block.slice()
    next[found.index] = found.prefix + 'confidence_level: ' + encodeScalar(op.newValue)
    return next
  }
  if (op.op === 'add_tier_field') {
    const clFound = findKeyLineInRange(block, 0, block.length, 'confidence_level', fieldIndent)
    const insertAt = clFound ? clFound.index + 1 : 1
    const newLine = ' '.repeat(fieldIndent) + op.field + ': ' + encodeScalar(op.value)
    const next = block.slice()
    next.splice(insertAt, 0, newLine)
    return next
  }
  if (op.op === 'set_tier_id_match') {
    const span = findFieldValueSpan(block, 'id_match', fieldIndent)
    const replacement = renderIdMatch(op.newValue, fieldIndent)
    const next = block.slice()
    if (span) {
      next.splice(span.start, span.end - span.start, ...replacement)
    } else {
      // Legacy tier schema variant with no id_match field at all (e.g.
      // `tier`/`confidence`/`description`-shaped tiers — see
      // commission-of-inquiry-legal-submission.yaml). The analysis still
      // assigns an id_match value in this case (see normalizedIdMatchFor's
      // '' fallback), so insert it rather than replace.
      const clFound = findKeyLineInRange(next, 0, next.length, 'confidence_level', fieldIndent)
      const insertAt = clFound ? clFound.index + 1 : 1
      next.splice(insertAt, 0, ...replacement)
    }
    return next
  }
  throw new Error(`unhandled tier field op '${op.op}'`)
}

// Locate the value span for `key:` at `indent`: a single line when the
// value is an inline scalar (`id_match: Pattern_x`), or the key's line plus
// its nested block when the value is itself a mapping (`id_match:` alone,
// followed by an indented `type:`/`ids:` block — see au-number-plates.yaml
// for the pre-existing multi-id convention this mirrors).
function findFieldValueSpan(lines, key, indent) {
  const found = findKeyLineInRange(lines, 0, lines.length, key, indent)
  if (!found) return null
  const afterKey = found.rest.slice(key.length + 1).trim()
  if (afterKey.length > 0) return { start: found.index, end: found.index + 1 }
  const end = blockEnd(lines, found.index + 1, indent)
  return { start: found.index, end }
}

function renderIdMatch(value, fieldIndent) {
  if (typeof value === 'string') {
    return [' '.repeat(fieldIndent) + 'id_match: ' + encodeScalar(value)]
  }
  if (value && typeof value === 'object' && value.type === 'any' && Array.isArray(value.ids)) {
    return [
      ' '.repeat(fieldIndent) + 'id_match:',
      ' '.repeat(fieldIndent + 2) + 'type: any',
      ' '.repeat(fieldIndent + 2) + 'ids:',
      ...value.ids.map(id => ' '.repeat(fieldIndent + 4) + '- ' + encodeScalar(id))
    ]
  }
  throw new Error(`unsupported id_match shape: ${JSON.stringify(value)}`)
}

// --- simple (non-tier) op edits ---------------------------------------------

function buildSimpleEdit(lines, op) {
  switch (op.op) {
    case 'set_keyword_strength':
      return buildKeywordStrengthEdit(lines, op)
    case 'convert_term_to_object':
    case 'set_term_case_sensitive':
      return buildTermEdit(lines, op)
    case 'set_recommended_confidence':
      return buildPurviewScalarEdit(lines, 'recommended_confidence', op.newValue)
    case 'set_pattern_confidence':
      return buildTopLevelScalarEdit(lines, 'confidence', op.newValue)
    case 'set_updated':
      return buildTopLevelScalarEdit(lines, 'updated', op.newValue)
    case 'set_remediation_metadata':
      return buildRemediationAppend(lines, op)
    default:
      throw new Error(`unhandled op type '${op.op}'`)
  }
}

function buildTopLevelScalarEdit(lines, key, newValue) {
  const idx = findTopLevelKeyLine(lines, key)
  const newLine = `${key}: ${encodeScalar(newValue)}`
  if (idx === -1) {
    // Some catalog entries (large auto-generated word-list dictionaries,
    // e.g. au-family-names-census.yaml) omit metadata fields like `updated:`
    // entirely — the analysis script still assigns them (`data.updated =
    // TODAY`), which appends a new top-level key rather than replacing one.
    return { start: lines.length, end: lines.length, replacement: [newLine] }
  }
  return { start: idx, end: idx + 1, replacement: [newLine] }
}

function buildPurviewScalarEdit(lines, key, newValue) {
  const { start, end } = purviewBody(lines)
  const found = findKeyLineInRange(lines, start, end, key, 2)
  if (!found) throw new Error(`'${key}:' not found under purview`)
  return { start: found.index, end: found.index + 1, replacement: [found.prefix + key + ': ' + encodeScalar(newValue)] }
}

function buildKeywordStrengthEdit(lines, op) {
  const [, e] = findKeywordItemSpan(lines, op.keywordIndex)
  const newLine = ' '.repeat(6) + 'strength: ' + encodeScalar(op.value)
  return { start: e, end: e, replacement: [newLine] }
}

function buildTermEdit(lines, op) {
  const { termsBodyStart, termsBodyEnd, itemIndent } = op.keywordIndex !== undefined
    ? findTermsBodySpanForPattern(lines, op.keywordIndex, op.groupIndex)
    : findTermsBodySpanForDictionary(lines)
  const spans = listItemSpans(lines, termsBodyStart, termsBodyEnd, itemIndent)
  const span = spans[op.termIndex]
  if (!span) throw new Error(`term[${op.termIndex}] not found`)
  const [s, e] = span

  if (op.op === 'convert_term_to_object') {
    const line = lines[s]
    const rest = line.slice(itemIndent + 2)
    const commentMatch = /\s+#.*$/.exec(rest)
    const comment = commentMatch ? commentMatch[0] : ''
    const replacement = [
      `${' '.repeat(itemIndent)}- text: ${encodeScalar(op.text)}${comment}`,
      `${' '.repeat(itemIndent + 2)}case_sensitive: true`
    ]
    return { start: s, end: e, replacement }
  }

  // set_term_case_sensitive: term already object-form; append the field at
  // the end of its (possibly multi-line) span.
  return { start: e, end: e, replacement: [`${' '.repeat(itemIndent + 2)}case_sensitive: true`] }
}

function buildRemediationAppend(lines, op) {
  if (findTopLevelKeyLine(lines, 'remediation') !== -1) {
    throw new Error('remediation: already present — merge-in-place not supported by the text applier')
  }
  const replacement = [
    'remediation:',
    '  catalog_quality_2026_06_02:',
    '    status: applied',
    '    changes:',
    ...op.notes.map(n => `      - '${String(n).replace(/'/g, "''")}'`)
  ]
  return { start: lines.length, end: lines.length, replacement }
}

// ============================================================================
// CLI
// ============================================================================

export function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null || a === undefined || b === undefined) return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object') {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    return ak.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

function diffLines(a, b) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const result = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'equal', line: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'remove', line: a[i] })
      i++
    } else {
      result.push({ type: 'add', line: b[j] })
      j++
    }
  }
  while (i < n) {
    result.push({ type: 'remove', line: a[i] })
    i++
  }
  while (j < m) {
    result.push({ type: 'add', line: b[j] })
    j++
  }
  return result
}

// Allow-listed edit shapes per Task 5a's brief: confidence_level,
// discovery_only, case_sensitive, updated, recommended_confidence, term
// object-form conversion, tier-block restructuring, plus the narrowly-scoped
// supporting fields (strength, id_match, remediation metadata block).
const ALLOWLIST_PATTERNS = [
  /^\s*-?\s*confidence_level:\s*\S+\s*$/,
  /^\s*-?\s*confidence:\s*\S+\s*$/,
  /^\s*discovery_only:\s*true\s*$/,
  /^\s*case_sensitive:\s*true\s*$/,
  /^\s*strength:\s*\S+\s*$/,
  /^\s*updated:\s*\S+\s*$/,
  /^\s*recommended_confidence:\s*\S+\s*$/,
  /^\s*-?\s*id_match:\s*\S+\s*$/,
  /^\s*id_match:\s*$/,
  /^\s*ids:\s*$/,
  /^\s*-\s*(Pattern|Keyword|Evidence|Regex|Filter)_[A-Za-z0-9_]+\s*$/,
  // Structural fields inside a whole pattern_tiers[] entry that a
  // set_tier_order prune/reorder can legitimately add or remove wholesale
  // (never free-form prose, only found within tier match-tree nodes).
  /^\s*matches:\s*$/,
  /^\s*-\s*ref:\s*\S+\s*$/,
  /^\s*-?\s*type:\s*\S+\s*$/,
  /^\s*min_matches:\s*\S+\s*$/,
  /^\s*max_matches:\s*\S+\s*$/,
  /^\s*min_count:\s*\S+\s*$/,
  /^\s*refs:\s*$/,
  /^\s*children:\s*$/,
  /^\s*excludes:\s*$/,
  /^\s*unique_results:\s*\S+\s*$/,
  /^\s*filter_ref:\s*\S+\s*$/,
  // Legacy tier schema variant (`tier: high` / `description: <prose>` in
  // place of id_match/matches — see commission-of-inquiry-legal-submission
  // and siblings). `description:` is deliberately scoped to the EXACT
  // column tier bodies use (itemIndent 4 + 2) so it can never match the
  // top-level pattern `description:` (column 0) or false_positives[]
  // `description:` (column 4).
  /^ {4}- tier:\s*\S+\s*$/,
  /^ {6}description:.*$/,
  /^\s*remediation:\s*$/,
  /^\s*catalog_quality_2026_06_02:\s*$/,
  /^\s*status:\s*applied\s*$/,
  /^\s*changes:\s*$/,
  /^\s*-\s*['"].*['"]\s*$/,
  /^\s*-\s*text:\s*\S.*$/,
  // isShortAcronymRisk's own regex is {2,3} chars, but SHORT_ACRONYM_TERMS
  // (remediate-catalog-quality.mjs) also explicitly lists a few 4-char
  // acronyms (e.g. 'AGAO', 'DLM') that convert the same way — allow 2-4,
  // case-insensitively (isShortAcronymRisk upper-cases before matching, so
  // e.g. lowercase 'jwt' converts too), with an optional trailing YAML
  // inline comment (`- SS #` parses to the bare scalar "SS" plus a comment).
  /^\s*-\s*[A-Za-z0-9&./-]{2,4}\s*(#.*)?$/
]

export function checkDiffAllowList(originalText, editedText) {
  const { lines: a } = splitLines(originalText)
  const { lines: b } = splitLines(editedText)
  const diff = diffLines(a, b)
  return diff.filter(d => d.type !== 'equal' && !ALLOWLIST_PATTERNS.some(re => re.test(d.line)))
}

function runCli() {
  const [manifestPath, ...rest] = process.argv.slice(2)
  const doWrite = rest.includes('--write')
  if (!manifestPath) {
    console.error('Usage: node scripts/lib/apply-remediation-ops.mjs <ops.json> [--write]')
    process.exit(1)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const groups = [...(manifest.patterns || []), ...(manifest.keywords || [])]

  const opTypeCounts = {}
  const pending = []
  let anyFailure = false

  for (const group of groups) {
    const filePath = group.file
    const failures = []
    let editedText
    let objResult
    let textParsed

    const originalText = fs.readFileSync(filePath, 'utf8')

    try {
      editedText = applyOpsToText(originalText, group.ops)
    } catch (err) {
      failures.push(`applyOpsToText threw: ${err.message}`)
    }

    try {
      const originalParsed = yaml.load(originalText)
      objResult = applyOpsToObject(originalParsed, group.ops)
    } catch (err) {
      failures.push(`applyOpsToObject threw: ${err.message}`)
    }

    if (editedText !== undefined) {
      try {
        textParsed = yaml.load(editedText)
      } catch (err) {
        failures.push(`edited text failed to parse as YAML: ${err.message}`)
      }
    }

    if (textParsed !== undefined && objResult !== undefined && !deepEqual(textParsed, objResult)) {
      failures.push('deepEqual oracle failed: text-applied result differs from object-applied result')
    }

    if (editedText !== undefined) {
      const violations = checkDiffAllowList(originalText, editedText)
      if (violations.length) {
        const sample = violations.slice(0, 5).map(v => `${v.type}:${JSON.stringify(v.line)}`).join('; ')
        failures.push(`diff allow-list violation(s) [${violations.length}]: ${sample}`)
      }
    }

    for (const op of group.ops) opTypeCounts[op.op] = (opTypeCounts[op.op] || 0) + 1

    if (failures.length) {
      anyFailure = true
      console.error(`FAIL ${filePath} (${group.slug}):`)
      for (const f of failures) console.error(`  - ${f}`)
    }

    pending.push({ filePath, slug: group.slug, editedText, ok: failures.length === 0 })
  }

  console.log(`Files processed: ${pending.length}`)
  console.log(`Oracle failures: ${pending.filter(r => !r.ok).length}`)
  console.log('Op type counts:')
  for (const [k, v] of Object.entries(opTypeCounts).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${k}: ${v}`)
  }

  if (anyFailure) {
    console.error('ABORTING: oracle failure(s) present. No files were written.')
    process.exit(1)
  }

  if (doWrite) {
    for (const r of pending) fs.writeFileSync(r.filePath, r.editedText, 'utf8')
    console.log(`Wrote ${pending.length} file(s).`)
  } else {
    console.log('Dry run only (0 oracle failures). Pass --write to apply.')
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  runCli()
}

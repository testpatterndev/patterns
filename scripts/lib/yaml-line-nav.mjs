// Line/indentation-based navigation and editing primitives for YAML text.
//
// These operate on plain text lines (no line-ending characters) using the
// 2-space-step indentation convention used throughout this repo's YAML
// files: a block sequence item's `- ` marker sits at (parentKeyIndent + 2),
// and sibling mapping keys inside that item align 2 columns after the dash.
// They deliberately do NOT attempt to be a general YAML parser — only what
// is needed to locate and rewrite specific known fields byte-precisely
// while leaving every other line untouched.

export function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length
  const lfOnly = (text.match(/(?<!\r)\n/g) || []).length
  return crlf >= lfOnly ? '\r\n' : '\n'
}

export function splitLines(text) {
  const hasTrailingNewline = /\r?\n$/.test(text)
  const body = hasTrailingNewline ? text.replace(/\r?\n$/, '') : text
  const lines = body.length === 0 && hasTrailingNewline ? [] : body.split(/\r\n|\n/)
  return { lines, hasTrailingNewline }
}

export function joinLines(lines, eol, hasTrailingNewline) {
  const body = lines.join(eol)
  return hasTrailingNewline ? body + eol : body
}

export function leadingSpaces(line) {
  const match = /^ */.exec(line)
  return match[0].length
}

function isBlank(line) {
  return line.trim().length === 0
}

// End (exclusive) of the block owned by a key at `keyIndent`, starting the
// scan just after the key's own line. YAML permits a block sequence to sit
// at the SAME indent as its parent mapping key (`keywords:\n- item`, not
// just `keywords:\n  - item`) — both conventions appear in this repo — so a
// same-indent line only ends the block if it is NOT itself a list item.
export function blockEnd(lines, afterIndex, keyIndent) {
  let i = afterIndex
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (isBlank(line)) continue
    const indent = leadingSpaces(line)
    if (indent > keyIndent) continue
    if (indent === keyIndent && line.slice(indent).startsWith('- ')) continue
    break
  }
  return i
}

// Find a `^key:` line at column 0 (true top-level scalar/mapping key).
export function findTopLevelKeyLine(lines, key, start = 0, end = lines.length) {
  const re = new RegExp(`^${escapeRe(key)}:(\\s|$)`)
  for (let i = start; i < end; i++) {
    if (re.test(lines[i])) return i
  }
  return -1
}

// Find `key:` at an exact nested indent within [start,end). Handles both a
// plain mapping line (`<indent spaces>key: value`) and the special case
// where `key` is the first field inline after a sequence dash
// (`<indent-2 spaces>- key: value`).
export function findKeyLineInRange(lines, start, end, key, indent) {
  const re = new RegExp(`^${escapeRe(key)}:`)
  for (let i = start; i < end; i++) {
    const line = lines[i]
    const leading = leadingSpaces(line)
    const rest = line.slice(leading)
    if (rest.startsWith('- ')) {
      const afterDash = rest.slice(2)
      if (leading + 2 === indent && re.test(afterDash)) {
        return { index: i, prefix: line.slice(0, leading + 2), rest: afterDash }
      }
    } else if (leading === indent && re.test(rest)) {
      return { index: i, prefix: line.slice(0, leading), rest }
    }
  }
  return null
}

// Find every `- ` list-item start at an exact column within [start,end).
export function findListItemStarts(lines, start, end, itemIndent) {
  const starts = []
  for (let i = start; i < end; i++) {
    const line = lines[i]
    if (leadingSpaces(line) === itemIndent && line.slice(itemIndent).startsWith('- ')) {
      starts.push(i)
    }
  }
  return starts
}

export function listItemSpans(lines, start, end, itemIndent) {
  const starts = findListItemStarts(lines, start, end, itemIndent)
  return starts.map((s, i) => [s, i + 1 < starts.length ? starts[i + 1] : end])
}

// The repo does not use one consistent list-indent convention: patterns
// consistently indent sequence items 2 columns past their key (js-yaml
// dump style), but some hand-authored keyword dictionaries use flush-left
// `- item` lists with NO extra indent under `keywords:`. Detect the actual
// indent from the body's first non-blank line rather than assuming one.
export function detectItemIndent(lines, start, end) {
  for (let i = start; i < end; i++) {
    if (isBlank(lines[i])) continue
    return leadingSpaces(lines[i])
  }
  return null
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// --- YAML plain-scalar safety ------------------------------------------------

const PLAIN_UNSAFE_LEADING = /^[-?:,[\]{}#&*!|>'"%@`]/
const RESERVED_WORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~', ''])

// YAML's core schema implicitly resolves unquoted ISO-8601-shaped scalars to
// timestamps (js-yaml: `updated: 2026-07-04` parses to a Date, not the
// string "2026-07-04") — every date field in this repo is hand-quoted for
// exactly this reason, so dates must always be forced into quoted form here.
const LOOKS_LIKE_DATE = /^\d{4}-\d{1,2}-\d{1,2}$/

export function isPlainScalarSafe(value) {
  const s = String(value)
  if (s.length === 0) return false
  if (PLAIN_UNSAFE_LEADING.test(s)) return false
  if (/^\s|\s$/.test(s)) return false
  if (/: |:$/.test(s)) return false
  if (/ #/.test(s)) return false
  if (/^[0-9.eE+-]+$/.test(s) && !Number.isNaN(Number(s))) return false // looks numeric
  if (LOOKS_LIKE_DATE.test(s)) return false
  if (RESERVED_WORDS.has(s.toLowerCase())) return false
  return true
}

// Encode a scalar value (string/boolean/number) the way it should appear
// after a `key: ` on a single line.
export function encodeScalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  const s = String(value)
  if (isPlainScalarSafe(s)) return s
  return `'${s.replace(/'/g, "''")}'`
}

// The regex text Purview actually receives: the testpattern exporter runs every pattern
// through normalizePdfRegex (testpattern src/lib/regex-compat.js) before upload, and that
// rewrite can push a regex under 1024 chars in source over Purview's 1024 limit. Mirror of
// its rules, kept in step by scripts/lib/__tests__/purview-export-length.test.mjs:
//   - \s? and \s{0,1} outside a class → (?:\s+)?   (other escapes pass through)
//   - [...] contents pass through untouched
//   - ^ and $ outside a class are dropped
//   - a run of literal spaces outside a class and outside a lookbehind body → \s+
//   - . before { + * → [\s\S]

export function purviewExportedRegex(pattern) {
  let out = '', i = 0, inClass = false, depth = 0, lbDepth = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '\\') {
      if (!inClass && pattern[i + 1] === 's') {
        if (pattern[i + 2] === '?') { out += '(?:\\s+)?'; i += 3; continue }
        if (pattern.slice(i + 2, i + 7) === '{0,1}') { out += '(?:\\s+)?'; i += 7; continue }
      }
      out += pattern.slice(i, i + 2); i += 2; continue
    }
    if (inClass) { if (c === ']') inClass = false; out += c; i++; continue }
    if (c === '[') { inClass = true; out += c; i++; continue }
    if (c === '(') {
      depth++
      if (!lbDepth && /^\(\?<[=!]/.test(pattern.slice(i, i + 4))) lbDepth = depth
    } else if (c === ')') {
      if (depth === lbDepth) lbDepth = 0
      depth = Math.max(0, depth - 1)
    }
    if (c === '^' || c === '$') { i++; continue }
    if (c === ' ' && !lbDepth) { while (pattern[i] === ' ') i++; out += '\\s+'; continue }
    if (c === '.' && '{+*'.includes(pattern[i + 1] ?? '\0')) { out += '[\\s\\S]'; i++; continue }
    out += c; i++
  }
  return out
}

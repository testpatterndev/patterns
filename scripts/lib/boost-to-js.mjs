// Translate Boost/Purview regex features that JavaScript lacks or mishandles, so the
// repo checkers evaluate a pattern the way Purview does.

// Boost's \K drops everything matched before it from the reported value.
// A top-level `prefix\Krest` reports the same text as the lookbehind `(?<=prefix)rest`.
export function emulateKeep(body) {
  const i = body.indexOf('\\K')
  if (i < 0 || body[i - 1] === '\\') return body
  return `(?<=${body.slice(0, i)})${body.slice(i + 2)}`
}

// Scoped case-insensitive groups `(?i:...)`. V8 (Node 24) supports them, but once one
// has run inside a lookaround, later `(?i:...)` groups in the same process can return
// wrong answers. Expanding each group to explicit both-case classes avoids relying on
// the modifier at all: `(?i:ab)` -> `(?:[aA][bB])`.
export function expandScopedI(body) {
  let out = ''
  let i = 0
  while (i < body.length) {
    if (body.startsWith('(?i:', i) && body[i - 1] !== '\\') {
      // Find the matching close paren.
      let depth = 0, j = i, inClass = false
      for (; j < body.length; j++) {
        const c = body[j]
        if (c === '\\') { j++; continue }
        if (inClass) { if (c === ']') inClass = false; continue }
        if (c === '[') { inClass = true; continue }
        if (c === '(') depth++
        else if (c === ')' && --depth === 0) break
      }
      out += '(?:' + foldCase(expandScopedI(body.slice(i + 4, j))) + ')'
      i = j + 1
      continue
    }
    out += body[i++]
  }
  return out
}

// Letters outside escapes become [xX]; letters inside character classes gain the other case.
function foldCase(s) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') { out += c + (s[i + 1] ?? ''); i++; continue }
    if (c === '[') {
      let j = i + 1, cls = ''
      for (; j < s.length && s[j] !== ']'; j++) {
        if (s[j] === '\\') { cls += s[j] + s[j + 1]; j++; continue }
        cls += s[j]
      }
      // Add the other case of each letter range (a-z -> A-Z) and each single letter.
      let extra = ''
      const plain = cls.replace(/\\./g, '  ')
      for (let k = 0; k < plain.length; k++) {
        const a = plain[k], dash = plain[k + 1], b = plain[k + 2]
        if (/[A-Za-z]/.test(a) && dash === '-' && b && /[A-Za-z]/.test(b)) { extra += swap(a) + '-' + swap(b); k += 2 }
        else if (/[A-Za-z]/.test(a)) extra += swap(a)
      }
      out += '[' + cls + extra + ']'
      i = j
      continue
    }
    out += /[A-Za-z]/.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c
  }
  return out
}
const swap = c => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())

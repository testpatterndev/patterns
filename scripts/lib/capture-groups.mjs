// One capturing group per regex, wrapping the reported match.
//
// Microsoft documents exactly one capturing group per custom SIT regex (sit-limits:
// "Capturing group in a regular expression | 1"), and a 2026-10-30 test-tenant A/B showed
// Copilot prompt blocking firing more often with `\b(X)\b` than with the group-less `\bX\b`
// (best effort either way). Every regex in this repo therefore carries one capturing group
// around the match it reports, with our own zero-width boundaries left outside it:
//
//   (?i)\bfoo|bar\b      ->  (?i)(\bfoo|bar\b)          top-level | : the group takes it all
//   (?i)\b(?:foo|bar)\b  ->  (?i)\b(foo|bar)\b          a lone (?:...) core becomes the group
//   (?<!\d)\d{9}(?!\d)   ->  (?<!\d)(\d{9})(?!\d)
//   label\s*:\s*\K\d+    ->  label\s*:\s*\K(\d+)        \K drops the prefix from the match
//   \b(ghp|gho)_\w{36}\b ->  \b((?:ghp|gho)_\w{36})\b   a partial group becomes (?:...)
//
// Only things that consume nothing may sit outside the group (leading inline flags, \b, \B,
// anchors, lookarounds, and a top-level \K prefix), so the group's span is the reported match
// and group 0 is unchanged. scanRegex() reads Boost/Perl syntax: escapes, character classes
// (a leading ] is literal, [:posix:] is skipped), (?...) group kinds and \Q...\E. Anything it
// cannot prove safe to rewrite (backreferences, conditionals, branch reset, recursion, verbs,
// inline flags after the start) throws HandleByHand.

export class HandleByHand extends Error {}

// Leading inline-flag groups such as (?i), (?is), (?-i), (?i-s). They stay outside the group.
const LEADING_FLAGS = /^(?:\(\?[a-zA-Z]*(?:-[a-zA-Z]+)?\))+/

export function splitLeadingFlags(src) {
  const m = String(src).match(LEADING_FLAGS)
  const flags = m ? m[0] : ''
  return { flags, body: String(src).slice(flags.length) }
}

// Length of the escape starting at src[i] === '\\' (Boost/Perl forms that span more than
// two characters only where it matters for finding the next metacharacter).
function escapeLength(src, i) {
  const c = src[i + 1]
  if (c === undefined) return 1
  if ('xpPNkg'.includes(c) && src[i + 2] === '{') {
    const close = src.indexOf('}', i + 3)
    return close < 0 ? 2 : close - i + 1
  }
  if (c === 'k' && (src[i + 2] === '<' || src[i + 2] === "'")) {
    const close = src.indexOf(src[i + 2] === '<' ? '>' : "'", i + 3)
    return close < 0 ? 2 : close - i + 1
  }
  return 2
}

const isBackref = (src, i) => /^\\(?:[1-9]|k[<{']|g\{|g-?\d)/.test(src.slice(i, i + 4))

// End (exclusive) of the character class opening at src[i] === '['.
function classEnd(src, i) {
  let j = i + 1
  if (src[j] === '^') j++
  if (src[j] === ']') j++ // a leading ] is a literal member in Boost/Perl
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue }
    if (src[j] === '[' && src[j + 1] === ':') {
      const close = src.indexOf(':]', j + 2)
      if (close >= 0) { j = close + 2; continue }
    }
    if (src[j] === ']') return j + 1
    j++
  }
  throw new Error(`unterminated character class at ${i}`)
}

// Classify the group opening at src[i] === '('. Returns { kind, headLen, capturing }.
function groupKind(src, i) {
  if (src[i + 1] === '*') throw new HandleByHand(`backtracking verb at ${i}`)
  if (src[i + 1] !== '?') return { kind: 'capture', headLen: 1, capturing: true }
  const r = src.slice(i + 2)
  if (r.startsWith(':')) return { kind: 'group', headLen: 3, capturing: false }
  if (r.startsWith('=')) return { kind: 'lookahead', headLen: 3, capturing: false }
  if (r.startsWith('!')) return { kind: 'lookahead', headLen: 3, capturing: false }
  if (r.startsWith('<=') || r.startsWith('<!')) return { kind: 'lookbehind', headLen: 4, capturing: false }
  if (r.startsWith('>')) return { kind: 'atomic', headLen: 3, capturing: false }
  if (r.startsWith('#')) return { kind: 'comment', headLen: 3, capturing: false }
  let m = r.match(/^(?:P?<([A-Za-z_][A-Za-z0-9_]*)>|'([A-Za-z_][A-Za-z0-9_]*)')/)
  if (m) return { kind: 'named', headLen: 2 + m[0].length, capturing: true, name: m[1] ?? m[2] }
  m = r.match(/^[a-zA-Z]*(?:-[a-zA-Z]+)?([:)])/)
  if (m) return m[1] === ')'
    ? { kind: 'flags', headLen: 2 + m[0].length, capturing: false }
    : { kind: 'group', headLen: 2 + m[0].length, capturing: false } // scoped flags (?i:...)
  if (r.startsWith('|')) throw new HandleByHand(`branch-reset group at ${i}`)
  if (r.startsWith('(')) throw new HandleByHand(`conditional group at ${i}`)
  throw new HandleByHand(`unsupported group (?${r.slice(0, 3)} at ${i}`)
}

// Walk a regex once. Returns every group (open/close offsets, kind, depth, whether it sits
// inside a lookaround) plus the offsets of top-level alternation bars and backreferences.
export function scanRegex(src) {
  src = String(src)
  const groups = [], stack = [], topBars = [], backrefs = [], keeps = []
  const flagsEnd = splitLeadingFlags(src).flags.length
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      if (src[i + 1] === 'Q') {
        const e = src.indexOf('\\E', i + 2)
        i = e < 0 ? src.length : e + 2
        continue
      }
      if (isBackref(src, i)) backrefs.push(i)
      if (src[i + 1] === 'K') {
        // Inside a group \K moves the match start past where that group began.
        if (stack.length) throw new HandleByHand(`\\K inside a group at ${i}`)
        keeps.push(i)
      }
      i += escapeLength(src, i)
      continue
    }
    if (c === '[') { i = classEnd(src, i); continue }
    if (c === '(') {
      const g = groupKind(src, i)
      if (g.kind === 'comment') {
        const close = src.indexOf(')', i)
        if (close < 0) throw new Error(`unterminated comment at ${i}`)
        i = close + 1
        continue
      }
      if (g.kind === 'flags') {
        if (i >= flagsEnd) throw new HandleByHand(`inline flag group after the start at ${i}`)
        i += g.headLen
        continue
      }
      const inLook = stack.some(s => s.kind === 'lookahead' || s.kind === 'lookbehind')
      const node = { open: i, close: -1, headLen: g.headLen, kind: g.kind, capturing: g.capturing, name: g.name, depth: stack.length, inLookaround: inLook }
      groups.push(node)
      stack.push(node)
      i += g.headLen
      continue
    }
    if (c === ')') {
      const node = stack.pop()
      if (!node) throw new Error(`unbalanced ) at ${i}`)
      node.close = i
      i++
      continue
    }
    if (c === '|' && stack.length === 0) topBars.push(i)
    i++
  }
  if (stack.length) throw new Error(`unclosed ( at ${stack[stack.length - 1].open}`)
  return { groups, topBars, backrefs, keeps }
}

export function countCapturingGroups(src) {
  return scanRegex(src).groups.filter(g => g.capturing).length
}

// Length of a quantifier starting at body[j] ('?', '*', '+', '{n}', '{n,}', '{n,m}', with a
// lazy '?' or possessive '+' suffix), or 0.
function quantifierLength(body, j) {
  let n = 0
  if ('?*+'.includes(body[j] ?? 'x')) n = 1
  else {
    const m = body.slice(j).match(/^\{\d+(?:,\d*)?\}/)
    if (m) n = m[0].length
  }
  if (n && (body[j + n] === '?' || body[j + n] === '+')) n++
  return n
}

// Split a body into its top-level atoms (each with any quantifier attached) and mark which
// consume nothing: \b \B \A \z \Z \G ^ $ and unquantified lookarounds.
function topLevelAtoms(body, scan) {
  const groupAt = new Map(scan.groups.filter(g => g.depth === 0).map(g => [g.open, g]))
  const atoms = []
  let i = 0
  while (i < body.length) {
    let end, zeroWidth = false, group = null, keep = false
    const c = body[i]
    if (c === '\\') {
      if (body[i + 1] === 'Q') { const e = body.indexOf('\\E', i + 2); end = e < 0 ? body.length : e + 2 }
      else end = i + escapeLength(body, i)
      zeroWidth = /^\\[bBAzZG]$/.test(body.slice(i, end))
      keep = body.slice(i, end) === '\\K'
    } else if (c === '[') end = classEnd(body, i)
    else if (c === '(') {
      group = groupAt.get(i)
      if (!group) throw new HandleByHand(`comment group at ${i}`)
      end = group.close + 1
      zeroWidth = group.kind === 'lookahead' || group.kind === 'lookbehind'
    } else {
      end = i + 1
      zeroWidth = c === '^' || c === '$'
    }
    const q = keep ? 0 : quantifierLength(body, end)
    if (q) zeroWidth = false
    atoms.push({ start: i, end: end + q, zeroWidth, keep, group, quantified: q > 0, bar: c === '|' && !group })
    i = end + q
  }
  return atoms
}

// Where the reported match sits in a body: lead (zero-width atoms, or everything up to the
// last top-level \K plus any zero-width atoms after it), core, trail (zero-width atoms).
// With a top-level | the whole body is the core: the boundaries belong to the branches.
export function decompose(src) {
  const { flags, body } = splitLeadingFlags(src)
  const scan = scanRegex(body)
  const atoms = topLevelAtoms(body, scan)
  if (scan.topBars.length && scan.keeps.length) throw new HandleByHand('top-level \\K with top-level alternation')
  if (scan.topBars.length) return { flags, body, scan, lead: '', core: body, trail: '', coreAtoms: atoms }
  let a = 0
  const lastKeep = atoms.map(x => x.keep).lastIndexOf(true)
  if (lastKeep >= 0) a = lastKeep + 1
  while (a < atoms.length && atoms[a].zeroWidth) a++
  let b = atoms.length
  while (b > a && atoms[b - 1].zeroWidth) b--
  const leadEnd = a < atoms.length ? atoms[a].start : body.length
  const coreEnd = b > a ? atoms[b - 1].end : leadEnd
  return { flags, body, scan, lead: body.slice(0, leadEnd), core: body.slice(leadEnd, coreEnd), trail: body.slice(coreEnd), coreAtoms: atoms.slice(a, b) }
}

// True when src has exactly one capturing group and it spans the reported match.
export function checkWholeMatchGroup(src) {
  let d
  try { d = decompose(src) } catch (e) { return { ok: false, reason: e.message } }
  const caps = d.scan.groups.filter(g => g.capturing)
  if (caps.length !== 1) return { ok: false, reason: `${caps.length} capturing groups (need exactly 1)` }
  const [only] = d.coreAtoms
  const wraps = d.coreAtoms.length === 1 && only.group?.capturing && !only.quantified
  if (!wraps) return { ok: false, reason: 'the capturing group does not wrap the whole match — only flags, \\b, anchors, lookarounds and a \\K prefix may sit outside it' }
  return { ok: true }
}

// Rewrite src so it has exactly one capturing group wrapping the reported match. Existing
// capturing groups become (?:...) (named ones lose their name). Idempotent: a regex that
// already passes checkWholeMatchGroup() is returned unchanged.
export function wrapWholeMatch(src) {
  src = String(src)
  if (checkWholeMatchGroup(src).ok) return { out: src, rule: 'unchanged', converted: [] }
  const d = decompose(src)
  if (d.scan.backrefs.length) throw new HandleByHand('backreference — renumbering or removing its group changes matching')
  if (!d.core) throw new HandleByHand('nothing consuming to wrap')
  const caps = d.scan.groups.filter(g => g.capturing)
  // Rewrite capturing heads to (?: right to left so earlier offsets stay valid.
  let body = d.body
  const converted = []
  for (const g of [...caps].sort((x, y) => y.open - x.open)) {
    converted.unshift(body.slice(g.open, g.close + 1))
    body = body.slice(0, g.open) + '(?:' + body.slice(g.open + g.headLen)
  }
  const shift = (pos) => pos + caps.filter(g => g.open < pos).reduce((n, g) => n + 3 - g.headLen, 0)
  const leadEnd = shift(d.lead.length)
  const coreEnd = shift(d.lead.length + d.core.length)
  const core = body.slice(leadEnd, coreEnd)
  // A core that is one unquantified (?:...) group becomes the capturing group itself:
  // (?i)\b(?:a|b)\b -> (?i)\b(a|b)\b, not \b((?:a|b))\b (shorter, same match).
  const [only] = d.coreAtoms
  const single = d.coreAtoms.length === 1 && only.group && !only.quantified && core.startsWith('(?:') && core.endsWith(')')
  const out = d.flags + body.slice(0, leadEnd) + (single ? '(' + core.slice(3) : '(' + core + ')') + body.slice(coreEnd)
  const rule = caps.length ? 'regroup' : d.scan.keeps.length ? 'wrap-after-keep' : single ? 'promote' : 'wrap'
  return { out, rule, converted }
}

// Every regex a pattern or identifier YAML carries, as { where, src, set(newSrc) }.
// Patterns: top-level pattern, purview.regexes[], purview.filters[] (exclude_pattern) and
// regional_tuning[] (the exporter adds an exclude-regex as a Purview regex for that jurisdiction).
// Identifiers: public_format, fallback and the replacement example overlay.
export function regexFields(doc, kind = 'pattern') {
  const out = []
  const add = (obj, key, where) => {
    if (obj && typeof obj[key] === 'string') out.push({ where, src: obj[key], set: (v) => { obj[key] = v } })
  }
  if (kind === 'identifier') {
    add(doc?.public_format, 'pattern', 'public_format.pattern')
    add(doc?.fallback, 'pattern', 'fallback.pattern')
    add(doc?.replacement?.example_overlay, 'pattern', 'replacement.example_overlay.pattern')
    return out
  }
  add(doc, 'pattern', 'pattern')
  for (const r of doc?.purview?.regexes ?? []) add(r, 'pattern', `purview.regexes/${r.id}`)
  for (const [i, f] of (doc?.purview?.filters ?? []).entries()) add(f, 'pattern', `purview.filters[${i}]`)
  for (const [i, t] of (Array.isArray(doc?.regional_tuning) ? doc.regional_tuning : []).entries()) {
    add(t, 'pattern', `regional_tuning[${i}].pattern`)
    add(t, 'regex', `regional_tuning[${i}].regex`)
  }
  return out
}

// `\S` with an unbounded quantifier written as the class `[^\s]` (same set in Boost and JS).
// Wrapping moves a bare top-level `\S+` inside a group, which purviewBanned() rejects; the
// class form says the same thing without the dot-like `\S` the rule is calibrated on.
export function nonSpaceAsClass(src) {
  src = String(src)
  let out = '', i = 0
  while (i < src.length) {
    if (src[i] === '\\' && src[i + 1] === 'Q') {
      const e = src.indexOf('\\E', i + 2)
      const end = e < 0 ? src.length : e + 2
      out += src.slice(i, end); i = end; continue
    }
    if (src[i] === '\\') {
      const n = escapeLength(src, i)
      const unbounded = /^(?:[*+]|\{\d+,\})/.test(src.slice(i + 2))
      out += src[i + 1] === 'S' && n === 2 && unbounded ? '[^\\s]' : src.slice(i, i + n)
      i += n; continue
    }
    if (src[i] === '[') { const e = classEnd(src, i); out += src.slice(i, e); i = e; continue }
    out += src[i++]
  }
  return out
}

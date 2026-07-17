// Purview (Boost.RegEx) banned-construct detection, shared by scripts/ci-check.mjs and
// scripts/lib/__tests__/purview-banned.test.mjs.
//
// What Purview actually rejects is a server-side validation/perf heuristic, not a
// documented grammar. The observable error (ClassificationRulePackageValidationException,
// live compl8.dev uploads) reads:
//
//   "The specified classification rule collection contains a regular expression processor
//    which is invalid or may perform poorly. ... You cannot configure a pattern with groups
//    of multiple match conditions like (.*, .+, .{0,n} or .{1,n}). Remove the group or the
//    multiple match condition..."
//
// Live evidence (2026-07-09 and 2026-07-17 uploads, compl8.dev) pins down one reliable
// rejection class and rules out several tempting over-generalisations:
//
//   REJECTED — unbounded quantifier applied to a group:
//     (?:[\\]n|\r|\n)+            global-gcp-service-account-key (2026-07-17)
//     (?:/{1,2}(?:...))*          us-classification-banner caveat groups (pre-rewrite)
//     (?://?(?:...))*             us-classification-banner portion marks (pre-rewrite)
//     (?:[a-z]{3,8} ){11,}-style  global-bip39-seed-phrase quantified word groups
//
//   REJECTED — dot-like \S* multi-match (in or out of a group):
//     (?:/\S*)?                   global-credential-combolist v0 (\S* ≈ .* inside a group)
//     otpauth://(?:totp|hotp)/\S* global-mfa-seeds shipped body (bare \S* at group depth 0)
//
//   ACCEPTED the same day (so must NOT be flagged):
//     (?:...)?         25+ optional groups, including bodies with \s+ inside (word\s+)?
//     (?:...){0,4}     us-classification-banner replacement caveat groups
//     (?:...){0,5}     us-classification-banner REL TO country list
//     (?:...){1,7}     global-ipv6-address (mirrors MS's own built-in IPv6 SIT shape)
//     \S+ / \S{3,}     bare (ungrouped) in shipped QGCREDS credential packages
//
// The murky middle — e.g. global-credential-combolist v1 was rejected while containing only
// bounded group quantifiers ((?::\d{2,5})?, (?:/[...]{1,64}){0,5}) — suggests an additional
// complexity/breadth estimate we cannot reproduce exactly. We therefore ban only the
// confirmed-rejected shapes (unbounded GROUP quantifiers; dot-like unbounded \S) and leave
// bounded group quantifiers alone; catalog impact of both bans is zero as of 2026-07-17
// (1685 patterns).

export const stripClasses = (src) => src.replace(/\[(?:[^\]\\]|\\.)*\]/g, '[]')

export function purviewBanned(src) {
  const s = stripClasses(src)
  // Escape-neutralized copy: every `\x` pair collapses to a placeholder, so any `.`, `^`,
  // `$`, or `)` that survives in `t` is guaranteed to be a live metacharacter. A naive
  // one-character lookbehind gets `\\.*` wrong (the dot follows an ESCAPED backslash and is
  // a real wildcard) — left-to-right pair consumption resolves runs of backslashes correctly.
  const t = s.replace(/\\./g, 'x')
  const issues = []
  if (/[+*]\)[*+]|[+*]\)\{/.test(s)) issues.push('nested quantifier')
  if (/\.(?:[*+]|\{\d+,?\d*\})/.test(t)) issues.push('unbounded/braced dot quantifier')
  // Char classes are already stripped to literal `[]`, so any surviving ^ or $ is outside
  // a class; escaped `\^`/`\$` literals are already neutralized in `t`.
  if (/[\^$]/.test(t)) issues.push('^/$ anchor')
  // Strip escaped characters first so literal `\(` / `\)` (e.g. parenthesised phone
  // renderings like `\(020\)`) are not miscounted as capturing groups — Boost/Purview
  // accepts literal parens fine; only real unnamed capture groups are the concern.
  const captures = (s.replace(/\\./g, '').replace(/\(\?[:=!<]/g, '(?x').match(/\((?!\?)/g) || []).length
  if (captures > 1) issues.push(`${captures} capturing groups`)
  // Boost.RegEx allows FIXED-length lookbehinds (e.g. `\s{3}`) — only variable-length
  // quantifiers (*, +, ?, {n,}, {n,m}) inside the body are banned. Note this also flags a
  // `?` belonging to a nested (?:...) group inside the lookbehind body; that's acceptable
  // since a nested group makes the lookbehind's length variable-risk regardless. Runs on
  // `t` so escaped literals inside the body — `(?<=ref\?)`, `(?<=foo\))` — neither
  // false-flag as quantifiers nor end the body scan early.
  if (/\(\?<[=!][^)]*(?:[*+?]|\{\d+,)/.test(t)) issues.push('variable-length lookbehind')
  // Unbounded quantifier applied to a GROUP — `(...)+`, `(...)*`, `(...){n,}` (lazy variants
  // included). This is the confirmed Purview "groups of multiple match conditions" rejection
  // class; see the header comment for the live evidence and why BOUNDED group quantifiers
  // (`(...)?`, `(...){n,m}`) stay allowed. `t` (not `s`) so a literal `\)` followed by a
  // quantifier is not mistaken for a group quantifier — and so `)\s*` does not collapse
  // into a false `)*` (neutralization replaces, never deletes).
  if (/\)(?:[*+]|\{\d+,\})/.test(t)) issues.push('unbounded group quantifier — (...)+ / (...)* / (...){n,}')
  // Dot-like \S with an unbounded quantifier. `\S*` is live-rejected wherever it appears
  // (combolist v0 path group AND the bare otpauth path — see header), and any unbounded \S
  // (`+`, `{n,}`) INSIDE a group matches the rejected (?:/\S*)? shape. Bare `\S+`/`\S{3,}`
  // OUTSIDE groups shipped fine in the QGCREDS packages, and narrow escapes like `\s+`
  // inside groups are accepted — so the rule stays exactly this narrow. Walking `s` (classes
  // already stripped) keeps `[\s\S]{40,}`-style class members out of scope.
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      if (s[i + 1] === 'S' && /^(?:[*+]|\{\d+,\})/.test(s.slice(i + 2))) {
        if (s[i + 2] === '*') { issues.push('\\S* dot-like zero-or-more'); break }
        if (depth > 0) { issues.push('unbounded \\S quantifier inside a group'); break }
      }
      i++ // skip the escaped character
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
  }
  return issues
}

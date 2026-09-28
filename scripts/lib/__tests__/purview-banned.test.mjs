#!/usr/bin/env node
//
// Plain-node regression test for purviewBanned() (no test framework in this repo).
// Cases are pinned to LIVE Purview upload evidence (compl8.dev, 2026-07-09 / 2026-07-17):
// everything Purview actually rejected must flag, and everything that uploaded fine the
// same day must stay clean — the check exists to gate real uploads, not to enforce style.
// Wired as `npm run test:purview-banned`.

import { purviewBanned } from '../purview-banned.mjs'

const GROUP_QUANT = 'unbounded group quantifier — (...)+ / (...)* / (...){n,}'
const LIT = (lit) => `literal '${lit}' in regex text — Purview rejects it anywhere, even inside [...]`

const cases = [
  // ── Unbounded group quantifiers: live-rejected shapes ──
  {
    name: 'gcp-service-account-key newline group (rejected 2026-07-17)',
    src: '(?:[\\\\]n|\\r|\\n)+[A-Za-z0-9+/=]{12,}',
    expect: [GROUP_QUANT, LIT(')+')],
  },
  {
    name: 'us-classification-banner caveat group (rejected pre-rewrite)',
    src: '\\b(?:TS|S|C)//(?:SI|TK|HCS)(?:/{1,2}(?:SI|TK|HCS))*\\b',
    expect: [GROUP_QUANT, LIT(')*')],
  },
  {
    name: 'portion mark with literal parens around quantified group (rejected pre-rewrite)',
    src: '\\((?:TS|S|C|U)//(?:SI|TK)(?://?(?:SI|TK))*\\)',
    expect: [GROUP_QUANT, LIT(')*')],
  },
  {
    name: 'bip39-style open-ended word group',
    src: '\\bmnemonic[\\s:=-]{0,8}(?:[a-z]{3,8} ){11,}[a-z]{3,8}\\b',
    expect: [GROUP_QUANT],
  },
  {
    name: 'lazy unbounded group quantifier still flags',
    src: '(?:ab){2,}?c',
    expect: [GROUP_QUANT],
  },
  {
    name: 'capture group with + flags',
    src: '\\bkey=([A-Z]|\\d)+\\b',
    expect: [GROUP_QUANT, LIT(')+')],
  },

  // ── Dot-like \S multi-match: live-rejected shapes ──
  {
    name: 'combolist v0 optional path group with \\S* (rejected 2026-07-09)',
    src: '\\bhost(?:/\\S*)?:[\\w.@-]{2,64}\\b',
    expect: ['\\S* dot-like zero-or-more'],
  },
  {
    name: 'mfa-seed otpauth path with bare \\S* at depth 0 (rejected)',
    src: 'otpauth://(?:totp|hotp)/\\S*',
    expect: ['\\S* dot-like zero-or-more'],
  },
  {
    name: 'unbounded \\S+ inside a group',
    src: '(?:key=\\S+)?value',
    expect: ['unbounded \\S quantifier inside a group'],
  },
  {
    name: 'open-ended \\S{4,} inside a group',
    src: '(?:pw:\\S{4,})?',
    expect: ['unbounded \\S quantifier inside a group'],
  },

  // ── Constructs Purview ACCEPTED the same day: must stay clean ──
  {
    name: 'bounded \\S{4,64} inside a group stays clean',
    src: '(?:key=\\S{4,64})?value',
    expect: [],
  },
  {
    name: 'optional group with \\s+ body (25+ uploaded fine)',
    src: '(?i)\\b(?:the\\s+)?system\\s+prompt\\b',
    expect: [],
  },
  {
    name: 'us-classification-banner replacement {0,4}/{0,5} groups (uploaded fine)',
    src: '\\b(?:TS|S|C)//(?:SI|TK|HCS)(?://(?:SI|TK|HCS)){0,4}\\b|\\b(?:TS|S|C)//REL TO [A-Z]{2,5}(?:,[ ]?[A-Z]{2,5}){0,5}\\b',
    expect: [],
  },
  {
    name: 'ipv6-style bounded group quantifier {1,7} (MS built-in SIT shape)',
    src: '(?:[A-Fa-f0-9]{1,4}:){1,7}[A-Fa-f0-9]{1,4}',
    expect: [],
  },
  {
    name: 'bare \\S+ / \\S{4,} outside groups (shipped in QGCREDS packages)',
    src: '(?i)\\bpassword\\s*=\\s*\\S{4,}|token\\s+\\S+',
    expect: [],
  },
  {
    name: 'escaped literal paren followed by quantifier is not a group quantifier',
    src: '\\(020\\)?\\s*\\d{4} \\d{4}',
    expect: [],
  },
  {
    name: 'group followed by escaped-token quantifier ()\\s* does not collapse to )*',
    src: '(?:userPWD|publishPassword)\\s*=\\s*"?[A-Za-z0-9+/=]{20,}"?',
    expect: [],
  },
  {
    name: 'paren inside a character class followed by quantifier',
    src: '[()]+[A-Z]{2,5}',
    expect: [],
  },
  {
    name: 'unbounded quantifier on a bare char class (not a group) stays clean',
    src: '-----BEGIN PRIVATE KEY-----[\\s\\S]{40,}',
    expect: [],
  },

  // ── Escaped-backslash disambiguation (a `\\` pair must not hide a live metachar) ──
  {
    name: 'wildcard dot after a literal backslash still flags',
    src: 'C:\\\\.*',
    expect: ['unbounded/braced dot quantifier', LIT('.*')],
  },
  {
    name: 'anchor after a literal backslash still flags',
    src: '\\\\^\\d{4}',
    expect: ['^/$ anchor'],
  },
  {
    name: 'escaped dot with quantifier stays clean',
    src: '\\d{1,3}\\.{1,2}\\d{1,3}',
    expect: [],
  },
  {
    name: 'literal backslash then escaped dot stays clean',
    src: '\\\\\\.[a-z]{2,8}',
    expect: [],
  },
  {
    name: 'literal backslash-S with quantifier is not dot-like \\S',
    src: 'dir\\\\S*[a-z]{1,8}',
    expect: [],
  },
  {
    name: 'fixed-length lookbehind with escaped ? in body stays clean',
    src: '(?<=ref\\?)\\d{6}',
    expect: [],
  },
  {
    name: 'fixed-length lookbehind with escaped paren in body stays clean',
    src: '(?<=foo\\))\\d{6}',
    expect: [],
  },

  // ── Literal repeaters: `.`/`)` + `*`/`+` in the regex TEXT, even inside [...] ──
  // Pinned 2026-09-28: the first two were rejected at a live tenant upload
  // (ClassificationRulePackageValidationException); the third has the same `.+` class shape.
  // Strings are the pre-fix catalog text, pinned here because the yamls were fixed.
  {
    name: 'au-family-domestic-violence-leave-record Regex_dfv_workplace_support: )+ inside [A-Za-z0-9@.()+ -] (rejected live)',
    src: "(?i)\\b(?:(?:work\\s+)?(?:location|site|office|workplace|team)\\s+(?:changed|relocated|transferred|moved)(?:\\s+(?:to|from))?\\s*[:#-]?\\s*(?!(?:n/?a|unknown|tbc|tba|the|a|an|any|where)\\b|_{2,}|\\[|<)[A-Z0-9][A-Za-z0-9'-]{2,30}|(?:new|changed|unlisted)\\s+(?:work\\s+)?(?:email|phone|telephone|mobile|extension)(?:\\s+(?:number|address))?\\s*[:#]\\s*(?!(?:n/?a|unknown|tbc|tba)\\b|_{2,}|\\[|<)[A-Z0-9+(][A-Za-z0-9@.()+ -]{3,40}|(?:hours|roster|shifts?|start\\s+time|work\\s+pattern)\\s+(?:changed|varied|adjusted)(?:\\s+(?:to|from))?\\s*[:#-]?\\s*[0-9A-Z]|flexible\\s+(?:working\\s+)?arrangements?\\s*[:#]\\s*(?!(?:n/?a|unknown|tbc|tba|the|a|an|any)\\b|_{2,}|\\[|<)[A-Z0-9][A-Za-z0-9'-]{2,40}|review\\s+date\\s*[:#-]?\\s*\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})",
    expect: [LIT(')+')],
  },
  {
    name: 'global-top500-248 Evidence_package_coordinate: .+ inside [\\w.+-] (rejected live)',
    src: "\\bpkg:(?:npm|maven|pypi|nuget|gem|golang|cargo|composer)/[\\w@./%-]{2,120}@[\\w.+-]{1,40}|@?\\b[a-z0-9][\\w.-]{1,60}(?:/[\\w.-]{1,60})?@\\d{1,4}\\.\\d{1,4}\\.\\d{1,6}\\b|\\b[a-z][\\w.-]{1,60}:[a-z][\\w.-]{1,60}:\\d{1,4}\\.\\d{1,4}(?:\\.\\d{1,6})?\\b",
    expect: [LIT('.+')],
  },
  {
    name: 'lawful-interception-warrant intercept_record_fields: .+ inside [A-Za-z0-9/.+-]',
    src: "(?i)\\b(?:warrant\\s*(?:no\\.?|number|ref(?:erence)?|ID)|target\\s+(?:service|line|number|phone|handset|identifier|ID)|(?:intercepted|monitored)\\s+(?:service|line|number)|(?:line|session|call|product)\\s*(?:no\\.?|number|ID|ref(?:erence)?)|[AB]-party(?:\\s+(?:no\\.?|number))?|IMSI|MSISDN)\\s*[:#]\\s*(?!(?:n/?a|name|unknown|tbc|tba|withheld|not\\s+recorded|the|a|an|any|all|each|see|refer)\\b|_{2,}|\\[|<)[A-Z0-9+][A-Za-z0-9/.+-]{1,30}",
    expect: [LIT('.+')],
  },
  {
    name: 'literal backslash then .+ in a class still flags ([\\\\.+])',
    src: '[\\\\.+]{1,4}',
    expect: [LIT('.+')],
  },
  { name: 'escaped dot before + in a class stays clean', src: '[\\w\\.+-]{1,40}', expect: [] },
  { name: 'escaped + after ) in a class stays clean', src: '[A-Za-z0-9@.()\\+ -]{3,40}', expect: [] },
  { name: 'escaped dot then + outside a class stays clean', src: 'foo\\.+bar', expect: [] },
  { name: 'escaped paren then + outside a class stays clean', src: 'x\\)+y', expect: [] },
  { name: 'dot last in a quantified class stays clean', src: '[a-z0-9.]+@[\\w.-]{1,60}', expect: [] },
  {
    name: 'fixed au-family class [A-Za-z0-9+@.() -] stays clean',
    src: '[A-Z0-9+(][A-Za-z0-9+@.() -]{3,40}',
    expect: [],
  },
  { name: 'fixed 248 class [\\w+.-] stays clean', src: '@[\\w+.-]{1,40}', expect: [] },
  { name: 'fixed lawful class [A-Za-z0-9/+.-] stays clean', src: '[A-Z0-9+][A-Za-z0-9/+.-]{1,30}', expect: [] },

  // ── Pre-existing rules keep working after the extraction ──
  {
    name: 'nested quantifier',
    src: '(?:a+)+b',
    expect: ['nested quantifier', GROUP_QUANT, LIT(')+')],
  },
  {
    name: 'unbounded dot quantifier',
    src: 'foo.*bar',
    expect: ['unbounded/braced dot quantifier', LIT('.*')],
  },
  {
    name: 'anchors',
    src: '^ABC\\d$',
    expect: ['^/$ anchor'],
  },
  {
    name: 'multiple capturing groups',
    src: '([A-Z]{2})(\\d{3})',
    expect: ['2 capturing groups'],
  },
  {
    name: 'variable-length lookbehind',
    src: '(?<!\\w+)\\d{6}',
    expect: ['variable-length lookbehind'],
  },
  {
    name: 'clean identifier pattern',
    src: '(?i)\\b(?:AFSL|AFS licen[cs]e)\\s*(?:number|no|#)?\\s*[:#-]?\\s*\\d{6}\\b',
    expect: [],
  },
]

let failures = 0
for (const { name, src, expect } of cases) {
  const got = purviewBanned(src)
  const ok = got.length === expect.length && expect.every(e => got.includes(e))
  if (!ok) {
    failures++
    console.error(`FAIL ${name}\n  src:      ${src}\n  expected: ${JSON.stringify(expect)}\n  got:      ${JSON.stringify(got)}`)
  }
}

if (failures) {
  console.error(`\npurview-banned: ${failures}/${cases.length} case(s) failed`)
  process.exit(1)
}
console.log(`purview-banned: all ${cases.length} cases passed`)

# Backlog ticket: harness-codex-findings — report

Fixes for 3 Codex static-review findings in `scripts/verify-pattern-testcases.mjs`
(the tier-aware test-case harness). No pattern YAMLs touched.

## Findings and fixes

### 1 (HIGH) — inline `(?i)` dropped on case_sensitive patterns

`toRe()` strips a leading inline-flag group like `(?i)` (invalid in JS) and maps it to
JS flags — but only mapped `s` and `m`. When the pattern has `case_sensitive: true`
(so the repo-convention `i` flag is not force-added), an evidence/label-context regex
that INTENTIONALLY carries `(?i)` (e.g. tr-passport-number's
`Pattern_tr_passport_label_context`:
`(?i)\b(?:pasaport|passport|seyahat\s+belgesi|travel\s+document|...)\b`) was compiled
case-SENSITIVELY — evaluated too strictly.

Fix: map `i` from the stripped inline group into the JS flags, and dedupe the flag
string (`[...new Set(flags)].join('')`) so a `(?i)` on a case-insensitive pattern does
not produce a duplicate-flag SyntaxError.

### 2 (MEDIUM) — keyword `min_count` counted distinct terms even when `unique_results` is falsy

`matchCount()` for keyword matchers always returned the number of DISTINCT matched
terms. Purview semantics: with `unique_results: false`/absent, two occurrences of the
same term must count as 2. Fix: `compileTerm()` now also returns a `count(text)`
capability (non-overlapping substring count for `match_style: string`, global-regex
match count for `word`); `matchCount()` uses total occurrences when `unique` is falsy
and distinct terms when true. (Regex matchers already handled both directions.)

### 3 (LOW) — top-level keyword_list terms lowercased unconditionally

The `kwTerms` path for `keyword_list`/`keyword_dictionary` primaries lowercased every
term, ignoring per-term `{ text, case_sensitive: true }` objects. Fix: terms are now
compiled through the same `compileTerm(term, 'string')` path used everywhere else
(text is still trimmed first, preserving the old trim behavior); `kwHit` delegates to
the compiled testers. Substring semantics unchanged.

## Empirical verification

Temporary fixture YAMLs were placed in `data/patterns/` and run through BOTH the HEAD
script (`git show HEAD:...` copy) and the fixed script, then deleted (not committed).

### Fix 1 — including tr-passport-number's regex verbatim

Fixture: `case_sensitive: true`, tier gated ONLY by the label-context regex.

| should_not_match value | HEAD script | fixed script |
|---|---|---|
| `Pasaport numarası: U08296543` (capitalized label, real tr regex) | warn only — tier did NOT fire (label regex compiled case-sensitively, missed `Pasaport`) | FAIL — tier@85 fires (`(?i)` honored) |
| `pasaport U08296543` (lowercase label) | FAIL — tier fires | FAIL — tier fires |
| `Pasaport No: U08296543` (generic caseflag fixture) | warn only | FAIL — tier@75 fires |

So a lowercase `pasaport` label satisfies the label-context evidence in both versions
(the regex body is lowercase), and the previously-missed mixed-case `Pasaport` label
is now correctly matched — the `(?i)` intent is honored despite `case_sensitive: true`.
`node scripts/verify-pattern-testcases.mjs tr-passport-number` itself: passes before
and after (its negatives contain no label text).

### Fix 2 — both directions

Fixture A (`min_count: 2`, `unique_results` absent, single term `alpha`):

| should_not_match value | HEAD script | fixed script |
|---|---|---|
| `U12345678 alpha alpha` (same term twice) | no FAIL (distinct=1 < 2) | FAIL — tier fires (occurrences=2 >= 2) — correct |
| `U12345678 alpha` (one occurrence) | no FAIL | no FAIL (1 < 2) — correct |

Fixture B (`min_count: 2`, `unique_results: true`, terms `beta`,`gamma`):

| should_not_match value | HEAD script | fixed script |
|---|---|---|
| `U12345678 beta beta beta` (one distinct term) | no FAIL | no FAIL (distinct=1 < 2) — correct |
| `U12345678 beta gamma` (two distinct) | FAIL — tier fires | FAIL — tier fires — unchanged |

No catalog case exercises the non-unique direction: all 495 pattern files that use
`min_count` pair it with `unique_results: true`, and `unique_results: false` appears
nowhere in `data/patterns/` — hence the synthetic fixtures.

### Fix 3

Fixture (`type: keyword_list`, terms `{ text: TLA, case_sensitive: true }` and
`confidential`):

| test case | HEAD script | fixed script |
|---|---|---|
| should_match `TLA document` | pass | pass |
| should_match `CONFIDENTIAL memo` (ci term) | pass | pass |
| should_not_match `the tla report` (lowercase of cs term) | FAIL (term lowercased, spurious hit) | pass — correct |

Zero catalog `keyword_list`/`keyword_dictionary` patterns currently use per-term
`case_sensitive: true` objects in top-level `keywords` (checked programmatically), so
no catalog impact.

### Injection-proofing

Broken `should_match` values are still caught: fixture canaries
`should_match: no-passport-here` (regex fixture) and
`should_match: nothing relevant` (keyword_list fixture) both FAIL under the fixed
script, exactly as under HEAD.

## Before/after FAIL diff (--all)

- HEAD: `86 failure(s), 77 warning(s)` (exit 1)
- Fixed: `86 failure(s), 77 warning(s)` (exit 1)
- `diff` of the two full outputs (sorted FAIL lines and the complete logs):
  **byte-identical**. No test case flips status in the catalog.

Why nothing flipped, despite 291 `case_sensitive: true` patterns containing `(?i)`
regexes: the `(?i)` fix only makes evidence regexes MORE likely to match. That can
only change results where (a) a should_not_match value contains a case-divergent
evidence hit that previously escaped a tier (none do), (b) a NOT-group/exclusion
regex newly matches a should_match value (none do), or (c) a former false-FAIL
should_match clears (none existed — should_match does not require evidence). The
min_count fix is inert on the catalog (all uses are `unique_results: true`), and the
keyword-case fix is inert (no per-term case_sensitive objects in top-level keywords).

## Gates

- `npm run check` — CI check: 0 error(s), 57 warning(s)
- `npm run check:quality` — Quality gate PASSED
- `npm run compile` — Done: 1655 patterns, 20 collections, 131 keyword dictionaries
  (patterns.json restored via `git checkout -- patterns.json` before staging)

# Backlog j2 — engine/case_sensitive harmonization + corpus census

Date: 2026-07-08
Branch: feat/coverage-waves-d4 (isolated worktree)
Ticket: j2-engine-harmonization

## 1. What `engine` and `case_sensitive` actually control

Read: `scripts/compile.js`, `scripts/ci-check.mjs`, `scripts/verify-pattern-testcases.mjs`,
`scripts/verify-catalog-quality.mjs`, `scripts/remediate-catalog-quality.mjs`, `scripts/lib/apply-remediation-ops.mjs`.

### `engine` (top-level field, e.g. `universal` / `boost_regex`)

**Pure metadata. No script in this repo consumes it.**

- `scripts/compile.js` is a YAML→JSON passthrough: the field is copied verbatim into
  `patterns.json` and nothing branches on it.
- `scripts/ci-check.mjs` applies its Boost.RegEx banned-construct checks (`purviewBanned()`)
  based on **presence of a `purview:` block**, not on `engine` (line 62-65: patterns with a
  purview block get errors, others get warnings — `engine` is never read).
- `scripts/generate-from-sample.js` only *sets* a default of `engine: universal` on generated
  files (lines 610, 671); it never reads it back.
- No XML exporter lives in this repo (the `exports: [purview_xml, ...]` list is a declaration
  for downstream tooling), so within the repo `universal` vs `boost_regex` changes **nothing**
  about matching, gating, or the emitted `patterns.json` beyond the field's literal value.

Conclusion: converting `engine: universal` → `engine: boost_regex` is semantically safe. It is
a *declarative* statement of which regex engine the pattern targets. Since all three D4 files
carry full `purview:` blocks (and already pass the Boost.RegEx construct bans that ci-check
enforces on any purview-bearing pattern), `boost_regex` is the more accurate declaration and
matches the j1/j3/j4 sibling convention.

### `case_sensitive: true` (top-level field)

**Consumed. It gates the `i` regex flag in both verification harnesses:**

- `scripts/ci-check.mjs` line 26 + 74-75:
  `toRe(src, p.case_sensitive)` → `fl = caseSensitive ? '' : 'i'`.
  Without the field, every regex (top-level `pattern` and all `purview.regexes[]`) is tested
  **case-insensitively** (repo default). With `case_sensitive: true` the `i` flag is dropped.
- `scripts/verify-pattern-testcases.mjs` lines 26-28: identical convention
  (`let flags = p.case_sensitive ? '' : 'i'`).
- Note: `toRe` strips a leading inline `(?i)` group and does **not** re-add `i` when
  `case_sensitive: true` — irrelevant here (none of the three files use inline-flag regexes),
  but it matters for patterns like tr-passport-number's `(?i)` label-context regex.
- Downstream, the field is the declared caseSensitive attribute for exporters; within the repo
  the gates above are the operative semantics.

There is also a **term-level** `case_sensitive: true` (objects inside keyword `terms:`, e.g.
`my-tax-number`'s `TIN` / `LHDN` terms), consumed by `verify-catalog-quality.mjs`
(short-acronym risk check) and the remediation tooling. That is a separate mechanism and was
not touched.

Conclusion: adding `case_sensitive: true` **is a real detection-semantics change** in the
verification harness: lowercase forms that previously matched under the forced `i` flag are
rejected afterwards.

## 2. Harmonization decision: SAFE and CORRECT — converted all 3

All three formats are case-fixed uppercase in the real world:

- **hk-passport-number** — HKSAR passport series letters H / K / KJ are printed uppercase
  (document data page and MRZ; Immigration Department references in the file).
- **th-passport-number** — Thai passport letter prefixes are uppercase (MRZ document-number
  field, corroborated in the file's references).
- **my-tax-number** — LHDN issues individual TIN prefixes IG / OG / SG uppercase (LHDN /
  MyInvois references in the file).

This exactly mirrors the j1/j3/j4 siblings (tr/ar/ch/no/za-passport-number: all
`engine: boost_regex` + `case_sensitive: true` + lowercase should_not_match cases).

### Changes per file (all: version 1.0.0 → 1.1.0, changelog entry, operation text updated)

| file | engine | case_sensitive | new should_not_match |
|---|---|---|---|
| `data/patterns/hk-passport-number.yaml` | universal → boost_regex | added `true` | `h01234567`, `kj0123456` |
| `data/patterns/th-passport-number.yaml` | universal → boost_regex | added `true` | `aa1234567`, `a123456` |
| `data/patterns/my-tax-number.yaml` | universal → boost_regex | added `true` | `ig115002000`, `sg10234567090` |

### Empirical before/after verification (node, `toRe` reimplementation from ci-check.mjs)

Behavior change confirmed — lowercase forms WERE accepted before and are REJECTED after;
uppercase forms unchanged:

```
hk  h01234567       before(insensitive)=true  after(case_sensitive)=false
hk  k12345678       before(insensitive)=true  after(case_sensitive)=false
hk  kj0123456       before(insensitive)=true  after(case_sensitive)=false
hk  H01234567       before=true  after=true
th  a123456         before(insensitive)=true  after(case_sensitive)=false
th  aa1234567       before(insensitive)=true  after(case_sensitive)=false
th  A123456 / AA1234567  before=true  after=true
my  ig115002000     before(insensitive)=true  after(case_sensitive)=false
my  sg10234567090   before(insensitive)=true  after(case_sensitive)=false
my  "og 4040080091" before(insensitive)=true  after(case_sensitive)=false
my  IG115002000 / SG10234567090  before=true  after=true
```

The behavior change is documented in each file via the new lowercase `should_not_match` cases
and the 1.1.0 changelog entry.

### Compiled-output diff (patterns.json fragments)

Before (committed patterns.json):

```
hk-passport-number  version=1.0.0  engine=universal    case_sensitive=(absent)  negatives=3
th-passport-number  version=1.0.0  engine=universal    case_sensitive=(absent)  negatives=3
my-tax-number       version=1.0.0  engine=universal    case_sensitive=(absent)  negatives=3
```

After (`npm run compile`):

```
hk-passport-number  version=1.1.0  engine=boost_regex  case_sensitive=true      negatives=5
th-passport-number  version=1.1.0  engine=boost_regex  case_sensitive=true      negatives=5
my-tax-number       version=1.1.0  engine=boost_regex  case_sensitive=true      negatives=5
```

Regex sources unchanged; only engine/case_sensitive/version/test-cases/changelog/operation
changed — exactly as intended. (`patterns.json` itself reverted before staging per repo
convention.)

### Gates

- `npm run check` → 0 error(s) (57 pre-existing warnings, unrelated)
- `npm run check:quality` → Quality gate PASSED
- `npm run compile` → Done: 1655 patterns, 18 collections, 131 keyword dictionaries
- `node scripts/verify-pattern-testcases.mjs hk-passport-number th-passport-number my-tax-number`
  → all test_cases pass (2 regexes each)

## 3. Census: letter-prefixed identifiers using `engine: universal` without `case_sensitive`

Method: node script over `data/patterns/*.yaml` selecting patterns with
`engine: universal` (or absent), no top-level `case_sensitive`, a digit component, and a
top-level regex beginning (after `\b`/group openers) with uppercase literal letters or an
`[A-Z]`-bearing class. **74 candidates** (72 from the original scan + 2 added in review
fixes — the original scan required a literal `\d`/`[0-9]` for its "digit component" test and
missed patterns whose only digits live in `[A-Z0-9]`-style classes; see section 5). No
changes made to any of them in this task.

Because the repo's verification default is case-INSENSITIVE, every one of these currently
accepts lowercase forms (e.g. `atu12345678`, `ab123456`) in the CI harness.

### Group A — national ID / passport / licence / institution identifiers, case-fixed uppercase formats (strong harmonization candidates)

at-passport-number, at-vat-number, au-ahpra-registration, au-citizenship-certificate,
au-superannuation-fund-number, au-travel-document-id, be-passport-number, be-vat-number,
ca-drivers-license, ca-passport-number, cy-passport-number, cz-drivers-license,
de-drivers-license, de-vat-number, ee-drivers-license, ee-passport-number,
es-passport-number, eu-passport-number, eu-vat-number, fi-passport-number, fr-vat-number,
global-swift-bic, gr-drivers-license, gr-national-id, gr-passport-number, hk-identity-card,
hu-drivers-license, hu-passport-number, hu-vat-number, id-passport-number,
ie-passport-number, in-drivers-license, in-pan, in-voter-id, it-codice-fiscale,
it-drivers-license, it-passport-number, it-vat-number, jp-passport-number,
jp-residence-card, kr-passport-number, lu-passport-number, lv-drivers-license,
lv-passport-number, mx-curp, mx-rfc, nl-passport-number, nl-vat-number, nz-drivers-license,
ph-passport-number, pl-drivers-license, pl-identity-card, pl-passport-number,
pt-drivers-license, pt-passport-number, sg-drivers-license, sg-passport-number,
si-passport-number, sk-drivers-license, sk-passport-number, tw-national-id,
tw-resident-certificate, ua-passport-number-international, uk-driving-licence,
uk-electoral-roll, us-alien-registration-number, us-drivers-license,
us-drivers-license-multistate

(68 files.) Recommendation: harmonize in a dedicated follow-up wave, per-jurisdiction
verification that the format is genuinely case-fixed (most are — MRZ/document-printed
uppercase), adding lowercase should_not_match cases and changelog entries as done here.
Watch for: (a) handwritten/free-text sources where users type identifiers lowercase — the
tradeoff is precision vs recall; (b) patterns whose purview regexes carry inline `(?i)`
groups, because `toRe` drops the `i` when `case_sensitive: true` is set (audit those
label-context regexes before converting); (c) `au-number-plates` (also in this group's shape)
— plates are printed uppercase but commonly written lowercase informally; (d)
`global-swift-bic` (`\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b`) — ISO 9362 defines BICs as
uppercase and the pattern is entirely letter-prefixed/case-fixed, so it is a strong candidate,
but BICs are frequently typed lowercase in email prose ("swift: deutdeff"), so weigh the
recall cost before converting.

### Group B — case-sensitive secrets (harmonization candidates for a different reason)

- global-gcp-api-key (`\bAIza[0-9A-Za-z_-]{35}\b`) — the `AIza` prefix and the body are
  genuinely case-significant (API keys are case-sensitive secrets); testing it
  case-insensitively is arguably wrong today.
- global-aws-access-key (`\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b`)
  — literal uppercase prefixes and an uppercase-alphanumeric body; AWS access key IDs are
  genuinely case-sensitive credentials, the exact analogue of global-gcp-api-key. Missed by
  the original scan (no literal `\d`; see section 5).

These two are the strongest individual candidates in the census: the values are secrets whose
case is definitionally significant, so case-insensitive matching admits strings that cannot be
real keys.

### Group C — document/context patterns, likely deliberate case-insensitive (leave as-is)

- cabinet-budget-review-committee-submission (`CBRC...` — prose/heading matching)
- government-revenue-forecast-model (`FY\d{2}...` — fiscal-year notation, "fy26" plausible)
- procurement-tender-evaluation-with-pricing (`QLD-\d{4}-...` — tender reference in prose)

These match identifiers embedded in prose where lowercase variants are plausible; recommend
leaving case-insensitive unless a review says otherwise.

## 4. Bottom line

- `engine` is inert metadata in-repo; `boost_regex` is the accurate declaration for
  purview-bearing patterns. `case_sensitive: true` is a real semantics change (drops the
  forced `i` flag in both gates).
- The 3 D4 files were safely harmonized to the j1/j3/j4 convention; the behavior change
  (lowercase now rejected) is verified empirically and documented in test cases + changelogs.
- 74 further candidates catalogued (68 strong, 2 case-sensitive-secret special cases,
  3 leave-as-is); recommended as a separate follow-up wave. No changes made to them here.

## 5. Review fixes (2026-07-08)

Review flagged the census as incomplete: two clear in-scope candidates were missing.

- Root cause: the census script's "digit component" test required a literal `\d`/`[0-9]` in
  the pattern, so patterns whose only digit-bearing component is a combined class like
  `[A-Z0-9]` were silently excluded.
- Re-scan of that gap (engine universal / no `case_sensitive` / uppercase-prefixed /
  `[A-Z0-9]`-class digits / no literal `\d`) returned 7 files. Five are defensible
  exclusions under the census intent: au-unique-student-identifier and eu-drivers-license
  (pure `[A-Z0-9]{n}` classes, no fixed letter prefix, all-digit values valid),
  global-electronic-mail-id (mixed-case by definition), us-cui-banner-marking (prose banner
  marking, deliberately case-insensitive), and global-gcp-api-key (already in Group B).
- Two were genuine misses, now added:
  - **global-aws-access-key** → Group B (case-sensitive secret; literal uppercase prefixes
    `AKIA`/`ASIA`/... — same class of candidate as global-gcp-api-key).
  - **global-swift-bic** → Group A (ISO 9362 BICs are case-fixed uppercase; caution note on
    lowercase prose usage added to the Group A recommendation).
- Totals updated: 72 → 74 candidates; Group A 67 → 68 files; Group B 1 → 2.
- No pattern YAML files were changed in this fix (census is documentation-only per the
  ticket); gates re-run to confirm the tree is clean: check 0 errors, quality PASSED,
  compile OK (patterns.json reverted before staging), and the three j2 files still pass
  `verify-pattern-testcases`.

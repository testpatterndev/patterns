# Backlog ticket: cicheck-keywordlist-regexes — implementation report

**Date:** 2026-07-08
**Branch:** feat/coverage-waves-d4 (isolated worktree)
**File changed:** `scripts/ci-check.mjs` (script only — zero pattern files touched)

## Ticket

> ci-check does not compile/test purview.regexes for keyword_list-typed patterns
> (found Plan-1 Task 3: 61% of that changeset had untested regexes).

## Diagnosis: what the type gate actually did (and did not) skip

Empirical audit of the pre-change `scripts/ci-check.mjs` against the live catalog,
verified by injection tests (not by reading the code alone):

| Per-regex check | Coverage before | Evidence |
|---|---|---|
| Double-escape (`\\b`) | ALL types, all regexes | code path: `regexes[]` built from top-level + `purview.regexes` before any type gate |
| `\|top500` generator token | ALL types, all regexes | same loop |
| Purview/Boost ban checks (`.*`/`.+`, nested quantifiers, `^`/`$` anchors, capture-group count, variable-length lookbehind) | ALL types, all regexes | **TEST-C:** injected `.*` + `^` into `ai-jailbreak-persona` (keyword_list) purview regex → old script exited 1 with 2 errors |
| **Regex compilation** | **NOBODY — 0 of 4,257 regexes** | **TEST-A2:** injected verified-invalid regex (`(?:DAN(unclosed\|…` — "Unterminated group") into the same keyword_list purview regex → old script exited **0, 0 errors** |

So the ticket's framing needs one correction: the ban checks were **not** type-gated —
they already covered keyword_list purview regexes. The real hole was **compilation**:
`const compiled = regexes.map(r => { try { return toRe(r.src, …) } catch { return null } }).filter(Boolean)`
silently swallowed compile failures for **every** pattern type. The type gate
(`if (KW_TYPES.has(p.type)) { …keyword checks…; continue }`) then made the hole
total for keyword-typed patterns: their `purview.regexes` are never exercised by
test-case execution either, so an uncompilable phrase regex had **no** path to
detection and would ship to the tenant. Regex-typed patterns could only catch a
dead purview regex indirectly, if a `should_match` case happened to depend on it.

## Fix

Per-regex loop in `ci-check.mjs` now compiles every collected regex
(top-level `pattern` + every `purview.regexes[].pattern`, all types) and pushes an
ERROR on failure:

```
ERROR <slug>: <regex-id> regex does not compile — <first line of RegExp error>
```

The compiled results are reused for the downstream test-case execution (compiled
once, not twice — the old code compiled the same list a second time). Header
comment documents the new check.

## Before/after coverage counts (catalog census: 1,655 patterns)

| Pattern type | patterns | purview regexes | top-level patterns | compile-checked before | compile-checked after |
|---|---|---|---|---|---|
| regex | 1,436 | 2,429 | 1,436 | 0 | 3,865 |
| keyword_list | 142 | 123 | 15 | 0 | 138 |
| keyword_proximity | 72 | 174 | 67 | 0 | 241 |
| keyword_dictionary | 2 | 3 | 0 | 0 | 3 |
| document_marker | 2 | 6 | 1 | 0 | 7 |
| trainable_classifier | 1 | 3 | 0 | 0 | 3 |
| **Total** | **1,655** | **2,738** | **1,519** | **0** | **4,257** |

Ban/double-escape/top500 checks: 4,257 regexes both before and after (unchanged —
they were never type-gated).

## New findings on the full catalog: NONE

Running the extended check over all 1,655 patterns produced **0 new errors**
(0 errors / 57 warnings — identical counts to the pre-change baseline). An
independent probe script confirmed: all 2,738 purview regexes and all 1,519
top-level patterns compile cleanly under the CI harness's `toRe()`. Therefore:

- **Ticket candidates from newly-covered regexes: none.**
- **Inline invalid-regex fixes required: none** (no pattern files modified, no
  version bumps, no changelog entries).
- Nothing was downgraded to warning; the compile check reports at ERROR severity
  unconditionally.

## Gate proof (inject → fail → revert)

Target: `data/patterns/ai-jailbreak-persona.yaml` (type: `keyword_list`), purview
regex `Pattern_jailbreak_persona` (line 41 — chosen over the byte-identical
top-level `pattern:` on line 15 to prove the purview path specifically; an earlier
naive injection hit the TOP occurrence first and was redone).

| Proof | Injection into purview regex | Old script | New script |
|---|---|---|---|
| PROOF-1 | `(?:DAN(unclosed\|…` (invalid — Unterminated group, verified via `new RegExp` throw) | exit 0, 0 errors (TEST-A2) | **exit 1** — `Pattern_jailbreak_persona regex does not compile — … Unterminated group` |
| PROOF-2 | `(?i).*\b(?:DAN…` (banned `.*`) | exit 1 (TEST-C — already covered) | **exit 1** — `Purview-banned construct — unbounded/braced dot quantifier` |

Injection reverted after each proof; `git status` confirms only
`scripts/ci-check.mjs` (and this report) differ from HEAD.

## Runtime

Full run on the network share: ~3.1 s wall (was ~3 s). The compile work is not
new — the old script already attempted compilation and discarded failures — so
CI cost is unchanged.

## Gates

- `npm run check` — CI check: 0 error(s), 57 warning(s), exit 0
- `npm run check:quality` — Quality gate PASSED (0 issues outside exclusion set)
- `npm run compile` — Done: 1655 patterns, 20 collections, 131 keyword dictionaries
  (`patterns.json` reset via `git checkout --` before staging, per repo convention)

## Residual scope notes (not done, deliberately)

- JS `RegExp` remains the compilation proxy for Boost.RegEx, as it was for
  regex-typed patterns. Boost-only syntax (possessive quantifiers, atomic groups)
  would false-positive here, but the catalog contains none today; the ban-check
  suite covers the known Boost/Purview divergences.
- keyword-typed patterns' test cases are still validated against their `keywords`
  array, not their purview phrase regexes — that is correct semantics (detection
  for those types IS the keyword list; the phrase regexes are supporting
  evidence with no per-regex test fixtures in the schema). If per-purview-regex
  test fixtures are ever wanted, that is a schema addition — separate ticket.

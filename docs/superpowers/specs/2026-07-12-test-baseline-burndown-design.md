# Test-Baseline Burn-Down — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into a task-by-task implementation plan before touching any pattern file.

**Goal:** Eliminate the accepted defect baseline: 45 `verify-pattern-testcases.mjs --all` failures and the 57 `ci-check.mjs` warnings (all of the `should_not_match matched top-level` class), so the corpus verifies at 0 failures / 0 ci-check warnings and future regressions are instantly visible.

**Scope guard:** ONLY the 45 failures and 57 ci-check warnings are in scope. The harness's own 99 warnings and `check:quality`'s 505 informational issues are NOT targets — except where the correct fix for an in-scope item also clears one (e.g. marking a no-evidence 65-tier `discovery_only` clears both a harness FAIL and a `check:quality` "broad low tier should be marked discovery_only" informational; that's a side benefit, not a mandate to chase the other 60+ discovery_only informationals on non-failing patterns).

## The defect classes (from the captured inventory)

**Class A1 — no-evidence 65-tier fires on a bare topic fragment (~20 failures, all `global-top500-*`).**
E.g. `global-top500-460-dam-safety-and-integrity-reports` FAILs because should_not_match `"dam safety report"` fires `tier@65` whose `id_match` is the topic regex with no required evidence. The tier is a broad inventory tier in everything but name. Fix: mark the 65 tier `discovery_only: true` — the corpus-wide convention for exactly this tier shape (see `ar-cuit-cuil.yaml`, `au-ndis-number.yaml`, hundreds of others), which `verify-pattern-testcases.mjs:420` exempts from should_not_match enforcement and `verify-catalog-quality.mjs:372` stops flagging. `scripts/compile.js` contains no `discovery_only` handling beyond passthrough, so compiled detection behavior is unchanged — this is a metadata/harness-semantics fix. Patch version bump.

**Class A2 — evidence-bearing 75/85 tier fires because the test value is keyword-stuffed (~17 failures, all `au-top500-*`).**
E.g. `au-top500-353-campus-incident-reports` FAILs on `"campus incident security incident"` — a fragment stuffed with both the primary phrase and the corroborating evidence terms. Such a value isn't a genuine negative: a detector REQUIRING topic+evidence co-occurrence is working as designed when it fires on text containing topic+evidence. Per-file adjudication with this precedence:
1. If the tier's evidence requirement is genuinely weak (e.g. the evidence group's terms are substrings of the primary phrase itself — self-corroboration), strengthen the tier (require a distinct evidence group, or add `min_count`/`unique_results`). Minor bump.
2. Otherwise replace the bad test value with a realistic near-miss negative that preserves the test's intent (topic mentioned in prose without record context — the value must still be plausible business text, not a random string) and does NOT contain the evidence terms. Keep the original value's `description` intent, rewrite both. Patch bump.
3. If the au file also carries a no-evidence 65 tier of the A1 shape, apply the A1 fix too.

**Class B — legal/sensitive keyword_proximity patterns where realistic published/educational/celebratory prose fires (8 failures).**
`commission-of-inquiry-legal-submission` (×2), `lpp-claim-assessment`, `patent-prosecution-strategy-pre-filing` (×2), `sanctions-compliance-legal-assessment` — harness says "top-level pattern matches (no tiers to gate it)"; `witness-protection-program-record`, `sexual-assault-counselling-record`, `gender-reassignment-medical-record`, `global-top500-389-immigration-interview-transcripts` — an evidence tier fires. These test values are GOOD tests (realistic prose about published reports, awareness days, support services) that the patterns genuinely over-match. Fix path, in precedence order:
1. Investigate why the harness reports "no tiers to gate it" for the first four — if the tiers exist but are non-evaluable to the harness for a fixable structural reason, fix the structure.
2. Add published/historical/educational-context exclusion terms to the pattern's NOT-group(s) — the exact approach the legal-75-tier ticket (PR #23) used on 11 sibling files; follow its conventions. Verify the exclusion terms are collision-free against the pattern's should_match values (word-level, same matcher semantics), the discipline from the noise-gate sweep.
3. Only if an exclusion cannot cleanly separate the negative (the value is genuinely indistinguishable from a positive by any tier logic), adjust the test value — and record why in the changelog.
Minor bump for tier/exclusion changes.

**Class C — identifier patterns whose top-level regex matches a should_not_match value that Purview-side tiers/filters would gate (~25 ci-check warnings, no harness failure).**
E.g. `za-tax-number` warns on `"0000000000"`: the Purview export carries `AllDigitsSameFilter`, but the top-level `pattern` (the universal-engine detector consumed outside Purview) matches. Per-file adjudication:
1. Tighten the top-level regex where a bounded, Purview-safe construct exists (e.g. `(?!0{10})` negative lookahead for all-zeros — lookAHEAD is allowed; only variable-length lookBEHIND is banned per `purviewBanned()`; precedent: the AllDigitsSameFilter guards waves, PR #10). Minor bump. MANDATORY: re-run the per-slug harness AND `npm run check` after every regex edit (standing lesson from the Purview-safe regression).
2. If the value tests engine-divergent behavior no regex can express (checksum failures etc.), replace with a value that fails structurally, preserving description intent. Patch bump.
3. The ~30 remaining ci-check warnings on `top500-*` slugs share values with Class A1/A2 — fixing those clears these; no separate work.

## Conventions binding all fixes

- Every touched file: version bump (patch = test-value/metadata-only, minor = tier/regex/exclusion behavior) + dated changelog entry citing this burn-down, following each file's existing changelog format.
- No `should_match` regressions anywhere: the per-slug harness must pass for every touched slug, and `--all` failure count must only go DOWN, never sideways into new slugs.
- All regex edits stay Purview-safe per `scripts/ci-check.mjs` `purviewBanned()` (no nested quantifiers, no bare capture groups, no `.` quantifiers, no variable-length lookbehind, no anchors).
- `patterns.json` recompiled once at the end; publish workflow (`gh run list`) must be green after merge.

## Acceptance

- `node scripts/verify-pattern-testcases.mjs --all` → **0 failures** (warnings may change composition; A1 conversions add "inventory tier" warnings by design).
- `node scripts/ci-check.mjs` → **0 errors, 0 warnings**.
- `npm run check:quality` gate still PASSED.
- No `should_match` regressions (verified per-slug on all touched files).

## Out of scope

- The harness's 99 warnings as a target in themselves.
- `check:quality` informationals on patterns not in the failure/warning inventory.
- Any change to `scripts/verify-pattern-testcases.mjs`, `scripts/ci-check.mjs`, or `scripts/compile.js` semantics — this wave fixes data, not the referee. (If a harness bug is discovered, stop and report it rather than papering over it in data.)

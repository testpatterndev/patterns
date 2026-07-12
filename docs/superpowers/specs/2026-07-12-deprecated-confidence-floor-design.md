# Deprecated-Pattern Confidence Floor + Overlap Adjudication — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into a task-by-task implementation plan before touching `compile.js` or writing the report.

**Goal:** Resolve the two unresolved issues flagged in the final review of the Art-9/protected-attribute wave (`.superpowers/sdd/progress.md`, Task 5 context) — (1) the 8 new "honest low-confidence" patterns are currently outranked by their own deprecated medium-confidence predecessors on shared evidence, defeating the point of the replacement; (2) the new patterns' phrase alternations overlap with unrelated still-active patterns (top500-006/067/014).

**Context established during investigation:**

- `scripts/compile.js` is a pure aggregator: it validates required fields and dumps every pattern YAML into `patterns.json` verbatim. It does not read `status` or `confidence` for any filtering, ranking, or weighting today — those fields are inert as far as this repo's code is concerned. Whatever generates Purview SIT XML from `patterns.json` (downstream, not in this repo) is presumably what turns `confidence`/`purview.recommended_confidence`/`purview.pattern_tiers[].confidence_level` into real ranking behavior.
- The 8 deprecated top500 siblings (005/015/016/017 × au/global) are `type: regex` / `engine: boost_regex` with a full `purview.pattern_tiers` block using the repo's canonical confidence ladder (`VALID_LEVELS = {65, 75, 85}` in `verify-catalog-quality.mjs`), `recommended_confidence: 75`, and top-level `confidence: medium`.
- The 8 new Art-9 patterns are `type: keyword_list` / `engine: universal` — flat `pattern` + `keywords`, top-level `confidence: low`, **no** `purview` block at all.
- Two of the four overlap pairs named in the ticket (`top500-006`/`067` vs `nationality-origin`, `top500-014` vs `sexual-orientation`) are overlaps between two **still-active** patterns serving different classification purposes (HR/right-to-work document typing vs GDPR-adjacent protected-attribute topic detection) that legitimately share vocabulary. This is a different situation from the deprecated-vs-replacement pairs and does not need the same fix.

**Decision:** two independent fixes, not one:

1. **Confidence floor for deprecated patterns, enforced at compile time.** This is a genuine defect — fix it in code, not by hand-editing 8 YAML files.
2. **Active-active vocabulary overlap is an accepted trade-off, not a defect.** Document the adjudication; do not carve up regexes.

## Fix 1: Compile-time confidence floor for deprecated patterns

**Where:** `scripts/compile.js`, in the per-pattern loop (after `yaml.load`, before `patterns.push(data)`).

**What:** When `data.status === 'deprecated'`:
- Force the compiled `data.confidence` to `'low'` (regardless of the source YAML's stated value).
- If `data.purview?.recommended_confidence` is a number, cap it at `65` (`Math.min(current, 65)`).
- If `data.purview?.pattern_tiers` is an array, cap every numeric `tier.confidence_level` at `65`.

This only ever lowers values (never raises), so it can't introduce a `nonCanonical` violation (65 is already a valid canonical level) and can't turn a previously-distinct-evidence multi-tier pattern into an `duplicateLevelsIdentical` violation (evidence refs are untouched, only the level number changes).

**Why compile-time, not hand-edited source:** the source YAML's `confidence: medium` plus its `purview.pattern_tiers` are the historical record of what the pattern's authors originally claimed before the C3 deprecation decided the phrase evidence was too generic to trust. Overwriting that record in 8 files would erase that context and wouldn't automatically apply to any pattern deprecated in the future. A compile-time floor is a one-time, general fix: it establishes the invariant "a deprecated pattern's compiled confidence can never exceed the catalog's low tier" permanently, for these 8 and for anything deprecated later.

**Why a floor and not "one tier below whatever the deprecated pattern claims":** an absolute floor at the lowest canonical tier is simpler to reason about and guarantees the invariant holds regardless of what confidence a future replacement pattern happens to be rated at (a replacement rated `medium` would still correctly outrank a deprecated pattern floored to `low`/65).

**Consistency with C3 policy:** C3 established "detection logic unchanged, no silent removals" for deprecation — that policy is about whether a pattern still *fires* (it does, unchanged), not about its ranking metadata. Flooring confidence is a natural extension of C3's own intent (these patterns' confidence was already identified as overstated; the deprecation just hadn't corrected the number).

## Fix 2: Document the active-active overlap as an accepted trade-off

**Where:** new report `.superpowers/sdd/backlog-art9-overlap-confidence-report.md`, matching the existing `backlog-*-report.md` naming convention for post-hoc adjudications. Add a one-line cross-link from `c3-deprecation-report.md`'s coverage-gap note pointing at the new report.

**Content:**
- State the specific overlaps found: `citizenship status`/`immigration status`/`visa status` shared between `{global,au}-top500-006-citizenship-status.yaml`, `{global,au}-top500-067-right-to-work-verification-documents.yaml`, and `{global,au}-nationality-origin.yaml`; `gender identity` shared between `global-top500-014-gender-or-sex-marker.yaml` and the `gender identity disclosure` alternation in `global-sexual-orientation.yaml`.
- State the adjudication: these are two different classification purposes that legitimately produce overlapping matches on the same text (e.g. a sentence with "citizenship status" is simultaneously evidence of a right-to-work/citizenship-status document type *and* evidence of a nationality/immigration-status protected-attribute topic). Multiple SITs firing on the same evidence for different purposes is expected DLP-catalog behavior, not duplicate/redundant detection.
- State why regex surgery was rejected: carving the shared phrases out of one side would require rewriting `keywords`, `test_cases`, and descriptive prose across multiple files, and would shrink an honest topic classifier's documented coverage to avoid overlapping with an unrelated-purpose classifier — solving a non-problem at real cost.
- Note the fix that *was* applied for the genuinely broken case (deprecated-vs-replacement inversion) and why that's different in kind from this active-active case.
- Leave a pointer for a future revisit: if operational data (alert volume/fatigue) ever shows this overlap is a real problem in practice, the right fix is policy/dashboard-level dedup by `data_categories`/`regulations`, not shrinking pattern coverage.

## Verification

- `npm run check` — 0 errors (same baseline as before: repo currently has 0 CI errors).
- `npm run check:quality` — no new failures in `shortAcronyms,nonCanonical,duplicateLevelsIdentical,weakHigh`.
- `node scripts/verify-pattern-testcases.mjs --all` — baseline is 45 pre-existing failures / 99 warnings; this change touches no regex/keyword content, so that count must not change.
- `npm run compile` — regenerate `patterns.json`; spot-check that a deprecated pattern (e.g. `global-top500-015-sexual-orientation`) now has `confidence: "low"` and `purview.pattern_tiers[].confidence_level <= 65` in the compiled output, while the source YAML is untouched.
- Diff `patterns.json` to confirm only the 8 deprecated patterns' compiled `confidence`/`pattern_tiers` values changed — no other pattern's compiled output should differ.

## Out of scope

- Not touching any regex/keyword content in the 8 new Art-9 patterns or the 4 active top500 patterns (006/067/014 × variants) — the overlap is adjudicated as acceptable, not fixed by content changes.
- Not building a general cross-pattern overlap-detection tool — this was a manually-identified, manually-adjudicated case, not a new CI gate.
- Not modifying the 8 deprecated patterns' source YAML `confidence`/`purview` values — only the compiled `patterns.json` output changes.
- Not changing `ci-check.mjs` or `verify-catalog-quality.mjs` — the floor logic lives entirely in `compile.js` since it's a compiled-output concern, not a source-validity concern.

# Deprecated-Pattern Confidence Floor + Overlap Adjudication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `compile.js` floor a deprecated pattern's compiled confidence to the catalog's lowest canonical tier (so it can never outrank the active replacement pattern it exists to be superseded by), and write up the active-active vocabulary-overlap question as an adjudicated, accepted trade-off rather than a code change.

**Architecture:** One small transform added to `scripts/compile.js`'s existing per-pattern loop (no new files, no new npm scripts, no new CI gates) plus one new markdown report cross-linked from the existing `c3-deprecation-report.md`. `patterns.json` is a checked-in generated artifact in this repo (see recent commit history, e.g. `144bfe5633 chore(build): recompile patterns.json`) — it gets regenerated and committed as part of this work, same as prior waves.

**Tech Stack:** Plain Node.js (`type: module`, no test framework in this repo — see `scripts/lib/__tests__/apply-remediation-ops.test.mjs`'s own comment header), `js-yaml`, existing `npm run compile` / `npm run check` / `npm run check:quality` / `node scripts/verify-pattern-testcases.mjs` scripts.

## Global Constraints

- Floor applies only to compiled output (`patterns.json`); **never** edit the 8 deprecated patterns' source YAML `confidence`/`purview` values.
- Floor only ever lowers a number, never raises one: `Math.min(current, 65)` for numeric tier levels, and force `confidence` to the string `'low'` — never anything more elaborate.
- `65` is the floor value (the lowest rung of this repo's canonical confidence ladder, `VALID_LEVELS = new Set([65, 75, 85])` in `scripts/verify-catalog-quality.mjs`).
- Do not touch `scripts/ci-check.mjs` or `scripts/verify-catalog-quality.mjs` — this is a compiled-output concern only.
- Do not touch any regex/keyword content in `data/patterns/*.yaml` — this plan changes zero detection logic.
- Baseline going in, must not regress: `npm run check` → 0 errors; `node scripts/verify-pattern-testcases.mjs --all` → 45 pre-existing failures / 99 warnings (unchanged count, since no test_cases or regex content changes).
- New report file follows the existing `backlog-*-report.md` naming convention used throughout `.superpowers/sdd/` (e.g. `backlog-quality-residuals-report.md`, `backlog-tier-harness-report.md`).

---

## Task 1: Compile-time confidence floor for deprecated patterns

**Files:**
- Modify: `scripts/compile.js:58-115` (the per-pattern loop)
- Modify: `patterns.json` (regenerated, not hand-edited)

**Interfaces:**
- Produces: every object in `patterns.json`'s `patterns` array where `status === 'deprecated'` now has `confidence === 'low'`, and (if it had a `purview` block) every `purview.pattern_tiers[].confidence_level` and `purview.recommended_confidence` capped at `<= 65`.

- [ ] **Step 1: Confirm current (pre-fix) inversion exists**

Run:
```bash
node -e "
const data = JSON.parse(require('fs').readFileSync('patterns.json', 'utf-8'));
const p = data.patterns.find(p => p.slug === 'global-top500-015-sexual-orientation');
console.log('status:', p.status, 'confidence:', p.confidence, 'recommended_confidence:', p.purview.recommended_confidence, 'tier levels:', p.purview.pattern_tiers.map(t => t.confidence_level));
"
```
Expected output (current, un-fixed state): `status: deprecated confidence: medium recommended_confidence: 75 tier levels: [ 75, 65 ]`

This confirms the deprecated pattern is currently compiled at `medium`/75 — strictly above the `low`/65 that `global-sexual-orientation` (its replacement) compiles at. This is the defect Task 1 fixes.

- [ ] **Step 2: Add the floor transform to `compile.js`**

Open `scripts/compile.js`. Find this existing block (currently lines 58-68):

```js
for (const file of patternFiles) {
  const raw = readFileSync(file, 'utf-8')
  const data = yaml.load(raw)

  // keyword_dictionary patterns don't need a 'pattern' field
  const reqFields = data.type === 'keyword_dictionary' || data.type === 'keyword_list'
    ? REQUIRED_KEYWORD_FIELDS
    : REQUIRED_PATTERN_FIELDS

  if (!validate(data, reqFields, file)) continue

  // Resolve keyword_lists references in corroborative_evidence
```

Insert a new block immediately after the `if (!validate(...)) continue` line and before the `// Resolve keyword_lists references` comment, so the loop reads:

```js
for (const file of patternFiles) {
  const raw = readFileSync(file, 'utf-8')
  const data = yaml.load(raw)

  // keyword_dictionary patterns don't need a 'pattern' field
  const reqFields = data.type === 'keyword_dictionary' || data.type === 'keyword_list'
    ? REQUIRED_KEYWORD_FIELDS
    : REQUIRED_PATTERN_FIELDS

  if (!validate(data, reqFields, file)) continue

  // Deprecated patterns must never outrank an active replacement on shared
  // evidence: floor their compiled confidence to this catalog's lowest
  // canonical tier. Source YAML confidence/purview values are left
  // untouched (historical record of what the pattern originally claimed);
  // only the compiled patterns.json output is demoted.
  const DEPRECATED_CONFIDENCE_FLOOR = 'low'
  const DEPRECATED_TIER_FLOOR = 65
  if (data.status === 'deprecated') {
    data.confidence = DEPRECATED_CONFIDENCE_FLOOR
    if (typeof data.purview?.recommended_confidence === 'number') {
      data.purview.recommended_confidence = Math.min(data.purview.recommended_confidence, DEPRECATED_TIER_FLOOR)
    }
    if (Array.isArray(data.purview?.pattern_tiers)) {
      for (const tier of data.purview.pattern_tiers) {
        if (typeof tier.confidence_level === 'number') {
          tier.confidence_level = Math.min(tier.confidence_level, DEPRECATED_TIER_FLOOR)
        }
      }
    }
  }

  // Resolve keyword_lists references in corroborative_evidence
```

Leave everything else in the file (the keyword-resolution blocks, the collections/keywords loading, the final `output` object and `writeFileSync`) unchanged.

- [ ] **Step 3: Recompile**

Run: `npm run compile`
Expected: `Done: 1663 patterns, ... → patterns.json` (same pattern count as before — this task adds no new pattern files), no `WARN`/`Compile failed` lines.

- [ ] **Step 4: Verify the floor took effect**

Run the same inspection command as Step 1:
```bash
node -e "
const data = JSON.parse(require('fs').readFileSync('patterns.json', 'utf-8'));
const p = data.patterns.find(p => p.slug === 'global-top500-015-sexual-orientation');
console.log('status:', p.status, 'confidence:', p.confidence, 'recommended_confidence:', p.purview.recommended_confidence, 'tier levels:', p.purview.pattern_tiers.map(t => t.confidence_level));
"
```
Expected (post-fix): `status: deprecated confidence: low recommended_confidence: 65 tier levels: [ 65, 65 ]`

- [ ] **Step 5: Verify all 16 deprecated patterns were floored, and nothing else changed**

Run:
```bash
node -e "
const data = JSON.parse(require('fs').readFileSync('patterns.json', 'utf-8'));
const deprecated = data.patterns.filter(p => p.status === 'deprecated');
console.log('deprecated pattern count:', deprecated.length);
const bad = deprecated.filter(p => p.confidence !== 'low' || (p.purview?.pattern_tiers || []).some(t => t.confidence_level > 65) || (p.purview?.recommended_confidence ?? 0) > 65);
console.log('still above floor:', bad.map(p => p.slug));
const active = data.patterns.filter(p => p.status !== 'deprecated');
console.log('active patterns with confidence high/medium (spot count, should be unchanged from before this task):', active.filter(p => p.confidence === 'high' || p.confidence === 'medium').length);
"
```
Expected: `deprecated pattern count: 16` (au+global × 005/015/016/017), `still above floor: []`, and the active-pattern high/medium count is just a sanity spot-check (no assertion needed — just confirming the floor logic didn't accidentally touch `status !== 'deprecated'` patterns, which it structurally can't since the whole block is gated on `data.status === 'deprecated'`).

- [ ] **Step 6: Verify source YAML untouched**

Run: `git diff --stat -- data/patterns/`
Expected: empty output (no source pattern YAML files modified — only `patterns.json` and `scripts/compile.js` should show in `git status`).

- [ ] **Step 7: Commit**

```bash
git add scripts/compile.js patterns.json
git commit -m "$(cat <<'EOF'
fix(compile): floor deprecated patterns' compiled confidence to low

A deprecated pattern's compiled confidence/purview tier levels are now
capped at this catalog's lowest canonical tier (low/65), so it can
never outrank the active, intentionally-honest-low-confidence
replacement pattern it exists to be superseded by (e.g.
global-top500-015-sexual-orientation at medium/75 was outranking its
own replacement global-sexual-orientation at low/65 on the shared
"sexual orientation" phrase). Source YAML confidence/purview values
are untouched — this only affects the compiled patterns.json output.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Document the active-active overlap as an accepted trade-off

**Files:**
- Create: `.superpowers/sdd/backlog-art9-overlap-confidence-report.md`
- Modify: `.superpowers/sdd/c3-deprecation-report.md` (add one cross-link line)

**Interfaces:**
- Consumes: none from Task 1 (independent, doc-only change).
- Produces: nothing consumed by later tasks — this is a terminal documentation artifact.

- [ ] **Step 1: Write the report**

Create `.superpowers/sdd/backlog-art9-overlap-confidence-report.md`:

```markdown
# Art-9 Wave Overlap/Confidence-Inversion Adjudication

Follow-up to the Art-9/protected-attribute pattern wave (see
`c3-deprecation-report.md` and
`docs/superpowers/specs/2026-07-12-art9-protected-attribute-patterns-design.md`).
The final review of that wave (progress.md, Task 5 context) flagged two
related but distinct issues. This report records the adjudication for both.

## Issue 1: deprecated-vs-replacement confidence inversion — FIXED

The 8 new patterns (`{au,global}-{sexual-orientation,religious-beliefs,
racial-ethnic-origin,nationality-origin}`) are deliberately rated
`confidence: low` — an honest signal that a bare topic phrase like "sexual
orientation" is weak evidence on its own. But their deprecated
predecessors (`{au,global}-top500-{005,015,016,017}-*`) are still rated
`confidence: medium` (`recommended_confidence: 75`, some with an 85 tier)
in the compiled catalog, and match the exact same core phrase (e.g. bare
"sexual orientation" matches both `global-top500-015-sexual-orientation`
and its replacement `global-sexual-orientation`). On shared evidence, the
deprecated pattern was outranking the honest pattern created specifically
to replace it — the opposite of the intended relationship.

**Fix:** `scripts/compile.js` now floors any `status: deprecated` pattern's
compiled `confidence` to `'low'` and caps `purview.pattern_tiers[].
confidence_level` / `purview.recommended_confidence` at `65` (this
catalog's lowest canonical tier). This is a compiled-output-only change —
the source YAML's original `confidence: medium` and tier values are left
untouched as the historical record of what the pattern originally
claimed before C3 identified its phrase evidence as too generic to trust.
The floor is general: it applies automatically to these 16 patterns and to
any pattern deprecated in the future, with no per-file hand-editing.

## Issue 2: active-active vocabulary overlap — ACCEPTED, NOT FIXED

Two of the four new patterns share literal phrases with unrelated,
still-active (non-deprecated) patterns:

- `citizenship status` / `immigration status` / `visa status` appear in
  both `{au,global}-nationality-origin.yaml` (low confidence, GDPR-adjacent
  protected-attribute topic classifier) and
  `{au,global}-top500-006-citizenship-status.yaml` /
  `{au,global}-top500-067-right-to-work-verification-documents.yaml`
  (medium confidence, HR/right-to-work document-type classifiers).
- `gender identity` appears in both `global-sexual-orientation.yaml`'s
  `gender identity disclosure` alternation and
  `global-top500-014-gender-or-sex-marker.yaml`'s bare `gender\s+identity`.

A document containing e.g. "citizenship status" can fire multiple SITs
simultaneously across these pairs.

**Adjudication: this is expected, not a defect.** The overlapping patterns
serve different classification purposes that legitimately produce
overlapping matches on the same text — a sentence with "citizenship
status" is simultaneously evidence of a citizenship-status/right-to-work
*document type* (top500-006/067's job) and evidence that a nationality/
immigration-status *protected-attribute topic* is present
(nationality-origin's job). Multiple SITs firing on shared evidence for
different purposes is normal DLP-catalog behavior, not duplicate
detection with no informational gain.

**Why regex surgery was rejected:** carving the shared phrases out of
either side would require rewriting `keywords`, `test_cases`, and
descriptive prose across multiple files (e.g. `nationality-origin`'s
`should_match` test cases explicitly exercise "citizenship status" and
"visa status" as primary example phrases), and would shrink an honest
topic classifier's documented coverage purely to avoid overlapping with an
unrelated-purpose classifier — solving a non-problem at real cost. Trimming
the *old* side (006/067/014) was also rejected: those patterns predate
this wave and serve a different, still-valid purpose; shrinking their
coverage to make room for a newcomer doesn't serve their own stated intent
either.

**Future revisit trigger:** if operational data (alert volume, analyst
fatigue) ever shows this overlap causes real duplicate-alert pain in
practice, the right fix is policy/dashboard-level deduplication by
`data_categories`/`regulations` at the DLP-policy layer, not shrinking
pattern coverage in this catalog.
```

- [ ] **Step 2: Cross-link from `c3-deprecation-report.md`**

Read `.superpowers/sdd/c3-deprecation-report.md` and find the line(s) discussing the "Coverage gap logged" note for the sensitive-attribute top500 deprecations (the note that led to the Art-9 wave). Add one line immediately after that note:

```markdown
> **2026-07-12 follow-up:** the Art-9 wave that filled this gap surfaced a
> confidence-inversion defect (fixed) and an active-active vocabulary
> overlap (adjudicated as accepted) — see
> `backlog-art9-overlap-confidence-report.md`.
```

- [ ] **Step 3: Verify the files render as valid markdown and the cross-link resolves**

Run: `test -f .superpowers/sdd/backlog-art9-overlap-confidence-report.md && echo "report exists"`
Expected: `report exists`

Run: `grep -n "backlog-art9-overlap-confidence-report.md" .superpowers/sdd/c3-deprecation-report.md`
Expected: one matching line (the cross-link you just added).

- [ ] **Step 4: Commit**

```bash
git add .superpowers/sdd/backlog-art9-overlap-confidence-report.md .superpowers/sdd/c3-deprecation-report.md
git commit -m "$(cat <<'EOF'
docs(sdd): adjudicate Art-9 wave overlap/confidence-inversion follow-up

Records the decision from the Task-5 final-review follow-up: the
deprecated-vs-replacement confidence inversion is a real defect (fixed
in scripts/compile.js, see prior commit); the active-active vocabulary
overlap between nationality-origin/sexual-orientation and unrelated
still-active patterns (top500-006/067/014) is adjudicated as an
accepted trade-off, not a defect, since the overlapping patterns serve
genuinely different classification purposes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Full verification sweep

**Files:** none (verification only — may amend Task 1/2 if a check surfaces a real regression, otherwise no changes).

**Interfaces:**
- Consumes: the compiled `patterns.json` from Task 1 and the report files from Task 2.
- Produces: a pass/fail confirmation that both changes are safe to leave as the final state of this work.

- [ ] **Step 1: Run `npm run check`**

Run: `npm run check`
Expected: `0 errors` in the output (matching the pre-existing baseline — this task's changes don't touch any `REQUIRED_PATTERN_FIELDS` or schema-validated fields).

- [ ] **Step 2: Run `npm run check:quality`**

Run: `npm run check:quality`
Expected: exits 0 (no new `shortAcronyms`, `nonCanonical`, `duplicateLevelsIdentical`, or `weakHigh` failures — flooring existing tier numbers down to an already-canonical value of 65 cannot introduce a `nonCanonical` violation, and doesn't change which tiers have identical vs. distinct evidence refs, so it cannot introduce a new `duplicateLevelsIdentical` violation either).

- [ ] **Step 3: Run the full test-case harness**

Run: `node scripts/verify-pattern-testcases.mjs --all`
Expected: the same baseline as going in — 45 pre-existing test failures / 99 warnings, unchanged count. (This task changed zero `test_cases`, `pattern`, or `keywords` content in any source YAML, so the pass/fail set for every pattern's test cases must be identical to before.)

- [ ] **Step 4: Diff review of `patterns.json`**

Find the Task 1 commit that changed `scripts/compile.js` and get its parent commit (the last commit before this work's `patterns.json` recompile):
```bash
git log --oneline -- scripts/compile.js | head -3
```
Note the hash of the commit whose message starts with `fix(compile): floor deprecated patterns' compiled confidence to low` (call it `TASK1_SHA`), then run:
```bash
node -e "
const { execSync } = require('child_process');
const before = JSON.parse(execSync('git show TASK1_SHA~1:patterns.json').toString());
const after = JSON.parse(require('fs').readFileSync('patterns.json', 'utf-8'));
const beforeMap = new Map(before.patterns.map(p => [p.slug, p]));
let changedSlugs = [];
for (const p of after.patterns) {
  const b = beforeMap.get(p.slug);
  if (!b) continue;
  if (JSON.stringify(b.confidence) !== JSON.stringify(p.confidence) || JSON.stringify(b.purview) !== JSON.stringify(p.purview)) {
    changedSlugs.push(p.slug);
  }
}
console.log('slugs with changed confidence/purview:', changedSlugs.sort());
"
```
(substitute the actual hash for `TASK1_SHA` before running). Expected: exactly the 16 deprecated slugs — `au-top500-005-nationality`, `global-top500-005-nationality`, `au-top500-015-sexual-orientation`, `global-top500-015-sexual-orientation`, `au-top500-016-religious-or-philosophical-beliefs`, `global-top500-016-religious-or-philosophical-beliefs`, `au-top500-017-ethnicity-or-race`, `global-top500-017-ethnicity-or-race` — i.e. no active, non-deprecated pattern's compiled confidence or purview block changed.

If any unexpected slug shows up, stop and investigate before proceeding — it means the floor logic in `compile.js` reached a pattern it shouldn't have.

- [ ] **Step 5: Final status check**

Run: `git status`
Expected: clean working tree (Tasks 1 and 2 already committed everything; this task made no changes if all checks passed).

# Test-Baseline Burn-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the corpus from 45 harness failures / 57 ci-check warnings to **0 / 0**, per `docs/superpowers/specs/2026-07-12-test-baseline-burndown-design.md` (read it first — it defines the defect classes A1/A2/B/C and the fix rubric; this plan operationalizes it).

**Architecture:** Pure data-file fixes across ~63 pattern YAMLs in `data/patterns/`, four independent cohort tasks + one verification task. No script/compiler changes permitted (design's out-of-scope rule: if a harness bug is found, STOP and report, don't paper over it in data).

**Tech Stack:** YAML pattern files; referees are `node scripts/verify-pattern-testcases.mjs`, `node scripts/ci-check.mjs` (verbose via `CI_VERBOSE=1`), `npm run check:quality`, `node scripts/compile.js`.

## Global Constraints

- Baseline going in: `verify-pattern-testcases.mjs --all` = 45 failures / 99 warnings; `ci-check.mjs` = 0 errors / 57 warnings; quality gate PASSED.
- Every touched file gets a version bump (patch = test-value/metadata-only, minor = tier/regex/exclusion behavior change) and a dated (`'2026-07-12'`) changelog entry describing the specific fix, in that file's existing changelog format.
- Zero `should_match` regressions: after editing any file, run `node scripts/verify-pattern-testcases.mjs <slug>` and require "all test_cases pass" (or, for A1 conversions, FAIL count 0 — a new `discovery_only` inventory *warning* for the old failing value is expected and correct).
- All regex edits must stay Purview-safe per `scripts/ci-check.mjs` `purviewBanned()`: no nested quantifiers, no bare `(...)` capture groups, no `.` with quantifiers, no `^`/`$` anchors, no variable-length lookbehind. Negative lookAHEAD (e.g. `(?!0{10})`) IS allowed. After every regex edit, `npm run check` must show 0 errors.
- When a top-level `pattern:` and a `purview.regexes[].pattern` carry the same regex, edit BOTH (they must stay in sync — check every file for a mirrored copy before finishing it).
- Adjudication discipline: if a file does not fit the rubric below, do NOT invent a fix — record it in the task report as `NEEDS-ADJUDICATION: <slug> — <why>` and move on. The controller resolves those.
- Do not touch `scripts/`, `patterns.json` (until Task 5), or any pattern file not named in your task's inventory.

---

### Task 1: Class A1 — mark no-evidence 65-tiers `discovery_only` (19 global-top500 files)

**Files (Modify):** `data/patterns/<slug>.yaml` for each of:
```
global-top500-241-private-source-code-repositories
global-top500-283-intrusion-detection-alerts
global-top500-285-sensitive-network-topology-diagrams
global-top500-286-vulnerability-scan-outputs
global-top500-287-patch-exception-records
global-top500-300-insider-threat-investigation-files
global-top500-353-campus-incident-reports
global-top500-389-immigration-interview-transcripts
global-top500-441-scada-network-diagrams
global-top500-442-plc-logic-programs
global-top500-443-distributed-control-system-configurations
global-top500-444-substation-protection-relay-settings
global-top500-446-water-treatment-dosing-formulas
global-top500-450-rail-signaling-configurations
global-top500-456-ot-cyber-incident-reports
global-top500-457-physical-badge-access-maps
global-top500-459-hazardous-material-storage-maps
global-top500-460-dam-safety-and-integrity-reports
global-top500-498-sovereign-debt-issuance-plans
```

**Interfaces:** none (standalone data files).

- [ ] **Step 1: For each file,** locate the `purview.pattern_tiers` entry with `confidence_level: 65` that the harness reported firing (each file's FAIL is a should_not_match fragment firing tier@65). Verify the tier has NO required positive evidence (`matches:` absent, or only NOT-groups/exclusions). If it HAS positive evidence requirements, do not mark it — record `NEEDS-ADJUDICATION` and skip the file.
- [ ] **Step 2: Add `discovery_only: true`** to that tier, placed directly after `confidence_level: 65` (the corpus convention — see `data/patterns/ar-cuit-cuil.yaml` tier 65 for the exact shape). Bump patch version; add changelog entry: `'Baseline burn-down: mark the no-evidence 65 tier discovery_only — it is a broad inventory tier by shape (id_match only, no required evidence), so bare topic fragments correctly surface in discovery rather than counting as classification; aligns with corpus convention and clears the should_not_match failure + check:quality discoveryMissing informational. No compiled detection change (discovery_only is harness/quality metadata).'`
- [ ] **Step 3: Verify each file:** `node scripts/verify-pattern-testcases.mjs <slug>` → 0 FAILs (an inventory-tier warn for the old value is expected).
- [ ] **Step 4: Verify the cohort:** run the harness once with all 19 slugs → 0 FAILs; `npm run check` → 0 errors.
- [ ] **Step 5: Commit** all 19 files: `git commit -m "fix(patterns): baseline burn-down A1 — mark 19 no-evidence 65 tiers discovery_only"`.

---

### Task 2: Class A2 — adjudicate keyword-stuffed negatives on evidence tiers (17 au-top500 files)

**Files (Modify):** `data/patterns/<slug>.yaml` for each of:
```
au-top500-225-reliability-and-failure-analysis
au-top500-241-private-source-code-repositories
au-top500-283-intrusion-detection-alerts
au-top500-285-sensitive-network-topology-diagrams
au-top500-287-patch-exception-records
au-top500-300-insider-threat-investigation-files
au-top500-353-campus-incident-reports
au-top500-442-plc-logic-programs
au-top500-443-distributed-control-system-configurations
au-top500-444-substation-protection-relay-settings
au-top500-446-water-treatment-dosing-formulas
au-top500-456-ot-cyber-incident-reports
au-top500-458-cctv-coverage-and-blind-spot-analyses
au-top500-460-dam-safety-and-integrity-reports
au-top500-461-enterprise-data-inventories
au-top500-483-election-incident-response-records
au-top500-498-sovereign-debt-issuance-plans
```
Each FAILs because a should_not_match fragment (e.g. `"campus incident security incident"`, `"voter sovereign debt"`) fires an evidence-bearing tier@75 or tier@85 — the fragment contains both the primary phrase and the corroborating evidence terms.

**Interfaces:** none.

- [ ] **Step 1: For each file, adjudicate in this order (design Class A2):**
  1. **Self-corroboration check:** if the firing tier's evidence group is satisfied by words that are part of the primary phrase itself (the id_match regex's own tokens double as the evidence terms), the tier is self-corroborating — strengthen it (require a distinct evidence group, or add `min_count: 2` + `unique_results: true` to the existing ref) so a bare fragment cannot satisfy it. Minor bump.
  2. **Otherwise the test value is defective** (a detector requiring topic+evidence co-occurrence working as designed on a value stuffed with topic+evidence): replace the should_not_match `value` with a realistic prose near-miss that mentions the topic WITHOUT the evidence terms and does not fire any tier (e.g. for campus incidents: `'The university published its annual campus safety statistics on the website.'`). Keep/update the `description` to state what the value now exercises. Patch bump.
  3. If the file also carries a no-evidence 65 tier matching Class A1's shape (check!), apply the A1 fix (`discovery_only: true`) too — same changelog language as Task 1.
- [ ] **Step 2:** Changelog entry per file describing which branch of the rubric applied and why (one or two sentences citing the actual tier/value).
- [ ] **Step 3: Verify each file:** `node scripts/verify-pattern-testcases.mjs <slug>` → 0 FAILs and all should_match still pass.
- [ ] **Step 4: Verify the cohort:** harness with all 17 slugs → 0 FAILs; `npm run check` → 0 errors.
- [ ] **Step 5: Commit:** `git commit -m "fix(patterns): baseline burn-down A2 — adjudicate stuffed negatives / self-corroborating tiers (17 au-top500 files)"`.

---

### Task 3: Class B — legal/sensitive patterns firing on published/educational prose (7 files)

**Files (Modify):** `data/patterns/<slug>.yaml` for each of:
```
commission-of-inquiry-legal-submission   (2 FAILs, "top-level pattern matches (no tiers to gate it)")
lpp-claim-assessment                     (1 FAIL, same class)
patent-prosecution-strategy-pre-filing   (2 FAILs, same class)
sanctions-compliance-legal-assessment    (1 FAIL, same class)
gender-reassignment-medical-record       (1 FAIL, tier@75 fires)
sexual-assault-counselling-record        (1 FAIL, tier@75 fires)
witness-protection-program-record        (1 FAIL, tier@75 fires)
```
The failing values are REALISTIC prose about published reports, awareness days, government services, textbooks — good tests the patterns genuinely over-match. Full failing values are in each file's `test_cases.should_not_match` (match them against the harness output).

**Interfaces:** none.

- [ ] **Step 1 (first four files): investigate the "no tiers to gate it" report.** All four are `type: keyword_proximity` WITH a `pattern_tiers` block — read `scripts/verify-pattern-testcases.mjs` (READ ONLY — no edits) to determine why the harness treats their tiers as non-gating for these values (likely: every tier's id_match itself matches the value and no tier carries an exclusion the value trips, so the top-level `pattern` is decisive; or the tiers are structurally non-evaluable). Record the mechanism in the task report — the right fix depends on it.
- [ ] **Step 2: For each file, fix by the design's Class B precedence:**
  1. If tiers are structurally non-evaluable for a fixable reason, fix the structure (minor bump).
  2. Add published/historical/educational-context exclusion terms to the pattern's NOT-group(s) — follow the conventions of the legal-75-tier wave (see `data/patterns/crown-solicitor-legal-opinion.yaml` and `native-title-negotiation-strategy.yaml` 1.4.0 changelogs for the established shape). Candidate terms per the failing values: `published report`, `final report was published`, `textbook`, `article discusses`, `annual report`, `Day of Visibility`, `awareness day`, `funds ... services` — choose terms that are (a) present in or clearly generalize the failing negatives, (b) word-level collision-free against EVERY should_match value of that file (verify with the same `(?<![A-Za-z0-9_])term(?![A-Za-z0-9_])` case-insensitive semantics the harness uses — this is the noise-gate sweep's discipline). Minor bump.
  3. Only if no clean exclusion separates a value (it is genuinely indistinguishable from a positive), adjust the test value and say why in the changelog. Patch bump.
- [ ] **Step 3: Verify each file:** per-slug harness → 0 FAILs, all should_match pass. For files where you added exclusions, ALSO confirm the exclusion did not silently kill any should_match (the harness covers this, but state it explicitly in the report).
- [ ] **Step 4:** `npm run check` → 0 errors. Commit: `git commit -m "fix(patterns): baseline burn-down B — published/educational-context gating for 7 legal/sensitive patterns"`.

---

### Task 4: Class C — identifier top-level regex warnings (20 files, 21 warnings)

**Files (Modify):** `data/patterns/<slug>.yaml` per this inventory (warning value shown truncated):
```
Repeated-digit / specimen class (fix: Purview-safe negative-lookahead guard on the top-level regex AND its mirrored purview.regexes copy if identical; precedent: the AllDigitsSameFilter guard waves):
  au-motor-vehicle-permit      "00000000"
  au-taxation-identifier       "000000000" and "111111111"  (guard must cover any repeated digit, e.g. (?!([0-9])\1{8}) is NOT allowed — backreference+capture; use an alternation-free bounded form like (?!0{9})(?!1{9})... for the digits the tests exercise, or the corpus's established guard shape if one exists — check how patterns fixed in the all-zeros waves (git log --grep "all-zeros") did it and COPY that shape)
  ph-tin                       "000-000-000-000"
  tr-passport-number           "U00000000"
  tr-tax-number                "1111111111"
  ua-tax-number                "5555555555"
  za-tax-number                "0000000000"

Template-prose class (fix: keep the template-context intent but make the embedded number structurally INVALID for this pattern — wrong length/format — so the top-level regex no longer matches; update description accordingly; patch bump):
  ae-passport-number           "sample template placeholder number 123456789"
  ar-passport-number           "passport specimen AAA000000 shown in the template"
  bg-passport-number           "sample template placeholder number 123456789"
  ca-bank-account              "sample template placeholder number 123456789"
  ca-phin                      "sample template placeholder number 123456789"
  co-national-id               "sample template placeholder number 123456789"
  dk-passport-number           "sample template placeholder number 123456789"
  eu-drivers-license           "template example placeholder record identifier"
  hr-identity-card             "sample template placeholder number 123456789"
  hr-passport-number           "sample template placeholder number 123456789"
  nl-bsn                       "sample template placeholder number 123456789"
  nz-social-welfare-number     "sample template placeholder number 123456789"
  ro-passport-number           "sample template placeholder number 123456789"
```

**Interfaces:** none.

- [ ] **Step 1 (repeated-digit class):** For each file, FIRST run `git log --oneline --grep "all-zeros"` and read one of those commits' file diffs to copy the established guard shape used by this corpus. Apply the same shape to the top-level `pattern:` (and identical mirrored copy under `purview.regexes` if present). The guard must make the specific warned value non-matching while every should_match value still matches. Minor bump; changelog cites the guarded value(s). If the established shape cannot express the guard for a value (e.g. would need banned constructs), fall back to the template-prose treatment for that value (make it structurally invalid) and note it.
- [ ] **Step 2 (template-prose class):** Edit only the `value` (and `description` if needed) of the warned should_not_match entry: keep the template/sample prose framing, change the embedded number so it fails the pattern's structural requirements (e.g. one digit short). Do NOT change the regex. Patch bump; changelog: `'Baseline burn-down: template-context negative used a structurally valid number, so the universal-engine top-level regex correctly matched it (template gating is a Purview-tier concern via the template-exclusion NOT-group, not expressible in a bare regex); embedded number made structurally invalid to preserve the template-prose intent without asserting the impossible.'`
- [ ] **Step 3: Verify per file:** per-slug harness → 0 FAILs, all should_match pass; after ANY regex edit additionally `npm run check` → 0 errors (Purview-safety re-check — standing lesson).
- [ ] **Step 4: Verify the cohort:** `CI_VERBOSE=1 node scripts/ci-check.mjs` → none of these 20 slugs appear in warnings.
- [ ] **Step 5: Commit:** `git commit -m "fix(patterns): baseline burn-down C — top-level guards + template-negative corrections (20 identifier files)"`.

---

### Task 5: Full verification, recompile, ledger

**Files:** Modify: `patterns.json` (via compiler only), `.superpowers/sdd/progress.md`.

**Interfaces:** Consumes Tasks 1-4 committed on this branch.

- [ ] **Step 1:** `node scripts/verify-pattern-testcases.mjs --all` → **0 failures**. Report the new warning count and composition delta vs the 99 baseline (A1/A2 conversions add inventory-tier warnings; nothing else should change). Any remaining failure = a missed file; fix within the responsible cohort's rubric before proceeding.
- [ ] **Step 2:** `CI_VERBOSE=1 node scripts/ci-check.mjs` → **0 errors, 0 warnings**. Any residual warning: fix per its class rubric.
- [ ] **Step 3:** `npm run check:quality` → gate PASSED. Also report how many `discoveryMissing` informationals cleared as a side effect (baseline had ~67).
- [ ] **Step 4:** `npm run compile` → expect **1685 patterns** (count unchanged — no patterns added/removed; only content edits).
- [ ] **Step 5:** Commit `patterns.json`: `git commit -m "chore(build): recompile patterns.json — test-baseline burn-down (0 failures / 0 ci warnings)"`.
- [ ] **Step 6:** Append one ledger line per task outcome to `.superpowers/sdd/progress.md` and commit: `git commit -m "docs(sdd): ledger — test-baseline burn-down complete"`.

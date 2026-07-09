# Backlog ticket: harness-triage-fixes — report

**Task:** fix the clear-cut classes from the tier-aware-harness triage
(`.superpowers/sdd/backlog-tier-harness-report.md`): (A) sentinel-filter vs should_match
contradictions, (B) template-noise terms inside should_match values, (C) should_match values
that only hit evidence-only regexes, and (D) — within the T2 legal-concept class — ONLY the
"exclusion lists wired as required refs" wiring bug.

**Result:** full-catalog harness failures drop from **86 FAIL lines to 67 FAIL lines**
(`node scripts/verify-pattern-testcases.mjs --all`), with **zero new FAILs** (verified by
set-diff of the before/after FAIL keys: 19 resolved, 0 introduced). Warning count unchanged
at 77. All 19 resolved FAILs are exactly the A/B/C populations from the triage report.
The 14 class-D wiring fixes change detection semantics (85-tier exclusions now actually
exclude) without changing the FAIL count — the residual T2 negatives fire the ungated
75 tier, and adding new publication-context NOT-groups there is explicitly deferred
(out of scope per ticket).

Out of scope, untouched: 36 self-corroborating top500 negatives (T1), 6 legacy
descriptive-tier negatives (T6), and all remaining T2 publication-context negatives.

Gates: `npm run check` → 0 errors; `npm run check:quality` → PASSED; `npm run compile` →
succeeds (patterns.json reset before staging).

---

## Class A — sentinel-filter vs should_match contradictions (1 file, 3 FAILs fixed)

### au-motor-vehicle-permit (2.1.0 → 2.1.1)

`Guard_permit_exclude_test` (TextMatchFilter, direction Full, logic Exclude) lists the exact
strings `1234567`, `12345678`, `123456789`, `1234567890` as sentinel exclusions, so those
should_match values could never match in Purview. Replaced with realistic non-sentinel
values (filter untouched, per ticket):

| before | after | tier path verified |
|---|---|---|
| `12345678` (passed only via top-level pattern; still sentinel-contradicted in Purview) | `40829161` | id_match `Pattern_permit_generic`, survives both filters |
| `123456789` (FAIL) | `082946135` | id_match hit, survives filters |
| `1234567` (FAIL) | `4082915` | id_match hit, survives filters |
| `1234567890` (FAIL) | `4062981735` | id_match hit, survives filters |

Per-slug harness: before `3 FAIL`; after `all test_cases pass (1 warning)` (the warning is
the pre-existing non-failing tier-gated-negative class for `"00000000"`).

## Class B — template-noise terms inside should_match values (4 files, 5 FAILs fixed)

Every tier of these patterns carries the shared `template-exclusion` NOT-group
(`template/sample/example/placeholder/...`, word match — `example` inside `api.example.com`
matches because `.` is a word boundary), so positives containing those terms were
permanently vetoed. Test values reworded; NOT-groups untouched.

| file | version | before value | after value |
|---|---|---|---|
| snaffler-shell-history-creds | 1.0.0 → 1.0.1 | `curl https://api.example.com/data -u admin:HunterTwo99` | `curl https://api.corp.internal/data -u admin:HunterTwo99` |
| snaffler-shell-history-creds | (same bump) | `sshpass -p 'Secret1' ssh user@host.example.com` | `sshpass -p 'Secret1' ssh user@bastion.corp.internal` |
| snaffler-source-db-credentials | 1.0.0 → 1.0.1 | `mysql_connect("db.example.com", "root", $password)` | `mysql_connect("db.corp.internal", "root", $password)` |
| global-npm-access-token | 1.1.0 → 1.1.1 | `//registry.npmjs.org/:_authToken=example-npm-token-placeholder-xyz0` | `//registry.npmjs.org/:_authToken=npm_Qw3rTy9zXcV8bNm2LkJ4hGf6DsA1pOiU7yTr` |
| global-sql-server-connection-string | 1.4.0 → 1.4.1 | `Data Source=sql01.corp.example.com\SQLEXPRESS;...` | `Data Source=sql01.corp.internal\SQLEXPRESS;...` |

Per-slug harness after: all four slugs `all test_cases pass`.

## Class C — should_match values only hitting evidence-only regexes (9 files, 11 FAILs fixed)

Each pattern's tiers all anchor on one primary id_match; the failing values contained only
evidence regex hits (reference numbers, dollar amounts, decimal metrics) so no tier could
anchor. Rewrote each value to contain a genuine id_match hit, keeping the original label
context. One case (pre-announcement-grant-funding-recommendation) turned out on per-slug
inspection to be vetoed by its own exclusion NOT-group ("successful applicants") rather
than missing an id hit — reworded accordingly.

| file | version | change (id_match now hit) |
|---|---|---|
| controlled-operation-authorisation | 1.1.0 → 1.1.2 | "COA renewal." → "Controlled operation authorisation renewal … Extension of authorised conduct …" (id hit `authorised conduct`; the interim 1.1.1 rewrite was defective — see Review fixes) |
| corrective-services-intelligence-report | 1.1.0 → 1.1.1 | "Monthly Assessment" → "Monthly Prison Intelligence Assessment" (id `prison\s+intelligence`) |
| government-procurement-pricing-schedule-sealed | 1.1.0 → 1.1.1 | value 2: "RFP:" → "RFP QLD-2026-04417:"; value 3: added ", RFT QLD-2025-11203" (id `QLD-\d{4}-\d{3,6}`) |
| grant-assessment-scoring-matrix | 1.1.0 → 1.1.1 | added "Top-ranked application scored 86.5/100." (id score format `\d/\d`) |
| pre-announcement-grant-funding-recommendation | 1.1.0 → 1.1.1 | "15 successful applicants recommended from 89 applications" → "15 applicants recommended for approval from 89 applications received" (removes own NOT-group phrase; id `$12.6M` already present) |
| procurement-tender-evaluation-with-pricing | 1.1.0 → 1.1.1 | "Road construction RFP" → "Road construction RFP QLD-2026-03310" (id `QLD-\d{4}-\d{3,6}`) |
| state-borrowing-and-debt-issuance-strategy | 1.1.0 → 1.1.1 | added "at a target spread of 48 basis points over CGS" (id `\d{1,3}\s*(?:basis\s*points|bps)`) |
| trading-algorithm-or-quantitative-strategy | 1.1.0 → 1.1.1 | added "alpha of 220 bps annualised over benchmark" (id `\d{1,4}\s*bps`) |
| whole-of-government-erp-payment-authorisation-file | 1.3.0 → 1.3.1 | appended genuine ABA Type 0 header records (`0` + 17 spaces + BSB `064-000` / `064-011` + fixed-width fields) to both prose values (id `\b0\s{6,}[\s\S]{0,20}\d{3}-\d{3}`); header digits pass AllDigitsSameFilter and the sentinel TextMatchFilter |

Per-slug harness after: all nine slugs `all test_cases pass`.

## Class D — exclusion lists wired as required positive refs (14 files, wiring bug fixed)

Detection: parsed every catalog file's `pattern_tiers[].matches` for plain `- ref:` entries
naming `Evidence_*_exclusion` groups (strength: noise). 14 files share the identical
authoring bug on their 85 tier — the noise/publication exclusion list was a required
POSITIVE evidence ref, meaning (a) the 85 tier could only fire when noise terms were
PRESENT, and (b) nothing ever excluded anything. Converted each to the sibling-convention
NOT-group (exact form used by e.g. gender-reassignment-medical-record):

```yaml
# before                                              # after
- ref: Evidence_<slug>_exclusion                      - type: any
                                                        min_matches: 0
                                                        max_matches: 0
                                                        refs:
                                                          - Evidence_<slug>_exclusion
```

All 14 bumped 1.1.0 → 1.2.0 (semantic wiring change) with changelog:

cabinet-legal-briefing, class-action-defence-strategy, coronial-inquest-draft-submission,
crown-solicitor-legal-opinion, judicial-review-defence-file, ma-legal-due-diligence-for-gocs,
major-litigation-strategy-document, native-title-negotiation-strategy,
regulatory-investigation-defence-strategy, regulatory-prosecution-brief,
royal-commission-draft-submission, settlement-authority-and-negotiation-mandate,
solicitor-general-legal-advice, state-legal-liability-assessment

(11 of these are in the T2 FAIL list; cabinet-legal-briefing, crown-solicitor-legal-opinion
and state-legal-liability-assessment have the same bug with currently-passing tests, fixed
for consistency — the report calls it "an authoring bug repeated across this family".)

Per-slug harness: 22 FAILs across these 14 slugs before and after — identical FAIL key
set, zero new FAILs. All but one of the persisting negatives fire the 75 tier; one
(solicitor-general-legal-advice, "The role of the Solicitor-General…") fires the 85 tier
after the fix, because at baseline the miswired 85 tier required exclusion terms to be
PRESENT (this value has none, so it could only reach 75), whereas the corrected NOT-group
form lets it through at 85. Net effect on 85-tier negative firings across the 14 files is
still an improvement: 3 at baseline → 1 after (the other two dropped 85→75 because the
now-active NOT-groups veto them at 85). Per the triage report's candidate fix, closing
the residuals requires adding
publication-context NOT-groups to every enforcement tier and extending the term lists —
explicitly deferred/out-of-scope for this ticket. No new should_match failures are possible
from the conversion: the 75/65 tiers of these files carry no NOT-groups, so any positive
that anchored before still anchors.

Conversion safety check (all 14 files): no should_match value contains any of its own
exclusion terms, so the now-active 85-tier NOT-groups veto nothing they shouldn't.

## Verification

1. Baseline (commit 64012c95a9): `--all` → **86 failure(s), 77 warning(s)** — identical to
   the triage report census.
2. After fixes: `--all` → **67 failure(s), 77 warning(s)**.
3. FAIL-set diff: 19 resolved (the exact A/B/C values above), **0 introduced**.
4. Per-slug runs shown above for every touched file.
5. Gates: `npm run check` → `CI check: 0 error(s), 57 warning(s)`;
   `npm run check:quality` → `Quality gate PASSED`; `npm run compile` →
   `Done: 1655 patterns, 20 collections, 131 keyword dictionaries → patterns.json`
   (patterns.json reset via `git checkout -- patterns.json` before staging).

## Census

- 28 pattern YAMLs modified (1 A + 4 B + 9 C + 14 D), 19 test values rewritten,
  14 tier wirings converted, 28 version bumps + changelog entries.
- 0 filters, NOT-group term lists, regexes, or keyword groups weakened or removed.

## Review fixes

Review of this pass surfaced one IMPORTANT defect and one report inaccuracy; both are
fixed in the `fix: harness-triage-fixes review fixes` commit.

### 1. controlled-operation-authorisation (1.1.1 → 1.1.2) — class-C fix was defective

The 1.1.1 rewrite claimed the third should_match value gained a genuine tier id_match hit
via "Controlled operation authorisation renewal". It did not: the tier id regex
`Pattern_controlled_operation_authorisation_controlled_operation_terms` is
`(?i)\b(controlled\s+operation\s+authoris|assumed\s+identity\s+authorit|authorised\s+conduct|PPRA\s+controlled\s+operation)\b`
— the trailing `\b` immediately after the `authoris` prefix can never match
"authorisation"/"authorised" (a word boundary cannot occur between `s` and `a`). Node
probe on the 1.1.1 value: tier regex → **false**. The value passed the harness only via
the top-level universal-engine pattern (which has the full `authoris(?:ation|ed)` forms),
so the original class-C defect — "tests nothing real at tier level" — persisted, masked
by a green harness.

Fix (test value only, per ticket scope): the value now reads "… Extension of **authorised
conduct** for 60 days … **PPRA Part 5** compliance audit completed …". Node probe after:
tier regex → true (hit `authorised conduct`); no exclusion terms present; all three
should_match values now genuinely anchor the tier id_match (values 1–2 already anchored
via "Authorised conduct"). Per-slug harness: `all test_cases pass`.

Follow-up flagged (regex changes out of this ticket's scope): two of the four branches of
that tier id regex are dead for the same trailing-`\b` reason —
`controlled\s+operation\s+authoris\b` and `assumed\s+identity\s+authorit\b` can never
match any real token ("authorisation", "authority", …). The tier regex should be
corrected in a dedicated ticket (e.g. `authoris(?:ation|ed)?`, `authorit(?:y|ies)`).

### 2. Report correction — class-D "persisting negatives" sentence

The earlier wording "the persisting negatives now fire the 75 tier (which has no
exclusion wiring at all)" was wrong: harness output shows solicitor-general-legal-advice
"The role of the Solicitor-General…" fires **tier@85** after the D-class conversion (it
fired tier@75 at baseline, because the miswired 85 tier required exclusion terms to be
present and that value has none). Verified from the before/after `--all` outputs:
85-tier negative firings across the 14 D-class files went 3 (baseline: judicial-review
x1, solicitor-general x2) → 1 (solicitor-general x1); the other two dropped 85→75
because the now-active NOT-groups veto them. FAIL key set unchanged. The Class D section
above has been reworded accordingly; the residual negatives remain deferred per ticket.

### Review-fix verification

1. Per-slug: `node scripts/verify-pattern-testcases.mjs controlled-operation-authorisation`
   → `all test_cases pass`.
2. Full run: `--all` → **67 failure(s), 77 warning(s)** — unchanged; normalized FAIL-key
   set-diff vs the pre-review state: 0 resolved, 0 introduced (identical sets).
3. Gates re-run: `npm run check` → 0 errors; `npm run check:quality` → PASSED;
   `npm run compile` → OK (patterns.json reverted before staging).

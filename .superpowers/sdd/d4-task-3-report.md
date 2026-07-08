# D4 Task 3 Report — EU AI Act concept classes (4 patterns shipped)

Worktree: `Z:\patterns\.claude\worktrees\wf_2084d11b-7fa-2` (branch `worktree-wf_2084d11b-7fa-2`,
isolated worktree of `feat/coverage-waves-d4` work). Date: 2026-07-08. Commit: the commit containing
this report (hash recorded in the task's structured output; report and patterns ship in one commit).

## Shipped patterns (files changed)

- `data/patterns/eu-ai-act-technical-documentation.yaml`
- `data/patterns/eu-ai-act-gpai-model-documentation.yaml`
- `data/patterns/eu-ai-act-fria.yaml`
- `data/patterns/eu-ai-act-conformity-declaration.yaml`
- `.superpowers/sdd/d4-task-3-report.md` (this report)

All four are `keyword_proximity` concept patterns following the `ma-legal-due-diligence-for-gocs.yaml`
exemplar: 85 tier = primary evidence + corroborative + citation regex + noise-exclusion NOT; 75 = primary
+ NOT; 65 = discovery_only bare primary + NOT. `shared_keywords: template-exclusion as
Keyword_noise_exclusion` on every file. `pattern_class` does NOT exist in the schema (grep: no hits in
repo scripts/schema), so it was not invented. Confidence `medium`, jurisdiction `eu`, regulation
"Regulation (EU) 2024/1689 (AI Act)", version 1.0.0, created/updated 2026-07-08.

## Per-pattern provenance and adjudications

### 1. eu-ai-act-technical-documentation (Art 11 + Annex IV)

- Sources: EUR-Lex CELEX:32024R1689; https://artificialintelligenceact.eu/article/11/ ;
  https://artificialintelligenceact.eu/annex/4/ ; https://artificialintelligenceact.eu/article/9/
- Primary vocabulary verified verbatim against Annex IV / Art 11: "general description of the AI system"
  (Annex IV(1)), "post-market monitoring plan" (Annex IV(9), Art 72(3)), "technical documentation of a
  high-risk AI system" / "referred to in Article 11" (Art 11(1)), plus "Annex IV technical documentation".
- Corroborative verified: intended purpose, risk management system (Art 9 title; "established,
  implemented, documented and maintained"), risk management measures (Art 9(2)(d)), reasonably
  foreseeable misuse (Art 9(2)(b)), human oversight, harmonised standards (Annex IV(7)), EU declaration
  of conformity (Annex IV(8)), design specifications / system architecture / datasheets (Annex IV(2)),
  instructions for use (Art 27(1)(e), Art 13), notified body, conformity assessment.
- Tier rationale: Annex IV section headings are distinctive document vocabulary; generic "technical
  documentation" alone is never gated on. 85 adds corroborative + Regulation (EU) 2024/1689 citation regex.
- Known residual FP: legal alerts quoting Annex IV verbatim — one filter-dependent should_not_match
  documents this (filter terms: client alert, legal update).

### 2. eu-ai-act-gpai-model-documentation (Art 53 + Annex XI/XII, Art 55)

- Sources: https://artificialintelligenceact.eu/article/53/ ; /article/55/ ; /annex/11/ ; /annex/12/ ;
  Commission AI Office template (24 Jul 2025):
  https://digital-strategy.ec.europa.eu/en/library/explanatory-notice-and-template-public-summary-training-content-general-purpose-ai-models
- Primary verified: "general-purpose AI model" (defined term), "public summary of training content"
  (AI Office template title), "content used for training" (Art 53(1)(d)), "technical documentation of the
  model" (Art 53(1)(a)).
- Corroborative verified: AI Office, downstream providers (Art 53(1)(b)/Annex XII), acceptable use
  policies, number of parameters, modality, methods of distribution, computational resources, energy
  consumption, curation methodologies, provenance (Annex XI s.1), adversarial testing / red teaming /
  model evaluation / systemic risk (Art 55(1), Annex XI s.2), Union law on copyright / reservation of
  rights (Art 53(1)(c)), synthetic data + data sources (AI Office template blocks).
- Adjudication: one consolidated pattern covers Annex XI, Annex XII, the Art 53(1)(d) public summary, and
  Art 55 evaluation material — all are Art 53/55 GPAI provider documentation sharing one vocabulary pool;
  splitting would produce mushy near-duplicates. Art 55 systemic-risk terms folded in as corroborative
  (distinctive: adversarial testing, red teaming, systemic risk) rather than a separate pattern.
- Honest FP: the term saturates AI Act news/commentary, and the final Art 53(1)(d) summary is public by
  design — both documented in false_positives; bare-primary tier is discovery_only.

### 3. eu-ai-act-fria (Art 27)

- Source: https://artificialintelligenceact.eu/article/27/ (title: "Fundamental Rights Impact Assessment
  for High-Risk AI Systems").
- Primary verified: defined term "fundamental rights impact assessment"; case-insensitive FRIA acronym as
  secondary structural regex (mirrors exemplar's GOC regex; FRIA keyword is case_sensitive).
- Corroborative verified against Art 27(1)(a)-(f) + 27(3): deployer, intended purpose, period of time /
  frequency (in test cases), categories of natural persons, risks of harm, human oversight measures,
  instructions for use, internal governance, complaint mechanisms, market surveillance authority, bodies
  governed by public law, Annex III (points 5(b)-(c) scope).
- FP adjudication: DPIA collision is real (Art 27(4) links FRIA to GDPR Art 35) and is documented, as is
  pre-AI-Act academic FRIA/FRAIA literature.

### 4. eu-ai-act-conformity-declaration (Art 47 + Annex V) — SHIPPED (optional item)

- Sources: https://artificialintelligenceact.eu/article/47/ ; https://artificialintelligenceact.eu/annex/5/
- Ship/skip adjudication: Annex V vocabulary is largely generic New-Legislative-Framework boilerplate
  ("EU declaration of conformity", "sole responsibility", "harmonised standards", "notified body") shared
  with every CE-marked product class. Shipped anyway because the collision is controllable at the regex
  level: the primary couples "EU declaration of conformity" to AI context (AI system / artificial
  intelligence / Regulation (EU) 2024/1689) within a bounded 400-char window (both orders), so even the
  discovery tier cannot fire on non-AI CE declarations. The CE collision is the first false_positives
  entry, and a generic machinery declaration is an empirically verified non-matching test case.
- Verified vocabulary: Art 47(1) "written machine readable, physical or electronically signed EU
  declaration of conformity", 10-year retention, "assume responsibility for compliance"; Annex V items
  (AI system name/type, sole responsibility, GDPR 2016/679 statement, harmonised standards, notified
  body, conformity assessment procedure).
- risk_rating 5 (lower than siblings): the signed declaration is ultimately provided to authorities;
  sensitivity concentrates in pre-signature drafts — stated in risk_description and false_positives.

## Skips

None. All three mandatory patterns plus the optional conformity-declaration pattern shipped (4 total,
top of the ~3-4 range).

## Empirical regex verification

Node harness (js-yaml + the ci-check `toRe`/`purviewBanned` logic) run against all four files:
- 0 Purview-banned constructs (no `.*`/`.+`, no nested quantifiers, no anchors, 0 capturing groups,
  bounded `{m,n}` only; lookahead gaps use `[\s\S]{0,400}?` per existing repo precedent, e.g. au-payid).
- 13/13 should_match matched by the top-level pattern; all 17 should_not_match either fail the primary
  (10 true negatives, including the generic CE machinery declaration) or are documented filter-dependent
  negatives (7, each carrying noise-filter terms and labelled in the test-case description).
- Final run: "ALL REGEX CHECKS PASSED".

## Gate output tails

- `npm run check` → `CI check: 0 error(s), 51 warning(s)` (0 warnings mention eu-ai-act; the 51 are
  pre-existing, verified with CI_VERBOSE grep).
- `npm run check:quality` → `Quality gate PASSED: 0 issue(s) in [shortAcronyms, nonCanonical,
  duplicateLevelsIdentical, weakHigh] outside the exclusion set`.
- `npm run compile` → `Done: 1600 patterns, 18 collections, 128 keyword dictionaries → patterns.json`
  (1596 pre-existing + 4 new). `git checkout -- patterns.json` run before staging.

## Self-review

- Followed the D4-2 concept conventions in full: honest topic-matcher confidence text, regulation-verified
  vocabulary only, canonical 85/75/65-discovery ladder, template-exclusion shared dict, no pattern_class.
- Deliberate choices a reviewer should see: (a) GPAI consolidation of Annex XI/XII + Art 53(1)(d) + Art 55
  into one pattern; (b) shipping the optional conformity declaration with an AI-coupled primary instead of
  skipping; (c) five filter-dependent should_not_match cases rely on the noise-exclusion NOT group rather
  than the primary regex — ci-check does not execute keyword_proximity cases, so these are contract
  documentation, empirically characterised in the node harness rather than gate-enforced.
- Sensitivity_labels cross-map uses us_gov/uk_gov (matching the repo's other non-AU concept patterns);
  no EU-specific label taxonomy exists in the repo.

## Review fixes (2026-07-08, after independent review of base commit 49d11cb3)

Verdict was needs_fixes with two IMPORTANT findings; both fixed, none rebutted.

1. **eu-ai-act-fria.yaml operation prose** — the prose claimed "a case-sensitive FRIA acronym regex"
   but `Pattern_eu_ai_act_fria_acronym` is `(?i)\bFRIA\b` (case-insensitive; empirically matches
   "agua fria"). Fixed the prose, not the regex: the exemplar's `Pattern_..._goc` regex is also `(?i)`,
   and this report already (correctly) described the regex as case-insensitive, so the prose was the
   outlier. New wording states the regex is case-insensitive and that the FRIA keyword evidence term
   (not the regex) is the case-sensitive element.

2. **eu-ai-act-conformity-declaration.yaml missing brief-mandated negatives** — the brief requires
   should_not_match to include an academic paper and the regulation text quoted in a memo; both were
   absent. Added two negatives: (a) a peer-reviewed abstract analysing the Article 47 declaration
   (filter-dependent: 'peer-reviewed'/'abstract'), and (b) an internal memo quoting Art 47(1) verbatim,
   circulated via a compliance newsletter (filter-dependent: 'newsletter'). Because a *plain* internal
   memo quoting Art 47(1) verbatim satisfies the AI-coupled primary and carries no noise term, it reaches
   the 75 tier — a real residual FP the original false_positives entry 4 did not cover. Extended that
   entry's description and mitigation to state this residual collision explicitly as an accepted
   concept-class limitation. Also updated the operation prose noise-exclusion list to include academic
   contexts.

Consequential report correction: the empirical-verification section previously said "8 true negatives +
5 filter-dependent" against 15 should_not_match cases (arithmetically inconsistent; the empirical split
was 10+5). With the two new negatives the harness now reports 17 should_not_match = 10 true negatives +
7 filter-dependent; the section above has been corrected to the verified numbers.

MINOR review findings (GPAI negative labels overstating filter reliance, the constructed
"Annex IV technical documentation" compound, undocumented plural-form FN scope) were deliberately left
unchanged for final triage per fixer instructions.

Re-run gates after fixes: `npm run check` → 0 error(s), 51 warning(s); `npm run check:quality` →
Quality gate PASSED; `npm run compile` → Done: 1600 patterns; `git checkout -- patterns.json` before
staging. Node harness re-run: 13/13 should_match, 0 failures, "ALL REGEX CHECKS PASSED".

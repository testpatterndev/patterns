# D4 Task 2 Report — EU DORA + NIS2 concept patterns

Implementer: Coverage Wave D4, task t2-dora-nis2.
Worktree: `Z:\patterns\.claude\worktrees\wf_2084d11b-7fa-1`, branch `worktree-wf_2084d11b-7fa-1`.
Date: 2026-07-08.

## Shipped (5 of 5; both optionals shipped)

All five are `type: keyword_proximity` concept classifiers on the `ma-legal-due-diligence-for-gocs.yaml`
architecture: top-level primary topic-phrase regex, corroborative keyword evidence, shared
`template-exclusion` dict as `Keyword_noise_exclusion` plus a local `Filter_*_exclusion` noise group,
and the 85 / 75 / 65-discovery_only Purview tier ladder. Confidence `medium`, jurisdiction `eu`,
version 1.0.0, created/updated 2026-07-08. `pattern_class` does NOT exist in this repo's schema
(grep over repo: no hits outside node_modules), so per the brief it was not invented.

### 1. eu-dora-register-of-information

- Primary sources:
  - DORA Art 28(3): "register of information in relation to all contractual arrangements on the use
    of ICT services provided by ICT third-party service providers", distinguishing those supporting
    "critical or important functions" — https://www.springlex.eu/packages/dora/dora-regulation/article-28/
    (EUR-Lex CELEX 32022R2554 blocks direct fetch; springlex reproduces the OJ text).
  - Implementing Regulation (EU) 2024/2956 (ITS on the register) — https://eur-lex.europa.eu/eli/reg_impl/2024/2956/oj/eng ;
    recital/Art text confirms entities "shall designate a 'contractual arrangement reference number'
    for each contractual arrangement".
  - ITS Annex I template codes and field vocabulary — https://www.springlex.eu/en/packages/dora/its-roi-regulation/annex-1/ :
    B_01.01–B_01.03, B_02.01–B_02.03, B_03.01–B_03.03, B_04.01, B_05.01–B_05.02, B_06.01, B_07.01,
    B_99.01; fields "contractual arrangement reference number", "type of ICT services", "rank",
    "ICT intra-group service provider", "substitutability", LEI.
- Vocabulary provenance: primary phrases = Art 28(3) term "register of information", ITS field
  "contractual arrangement reference number", DORA defined term "ICT third-party service provider".
  Corroborative = Art 28(3)/ITS vocabulary above. Structural regex `\bB_(?:0[1-7]|99)\.0[1-3]\b`
  (case-sensitive) covers exactly the final B_xx.yy code space (draft ITS used RT.xx.xx; final OJ
  text uses B_ — verified via EUR-Lex search hits on 2024/2956, so RT codes were deliberately excluded).
- REGISTER-CONSOLIDATION ADJUDICATION: the plan listed "ICT third-party register" and "register of
  information" as separate items. Art 28(3) establishes a single document class — ONE register of
  information covering all ICT third-party contractual arrangements; the ITS 2024/2956 templates are
  that same register's format. "ICT third-party register" is an informal alias, not a distinct class.
  Consolidated into this ONE pattern.
- Tier rationale: 85 = primary + corroborative + B_xx.yy template-code regex + noise NOT (register
  extracts/submissions); 75 = primary + NOT (memos about the entity's register without template
  codes); 65 discovery_only = bare primary.

### 2. eu-dora-major-incident-report

- Primary sources:
  - DORA Art 19(1)/(4): report "major ICT-related incidents" to the "relevant competent authority";
    stages "an initial notification", "an intermediate report", "a final report, when the root cause
    analysis has been completed"; Art 19(2) voluntary notification of "significant cyber threats" —
    https://www.springlex.eu/en/packages/dora/dora-regulation/article-19/
  - Implementing Regulation (EU) 2025/302 Art 1: single Annex I template for all three stages, Annex II
    data glossary — https://www.springlex.eu/en/packages/dora/its-ir-regulation/article-1/
  - Delegated Regulation (EU) 2025/301 timelines (4h from classification as major / no later than 24h
    from awareness; 72h; 1 month) and the entity-assigned incident reference code — Central Bank of
    Ireland: https://www.centralbank.ie/regulation/digital-operational-resilience-act-dora/reporting-major-ict-related-incidents-and-significant-cyber-threats
- Vocabulary provenance: primary = Art 19 terms of art "major ICT-related incident", "significant
  cyber threat". Corroborative = stage names, "root cause analysis" (Art 19(4)(c) wording), "incident
  reference code" (2025/301/302), "classified as major" (2025/301 timeline wording), "competent
  authority", instrument citations.
- Tier rationale: 85 = primary + report-stage corroborative + NOT; 75 = primary + NOT; 65 discovery.
  No structural regex: the incident reference code has no mandated format (entity-assigned).

### 3. eu-dora-ict-risk-framework (optional — SHIPPED)

- Primary source: DORA Art 6(1)/(8) — "a sound, comprehensive and well-documented ICT risk management
  framework"; "digital operational resilience strategy"; "the risk tolerance level for ICT risk, in
  accordance with the risk appetite"; "clear information security objectives, including key
  performance indicators"; "a communication strategy in the event of ICT-related incidents" —
  https://www.springlex.eu/packages/dora/dora-regulation/article-6/
- Distinctiveness adjudication: shipped because BOTH primary phrases are multi-word Art 6 defined
  terms that essentially never occur outside the DORA orbit, and the Art 6(8) strategy vocabulary
  (risk tolerance level, information security objectives + KPIs, resilience testing) gives a real
  corroboration layer. Honest limitation recorded in false_positives: consultancy/GRC content reuses
  the same phrases and is only noise-suppressed.
- Tier rationale: standard ladder; 85 requires Art 6 vocabulary in proximity.

### 4. eu-nis2-incident-notification

- Primary sources:
  - NIS2 Art 23(1)/(3)/(4) — essential and important entities notify "its CSIRT or, where applicable,
    its competent authority" "without undue delay"; significance = "severe operational disruption of
    the services or financial loss" / "considerable material or non-material damage"; stages: early
    warning (24h), incident notification (72h, incl. "the indicators of compromise" where available),
    intermediate report on request, final report not later than one month (detailed description incl.
    severity and impact, type of threat or root cause, applied and ongoing mitigation measures,
    cross-border impact), progress report for ongoing incidents —
    https://www.nis-2-directive.com/NIS_2_Directive_Article_23.html and exact 23(4) subpoint text at
    https://luxgap.com/lois/nis2/art-23/?lang=en
- Vocabulary provenance: primary = the Art 23 defined trigger "significant incident" ONLY (revised —
  see Review fixes). The stage names "early warning" and "incident notification" are ubiquitous
  outside NIS2 (meteorology, ops tooling) and are corroborative-only. Corroborative = CSIRT
  (+ case-sensitive `\bCSIRTs?\b` structural regex required at 85), "severe operational disruption",
  "indicators of compromise", "Directive (EU) 2022/2555", essential/important entity,
  report-stage names ("early warning", "incident notification", intermediate/final/progress report).
- Tier rationale: 85 = primary + NIS2 corroborative + CSIRT regex + NOT; 75 = primary + NOT; 65 discovery.

### 5. eu-nis2-cybersecurity-risk-measures (optional — SHIPPED)

- Primary source: NIS2 Art 21(1)/(2) — "appropriate and proportionate technical, operational and
  organisational measures"; "an all-hazards approach"; measure list (a)–(j): policies on risk analysis
  and information system security; incident handling; business continuity, backup management,
  disaster recovery, crisis management; supply chain security; vulnerability handling and disclosure;
  effectiveness-assessment policies; cyber hygiene and cybersecurity training; cryptography/encryption;
  HR security, access control, asset management; multi-factor authentication —
  https://www.nis-2-directive.com/NIS_2_Directive_Article_21.html
- Distinctiveness adjudication: shipped. "Cybersecurity risk-management measures" (the NIS2 Article
  21 term of art, matched hyphenated or unhyphenated) is the SOLE primary (revised — see Review
  fixes). "All-hazards approach" is a ubiquitous FEMA/civil-protection term of art, so it and the
  (a)–(j) measure names are used ONLY as corroboration, never as primary — this is the design line
  that made the pattern shippable rather than mushy.
- Tier rationale: standard ladder; civil-protection "all-hazards" collision eliminated at every tier
  by making the term corroborative-only.

## Skips

None. Both optional patterns passed the distinctiveness test with primary-source vocabulary.

## Conventions & bans compliance

- All regexes purview-safe: no `.*`/`.+`, no nested quantifiers, no anchors, 0 capturing groups,
  bounded classes only. `npm run check` enforces the ban set — 0 errors.
- Short-acronym rule: LEI, DORA, NIS2, "NIS 2", CSIRT keyword terms set `case_sensitive: true`.
- Every should_match verified to contain no shared/template-exclusion or local noise term (scripted check).
- Test cases: 3–4 should_match (register extracts, notification/report headers, board/audit papers),
  3 should_not_match (press releases, consultancy webinars/newsletters, academic/training material)
  per pattern; false_positives sections are honest about concept-class collisions (consultancy
  marketing, quoted regulation text, DORA-NIS2 cross-collision, generic "early warning").

## Empirical verification

Node script (js-yaml + RegExp) run against all 5 files: every should_match matched by the top-level
primary; structural regexes hit their intended cases (B-codes: cases 0 and 2 of register; CSIRTs?:
all 3 NIS2 incident cases); noise-context negatives behave as designed (primary matches are
NOT-gated at tier level, per keyword_proximity architecture). Output: ALL OK.

## Gate output tails

- `npm run check` → `CI check: 0 error(s), 51 warning(s)` (warnings pre-existing, none from the 5 new files —
  keyword_proximity types are exempt from regex-test warnings and the new regexes carry no banned constructs).
- `npm run check:quality` → `Quality gate PASSED: 0 issue(s) in [shortAcronyms, nonCanonical,
  duplicateLevelsIdentical, weakHigh] outside the exclusion set`
- `npm run compile` → `Done: 1601 patterns, 18 collections, 128 keyword dictionaries → patterns.json`
  (1596 → 1601). `git checkout -- patterns.json` run before staging; patterns.json NOT committed.

## Files changed

- `data/patterns/eu-dora-register-of-information.yaml` (new)
- `data/patterns/eu-dora-major-incident-report.yaml` (new)
- `data/patterns/eu-dora-ict-risk-framework.yaml` (new)
- `data/patterns/eu-nis2-incident-notification.yaml` (new)
- `data/patterns/eu-nis2-cybersecurity-risk-measures.yaml` (new)
- `.superpowers/sdd/d4-task-2-report.md` (this report)

Commit: (hash recorded in structured output; style `feat(patterns): ...`, not pushed)

## Review fixes (fixer pass, 2026-07-08)

Independent review verdict: needs_fixes (0 Critical, 2 Important, 4 Minor). Both Important
findings fixed; commit `fix(patterns): t2-dora-nis2 review fixes`.

1. `eu-nis2-incident-notification.yaml` — FIXED. "Early warning" and "incident notification"
   violated brief convention 1 (primary = regulation-specific terms of art only): the reviewer
   verified that "tsunami early warning system for the Pacific" and "Set up incident notification
   emails in PagerDuty" fired at the NON-discovery 75 tier. Both phrases demoted from the primary
   regex/keyword group to the corroborative keyword group (they were already in the top-level
   corroborative_evidence list); "significant incident" — the Art 23 defined trigger — is now the
   sole primary. Top-level `pattern`, Purview `Pattern_..._topic_terms`, `Evidence_..._primary`,
   `Evidence_..._corroborative`, `operation`, `confidence_justification`, and the first
   false_positives mitigation all updated consistently. should_not_match[0] (law-firm newsletter)
   was reworded to include "significant incident" so it still exercises the noise-suppression path
   under the narrowed primary.
2. `eu-nis2-cybersecurity-risk-measures.yaml` — FIXED (took the stronger of the reviewer's two
   options). "All-hazards approach" (ubiquitous FEMA/civil-protection term; "FEMA all-hazards
   approach" fired at 75) removed from the primary regex/keyword group and added to the
   corroborative group (both hyphenated and unhyphenated forms); "cybersecurity risk-management
   measures" is now the sole primary, with the unhyphenated keyword variant added to the primary
   keyword group to keep it aligned with the `risk[\s-]management` regex. The misleading
   "discovery-tier collision is acknowledged" mitigation prose replaced: all-hazards is now
   corroborative-only and never fires alone at ANY tier. should_not_match[2] (academic survey)
   reworded to include the primary phrase so it still exercises the noise gate.

Nothing rebutted — both Important findings were factually correct and were fixed as named.

Empirical re-verification (node, js-yaml): all four reviewer probes ("tsunami early warning system
for the Pacific", "Set up incident notification emails in PagerDuty", "FEMA all-hazards approach",
and an unhyphenated "all hazards approach" civil-protection sentence) no longer match the primary
(top-level AND Purview regex, asserted identical); all 6 should_match cases still match their
primary; every should_not_match that contains a primary phrase also contains a noise term; no
should_match contains a noise term. Output: ALL OK.

Gates re-run after fixes: `npm run check` → 0 error(s), 51 warning(s); `npm run check:quality` →
PASSED (0 issues outside exclusion set); `npm run compile` → Done: 1601 patterns (independently
confirms the 1596→1601 count the review flagged as unverified); `git checkout -- patterns.json`
before staging.

Minor findings deliberately left for final triage per fixer instructions: singular-only primaries
(plural `s?` broadening), DORA webinar should_not_match lacking a primary phrase, and the B-code
regex over-matching nonexistent template codes (harmless 85-tier corroboration).

## Self-review

- Strongest pattern: register-of-information (B_xx.yy structural evidence is near-unique to ITS
  2024/2956 content). Weakest tier: NIS2 incident notification 75/65 — "significant incident" alone
  still collides with generic incident-management prose; documented honestly rather than
  over-promising. (The originally offered adjustment — demoting "early warning" to corroborative —
  was applied in the review-fixes pass, along with "incident notification".)
- EUR-Lex could not be fetched directly (empty body on TXT and HTML endpoints); article text was
  verified via springlex.eu / nis-2-directive.com / luxgap.com mirrors of the OJ text plus the
  Central Bank of Ireland supervisory page, and instrument numbers cross-checked against EUR-Lex ELI
  URLs returned by search. All gated phrases trace to the cited article text; nothing authored from memory.
- Sensitivity cross-maps mirror the at-tax-id band (OFFICIAL: Sensitive / SENSITIVE / CUI /
  OFFICIAL-SENSITIVE / RESTRICTED / Protected B) — these are corporate compliance documents, not
  national-security material.

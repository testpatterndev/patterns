# Codex D4 Review Findings — Fix Report

Branch: `codex-fix/d4-findings` (off `main`). Date: 2026-07-08.

Touched patterns: `eu-ai-act-fria` (1.1.0), `eu-ai-act-conformity-declaration` (1.0.1),
`eu-ai-act-gpai-model-documentation` (1.0.1), `eu-ai-act-technical-documentation` (1.0.1),
`eu-dora-register-of-information` (1.1.1).

## Finding 1 — Dead noise gate in the 4 eu-ai-act-* patterns

**Status: CONFIRMED — fixed by wiring where safe (1 file) and removing the dead declaration where wiring is provably unsafe (3 files).**

All four `eu-ai-act-*.yaml` files declared `shared_keywords: template-exclusion as
Keyword_noise_exclusion` but no tier referenced that id. Semantics verified against
`scripts/compile.js` (lines 89–112): `shared_keywords` are only *materialized* into
`purview.keywords`; nothing auto-wires them into tiers. An id participates in detection only
when a tier's `matches`/`excludes` references it (`scripts/verify-pattern-testcases.mjs`
mirrors this: `min_matches: 0, max_matches: 0` refs-group = NOT gate). So the declaration was
dead in all four files. The five DORA/NIS2 siblings (`eu-dora-register-of-information`,
`eu-dora-ict-risk-framework`, `eu-dora-major-incident-report`, `eu-nis2-cybersecurity-risk-measures`,
`eu-nis2-incident-notification`) reference `Keyword_noise_exclusion` in every tier's NOT group
(4 occurrences each) — they are wired correctly and were left untouched (except the register
prose fix, finding 2).

**Why not blanket-wire (the Codex-suggested fix):** the `template-exclusion` dictionary
(`data/keywords/template-exclusion.yaml`) contains the word-matched terms `documentation`,
`template`, `training data`, `demo`, `sample`. A word-level scan of the four files' own
`should_match` values against the dictionary showed fatal collisions in three of them:

| pattern | collision | why it is intrinsic vocabulary |
|---|---|---|
| eu-ai-act-technical-documentation | `documentation` in should_match[0], [2] | "technical documentation" is the pattern's *primary* term (Annex IV) — wiring suppresses every genuine hit |
| eu-ai-act-gpai-model-documentation | `documentation` in [0], `template` in [1] | Annex XI "technical documentation of the model"; Article 53(1)(d) "AI Office template" |
| eu-ai-act-conformity-declaration | `documentation` in [2] | Article 47(1) requires the declaration to be lodged with the technical documentation |
| eu-ai-act-fria | none — all 3 positives clean | safe to wire |

Per-file resolution:
- **eu-ai-act-fria**: `Keyword_noise_exclusion` wired into the NOT group of all three tiers,
  exactly following the DORA/NIS2 convention (shared id listed before the local
  `Filter_eu_ai_act_fria_exclusion`).
- **conformity-declaration / gpai-model-documentation / technical-documentation**: dead
  declaration removed; the local `Filter_*_exclusion` (already wired in every tier, carrying
  'peer-reviewed', 'newsletter', press/marketing/academic terms) remains the noise gate.
  In conformity-declaration the false-positive mitigation prose falsely claimed
  "template-exclusion shared dictionary suppresses boilerplate sample documents" — corrected
  to document that the dictionary is deliberately not used and why.

**Verification:** `scripts/verify-pattern-testcases.mjs` on all 9 slugs (4 AI Act + 5
DORA/NIS2): *all test_cases pass* (21 informational "tier-gated negative" warnings, which are
the desired outcome — the top-level pattern matches but no enforcement tier fires). A
tier-level reachability script (harness semantics, value-as-whole-document) confirms the
filter-dependent negatives (academic 'peer-reviewed', memo/marketing 'newsletter'/'webinar')
are suppressed at every enforcement tier in all touched files, and no should_match case lost
its tiers.

## Finding 2 — eu-dora-register-of-information prose says OR, tier logic says AND

**Status: CONFIRMED (prose defect) — prose fixed to describe the AND semantics; tier logic untouched.**

The 85 tier's `matches` list is conjunctive: `Evidence_..._primary` AND
`Evidence_..._corroborative` AND `Pattern_..._template_codes` (plus the NOT group), but
`confidence_justification` claimed vocabulary "**or** B_xx.xx template codes".

Adjudication: the tier logic was reviewed and approved twice, and the AND requirement is
demonstrably reachable on realistic register extracts — tier-reachability run:
should_match[0] (register extract with `B_02.01`) fires at **85**/75/65; should_match[2]
(supply-chain rows with `B_05.02`) fires at **85**/75/65; should_match[1] (submission memo,
vocabulary but no template code) correctly stops at 75. So AND is the intended design and the
prose was wrong. `operation` and `confidence_justification` rewritten to state that the 85
tier requires a template code *in addition to* the register vocabulary and that
vocabulary-only extracts stop at 75. Version 1.1.0 → 1.1.1 (prose-only).

## Finding 3 — eu-ai-act-fria 85 tier unreachable without the acronym

**Status: CONFIRMED — fixed via option (a), with a citation regex as the OR-alternative.**

Before: the 85 tier required `Pattern_eu_ai_act_fria_acronym` (`(?i)\bFRIA\b`). Verified
against the pre-fix file: should_match[0] and [2] — both realistic completed FRIAs using only
the full defined title — contain no `FRIA` token and therefore could never reach the
recommended confidence (85); only should_match[1] could.

Fix: the structural leg is now `type: any, min_matches: 1` over
`Pattern_eu_ai_act_fria_acronym` OR a new `Pattern_eu_ai_act_fria_citation`
(`(?i)\b(?:Regulation\s+\(EU\)\s+2024/1689|Article\s+27|Annex\s+III)\b`). Rationale:
- The literal option (a) (full-title regex as the alternative) would be vacuous — the
  full-title regex *is* the tier's `id_match`, so the leg would always be satisfied and the
  85 tier would silently collapse to primary+corroborative. Rejected.
- A citation regex as the structural 85-tier leg is exactly the convention of the sibling
  AI Act patterns (`eu-ai-act-conformity-declaration` requires
  `Pattern_..._citation` = Regulation (EU) 2024/1689; `eu-ai-act-gpai-model-documentation`
  requires 2024/1689|Annex XI/XII|Article 53/55). A genuine FRIA cites its legal basis
  (Article 27 / Annex III / the Regulation).
- FP surface: unchanged for the file's negatives — all four should_not_match cases carry
  local noise-filter terms ('press briefing', 'book a demo'/'webinar', 'peer-reviewed',
  'client alert') and remain suppressed at every enforcement tier (verified); documents that
  merely paraphrase Article 27 without the defined term never fire the `id_match` at all.

After the fix all three positives fire at 85/75/65 and all four negatives are suppressed
(tier-reachability run above). `operation` prose updated. Version 1.0.0 → 1.1.0.

## Gates

- `npm run check`: **0 errors** (57 pre-existing warnings).
- `npm run check:quality`: **Quality gate PASSED** (0 issues in fail-on categories outside the exclusion set).
- `npm run compile`: OK (1655 patterns); `patterns.json` reverted before staging per convention.
- `scripts/verify-pattern-testcases.mjs` on all 5 touched slugs + 4 DORA/NIS2 siblings: **all test_cases pass**.

## Note (out of scope)

The declared-but-unwired `Keyword_noise_exclusion` shape is widespread: ~200 other pattern
files (e.g. `ma-legal-due-diligence-for-gocs.yaml`, most `au-*` document classifiers) carry
the same dead declaration (1 grep occurrence vs 4 in wired files). Left untouched here — a
corpus-wide sweep needs the same per-file dictionary-collision adjudication performed above.

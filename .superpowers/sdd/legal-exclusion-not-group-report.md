# Backlog ticket: legal-pattern lost NOT-group wrappers — report

Date: 2026-07-09
Branch: `claude/funny-wright-3a7464` (worktree off `main` @ `64012c95a9`)
Scope: 14 legal-document pattern YAMLs whose 85 tier referenced their own
`Evidence_*_exclusion` keyword group as plain positive evidence. Origin: noise-gate sweep
residuals section.
Commit: `b4882dcb52` — PR: https://github.com/testpatterndev/patterns/pull/20

## The defect

Each affected pattern declares an `Evidence_<slug>_exclusion` keyword group with
`strength: noise` whose terms are published-document vocabulary ('published reasons',
'tabled', 'media release', 'judgment', 'template', 'example', 'annual report', ...). The
85 tier's `matches` list carried it as a bare `- ref:` entry — a **positive (AND)
requirement** — so the tier demanded that exclusion vocabulary be present. The intended
semantics (a NOT-group: `type: any, min_matches: 0, max_matches: 0`) had been lost,
inverting the gate: the tier could only reach 85 confidence on exactly the
published/template documents it was designed to suppress.

### Intent confirmation

Three independent sources agree the group is negative evidence:

1. **`strength: noise`** on every one of the 14 groups — the strength class used by
   NOT-group members throughout the catalog.
2. **`false_positives` mitigations** in each file say "Negative match on ..." listing the
   exact same terms (royal-commission's `operation` prose even spells out "Exclusion:
   negative match on 'tabled', 'published', 'public version'").
3. **The DORA/NIS2 convention** (`eu-dora-register-of-information.yaml`): shared
   `Keyword_noise_exclusion` + `Filter_*_exclusion` wrapped in a NOT-group on every tier.

Empirical proof from the baseline verifier run: `judicial-review-defence-file`'s
published-decision negative and `solicitor-general-legal-advice`'s published-transcript
and public-lecture negatives **fired at tier@85 precisely because** they contain
'published reasons' / 'published transcript' / 'public lecture' — the bug rewarding the
noise vocabulary.

## The fix

Converted the positive ref to NOT-group semantics in the 85 tier of each file. Two
structural variants:

| Slug | Variant | Version |
|---|---|---|
| cabinet-legal-briefing | folded into existing `Filter_*_exclusion` NOT-group | 1.1.0 → 1.1.1 |
| coronial-inquest-draft-submission | folded into existing NOT-group | 1.1.0 → 1.1.1 |
| ma-legal-due-diligence-for-gocs | folded into existing NOT-group | 1.1.0 → 1.1.1 |
| regulatory-investigation-defence-strategy | folded into existing NOT-group | 1.1.0 → 1.1.1 |
| regulatory-prosecution-brief | folded into existing NOT-group | 1.1.0 → 1.1.1 |
| royal-commission-draft-submission | folded into existing NOT-group | 1.1.0 → 1.1.1 |
| settlement-authority-and-negotiation-mandate | folded into existing NOT-group | 1.1.0 → 1.1.1 |
| class-action-defence-strategy | new NOT-group appended (tier had none) | 1.1.0 → 1.1.1 |
| crown-solicitor-legal-opinion | new NOT-group appended | 1.1.0 → 1.1.1 |
| judicial-review-defence-file | new NOT-group appended | 1.1.0 → 1.1.1 |
| major-litigation-strategy-document | new NOT-group appended | 1.1.0 → 1.1.1 |
| native-title-negotiation-strategy | new NOT-group appended | 1.1.0 → 1.1.1 |
| solicitor-general-legal-advice | new NOT-group appended | 1.1.0 → 1.1.1 |
| state-legal-liability-assessment | new NOT-group appended | 1.1.0 → 1.1.1 |

Where a `Filter_*_exclusion` NOT-group already existed in the tier, the Evidence group
was added to its `refs` (per DORA, which lists multiple noise groups in one NOT-group —
semantically identical to separate groups at min 0 / max 0). Scope was held to the tier
carrying the lost wrapper; extending the exclusion to 75/65 tiers is a design change left
to the weak-75-tier follow-up. All 14 got a changelog entry and `updated: '2026-07-09'`.

## 85-tier reachability check (should_match)

A NOT-group vetoes a should_match value that itself contains exclusion vocabulary
(`nodeVetoedByValue` in the harness). Checked every should_match value against its file's
exclusion terms (word-boundary, case-insensitive): **zero hits** — including the
near-misses ('NOT FOR PUBLICATION' does not word-match 'published'; 'Federal Court —
QUD 123/2025' does not contain 'filed'). Each file also has at least one should_match
value satisfying the 85 tier's `id_match` (cabinet's `CABINET-IN-CONFIDENCE`,
crown-solicitor's `CS-2025-0847`, settlement's 'Settlement Authority', ...), so the 85
tier remains reachable in all 14 patterns.

## Verification

`node scripts/verify-pattern-testcases.mjs <14 slugs>`:

| | before | after |
|---|---|---|
| should_match failures | 0 | 0 |
| should_not_match failures | 22 | 22 |
| warnings | 8 | 8 |

The 22 failures are byte-for-byte the same test values before and after — they are the
**pre-existing weak-75-tier residual** (every 75 tier requires only `id_match` + the
primary keyword group, which are near-synonyms, so any document mentioning the topic
fires at 75). Tier attribution shifted for exactly three: judicial-review neg#1 and
solicitor-general negs #1/#3 previously reported `tier@85 fires` (the bug) and now report
`tier@75 fires` (the residual). No negative gained a new way to fire: for each file the
85 tier's other positive requirements (reference-number regexes, structural headings,
document-type regexes) were checked against every should_not_match value — the only value
newly able to satisfy a full 85 tier is solicitor-general neg#2 (see residuals), which
already failed at 75.

Gates: `npm run check` — 0 errors, 57 warnings (unchanged). `npm run check:quality` —
gate PASSED. `patterns.json` was never touched by these edits or the checks — nothing to
revert; the commit contains exactly the 14 YAMLs.

## Residuals / follow-ups (not in this change)

1. **Weak 75 tiers** — all 22 remaining verifier failures on these slugs. Candidate fix
   per file: require the corroborative group at 75 and/or extend the exclusion NOT-group
   to every tier (the DORA convention). Design decision per pattern; same 14 files.
2. **solicitor-general-legal-advice 85 tier is under-specified** — after the fix it is
   title regex + corroborative + NOT, and the corroborative group matches the generic
   word 'advice', so an academic description of the role satisfies the full tier. A
   document-marker or reference-number requirement (cf. crown-solicitor's
   `CS-\d{4}-\d{4}`) would tighten it.
3. **Structural check on ~45 other files** carrying `- ref: Evidence_template_exclusion`
   (and friends) at deeper indentation (au-afsl-number, au-qld-*, au-foi-exemption-references,
   au-individual-healthcare-identifier, au-number-plates, ...). Different nesting shape —
   verify none is the same lost-wrapper bug in disguise.

# C1-T1 report: pattern_class persisted catalog-wide

Date: 2026-07-09 · Branch: `concept/c1-pattern-class`
Plan: testpattern docs/superpowers/plans/2026-07-04-concept-strategy.md §C1 item 1.

## Result

`pattern_class: identifier | concept | marking` persisted as an explicit field on all
1,655 patterns (inserted after `type:`), each with a minor version bump + changelog entry:

| Class | Count | Derivation |
|---|---|---|
| concept | 1,175 | top500 family (953) + keyword-family types + phrase-alternation top-level regexes |
| identifier | 461 | structural top-level regex (digit runs, bounded char classes, URI schemes, PEM armor, literal prefixes) |
| marking | 19 | protective-marking slug family (17) + 2 `document_marker`-type SITs |

Derivation: `scripts/derive-pattern-class.mjs` (census / `--tsv` / `--apply` modes).
Independent confirmation: the 17 marking-family files exactly match verify-catalog-quality's
own documented exclusion set (minus the 3 snaffler entries, which classify identifier/concept).

## Heuristic decisions (spot-reviewed)

- **A discriminator tier does not flip class**: concept doc-patterns carrying a structured
  reference-number tier (crown-solicitor `CS-\d{4}-\d{4}`, controlled-operation `COA-\d{4}`)
  stay `concept` — the class describes decoy behavior of the primary (topic) anchor, which is
  what the C1 verdict model scores. Keyword-family types are therefore always concept.
- **regex-type patterns judged by top-level `pattern:` only** (the id_match anchor).
  Structural wins over phrases when mixed (label+value regexes anchor on the value).
- 7 spot-reviewed overrides live in the script's `REVIEWED` map with reasons (zero-width
  unicode markers, JSON/HL7 literal markers, config-directive creds → identifier;
  bare credential-label alternation → concept; FOI statutory citations → identifier).
- `us-classification-banner` + `au-pspf-security-classification` (deprecated-in-place)
  fold into `marking` via slug rules.

## Infrastructure changes

- `scripts/ci-check.mjs`: `pattern_class`, when present, must be one of the three values
  (error otherwise). Not yet REQUIRED — flip after this merges if desired.
- `scripts/lib/bump-pattern-version.mjs`: (a) `PATTERN_BUMP_DATE` env override for the
  hardcoded date; (b) **bugfix found by this wave's first application**: changelog entries
  were always inserted at 2-space indent, but ~8 files use zero-indent list items — mixed
  indent broke their YAML parse. The helper now matches the file's existing item indent.
- `scripts/compile.js` needs no change — it passes whole YAML docs through, so
  pattern_class lands in patterns.json on the next recompile.

## Gates (all at exact baseline)

`npm run check` 0 errors / 57 warnings · `npm run check:quality` PASSED ·
`verify-pattern-testcases --all` 67 FAILs / 77 warnings · `npm run compile` 1,655 patterns
(patterns.json reverted, not committed — separate chore(build) after merge per convention).

## Next (C1-T2..T4)

Harness verdicts (TOPIC_PASS/TOPIC_FP) + testpattern compile passthrough check → site
vocabulary → re-score raw 2026-03 per-variant results. The ~36 deferred top500
self-corroborating tiers are addressed by the verdict model (scored as topic classifiers),
not piecemeal rewiring.

# C4 report: xlsx clean-negative investigation

Date: 2026-07-09 · Plan: concept-strategy §C4 (Nathan GO in-session)
Verdict up front: **the clean-negative FP problem is almost entirely a doc-gen artefact, not
pattern over-match.** Three defects found (two fixed today, one was already fixed but the doc
corpus predated it); the plan's anticipated pattern-side fix (generic-business-vocab NOT
exclusions) is NOT supported by the evidence and was not applied.

## T1 — Evidence (from March + July raw per-variant results)

Clean-negative FP rate by class/format:

| class | docx | pdf | pptx | xlsx |
|---|---|---|---|---|
| concept | 48.9% | 48.7% | 40.5% | **77.6%** |
| identifier | 4.7% | 4.9% | 4.1% | 5.2% |

Identifiers show no xlsx skew → the artefact injects *topic vocabulary*, not values.
Excess cohort (xlsx-FP, docx-clean): 153 slugs. Both-formats cohort: 255 slugs.
FP confidence distribution: 549@65 (bare id_match), 345@75, 240@85.

## T2 — Audit trail (hypotheses tested in order)

1. xlsx generator's hardcoded business vocabulary (categories/DEPTS/STATUSES): **0/153**
   excess-cohort regexes match it. Eliminated.
2. Neutral-archetype themed filler at xlsx volume (~4k samples/doc): **1/153**
   (au-top500-341-student-enrollment-records ↔ "Course enrollment" in training-catalog
   filler — noted below). Eliminated as a driver.
3. Actual document extraction (sharedStrings/document.xml) found the real causes:

**Cause A — stale metadata sheets (the xlsx excess).** The xlsx generator's Document
Metadata sheet writes the pattern name + slug; the negative-polarity mask for those rows
exists in today's generator, but **1,145 of 1,557 doc sets were generated 2026-02-21,
before the mask** — their neg-clean xlsx carries the unmasked topic phrase (verified:
au-top500-127 "Pattern Name: Bankruptcy case records" in sharedStrings; today's docs show
"DLP Test Document"/x-masked slug). xlsx-only because only xlsx writes the name into
sheet content; docx puts it in doc properties, which classification doesn't scan.

**Cause B — placeClean table-header no-op (the cross-format base rate).**
`keyword-placer.js` placeClean's table case was `GENERIC_FORM_LABELS.includes(h) ? h : h`
— a no-op — while `buildTableWithValues` unconditionally splices the pattern name in as
a column header. Every clean negative whose neutral archetype uses tables carried the
topic phrase as a column header in docx/pdf/pptx (and via the same blocks nowhere in
xlsx, which builds its own sheets — hence formats diverge). Verified live:
au-top500-173's neg-clean docx contained "Milestone | SOX control deficiency records |
Owner | …".

**Cause C — clean negatives embedded should_not_match values (semantic flaw).**
content-builder gave negatives `testValues = should_not_match`, and buildArchetypeBlocks
embeds testValues into form/table/additional blocks. For concept patterns,
should_not_match sentences contain the topic phrases by design (near-misses) — which
contradicts the C1 clean-negative semantic ("no topical relevance") that TOPIC_FP is
scored against. Top500 negs are mostly innocuous strings so this rarely fired for them,
but it guarantees FPs for concept patterns with realistic near-miss negs (legal family).

## T3 — Fixes (doc-gen lib on Z:\testpattern — machine-local by convention, /lib/ gitignored)

- `keyword-placer.js` placeClean: table headers containing the pattern name are replaced
  with generic labels (fixes B); defensive same fix for form labels; signature now takes
  patternName.
- `content-builder.js`: clean negatives embed **no test values** (fixes C); the near-miss
  role stays with decoy negatives, which keep embedding should_not_match (expected-fire
  for concepts under the C1 model, recorded not penalized).
- Cause A needs no code change (mask already present) — only regeneration.

**Verification (probe slugs au-top500-127 + -173, regenerated):** neg-clean docx clean,
neg-clean xlsx clean, xlsx metadata masked, pos-std still matches. 

**Remediation in flight:** full-corpus regeneration of all 1,655 doc sets (launched
2026-07-09 ~14:00, ~2.8h) — the whole corpus predates fixes B/C.
⚠️ The staged 37-batch targeted classification run should be executed only AFTER the
regeneration completes (the run uploads these docs).

## T4 — keywordHeading robustness

`keywordHeading()` now filters its suffix pool against the pattern's own exclusion
vocabulary (threaded from content-builder's extractPurviewKeywords) instead of relying on
the 2026-07-04 single-term swap — a positive doc can no longer self-trip its NOT gate via
a generated heading, regardless of future dictionary content.

## Not done, deliberately

- **No generic-business-vocab NOT exclusions added to patterns** — the audit attributes
  the FP mass to doc-gen artefacts; adding pattern-side exclusions would mask the
  artefact and weaken genuine detection. Re-judge after a post-regeneration tenant run:
  residual TOPIC_FP then = genuine over-match, with real evidence to design against.
- au-top500-341-student-enrollment-records ↔ "Course enrollment" filler collision noted:
  arguably correct topical behaviour (the training-catalog "neutral" archetype is not
  neutral for that pattern). Single-pattern edge; revisit with post-regeneration data.

## Expected effect

TOPIC_FP (789 of 1,287 in the re-baselined dataset) should drop substantially at the next
tenant run; the concept clean-neg FP floor becomes an honest measure of over-match.

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
The floor is general: it applies automatically to every currently-deprecated
pattern (17 at time of writing — the 16 Art-9/biometric pairs named above
plus one pre-existing unrelated deprecated pattern,
`au-pspf-security-classification`, correctly swept up by the same
status-gated logic) and to any pattern deprecated in the future, with no
per-file hand-editing.

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

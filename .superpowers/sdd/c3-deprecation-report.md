# C3 report: deprecate/redesign un-expressible patterns

Date: 2026-07-09 · Plan: concept-strategy §C3 (Nathan "go for it" in-session)
Branch: `concept/c3-deprecations`

## Schema (new)

`status: active | deprecated` (optional; absent = active) + `deprecation_reason`
(required iff deprecated) — top-level fields after `pattern_class`, validated by ci-check.
Compiler passes them through automatically. Deprecation is IN PLACE: detection logic
unchanged, patterns stay in the catalog/exports for discovery — no silent removals.

## Deprecated (17 files)

**Biometric-content top500 (8):** au/global × facial-images, fingerprints,
iris-or-retina-scans, voiceprints. Reason: needs-EDM/ML — biometric content
(images/scans/audio) is not detectable by text regex; the phrase lists only detected
*discussion* of biometrics, a role already covered by `au-biometric-data-reference`
(kept). Verdicts: NOT_DETECTED/TOPIC_FP across the family.

**Sensitive-attribute top500 (8):** au/global × nationality, sexual-orientation,
religious-or-philosophical-beliefs, ethnicity-or-race. Reason: needs-EDM/ML — attribute
*values* have no text format, and the phrase evidence was too generic for reliable topic
detection (au-top500-005-nationality's evidence includes the phrase "personal details").
Replacement path: dedicated Art-9 reference patterns modeled on
`global-political-opinion` / `global-trade-union-membership` (both kept — honest,
documented low-precision keyword concepts). **Coverage gap logged**: no dedicated
religion / ethnicity / sexual-orientation / nationality reference patterns exist —
D-wave candidate.

> **2026-07-12 follow-up:** the Art-9 wave that filled this gap surfaced a
> confidence-inversion defect (fixed) and an active-active vocabulary
> overlap (adjudicated as accepted) — see
> `backlog-art9-overlap-confidence-report.md`.

**au-pspf-security-classification (1):** the deprecation precedent was changelog-note
only (1.1.0, 2026-06-29); now carries the structured field. Reason: superseded by the
au-marking-* per-category classifiers; retained for broad discovery.

## Adjudicated KEEP (census hits excluded, with reasons)

- `global-biometric-template` — identifier class, structural template format.
- `au-biometric-data-reference` — honest reference-detection concept, 3 tiers.
- `global-political-opinion`, `global-trade-union-membership` — the Art-9 keyword-concept
  model the attribute replacements should follow.
- `global-passport-mrz` (census hit on "nationality" — structural MRZ), 
  `snaffler-remote-access-config` (census hit on SSH "fingerprint"),
  `forensic-evidence-chain-of-custody-active` (mentions biometrics; target is expressible).
- **Abstract-doc family kept** (bills-of-lading ×2, restructuring-plans ×2, tender/
  procurement): post-C1 these score honestly as topic classifiers; deprecating them while
  keeping ~200 sibling top500 doc-concepts would be arbitrary. bills-of-lading noted as a
  C2 discriminator candidate (B/L numbers are structural).

The plan's "~50 patterns" estimate predates C1: the honest-low-precision-concept
conversion it offered as the alternative outcome is now the catalog-wide default via
pattern_class + the concept verdict scale, so only the truly un-expressible core needed
deprecation.

## Gates

check 0 err / 57 warn · verifier 45F/99W (baseline) · compile OK (patterns.json reverted).
**check:quality currently FAILS on main with 11 shortAcronyms issues — all from PR #25's
new Phase-1 SITs (br-cnh 'CNH', ca-business-number 'CRA', global-ndc 'NDC', id-npwp
'DJP'/'SPT', in-uan 'UAN', …), merged by the parallel agent session; none are in this
diff.** Flagged for the Phase-1 owner; the standard fix is per-term case_sensitive
conversion (j2-wave convention).

## Site follow-up (C3-T4)

Deprecated status badge in PatternDetail/Browse/Card + bot/llms renderers — separate
site-repo PR.

# Backlog ticket: batch1-minors — micro-pass over batch-1 approved-with-minors items

Date: 2026-07-08. Branch: `feat/coverage-waves-d4` (isolated worktree).
One line per item, each with the empirical evidence used to confirm it.

## Item 1 — eu-nis2-incident-notification vendor-webinar negative (DONE, 1.1.0 → 1.1.1)

`should_not_match[1]` reworded to "Vendor webinar: automate reporting of significant
incidents under NIS2 and never miss the 24-hour early warning deadline again. Demo of our
compliance dashboard included." — it now contains the pluralized primary phrase plus the
`webinar` noise-gate term, mirroring the batch-1 rewords in eu-dora-major-incident-report
and eu-nis2-cybersecurity-risk-measures.
Evidence (node probe + tier harness): TOP pattern matches = true; primary terms present =
`["significant incidents"]`; noise-gate terms present = `["webinar"]`;
`verify-pattern-testcases.mjs eu-nis2-incident-notification` reports the value as a
tier-gated negative warn (top-level matches, no tier fires) with 0 failures — identical
gating to the other two fixed negatives.

## Item 2 — eu-vat-number references (DONE, 1.1.0 → 1.1.1, metadata-only patch)

Added `https://marosavat.com/resources/vat-number-formats` and
`https://www.vatify.eu/vat-number-eu.html` (the VIES-FAQ Q11 table mirrors that evidence
the spaced DK/FR/XI renderings accepted in 1.1.0, per the backlog-euvat-spacing report).
Retitled the Wikipedia reference to "secondary per-country overview; its FR example
'FR XX 999 999 999' diverges from the VIES rendering and is deliberately not followed" —
it no longer claims to mirror VIES.
Evidence: node probe printed the 5-entry reference list and confirmed the Wikipedia title
no longer contains "mirror"; no pattern/tier/test-case bytes changed (diff is references +
version + changelog only).

## Item 3 — scripts/ci-check.mjs recursive collections read (DONE)

The collection-integrity loop now walks `data/collections` recursively via a `walkYaml`
helper that mirrors `compile.js` `walkDir` (directories recursed, `.yaml`/`.yml` accepted),
so a subdirectory collection that compile.js would ship can no longer be silently skipped;
labels fall back to the colDir-relative path.
Evidence (before/after probe with a temporary `data/collections/zz-probe-sub/
zz-probe-collection.yaml` containing a dangling member): HEAD ci-check = "0 error(s)"
(silently skipped); new ci-check = `ERROR collections/zz-probe-collection: dangling member
'definitely-not-a-real-slug'`, exit 1. Probe removed after the run.

## Item 4 — scripts/verify-pattern-testcases.mjs diagnostics (DONE)

(a) should_match FAIL now emits the actual veto reason via `shouldMatchFailReason` —
per-tier "every id_match hit is vetoed by a match-level filter" or "NOT-group violated
(matched: <refs>)", with "id_match never matches the value" reserved for the case where
the primary genuinely never hits.
Evidence: `au-motor-vehicle-permit` should_match "123456789"/"1234567"/"1234567890" —
HEAD script blamed "id_match never matches the value"; new script correctly reports
"every id_match hit is vetoed by a match-level filter" at all 3 tiers (the
TextMatchFilter sentinel list contains those exact literals). Pass/fail behavior is
byte-identical between old and new (same 3 pre-existing failures, exit 1 both) — only the
diagnostic changed. A temporary probe pattern additionally exercised all three reason
branches (filter veto, NOT-group veto naming `Keyword_probe_noise`, genuine no-match).

(b) A should_not_match value that fires a `discovery_only` tier now warns
("fires discovery_only tier@N (inventory tier — not a failure, but the value would
surface in discovery)") instead of passing silently.
Evidence: probe pattern negative "ref 12345678 in plain prose" (enforcement tier blocked
by missing positive evidence, discovery tier fires) produced the warn; the reworded NIS2
negative correctly does NOT warn (its discovery tier is noise-gated by `webinar`).

(c) `--all` combined with explicit slugs is now an error (exit 2) instead of silently
ignoring the slugs.
Evidence: HEAD script with `--all eu-vat-number` ran the entire corpus (89 pre-existing
corpus-wide failures, slug ignored); new script prints "Error: --all cannot be combined
with explicit slugs — pass either --all or a slug list, not both." and exits 2.

## Item 5 — version bumps + changelogs (DONE)

Only the two touched pattern YAMLs were bumped, both patch per corpus convention:
eu-nis2-incident-notification 1.1.0 → 1.1.1 (test change), eu-vat-number 1.1.0 → 1.1.1
(metadata/reference change), each with a dated changelog entry; script changes carry no
pattern version. Evidence: node probe printed `version: 1.1.1 | changelog[0].version:
1.1.1` for both files; `git status` shows exactly 4 modified files (2 pattern YAMLs,
2 scripts) plus this report.

## Gates

- `npm run check` — 0 errors.
- `npm run check:quality` — PASSED.
- `npm run compile` — succeeds; `patterns.json` reverted before staging per workflow
  convention.
